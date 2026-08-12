(() => {
  'use strict';

  const VERSION = '5.31.8';
  const MANUAL_STORAGE_KEY = 'tkn_manual_product_import_v5_15_draft';
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const source = page.includes('shopee') ? 'SHOPEE'
    : page.includes('lazada') ? 'LAZADA'
      : page.includes('manual-product') ? 'MANUAL'
        : null;
  let categoryMapCache = null;
  const dbName = source === 'SHOPEE' ? 'tkn_marketplace_import_v1'
    : source === 'LAZADA' ? 'tkn_marketplace_import_lazada_v1'
      : null;

  const SOURCE_MAP = new Map([
    ['home & living', ['บ้านและของใช้', 'ของใช้ทั่วไป']],
    ['tools & home improvement', ['เครื่องมือและอุปกรณ์บ้าน', 'เครื่องมือและอุปกรณ์']],
    ['mobile & gadgets', ['โทรศัพท์และอุปกรณ์', 'อุปกรณ์เสริมโทรศัพท์']],
    ['accessories', ['โทรศัพท์และอุปกรณ์', 'อุปกรณ์เสริมโทรศัพท์']],
    ['men shoes', ['แฟชั่น', 'รองเท้าผู้ชาย']],
    ['women shoes', ['แฟชั่น', 'รองเท้าผู้หญิง']],
    ['sneakers', ['แฟชั่น', 'รองเท้าผ้าใบ']],
    ['boots', ['แฟชั่น', 'รองเท้าบูท']],
    ['lightings', ['บ้านและของใช้', 'ไฟและอุปกรณ์ส่องสว่าง']],
    ['fishing tackles', ['กีฬาและกิจกรรมกลางแจ้ง', 'ตกปลาและอุปกรณ์']],
    ['kitchenware', ['บ้านและของใช้', 'เครื่องครัว']],
    ['pets', ['สัตว์เลี้ยงและอุปกรณ์', 'ของใช้สัตว์เลี้ยง']],
    ['pet supplies', ['สัตว์เลี้ยงและอุปกรณ์', 'ของใช้สัตว์เลี้ยง']],
    ['toys', ['ของเล่น โมเดล และของสะสม', 'ของเล่นทั่วไป']],
    ['hobbies & collections', ['ของเล่น โมเดล และของสะสม', 'ของสะสม']],
    ['beauty', ['ความงามและของใช้ส่วนตัว', 'ความงามทั่วไป']],
    ['automobiles', ['รถยนต์และอุปกรณ์', 'อุปกรณ์รถยนต์']],
    ['motorcycles', ['รถจักรยานยนต์และอุปกรณ์', 'อุปกรณ์รถจักรยานยนต์']]
  ]);

  const NAME_RULES = [
    { re: /\b(usb[ -]?c|charger|adapter|power bank|gan)\b|สายชาร์จ|ที่ชาร์จ|หัวชาร์จ/i, value: ['โทรศัพท์และอุปกรณ์', 'ที่ชาร์จและสายชาร์จ'] },
    { re: /เคสมือถือ|โทรศัพท์|สมาร์ตโฟน|หูฟัง|earphone|headphone/i, value: ['โทรศัพท์และอุปกรณ์', 'อุปกรณ์เสริมโทรศัพท์'] },
    { re: /รองเท้า|sneaker|boots?|รองเท้าบูท/i, value: ['แฟชั่น', 'รองเท้า'] },
    { re: /เสื้อ|กางเกง|กระโปรง|เดรส|shirt|pants|dress/i, value: ['แฟชั่น', 'เสื้อผ้า'] },
    { re: /สุนัข|แมว|สัตว์เลี้ยง|dog|cat|pet house|บ้านสัตว์/i, value: ['สัตว์เลี้ยงและอุปกรณ์', 'ของใช้สัตว์เลี้ยง'] },
    { re: /ของเล่น|โมเดล|ตุ๊กตา|toy|model car|figure/i, value: ['ของเล่น โมเดล และของสะสม', 'ของเล่นและโมเดล'] },
    { re: /หลอดไฟ|ไฟ\s*led|โคมไฟ|lamp|lighting/i, value: ['บ้านและของใช้', 'ไฟและอุปกรณ์ส่องสว่าง'] },
    { re: /หม้อ|กระทะ|จาน|ชาม|แก้ว|เครื่องครัว|kitchenware/i, value: ['บ้านและของใช้', 'เครื่องครัว'] },
    { re: /เครื่องมือช่าง|สว่าน|ไขควง|ฉนวนกันความร้อน|hardware tool/i, value: ['เครื่องมือและอุปกรณ์บ้าน', 'เครื่องมือช่าง'] },
    { re: /อุปกรณ์รถยนต์|อะไหล่รถ|car accessory|auto part/i, value: ['รถยนต์และอุปกรณ์', 'อุปกรณ์ยานยนต์'] },
    { re: /เครื่องสำอาง|ครีมบำรุง|เซรั่ม|cosmetic|skincare/i, value: ['ความงามและของใช้ส่วนตัว', 'เครื่องสำอางและดูแลผิว'] },
    { re: /ตกปลา|คันเบ็ด|รอกตกปลา|fishing/i, value: ['กีฬาและกิจกรรมกลางแจ้ง', 'ตกปลาและอุปกรณ์'] },
    { re: /กล่องใส่(?:กระดาษ)?ทิชชู่|ชั้นวาง|กล่องจัดเก็บ|storage organizer/i, value: ['บ้านและของใช้', 'อุปกรณ์จัดเก็บ'] }
  ];

  const n = (value) => {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const normalize = (value) => String(value ?? '').trim().toLowerCase();
  const request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  function sourceCategory(row) {
    const candidates = [row.item_category_name, row.sub_category, row.main_category, row.category, row.source_category]
      .map(normalize).filter(Boolean);
    for (const candidate of candidates) {
      if (SOURCE_MAP.has(candidate)) return SOURCE_MAP.get(candidate);
    }
    for (const [key, value] of SOURCE_MAP.entries()) {
      if (candidates.some((candidate) => candidate.includes(key))) return value;
    }
    return null;
  }

  function nameCategory(row) {
    const name = [row.item_name, row.product_name, row.name, row.product_description].filter(Boolean).join(' ');
    for (const rule of NAME_RULES) if (rule.re.test(name)) return rule.value;
    return null;
  }

  function thaiCategory(row) {
    const byName = nameCategory(row);
    const bySource = sourceCategory(row);
    if (byName && bySource && byName[0] !== bySource[0]) {
      return { main: byName[0], sub: byName[1], confidence: 'REVIEW', reason: 'ชื่อสินค้าขัดแย้งกับหมวดหมู่ต้นทาง' };
    }
    if (byName) return { main: byName[0], sub: byName[1], confidence: 'AUTO', reason: 'วิเคราะห์จากชื่อสินค้า' };
    if (bySource) return { main: bySource[0], sub: bySource[1], confidence: 'AUTO', reason: 'จับคู่หมวดหมู่ต้นทาง' };
    return { main: 'ยังไม่จัดประเภท', sub: 'รอตรวจหมวดหมู่', confidence: 'REVIEW', reason: 'ข้อมูลไม่เพียงพอ' };
  }

  async function openExistingDatabase(name) {
    if (!name || !('indexedDB' in window)) return null;
    return new Promise((resolve) => {
      let created = false;
      const op = indexedDB.open(name);
      op.onerror = () => resolve(null);
      op.onupgradeneeded = () => { created = true; };
      op.onsuccess = () => {
        const db = op.result;
        if (created || !db.objectStoreNames.contains('records')) {
          db.close();
          if (created) indexedDB.deleteDatabase(name);
          resolve(null);
          return;
        }
        resolve(db);
      };
    });
  }

  async function readIndexedWorkspace() {
    const db = await openExistingDatabase(dbName);
    if (!db) return { rows: [], settings: {} };
    try {
      const tx = db.transaction('records', 'readonly');
      return { rows: await request(tx.objectStore('records').getAll()) || [], settings: {} };
    } finally {
      db.close();
    }
  }

  function readManualWorkspace() {
    try {
      const draft = JSON.parse(localStorage.getItem(MANUAL_STORAGE_KEY) || 'null');
      const rows = Array.isArray(draft?.rows) ? draft.rows.filter((row) => !row.imported && row.selected !== false) : [];
      return { rows, settings: draft?.settings || {} };
    } catch (error) {
      console.warn('อ่านร่างนำเข้าด้วยตนเองไม่สำเร็จ:', error);
      return { rows: [], settings: {} };
    }
  }

  async function readWorkspace() {
    if (source === 'MANUAL') return readManualWorkspace();
    if (source === 'SHOPEE' || source === 'LAZADA') return readIndexedWorkspace();
    return { rows: [], settings: {} };
  }

  async function getClient() {
    for (let i = 0; i < 60; i += 1) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  async function loadManualCategoryMap() {
    if (categoryMapCache) return categoryMapCache;
    const client = await getClient();
    if (!client) return new Map();
    const { data, error } = await client.from('categories').select('code,name');
    if (error) throw error;
    categoryMapCache = new Map((data || []).map((row) => [String(row.code || '').trim(), String(row.name || '').trim()]));
    return categoryMapCache;
  }

  async function enrichWorkspaceRows(workspace) {
    if (source !== 'MANUAL') return workspace.rows;
    try {
      const map = await loadManualCategoryMap();
      return workspace.rows.map((row) => ({ ...row, tkn_category_name: map.get(String(row.category_code || '').trim()) || '' }));
    } catch (error) {
      console.warn('อ่านชื่อหมวดหมู่สำหรับงานนำเข้าเองไม่สำเร็จ:', error);
      return workspace.rows;
    }
  }

  function flowHost() {
    return document.querySelector('.hero-card,.top,.page-hero,.shopee-hero,main');
  }

  function stageForPage() {
    if (page.includes('sort-pack')) return 4;
    if (page.includes('box-qr')) return 5;
    if (source) return 2;
    return 1;
  }

  function injectFlow() {
    if (document.getElementById('tknMpFlow')) return;
    const host = flowHost();
    if (!host) return;
    const current = stageForPage();
    const canCreate = Boolean(source);
    const section = document.createElement('section');
    section.id = 'tknMpFlow';
    section.className = 'tkn-mp-flow';
    section.innerHTML = `
      <div class="tkn-mp-flow__head">
        <div><h2>กระบวนการ Marketplace → สต็อก</h2><p>ไฟล์เป็นยอดคาดการณ์ ส่วนยอดสต็อกเกิดจากสินค้าที่สแกนพบจริงและปิดกล่องแล้ว</p></div>
        <div class="tkn-mp-actions">
          ${canCreate ? '<button class="tkn-mp-btn primary" id="tknCreateBatchBtn" type="button">สร้างชุดงานคัดแยก</button>' : ''}
          <a class="tkn-mp-btn ghost" href="./sort-pack-qr.html">แยกสินค้า / ปิดกล่อง</a>
          <a class="tkn-mp-btn ghost" href="./box-qr-stock.html">Box QR / จัดเก็บ</a>
        </div>
      </div>
      <div class="tkn-mp-flow__steps">${['นำเข้าไฟล์', 'ตรวจข้อมูล/ต้นทุน', 'สร้างฉลาก', 'สแกนคัดแยก', 'ปิดกล่อง', 'พร้อมขาย'].map((label, index) => `<div class="tkn-mp-step ${index + 1 === current ? 'is-current' : ''}">${index + 1}. ${label}</div>`).join('')}</div>
      <div id="tknMpSummary" class="tkn-mp-summary"></div>
      <div id="tknMpAlert" class="tkn-mp-alert">กำลังตรวจข้อมูล...</div>`;
    host.insertAdjacentElement('afterend', section);
    document.getElementById('tknCreateBatchBtn')?.addEventListener('click', openBatchModal);
    refreshSummary();
  }

  function normalizeRow(row, index) {
    const category = row.tkn_category_name
      ? { main: row.tkn_category_name, sub: 'สินค้าทั่วไป', confidence: 'AUTO', reason: 'หมวดหมู่ที่เลือกในระบบ TKN' }
      : thaiCategory(row);
    const sourceSku = String(row.sku_id || row.source_sku || row.seller_sku || row.product_code || row.barcode || '').trim();
    const tracking = String(row.tracking_number || row.handover_tracking_number || row.reference || '').trim();
    const order = String(row.order_number || row.order_sn || row.return_number || '').trim();
    const sourceProductName = String(row.item_name || row.product_name || row.name || 'สินค้าไม่ระบุชื่อ').trim();
    const thaiName = window.TKNThaiProductName?.make({
      originalName: sourceProductName,
      mainCategory: category.main || row.main_category || row.source_category,
      subCategory: category.sub || row.sub_category,
      sku: sourceSku
    }) || { name: sourceProductName, status: 'SOURCE_FALLBACK', changed: false };
    const productName = thaiName.name;
    const unitCost = n(row.cost_price ?? row.unit_cost);
    const sellingPrice = n(row.selling_price ?? row.sale_price);
    return {
      line_no: index + 1,
      tracking_number: tracking,
      order_number: order,
      source_sku: sourceSku,
      barcode: String(row.barcode || '').trim(),
      product_name: productName,
      source_product_name: sourceProductName,
      product_name_th_status: thaiName.status,
      expected_quantity: Math.max(n(row.item_quantity ?? row.quantity) || 1, 0),
      unit_cost: unitCost > 0 ? unitCost : null,
      selling_price: sellingPrice > 0 ? sellingPrice : null,
      category_th: category.main,
      subcategory_th: category.sub,
      category_status: category.confidence,
      category_reason: category.reason,
      raw_data: {
        ...row,
        _tkn_source_product_name: sourceProductName,
        _tkn_thai_product_name: productName,
        _tkn_product_name_th_status: thaiName.status
      }
    };
  }

  async function refreshSummary() {
    const workspace = await readWorkspace();
    const rows = await enrichWorkspaceRows(workspace);
    const normalizedRows = rows.map(normalizeRow);
    const trackingCount = new Set(normalizedRows.map((row) => row.tracking_number).filter(Boolean)).size;
    const skuCount = new Set(normalizedRows.map((row) => row.source_sku).filter(Boolean)).size;
    const quantity = normalizedRows.reduce((sum, row) => sum + row.expected_quantity, 0);
    const missingCost = normalizedRows.filter((row) => !row.unit_cost).length;
    const reviewCategory = normalizedRows.filter((row) => row.category_status === 'REVIEW').length;
    const categoryNamed = normalizedRows.filter((row) => row.product_name_th_status === 'AUTO_CATEGORY').length;
    const summary = document.getElementById('tknMpSummary');
    if (summary) {
      summary.innerHTML = [
        ['รายการ', normalizedRows.length], ['Tracking', trackingCount], ['SKU', skuCount],
        ['จำนวนคาดการณ์', quantity], ['รอต้นทุน', missingCost], ['ชื่อไทยจากหมวด', categoryNamed]
      ].map(([label, value]) => `<div class="tkn-mp-stat"><span>${label}</span><strong>${Number(value).toLocaleString('th-TH')}</strong></div>`).join('');
    }
    const alertBox = document.getElementById('tknMpAlert');
    if (!alertBox) return;
    alertBox.className = 'tkn-mp-alert';
    if (!normalizedRows.length) alertBox.textContent = source ? 'ยังไม่มีข้อมูลในพื้นที่ทำงานของหน้านี้' : 'เลือกโมดูล Shopee, Lazada หรือนำเข้าด้วยตนเองเพื่อเริ่มงาน';
    else if (missingCost) alertBox.textContent = `มี ${missingCost.toLocaleString('th-TH')} รายการที่ยังไม่มีต้นทุน สามารถสร้างชุดงานได้แต่ยังปิดกล่องพร้อมขายไม่ได้`;
    else if (reviewCategory) alertBox.textContent = `มี ${reviewCategory.toLocaleString('th-TH')} รายการรอตรวจหมวดหมู่ภาษาไทย`;
    else {
      alertBox.classList.add('ok');
      alertBox.textContent = 'ข้อมูลพร้อมสร้างชุดงานคัดแยก';
    }
  }

  async function loadBranches(selectedCode = '') {
    const client = await getClient();
    if (!client) return [];
    const { data, error } = await client.from('branches').select('code,name').eq('is_active', true).order('sort_order');
    if (error) throw error;
    return (data || []).map((branch) => ({ ...branch, selected: branch.code === selectedCode }));
  }

  async function openBatchModal() {
    const workspace = await readWorkspace();
    const workspaceRows = await enrichWorkspaceRows(workspace);
    const rows = workspaceRows.map(normalizeRow);
    if (!rows.length) return alert('ยังไม่มีข้อมูลในพื้นที่ทำงาน');
    let branches = [];
    try {
      branches = await loadBranches(workspace.settings?.branchCode || '');
    } catch (error) {
      return alert(`อ่านรายชื่อสาขาไม่สำเร็จ: ${error.message || error}`);
    }
    if (!branches.length) return alert('ไม่พบสาขาที่เปิดใช้งาน');

    let modal = document.getElementById('tknMpModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'tknMpModal';
      modal.className = 'tkn-mp-modal';
      document.body.appendChild(modal);
    }
    const totals = {
      quantity: rows.reduce((sum, row) => sum + row.expected_quantity, 0),
      missingCost: rows.filter((row) => !row.unit_cost).length,
      reviewCategory: rows.filter((row) => row.category_status === 'REVIEW').length,
      categoryNamed: rows.filter((row) => row.product_name_th_status === 'AUTO_CATEGORY').length
    };
    modal.hidden = false;
    modal.innerHTML = `<div class="tkn-mp-modal__card">
      <h2>สร้างชุดงานคัดแยก ${esc(source)}</h2>
      <p>ระบบจะยังไม่เพิ่มยอดสต็อกจากไฟล์ ยอดจริงเกิดเมื่อสแกนสินค้าภายในกล่อง</p>
      <label>ชื่อชุดงาน<input id="tknBatchName" value="${esc(`${source} ${new Date().toLocaleDateString('th-TH')}`)}"></label>
      <label>สาขารับเข้า<select id="tknBatchBranch">${branches.map((branch) => `<option value="${esc(branch.code)}" ${branch.selected ? 'selected' : ''}>${esc(branch.code)} — ${esc(branch.name)}</option>`).join('')}</select></label>
      <table class="tkn-mp-table">
        <tr><th>รายการ</th><td>${rows.length.toLocaleString('th-TH')}</td></tr>
        <tr><th>จำนวนคาดการณ์</th><td>${totals.quantity.toLocaleString('th-TH')}</td></tr>
        <tr><th>รอต้นทุน</th><td>${totals.missingCost.toLocaleString('th-TH')}</td></tr>
        <tr><th>รอตรวจหมวดหมู่</th><td>${totals.reviewCategory.toLocaleString('th-TH')}</td></tr>
        <tr><th>ชื่อไทยสร้างจากหมวด</th><td>${totals.categoryNamed.toLocaleString('th-TH')}</td></tr>
      </table>
      <div class="tkn-mp-alert">รายการที่ยังไม่มีต้นทุนหรือหมวดหมู่สามารถเข้าสู่การคัดแยกได้ แต่ระบบจะไม่อนุญาตให้ปิดกล่องพร้อมขายจนกว่าข้อมูลครบ</div>
      <div class="tkn-mp-actions" style="margin-top:16px">
        <button class="tkn-mp-btn primary" id="tknConfirmBatch" type="button">ยืนยันสร้างชุดงาน</button>
        <button class="tkn-mp-btn ghost" id="tknCloseModal" type="button">ยกเลิก</button>
      </div>
    </div>`;
    document.getElementById('tknCloseModal').onclick = () => { modal.hidden = true; };
    document.getElementById('tknConfirmBatch').onclick = () => createBatch(rows, modal);
  }

  async function digestRows(rows) {
    const canonical = rows.map((row) => ({
      tracking_number: row.tracking_number,
      order_number: row.order_number,
      source_sku: row.source_sku,
      product_name: row.source_product_name || row.product_name,
      expected_quantity: row.expected_quantity,
      unit_cost: row.unit_cost,
      selling_price: row.selling_price
    }));
    const bytes = new TextEncoder().encode(JSON.stringify(canonical));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  async function createBatch(rows, modal) {
    const client = await getClient();
    if (!client) return alert('ยังเชื่อมต่อฐานข้อมูลไม่ได้');
    const button = document.getElementById('tknConfirmBatch');
    button.disabled = true;
    button.textContent = 'กำลังสร้าง...';
    try {
      const fingerprint = await digestRows(rows);
      const beginArgs = {
        p_source: source,
        p_batch_name: document.getElementById('tknBatchName').value.trim(),
        p_branch_code: document.getElementById('tknBatchBranch').value,
        p_source_fingerprint: fingerprint
      };
      const begin = await client.rpc('tkn_v5271_begin_import_batch', beginArgs);
      if (begin.error) throw begin.error;
      const batchId = begin.data?.batch_id;
      const batchCode = begin.data?.batch_code || '';
      if (!batchId) throw new Error('ระบบไม่ได้คืนรหัสชุดงาน');
      const chunkSize = 500;
      for (let start = 0; start < rows.length; start += chunkSize) {
        button.textContent = `กำลังบันทึก ${Math.min(start + chunkSize, rows.length).toLocaleString('th-TH')} / ${rows.length.toLocaleString('th-TH')}`;
        const chunk = rows.slice(start, start + chunkSize).map((row, index) => ({
          ...row,
          source_line_key: `${start + index + 1}:${row.tracking_number}:${row.source_sku}:${row.order_number}`
        }));
        const appended = await client.rpc('tkn_v5271_append_import_items', { p_batch_id: batchId, p_items: chunk });
        if (appended.error) throw appended.error;
      }
      const finalized = await client.rpc('tkn_v5271_finalize_import_batch', { p_batch_id: batchId });
      if (finalized.error) throw finalized.error;
      modal.hidden = true;
      alert(`สร้างชุดงาน ${batchCode} สำเร็จ\nระบบจะเปิดหน้าแยกสินค้าเพื่อสแกนของจริง`);
      location.href = `./sort-pack-qr.html?batch=${encodeURIComponent(batchCode)}&source=${encodeURIComponent(source)}`;
    } catch (error) {
      console.error(error);
      const duplicate = String(error.message || '').includes('DUPLICATE_IMPORT_BATCH');
      alert(duplicate ? 'ข้อมูลชุดนี้ถูกสร้างเป็นชุดงานแล้ว ระบบป้องกันการนำเข้าซ้ำ' : `สร้างชุดงานไม่สำเร็จ: ${error.message || error}`);
      button.disabled = false;
      button.textContent = 'ยืนยันสร้างชุดงาน';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectFlow();
    setInterval(refreshSummary, 15000);
  });

  window.TKNMarketplaceWorkflow = Object.freeze({ version: VERSION, thaiCategory, refreshSummary, readWorkspace });
})();
