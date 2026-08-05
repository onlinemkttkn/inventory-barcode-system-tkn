(() => {
  'use strict';

  const VERSION = '5.25.10';
  const CURRENT_BOX_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'];
  const $ = (id) => document.getElementById(id);
  const E = Object.fromEntries([
    'search','categoryFilter','typeFilter','brandFilter','boxFilter','promoFilter','reloadBtn','resultSummary','selectAll','productBody','emptyState','selectedCount','promoName','discountMode','discountPercent','promoPrice','percentField','fixedField','startAt','endAt','pricePreview','confirmBelowCost','createPromoBtn','message','activePromos'
  ].map((id) => [id, $(id)]));

  const selected = new Set();
  let products = [];
  let rawBoxMap = new Map();
  let stockMap = new Map();
  let activeMap = new Map();

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (x) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]));
  const money = (v) => new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB' }).format(Number(v || 0));
  const qty = (v) => Math.max(0, Number(v || 0));
  const msg = (text, cls='') => { E.message.textContent = text; E.message.className = `message ${cls}`.trim(); };
  const localDateTime = (date) => { const d = new Date(date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const timestamp = (value) => { const n = Date.parse(value || ''); return Number.isFinite(n) ? n : 0; };
  const displayBoxCode = (value) => String(value || '-').replace(/^TKN-B-/i, '');

  async function requireAdmin() {
    const { data:{session} } = await supabaseClient.auth.getSession();
    if (!session) { location.href = './dashboard.html'; return false; }
    const { data, error } = await supabaseClient.rpc('current_access_context');
    if (error || !data?.user_id || !(data.permissions || []).includes('product.manage')) {
      alert('บัญชีนี้ไม่มีสิทธิ์จัดการโปรโมชั่น');
      location.href = './dashboard.html';
      return false;
    }
    return true;
  }

  function normalizeRawBoxes(rows) {
    const grouped = new Map();
    for (const row of rows || []) {
      const box = row.stock_boxes || {};
      const status = String(box.status || '').toUpperCase();
      const quantity = qty(row.quantity);
      const code = String(box.box_code || '').trim();
      if (!quantity || !code || !CURRENT_BOX_STATUSES.includes(status)) continue;
      const key = code.toUpperCase();
      const old = grouped.get(key) || {
        box_code: code,
        status,
        location: box.location_text || '',
        quantity: 0,
        sortAt: 0,
      };
      old.quantity += quantity;
      old.sortAt = Math.max(old.sortAt, timestamp(box.closed_at), timestamp(box.created_at));
      if (!old.location && box.location_text) old.location = box.location_text;
      grouped.set(key, old);
    }
    return [...grouped.values()].sort((a, b) => b.sortAt - a.sortAt || a.box_code.localeCompare(b.box_code, 'th'));
  }

  /*
   * branch_inventory คือยอดคงเหลือจริง ส่วน stock_box_items อาจมีแถวเก่าจากกล่องเดิม
   * จึงจัดสรรตำแหน่งกล่องจากรายการล่าสุดก่อน และไม่ให้ยอดตำแหน่งรวมเกินยอดคงเหลือจริง
   * วิธีนี้ซ่อนตำแหน่งที่ขายหมด/จำนวนเป็นศูนย์ โดยไม่ลบใบเสร็จหรือประวัติการขาย
   */
  function buildStockSnapshot(product) {
    const total = qty(product.total_branch_quantity);
    let remaining = total;
    const currentBoxes = [];
    for (const box of normalizeRawBoxes(rawBoxMap.get(product.id) || [])) {
      if (remaining <= 0) break;
      const currentQty = Math.min(qty(box.quantity), remaining);
      if (currentQty <= 0) continue;
      currentBoxes.push({ ...box, quantity: currentQty });
      remaining -= currentQty;
    }
    return {
      total,
      boxes: currentBoxes,
      inBox: currentBoxes.reduce((sum, box) => sum + box.quantity, 0),
      storefront: Math.max(0, remaining),
      soldOut: total <= 0,
    };
  }

  function rebuildStockMap() {
    stockMap = new Map(products.map((product) => [product.id, buildStockSnapshot(product)]));
    for (const id of [...selected]) {
      if (stockMap.get(id)?.soldOut) selected.delete(id);
    }
  }

  async function loadAll() {
    msg('กำลังโหลดข้อมูล...');
    selected.clear();
    const productResult = await supabaseClient.from('product_management_list_v5250')
      .select('*').eq('is_active', true).order('name').limit(3000);
    if (productResult.error) {
      msg(`โหลดไม่ได้: ${productResult.error.message} — กรุณารัน SQL v5.25.0`, 'error');
      return;
    }
    products = productResult.data || [];

    const ids = products.map((x) => x.id);
    rawBoxMap = new Map();
    if (ids.length) {
      for (let i = 0; i < ids.length; i += 300) {
        const batch = ids.slice(i, i + 300);
        const { data, error } = await supabaseClient.from('stock_box_items')
          .select('product_id,quantity,stock_boxes!inner(box_code,status,location_text,closed_at,created_at)')
          .in('product_id', batch)
          .in('stock_boxes.status', CURRENT_BOX_STATUSES)
          .gt('quantity', 0);
        if (error) {
          console.warn(`[Stock Promotion ${VERSION}] โหลดตำแหน่งกล่องไม่สำเร็จ`, error);
          continue;
        }
        for (const row of data || []) {
          const arr = rawBoxMap.get(row.product_id) || [];
          arr.push(row);
          rawBoxMap.set(row.product_id, arr);
        }
      }
    }

    rebuildStockMap();
    await loadActivePromos();
    fillFilters();
    render();
    msg('พร้อมเลือกสินค้า · แสดงเฉพาะตำแหน่งที่มีจำนวนคงเหลือจริง', 'ok');
  }

  async function loadActivePromos() {
    const { data, error } = await supabaseClient.from('active_product_promotions_v5250').select('*').order('start_at', { ascending:false });
    if (error) { activeMap = new Map(); return; }
    activeMap = new Map((data || []).map((x) => [x.product_id, x]));
    E.activePromos.innerHTML = (data || []).length
      ? (data || []).map((x) => `<article class="active-item"><strong>${esc(x.promo_name)}</strong><small>${esc(products.find((p) => p.id === x.product_id)?.label_name || products.find((p) => p.id === x.product_id)?.name || x.product_id)}</small><small>${money(x.normal_price)} → ${money(x.promo_price)}</small><button class="btn danger" data-deactivate="${x.id}" type="button">ยกเลิกโปร</button></article>`).join('')
      : '<p class="muted">ยังไม่มีโปรโมชั่นที่กำลังใช้งาน</p>';
    E.activePromos.querySelectorAll('[data-deactivate]').forEach((btn) => { btn.onclick = () => deactivate(btn.dataset.deactivate); });
  }

  function unique(field) {
    return [...new Set(products.map((x) => String(x[field] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  }

  function fillFilters() {
    const preserve = { c:E.categoryFilter.value, t:E.typeFilter.value, b:E.brandFilter.value, x:E.boxFilter.value };
    E.categoryFilter.innerHTML = '<option value="">ทุกหมวดหมู่</option>' + unique('category_name').map((x) => `<option>${esc(x)}</option>`).join('');
    E.typeFilter.innerHTML = '<option value="">ทุกประเภท</option>' + unique('product_type_th').map((x) => `<option>${esc(x)}</option>`).join('');
    E.brandFilter.innerHTML = '<option value="">ทุกยี่ห้อ</option>' + unique('brand_name').map((x) => `<option>${esc(x)}</option>`).join('');
    const boxes = [...new Set([...stockMap.values()].flatMap((stock) => stock.boxes.map((box) => box.box_code)))].sort((a, b) => a.localeCompare(b, 'th'));
    E.boxFilter.innerHTML = '<option value="">ทุกตำแหน่ง</option><option value="STOREFRONT">อยู่หน้าร้าน</option>' + boxes.map((x) => `<option value="${esc(x)}">${esc(displayBoxCode(x))}</option>`).join('');
    E.categoryFilter.value = preserve.c;
    E.typeFilter.value = preserve.t;
    E.brandFilter.value = preserve.b;
    E.boxFilter.value = [...E.boxFilter.options].some((o) => o.value === preserve.x) ? preserve.x : '';
  }

  function filtered() {
    const q = E.search.value.trim().toLowerCase();
    return products.filter((x) => {
      const stock = stockMap.get(x.id) || buildStockSnapshot(x);
      if (q && !`${x.name} ${x.label_name} ${x.product_code} ${x.base_sku} ${x.model_name}`.toLowerCase().includes(q)) return false;
      if (E.categoryFilter.value !== '' && x.category_name !== E.categoryFilter.value) return false;
      if (E.typeFilter.value !== '' && x.product_type_th !== E.typeFilter.value) return false;
      if (E.brandFilter.value !== '' && x.brand_name !== E.brandFilter.value) return false;
      if (E.boxFilter.value === 'STOREFRONT' && stock.storefront <= 0) return false;
      if (E.boxFilter.value && E.boxFilter.value !== 'STOREFRONT' && !stock.boxes.some((box) => box.box_code === E.boxFilter.value)) return false;
      if (E.promoFilter.value === 'ACTIVE' && !activeMap.has(x.id)) return false;
      if (E.promoFilter.value === 'NONE' && activeMap.has(x.id)) return false;
      return true;
    });
  }

  function locationHtml(stock) {
    if (stock.soldOut) return '<span class="stock-empty">สินค้าหมด</span>';
    const locations = [];
    if (stock.storefront > 0) locations.push(`<span class="location-storefront">หน้าร้าน ${stock.storefront.toLocaleString('th-TH')} ชิ้น</span>`);
    for (const box of stock.boxes) {
      if (box.quantity <= 0) continue;
      const location = box.location ? ` · ${esc(box.location)}` : '';
      locations.push(`<span class="location-box">${esc(displayBoxCode(box.box_code))} · ${box.quantity.toLocaleString('th-TH')} ชิ้น${location}</span>`);
    }
    return locations.length ? locations.join('') : `<span class="stock-unknown">ไม่พบตำแหน่งปัจจุบัน · ${stock.total.toLocaleString('th-TH')} ชิ้น</span>`;
  }

  function render() {
    const rows = filtered();
    E.productBody.innerHTML = '';
    E.emptyState.classList.toggle('hidden', rows.length > 0);
    E.resultSummary.textContent = `${rows.length.toLocaleString('th-TH')} รายการ`;

    for (const x of rows) {
      const stock = stockMap.get(x.id) || buildStockSnapshot(x);
      const promo = activeMap.get(x.id);
      const tr = document.createElement('tr');
      if (stock.soldOut) tr.classList.add('is-sold-out');
      tr.innerHTML = `<td><input type="checkbox" data-product="${x.id}" ${selected.has(x.id) ? 'checked' : ''} ${stock.soldOut ? 'disabled title="สินค้าหมด ไม่สามารถเลือกทำโปรโมชั่น"' : ''}></td><td class="product-name"><strong>${esc(x.label_name || x.name)}</strong><small class="code">${esc(x.product_code)}</small><small>${esc([x.product_type_th, x.brand_name, x.model_name].filter(Boolean).join(' · '))}</small></td><td><div class="stock-location">${locationHtml(stock)}</div></td><td>${stock.total.toLocaleString('th-TH')}</td><td>${money(x.cost_price)}</td><td>${money(x.selling_price)}</td><td>${promo ? `<span class="promo-badge">${money(promo.promo_price)}</span>` : '-'}</td>`;
      E.productBody.appendChild(tr);
    }

    E.productBody.querySelectorAll('[data-product]:not(:disabled)').forEach((cb) => {
      cb.onchange = () => { cb.checked ? selected.add(cb.dataset.product) : selected.delete(cb.dataset.product); updateSelection(); };
    });
    const selectableRows = rows.filter((x) => !(stockMap.get(x.id)?.soldOut));
    E.selectAll.checked = selectableRows.length > 0 && selectableRows.every((x) => selected.has(x.id));
    E.selectAll.disabled = selectableRows.length === 0;
    updateSelection(false);
  }

  function proposedPrice(p) {
    return E.discountMode.value === 'FIXED'
      ? Number(E.promoPrice.value || 0)
      : Math.max(0, Number(p.selling_price || 0) * (1 - Number(E.discountPercent.value || 0) / 100));
  }

  function updateSelection() {
    for (const id of [...selected]) {
      if (stockMap.get(id)?.soldOut) selected.delete(id);
    }
    E.selectedCount.textContent = selected.size.toLocaleString('th-TH');
    const list = products.filter((x) => selected.has(x.id));
    const below = list.filter((x) => proposedPrice(x) + 0.0001 < Number(x.cost_price || 0));
    E.pricePreview.innerHTML = list.length
      ? `ตัวอย่าง ${list.slice(0, 4).map((x) => `${esc(x.label_name || x.name)}: ${money(x.selling_price)} → <b class="${proposedPrice(x) < Number(x.cost_price || 0) ? 'below-cost' : ''}">${money(proposedPrice(x))}</b>`).join('<br>')}${list.length > 4 ? `<br>และอีก ${list.length - 4} รายการ` : ''}${below.length ? `<br><strong class="below-cost">ต่ำกว่าทุน ${below.length} รายการ</strong>` : ''}`
      : 'เลือกสินค้าเพื่อดูตัวอย่างราคา';
  }

  async function createPromotion() {
    const ids = [...selected].filter((id) => !stockMap.get(id)?.soldOut);
    if (!ids.length) return msg('กรุณาเลือกสินค้าที่มีจำนวนคงเหลือ', 'error');
    if (!E.promoName.value.trim()) return msg('กรุณาระบุชื่อโปรโมชั่น', 'error');
    const list = products.filter((x) => ids.includes(x.id));
    const below = list.some((x) => proposedPrice(x) + 0.0001 < Number(x.cost_price || 0));
    if (below && !E.confirmBelowCost.checked) return msg('มีราคาต่ำกว่าทุน กรุณาติ๊กยืนยันก่อนบันทึก', 'error');
    E.createPromoBtn.disabled = true;
    msg('กำลังสร้างโปรโมชั่น...');
    const { data, error } = await supabaseClient.rpc('upsert_product_promotion_v5250', {
      p_product_ids: ids,
      p_promo_name: E.promoName.value.trim(),
      p_promo_price: E.discountMode.value === 'FIXED' ? Number(E.promoPrice.value || 0) : null,
      p_discount_percent: E.discountMode.value === 'PERCENT' ? Number(E.discountPercent.value || 0) : null,
      p_start_at: E.startAt.value ? new Date(E.startAt.value).toISOString() : new Date().toISOString(),
      p_end_at: E.endAt.value ? new Date(E.endAt.value).toISOString() : null,
    });
    E.createPromoBtn.disabled = false;
    if (error) return msg(error.message, 'error');
    msg(`สร้างโปรโมชั่นสำเร็จ ${data || ids.length} รายการ`, 'ok');
    E.confirmBelowCost.checked = false;
    selected.clear();
    await loadActivePromos();
    render();
  }

  async function deactivate(id) {
    if (!confirm('ยืนยันยกเลิกโปรโมชั่นนี้?')) return;
    const { error } = await supabaseClient.rpc('deactivate_product_promotion_v5250', { p_promotion_id:id });
    if (error) return msg(error.message, 'error');
    await loadActivePromos();
    render();
    msg('ยกเลิกโปรโมชั่นแล้ว', 'ok');
  }

  [E.search, E.categoryFilter, E.typeFilter, E.brandFilter, E.boxFilter, E.promoFilter].forEach((node) => node.addEventListener(node.tagName === 'INPUT' ? 'input' : 'change', render));
  [E.discountPercent, E.promoPrice].forEach((node) => node.addEventListener('input', updateSelection));
  E.discountMode.onchange = () => {
    const fixed = E.discountMode.value === 'FIXED';
    E.fixedField.classList.toggle('hidden', !fixed);
    E.percentField.classList.toggle('hidden', fixed);
    updateSelection();
  };
  E.selectAll.onchange = () => {
    for (const x of filtered()) {
      if (stockMap.get(x.id)?.soldOut) continue;
      E.selectAll.checked ? selected.add(x.id) : selected.delete(x.id);
    }
    render();
  };
  E.reloadBtn.onclick = loadAll;
  E.createPromoBtn.onclick = createPromotion;
  E.startAt.value = localDateTime(new Date());
  E.endAt.value = localDateTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  requireAdmin().then((ok) => { if (ok) loadAll(); });
})();
