(() => {
  'use strict';

  const VERSION = '5.31.11';
  const DRAFT_KEY = 'tkn_manual_product_import_v5_15_draft';
  const state = {
    items: [],
    lookup: '',
    busy: false,
    categories: [],
    selectedIds: new Set(),
    selectionMode: 'CUSTOM', // CUSTOM | SET | ALL
    selectedSetKey: '',
  };

  const norm = (value) => String(value ?? '').trim();
  const key = (value) => norm(value).toUpperCase().replace(/\s+/g, '');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const num = (value, fallback = 0) => {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function client() {
    for (let i = 0; i < 60; i += 1) {
      if (window.supabaseClient) return window.supabaseClient;
      await sleep(100);
    }
    return null;
  }

  function insertionTarget() {
    const shell = document.querySelector('.sp-shell');
    const actionbar = shell?.querySelector('.sp-actionbar');
    if (shell && actionbar) return { mode: 'BEFORE', target: actionbar };
    const fallback = document.querySelector('#tknMpFlow') || document.querySelector('.sp-shell main,.sp-shell,.sp-main,main');
    return fallback ? { mode: 'AFTER', target: fallback } : null;
  }

  function inject() {
    if (document.getElementById('tknUniversalReceive')) return;
    const slot = insertionTarget();
    if (!slot) return;

    const section = document.createElement('section');
    section.id = 'tknUniversalReceive';
    section.className = 'tkn-receive-box';
    section.innerHTML = `
      <div class="tkn-receive-head">
        <div class="tkn-receive-title">
          <span class="tkn-receive-kicker">WAREHOUSE RECEIVING</span>
          <strong>Universal Receiving v${VERSION}</strong>
          <span>ค้นหา Batch / Tracking แล้วตรวจของจริงตาม Flow เดิม จากนั้นเลือก 1 เซตหรือเลือกทั้งหมดที่พร้อมก่อนส่งเข้าสต็อก</span>
        </div>
        <div class="tkn-receive-head-badge"><b>1 เซต</b><span>= 1 Tracking</span></div>
      </div>

      <div class="tkn-receive-tools">
        <label class="tkn-receive-field tkn-receive-field-wide">
          <span>ค้นหาชุดงาน</span>
          <div class="tkn-receive-input-action">
            <input id="tknReceiveLookup" autocomplete="off" placeholder="Batch Code / Tracking / SKU / Barcode">
            <button id="tknReceiveFind" type="button">ค้นหา</button>
          </div>
        </label>
        <label class="tkn-receive-field tkn-receive-field-wide">
          <span>ตรวจของจริง</span>
          <div class="tkn-receive-input-action">
            <input id="tknReceiveBarcode" autocomplete="off" placeholder="สแกน Barcode โรงงาน" inputmode="none">
            <button id="tknReceiveScan" type="button">ยืนยันสแกน</button>
          </div>
        </label>
      </div>

      <div id="tknReceiveMsg" class="tkn-receive-msg" role="status" aria-live="polite"></div>

      <div class="tkn-receive-metrics" aria-label="สรุปรายการรับเข้า">
        <article><span>ทั้งหมด</span><b id="tknReceiveTotalCount">0</b><small>รายการ</small></article>
        <article><span>พร้อมเลือก</span><b id="tknReceiveReadyCount">0</b><small>READY_TO_STORE</small></article>
        <article><span>เลือกแล้ว</span><b id="tknReceiveSelectedCount">0</b><small id="tknReceiveSelectedQty">0 ชิ้น</small></article>
        <article><span>เข้าสต็อกแล้ว</span><b id="tknReceiveCommittedCount">0</b><small>รายการ</small></article>
      </div>

      <div class="tkn-receive-selection" id="tknReceiveSelection">
        <div class="tkn-receive-selection-copy">
          <b>เลือกรายการที่จะส่งเข้าสต็อก</b>
          <span>เลือก 1 Tracking เป็นหนึ่งเซต หรือเลือกพร้อมทั้งหมดในผลค้นหานี้</span>
        </div>
        <div class="tkn-receive-selection-controls">
          <select id="tknReceiveSetSelect" aria-label="เลือก Tracking หรือเซต"></select>
          <button id="tknSelectSet" class="tkn-select-set" type="button">เลือกเซตนี้ครั้งเดียว</button>
          <button id="tknSelectAllReady" class="tkn-select-all" type="button">เลือกทั้งหมดที่พร้อม</button>
          <button id="tknClearReceiveSelection" class="tkn-select-clear" type="button">ล้างที่เลือก</button>
        </div>
        <div id="tknReceiveSelectionSummary" class="tkn-receive-selection-summary">ยังไม่ได้เลือกรายการ</div>
      </div>

      <div id="tknReceiveRows" class="tkn-receive-rows"><p class="tkn-receive-empty">ยังไม่มีรายการ</p></div>

      <div class="tkn-receive-actions">
        <div><b>ส่งเฉพาะรายการที่เลือก</b><span>ไม่เปลี่ยนจำนวนรับเข้า ไม่ข้าม Validation และไม่แตะรายการที่เข้าสต็อกแล้ว</span></div>
        <button id="tknPrepareStock" type="button" disabled>เลือกรายการก่อน → รับเข้าสต็อก</button>
      </div>`;

    if (slot.mode === 'BEFORE') slot.target.insertAdjacentElement('beforebegin', section);
    else slot.target.insertAdjacentElement('afterend', section);

    document.getElementById('tknReceiveFind').addEventListener('click', () => find());
    document.getElementById('tknReceiveScan').addEventListener('click', scan);
    document.getElementById('tknPrepareStock').addEventListener('click', prepareStock);
    document.getElementById('tknSelectSet').addEventListener('click', selectCurrentSet);
    document.getElementById('tknSelectAllReady').addEventListener('click', selectAllReady);
    document.getElementById('tknClearReceiveSelection').addEventListener('click', clearSelection);
    document.getElementById('tknReceiveLookup').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); find(); }
    });
    document.getElementById('tknReceiveBarcode').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); scan(); }
    });

    const queryBatch = new URLSearchParams(location.search).get('import_batch');
    if (queryBatch) {
      document.getElementById('tknReceiveLookup').value = queryBatch;
      setTimeout(() => find(), 300);
    } else {
      updateSelectionUi();
    }
  }

  function msg(text, type = '') {
    const element = document.getElementById('tknReceiveMsg');
    if (!element) return;
    element.textContent = text || '';
    element.dataset.type = type;
  }

  const BLOCKING_FLAGS = new Set([
    'COST_MISMATCH', 'COST_AMBIGUOUS', 'FORMULA_ERROR', 'WAITING_COST',
    'WAITING_CATEGORY', 'NO_NAME', 'INVALID_QTY',
  ]);
  const flagsOf = (item) => (Array.isArray(item.validation_flags) ? item.validation_flags : []);
  const blocked = (item) => flagsOf(item).some((flag) => BLOCKING_FLAGS.has(flag));
  const exactReady = (item) => item.item_status === 'READY_TO_STORE'
    && num(item.counted_quantity) === num(item.expected_quantity)
    && num(item.unit_cost) > 0
    && num(item.selling_price) > 0
    && !blocked(item)
    && item.category_status !== 'REVIEW'
    && num(item.stock_committed_quantity) === 0;

  function groupKey(item) {
    return norm(item.tracking_number) || norm(item.batch_code) || 'NO-TRACKING';
  }

  function groupLabel(item) {
    return norm(item.tracking_number) || `${norm(item.batch_code) || 'Batch'} · ไม่มี Tracking`;
  }

  function readyItems(items = state.items) {
    return items.filter(exactReady);
  }

  function selectionFor(items, mode, selectedGroupKey, customIds = []) {
    const ready = readyItems(items);
    if (mode === 'ALL') return ready.map((item) => item.id);
    if (mode === 'SET') return ready.filter((item) => groupKey(item) === selectedGroupKey).map((item) => item.id);
    const allowed = new Set(ready.map((item) => item.id));
    return customIds.filter((id) => allowed.has(id));
  }

  function groupsOf(items = state.items) {
    const map = new Map();
    items.forEach((item) => {
      const gk = groupKey(item);
      if (!map.has(gk)) map.set(gk, { key: gk, label: groupLabel(item), total: 0, ready: 0, qty: 0 });
      const group = map.get(gk);
      group.total += 1;
      if (exactReady(item)) {
        group.ready += 1;
        group.qty += num(item.expected_quantity);
      }
    });
    return [...map.values()];
  }

  function reconcileSelection({ preserveSelection = false } = {}) {
    const groups = groupsOf();
    if (!preserveSelection) {
      state.selectedIds.clear();
      if (groups.length === 1) {
        state.selectionMode = 'SET';
        state.selectedSetKey = groups[0].key;
      } else {
        state.selectionMode = 'CUSTOM';
        state.selectedSetKey = '';
      }
    }

    if (state.selectionMode === 'SET' && !groups.some((group) => group.key === state.selectedSetKey)) {
      state.selectionMode = 'CUSTOM';
      state.selectedSetKey = '';
    }

    const nextIds = selectionFor(
      state.items,
      state.selectionMode,
      state.selectedSetKey,
      [...state.selectedIds],
    );
    state.selectedIds = new Set(nextIds);
  }

  function selectedReadyItems() {
    return state.items.filter((item) => exactReady(item) && state.selectedIds.has(item.id));
  }

  function updateMetrics() {
    const total = state.items.length;
    const ready = readyItems().length;
    const committed = state.items.filter((item) => num(item.stock_committed_quantity) > 0).length;
    const selected = selectedReadyItems();
    const selectedQty = selected.reduce((sum, item) => sum + num(item.expected_quantity), 0);
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
    setText('tknReceiveTotalCount', total);
    setText('tknReceiveReadyCount', ready);
    setText('tknReceiveCommittedCount', committed);
    setText('tknReceiveSelectedCount', selected.length);
    setText('tknReceiveSelectedQty', `${selectedQty.toLocaleString('th-TH')} ชิ้น`);
  }

  function updateSetOptions() {
    const select = document.getElementById('tknReceiveSetSelect');
    if (!select) return;
    const groups = groupsOf();
    const previous = state.selectedSetKey || select.value;
    select.innerHTML = groups.length
      ? groups.map((group) => `<option value="${esc(group.key)}">${esc(group.label)} · พร้อม ${group.ready}/${group.total} · ${group.qty.toLocaleString('th-TH')} ชิ้น</option>`).join('')
      : '<option value="">ยังไม่มีเซต</option>';
    const next = groups.some((group) => group.key === previous) ? previous : (groups[0]?.key || '');
    select.value = next;
    if (state.selectionMode === 'SET') state.selectedSetKey = next;
  }

  function updateSelectionUi() {
    updateSetOptions();
    updateMetrics();

    const selected = selectedReadyItems();
    const qty = selected.reduce((sum, item) => sum + num(item.expected_quantity), 0);
    const cost = selected.reduce((sum, item) => sum + (num(item.unit_cost) * num(item.expected_quantity)), 0);
    const summary = document.getElementById('tknReceiveSelectionSummary');
    if (summary) {
      const modeLabel = state.selectionMode === 'ALL'
        ? 'เลือกทั้งหมดที่พร้อม'
        : state.selectionMode === 'SET'
          ? `เลือกเซต ${state.selectedSetKey || '-'}`
          : 'เลือกเอง';
      summary.textContent = selected.length
        ? `${modeLabel} · ${selected.length.toLocaleString('th-TH')} รายการ · ${qty.toLocaleString('th-TH')} ชิ้น · ต้นทุนรวมประมาณ ฿${cost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : 'ยังไม่ได้เลือกรายการที่พร้อมรับเข้าสต็อก';
    }

    document.querySelectorAll('[data-receive-select]').forEach((checkbox) => {
      checkbox.checked = state.selectedIds.has(checkbox.dataset.receiveSelect);
      checkbox.closest('tr')?.classList.toggle('is-selected', checkbox.checked);
    });

    const prepare = document.getElementById('tknPrepareStock');
    if (prepare) {
      prepare.disabled = selected.length === 0 || state.busy;
      prepare.textContent = selected.length
        ? `ส่งที่เลือก ${selected.length.toLocaleString('th-TH')} รายการ → รับเข้าสต็อก`
        : 'เลือกรายการก่อน → รับเข้าสต็อก';
    }
  }

  function statusHtml(item) {
    const flags = flagsOf(item);
    const committed = num(item.stock_committed_quantity) > 0;
    if (committed) return '<span class="tkn-status-chip is-committed">เข้าสต็อกแล้ว</span>';
    if (exactReady(item)) return '<span class="tkn-status-chip is-ready">พร้อมเลือก</span>';
    const detail = `${item.item_status || 'รอตรวจ'}${flags.length ? ` · ${flags.join(', ')}` : ''}`;
    return `<span class="tkn-status-chip is-waiting">${esc(detail)}</span>`;
  }

  function render() {
    const box = document.getElementById('tknReceiveRows');
    if (!box) return;
    if (!state.items.length) {
      box.innerHTML = '<p class="tkn-receive-empty">ยังไม่มีรายการ — ค้นหา Batch หรือ Tracking ก่อน</p>';
      updateSelectionUi();
      return;
    }

    box.innerHTML = `<div class="tkn-receive-table"><table>
      <thead><tr>
        <th class="tkn-check-col">เลือก</th><th>Tracking / เซต</th><th>SKU / Barcode</th><th>สินค้า</th>
        <th class="tkn-num-col">ตามไฟล์</th><th class="tkn-num-col">สแกนแล้ว</th><th class="tkn-num-col">ต้นทุน</th><th>สถานะ</th><th></th>
      </tr></thead>
      <tbody>${state.items.map((item) => {
        const selectable = exactReady(item);
        const checked = selectable && state.selectedIds.has(item.id);
        const committed = num(item.stock_committed_quantity) > 0;
        return `<tr data-item="${esc(item.id)}" class="${checked ? 'is-selected' : ''} ${selectable ? 'is-ready' : ''}">
          <td class="tkn-check-col"><input type="checkbox" data-receive-select="${esc(item.id)}" aria-label="เลือกรายการ ${esc(item.source_sku || item.product_name || '')}" ${checked ? 'checked' : ''} ${selectable ? '' : 'disabled'}></td>
          <td><b class="tkn-tracking-code">${esc(groupLabel(item))}</b><small>${esc(item.batch_code || '')}</small></td>
          <td><b>${esc(item.source_sku || item.internal_sku || '-')}</b><small>${esc(item.mapped_barcode || item.barcode || '')}</small></td>
          <td class="tkn-product-cell"><b>${esc(item.product_name || '-')}</b><small>${esc(item.category_th || '')}${item.subcategory_th ? ` · ${esc(item.subcategory_th)}` : ''}</small></td>
          <td class="tkn-num-col">${num(item.expected_quantity).toLocaleString('th-TH')}</td>
          <td class="tkn-num-col"><strong>${num(item.counted_quantity).toLocaleString('th-TH')}</strong></td>
          <td class="tkn-num-col">฿${num(item.unit_cost).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>${statusHtml(item)}</td>
          <td>${committed ? '' : `<button type="button" class="tkn-mini" data-resolve="${esc(item.id)}">แก้/ยืนยัน</button>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;

    box.querySelectorAll('[data-resolve]').forEach((button) => {
      button.addEventListener('click', () => resolveItem(button.dataset.resolve));
    });
    box.querySelectorAll('[data-receive-select]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        state.selectionMode = 'CUSTOM';
        state.selectedSetKey = '';
        if (checkbox.checked) state.selectedIds.add(checkbox.dataset.receiveSelect);
        else state.selectedIds.delete(checkbox.dataset.receiveSelect);
        updateSelectionUi();
      });
    });
    updateSelectionUi();
  }

  async function find(options = {}) {
    const opts = options && typeof options === 'object' && !(options instanceof Event) ? options : {};
    const lookup = norm(document.getElementById('tknReceiveLookup')?.value);
    if (!lookup) return msg('กรุณาสแกนหรือกรอก Batch / Tracking', 'error');
    const c = await client();
    if (!c) return msg('ไม่พบฐานข้อมูล', 'error');

    if (!opts.quiet) msg('กำลังค้นหา...');
    const { data, error } = await c.rpc('tkn_v5281_find_receiving_source', { p_lookup: lookup });
    if (error) return msg(error.message, 'error');

    state.items = Array.isArray(data) ? data : [];
    state.lookup = lookup;
    reconcileSelection({ preserveSelection: Boolean(opts.preserveSelection) });
    render();
    if (!opts.quiet) {
      msg(
        state.items.length ? `พบ ${state.items.length.toLocaleString('th-TH')} รายการ · เลือกเซตหรือเลือกทั้งหมดที่พร้อมได้` : 'ไม่พบรายการ',
        state.items.length ? 'success' : 'error',
      );
    }
    document.getElementById('tknReceiveBarcode')?.focus();
  }

  async function scan() {
    const barcodeInput = document.getElementById('tknReceiveBarcode');
    const barcode = norm(barcodeInput?.value);
    if (!barcode) return;
    if (!state.items.length) return msg('ค้นหา Batch/Tracking ก่อน', 'error');

    const matches = state.items.filter((item) => [item.barcode, item.source_sku, item.internal_sku, item.mapped_barcode]
      .some((value) => key(value) === key(barcode)));
    let selected = matches[0];

    if (!selected) {
      if (state.items.length === 1) selected = state.items[0];
      else {
        const choices = state.items.map((item, index) => `${index + 1}. ${item.source_sku || '-'} · ${item.product_name}`).join('\n');
        const pick = Number(prompt(`Barcode นี้ยังไม่เคยจับคู่\nเลือกสินค้าที่ตรงกัน:\n${choices}`));
        if (!pick || !state.items[pick - 1]) return;
        selected = state.items[pick - 1];
      }
    }

    const c = await client();
    const { data, error } = await c.rpc('tkn_v5281_register_receiving_scan', {
      p_batch_item_id: selected.id,
      p_barcode: barcode,
      p_quantity: 1,
    });
    if (error) return msg(error.message, 'error');

    if (barcodeInput) barcodeInput.value = '';
    await find({ preserveSelection: true, quiet: true });
    msg(`รับสแกน ${barcode} แล้ว · ${data.counted_quantity}/${data.expected_quantity}`, 'success');
  }

  async function resolveItem(id) {
    const item = state.items.find((row) => row.id === id);
    if (!item) return;
    const cost = Number(prompt('ต้นทุนสุดท้ายต่อชิ้น', String(num(item.unit_cost) || '')));
    if (!(cost > 0)) return msg('ต้นทุนต้องมากกว่า 0', 'error');
    const price = Number(prompt('ราคาขาย', String(num(item.selling_price) || '')));
    if (!(price > 0)) return msg('ราคาขายต้องมากกว่า 0', 'error');

    const sourceName = norm(item.source_product_name || item.product_name || '');
    const suggestedName = window.TKNThaiProductName?.make({
      originalName: sourceName,
      mainCategory: item.category_th,
      subCategory: item.subcategory_th,
      sku: item.internal_sku || item.source_sku || item.mapped_barcode || item.barcode,
    })?.name || sourceName;
    const enteredName = prompt('ชื่อสินค้า (ภาษาไทย)', suggestedName)?.trim();
    if (!enteredName) return msg('ต้องมีชื่อสินค้า', 'error');
    const name = window.TKNThaiProductName?.isThaiOnly?.(enteredName)
      ? enteredName
      : (window.TKNThaiProductName?.make({
          originalName: enteredName,
          mainCategory: item.category_th,
          subCategory: item.subcategory_th,
          sku: item.internal_sku || item.source_sku || item.mapped_barcode || item.barcode,
        })?.name || enteredName);
    const category = prompt('ประเภทสินค้า (ภาษาไทย)', item.category_th || '')?.trim();
    if (!category) return msg('ต้องระบุประเภทสินค้า', 'error');
    const subcategory = prompt('หมวดหมู่ย่อย (ภาษาไทย)', item.subcategory_th || '')?.trim() || 'ทั่วไป';
    const counted = Number(prompt('จำนวนตรวจจริง', String(num(item.counted_quantity))));
    if (!Number.isFinite(counted) || counted < 0) return msg('จำนวนตรวจจริงไม่ถูกต้อง', 'error');

    const c = await client();
    const { error } = await c.rpc('tkn_v5281_resolve_receiving_exception', {
      p_batch_item_id: id,
      p_final_unit_cost: cost,
      p_selling_price: price,
      p_product_name: name,
      p_category_th: category,
      p_subcategory_th: subcategory,
      p_counted_quantity: counted,
    });
    if (error) return msg(error.message, 'error');
    await find({ preserveSelection: true, quiet: true });
    msg('ยืนยันข้อมูลแล้ว ระบบคำนวณสถานะใหม่เรียบร้อย', 'success');
  }

  function selectCurrentSet() {
    const select = document.getElementById('tknReceiveSetSelect');
    const setKey = norm(select?.value);
    if (!setKey) return msg('ยังไม่มีเซตให้เลือก', 'error');
    state.selectionMode = 'SET';
    state.selectedSetKey = setKey;
    state.selectedIds = new Set(selectionFor(state.items, 'SET', setKey));
    render();
    msg(
      state.selectedIds.size
        ? `เลือกเซต ${setKey} แล้ว ${state.selectedIds.size.toLocaleString('th-TH')} รายการ`
        : `ตั้งค่าเซต ${setKey} แล้ว · รายการจะถูกเลือกอัตโนมัติเมื่อสแกนครบและ READY_TO_STORE`,
      'success',
    );
  }

  function selectAllReady() {
    state.selectionMode = 'ALL';
    state.selectedSetKey = '';
    state.selectedIds = new Set(selectionFor(state.items, 'ALL', ''));
    render();
    msg(
      state.selectedIds.size
        ? `เลือกทั้งหมดที่พร้อมแล้ว ${state.selectedIds.size.toLocaleString('th-TH')} รายการ`
        : 'ตั้งค่าเลือกทั้งหมดแล้ว · รายการจะถูกเลือกอัตโนมัติเมื่อสแกนครบและ READY_TO_STORE',
      'success',
    );
  }

  function clearSelection() {
    state.selectionMode = 'CUSTOM';
    state.selectedSetKey = '';
    state.selectedIds.clear();
    render();
    msg('ล้างรายการที่เลือกแล้ว');
  }

  async function loadCategories() {
    if (state.categories.length) return;
    const c = await client();
    const { data } = await c.from('categories').select('code,name');
    state.categories = data || [];
  }

  function categoryCode(item) {
    const categoryName = key(item.category_th).toLowerCase();
    const hit = state.categories.find((category) => key(category.name).toLowerCase() === categoryName
      || key(category.code).toLowerCase() === categoryName);
    return hit?.code || '';
  }

  async function prepareStock() {
    if (!state.items.length) return msg('ไม่มีรายการให้ส่งเข้าสต็อก', 'error');
    const ready = selectedReadyItems();
    if (!ready.length) return msg('กรุณาเลือกเซตหรือเลือกทั้งหมดที่พร้อมก่อนส่งเข้าสต็อก', 'error');

    const branches = [...new Set(ready.map((item) => norm(item.branch_code)).filter(Boolean))];
    if (branches.length > 1) return msg('รายการที่เลือกอยู่มากกว่า 1 สาขา กรุณาเลือกทีละสาขา', 'error');

    state.busy = true;
    updateSelectionUi();
    await loadCategories();

    try {
      const groups = new Map();
      for (const item of ready) {
        const productCode = norm(item.internal_sku || item.source_sku || item.mapped_barcode || item.barcode);
        if (!productCode) continue;
        const groupKeyValue = [productCode, norm(item.mapped_barcode || item.barcode), num(item.unit_cost), num(item.selling_price)].join('|');
        if (!groups.has(groupKeyValue)) {
          groups.set(groupKeyValue, {
            id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            selected: true,
            product_code: productCode,
            barcode: norm(item.mapped_barcode || item.barcode),
            product_name: window.TKNThaiProductName?.make({
              originalName: item.source_product_name || item.product_name,
              mainCategory: item.category_th,
              subCategory: item.subcategory_th,
              sku: item.internal_sku || item.source_sku || item.mapped_barcode || item.barcode,
            })?.name || item.product_name,
            category_code: categoryCode(item),
            unit_name: 'ชิ้น',
            brand_code: '',
            cost_price: String(num(item.unit_cost)),
            quantity: '0',
            selling_price: String(num(item.selling_price)),
            raw_selling_price: num(item.selling_price),
            condition_status: 'NORMAL',
            notes: `Universal Import ${item.batch_code || ''} / ${item.tracking_number || ''}`,
            existing: null,
            errors: [],
            status: 'DRAFT',
            imported: false,
            importResult: null,
            commit_state: 'PENDING',
            idempotency_key: `v5281-${item.id}`,
            tkn_commit_allocations: [],
          });
        }
        const group = groups.get(groupKeyValue);
        group.quantity = String(num(group.quantity) + num(item.expected_quantity));
        group.tkn_commit_allocations.push({ item_id: item.id, quantity: num(item.expected_quantity) });
      }

      const rows = [...groups.values()];
      if (!rows.length) return msg('รายการที่เลือกยังไม่มี SKU/Barcode สำหรับรับสต็อก', 'error');

      const branch = ready[0].branch_code || '';
      const draft = {
        version: '5.28.1',
        savedAt: new Date().toISOString(),
        settings: {
          branchCode: branch,
          supplier: ready[0].source || 'UNIVERSAL',
          reference: ready[0].batch_code || state.lookup,
          markupPercent: 30,
          vatRate: 7,
          costIncludesVat: false,
          roundToEndingZero: true,
          updateExistingPrice: true,
        },
        rows,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      location.href = './manual-product-import.html?from=universal_receiving';
    } finally {
      state.busy = false;
      updateSelectionUi();
    }
  }

  if (window.__TKN_TEST__) {
    window.TKNUniversalReceivingTest = Object.freeze({
      version: VERSION,
      exactReady,
      groupKey,
      selectionFor,
      groupsOf: (items) => {
        const old = state.items;
        state.items = items;
        const result = groupsOf();
        state.items = old;
        return result;
      },
    });
  }

  document.addEventListener('DOMContentLoaded', inject);
})();
