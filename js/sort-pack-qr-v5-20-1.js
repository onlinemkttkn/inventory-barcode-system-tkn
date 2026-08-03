(() => {
  'use strict';

  const VERSION = '5.20.1';
  const STATE_KEY = 'tkn_sort_pack_v5201';
  const LEGACY_STATE_KEY = 'tkn_sort_pack_v520';
  const ENGINE = window.TKNCategoryEngine;
  if (!ENGINE) throw new Error('ไม่พบ TKN Category Engine v5.20.1');

  const $ = (id) => document.getElementById(id);
  const CATEGORIES = [...ENGINE.CATEGORIES];
  const SOURCE_DATABASES = Object.freeze({
    SHOPEE: 'tkn_marketplace_import_v1',
    LAZADA: 'tkn_marketplace_import_lazada_v1',
  });

  const state = {
    step: 1,
    lot: null,
    items: [],
    box: null,
    labelQueue: [],
    page: 1,
    pageSize: 25,
    query: '',
    statusFilter: 'ALL',
    selectedIds: [],
    expandedIds: [],
    categories: CATEGORIES,
  };

  let persistTimer = null;
  let searchTimer = null;
  let categoryMemory = ENGINE.loadLocalMemory();

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const money = (value) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numberValue = (value, fallback = 0) => {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const nowIso = () => new Date().toISOString();
  const cloneItem = (item) => JSON.parse(JSON.stringify(item));
  const codeCost = (value) => `C${Math.round(Number(value || 0) * 100).toString(36).toUpperCase()}`;
  const unique = (values) => [...new Set(values.filter(Boolean))];

  function saveState() {
    const packet = { ...state, categories: CATEGORIES };
    localStorage.setItem(STATE_KEY, JSON.stringify(packet));
  }

  function migrateItem(item) {
    const sourceCategory = item.sourceCategory || item.mainCategory || item.subCategory || '';
    const categoryIsKnown = Boolean(ENGINE.isKnownCategory(item.category));
    return {
      id: item.id || crypto.randomUUID(),
      sourceItemId: item.sourceItemId || item.id || '',
      source: item.source || 'AUTO',
      tracking: item.tracking || state.lot?.tracking || '',
      order: item.order || '',
      sourceSku: item.sourceSku || '',
      sku: item.sku || item.sourceSku || '',
      name: item.name || 'สินค้าไม่ระบุชื่อ',
      quantity: Math.max(1, numberValue(item.quantity, 1)),
      unitCost: Math.max(0, numberValue(item.unitCost, 0)),
      hasCost: item.hasCost !== undefined ? Boolean(item.hasCost) : Number(item.unitCost || 0) > 0,
      sourcePrice: Math.max(0, numberValue(item.sourcePrice, 0)),
      mainCategory: item.mainCategory || '',
      subCategory: item.subCategory || '',
      sourceCategory,
      category: categoryIsKnown ? ENGINE.isKnownCategory(item.category) : '',
      categoryConfirmed: item.categoryConfirmed !== undefined ? Boolean(item.categoryConfirmed) : categoryIsKnown,
      suggestedCategory: item.suggestedCategory || '',
      categoryOrigin: item.categoryOrigin || (categoryIsKnown ? 'LEGACY_CONFIRMED' : ''),
      categoryConfidence: numberValue(item.categoryConfidence, categoryIsKnown ? 1 : 0),
      categoryReason: item.categoryReason || (categoryIsKnown ? 'ข้อมูลที่เลือกไว้ก่อนอัปเดต' : ''),
      status: item.status || 'PENDING',
      labelQueued: Boolean(item.labelQueued),
      productId: item.productId || null,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY) || localStorage.getItem(LEGACY_STATE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw);
      Object.assign(state, stored || {});
      state.categories = CATEGORIES;
      state.items = Array.isArray(stored?.items) ? stored.items.map(migrateItem) : [];
      state.labelQueue = Array.isArray(stored?.labelQueue) ? stored.labelQueue.map(migrateItem) : [];
      if (stored?.box?.items) stored.box.items = stored.box.items.map(migrateItem);
      state.box = stored?.box || null;
      state.selectedIds = Array.isArray(stored?.selectedIds) ? stored.selectedIds : [];
      state.expandedIds = [];
      state.pageSize = [10, 25, 50, 100].includes(Number(stored?.pageSize)) ? Number(stored.pageSize) : 25;
      if (!localStorage.getItem(STATE_KEY)) saveState();
    } catch (error) {
      console.warn('กู้คืนงานแยกสินค้าไม่สำเร็จ:', error);
    }
  }

  function message(text, type = 'info') {
    const element = $('notice');
    element.hidden = false;
    element.textContent = text;
    element.className = `sp-notice${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    clearTimeout(message.timer);
    message.timer = setTimeout(() => { element.hidden = true; }, 5200);
  }

  function setCloudStatus(text, mode = '') {
    const element = $('cloudStatus');
    element.textContent = text;
    element.dataset.mode = mode;
  }

  function newLotCode() {
    return `LOT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-5)}`;
  }

  function newBoxCode() {
    return `TKN-B-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${String(Date.now()).slice(-5)}`;
  }

  async function waitClient() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB error'));
    });
  }

  async function databaseExists(name) {
    if (typeof indexedDB.databases !== 'function') return true;
    try {
      const databases = await indexedDB.databases();
      return databases.some((entry) => entry.name === name);
    } catch {
      return true;
    }
  }

  async function openExistingDatabase(name) {
    if (!('indexedDB' in window) || !(await databaseExists(name))) return null;
    return new Promise((resolve, reject) => {
      let created = false;
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { created = request.oldVersion === 0; };
      request.onsuccess = () => {
        const db = request.result;
        if (created || !db.objectStoreNames.contains('records')) {
          db.close();
          if (created) indexedDB.deleteDatabase(name);
          resolve(null);
          return;
        }
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error(`เปิด ${name} ไม่สำเร็จ`));
    });
  }

  async function readIndexedRows(source, tracking) {
    const dbName = SOURCE_DATABASES[source];
    if (!dbName) return [];
    const db = await openExistingDatabase(dbName);
    if (!db) return [];
    try {
      const transaction = db.transaction('records', 'readonly');
      const store = transaction.objectStore('records');
      let rows = [];
      if (store.indexNames.contains('tracking_number')) {
        rows = await requestResult(store.index('tracking_number').getAll(IDBKeyRange.only(tracking)));
      }
      if (!rows.length) {
        const all = await requestResult(store.getAll());
        rows = all.filter((row) => String(row.tracking_number || row.order_number || '').trim() === tracking);
      }
      return rows || [];
    } finally {
      db.close();
    }
  }

  function sourceCandidates() {
    const selected = $('sourceSelect').value;
    if (selected === 'SHOPEE' || selected === 'LAZADA') return [selected];
    if (selected === 'MANUAL') return [];
    return ['SHOPEE', 'LAZADA'];
  }

  function normalizeSourceRow(row, fallbackSource, tracking) {
    const source = String(row.source || fallbackSource || 'AUTO').toUpperCase();
    const costRaw = row.unit_cost ?? row.cost_price ?? '';
    const explicitCostFlag = row.raw_data?.cost_provided;
    const hasCost = typeof explicitCostFlag === 'boolean'
      ? explicitCostFlag
      : row.cost_price !== undefined
        ? String(row.cost_price ?? '').trim() !== ''
        : numberValue(row.unit_cost, 0) > 0;
    const mainCategory = String(row.main_category || row.raw_data?.main_category || '').trim();
    const subCategory = String(row.sub_category || row.raw_data?.sub_category || '').trim();
    const sourceCategory = String(row.category || subCategory || mainCategory || '').trim();
    const sourceSku = String(row.source_sku || row.sku_id || row.seller_sku || row.sku || '').trim();
    const sku = String(row.sku || row.product_code || sourceSku || '').trim();
    return migrateItem({
      id: row.id || crypto.randomUUID(),
      sourceItemId: row.id || row.key || `${source}:${tracking}:${sourceSku}`,
      source,
      tracking: String(row.tracking_number || tracking || '').trim(),
      order: String(row.order_number || row.return_number || '').trim(),
      sourceSku,
      sku,
      name: String(row.product_name || row.item_name || row.name || 'สินค้าไม่ระบุชื่อ').trim(),
      quantity: row.quantity ?? row.item_quantity ?? row.actual_qty ?? 1,
      unitCost: costRaw,
      hasCost,
      sourcePrice: row.source_item_price ?? row.item_price_pp ?? 0,
      mainCategory,
      subCategory,
      sourceCategory,
      category: '',
      categoryConfirmed: false,
      productId: row.product_id || null,
    });
  }

  function deduplicateItems(items) {
    const map = new Map();
    for (const item of items) {
      const key = `${item.source}|${item.tracking}|${item.sourceSku || item.sku}|${item.name}`.toUpperCase();
      if (!map.has(key)) {
        map.set(key, item);
        continue;
      }
      const existing = map.get(key);
      existing.quantity += item.quantity;
      if (!existing.hasCost && item.hasCost) {
        existing.unitCost = item.unitCost;
        existing.hasCost = true;
      }
      if (!existing.sourceCategory && item.sourceCategory) existing.sourceCategory = item.sourceCategory;
    }
    return [...map.values()];
  }

  async function readServerRows(tracking) {
    if ($('sourceSelect').value === 'MANUAL') return [];
    const client = await waitClient();
    if (!client) return [];
    const candidates = sourceCandidates();
    const tables = ['marketplace_sorting_source_items', 'marketplace_receiving_items'];
    for (const table of tables) {
      for (const source of candidates.length ? candidates : ['']) {
        try {
          let query = client.from(table).select('*').eq('tracking_number', tracking);
          if (source && table === 'marketplace_sorting_source_items') query = query.eq('source', source);
          let result = await query;
          if ((!result.data || !result.data.length) && table === 'marketplace_sorting_source_items') {
            let orderQuery = client.from(table).select('*').eq('order_number', tracking);
            if (source) orderQuery = orderQuery.eq('source', source);
            result = await orderQuery;
          }
          if (!result.error && result.data?.length) {
            return result.data.map((row) => normalizeSourceRow(row, source, tracking));
          }
        } catch (error) {
          console.warn(`อ่าน ${table} ไม่สำเร็จ:`, error);
        }
      }
    }
    return [];
  }

  async function readLocalMarketplaceRows(tracking) {
    if ($('sourceSelect').value === 'MANUAL') return [];
    const items = [];
    for (const source of sourceCandidates()) {
      try {
        const rows = await readIndexedRows(source, tracking);
        items.push(...rows.map((row) => normalizeSourceRow(row, source, tracking)));
      } catch (error) {
        console.warn(`อ่านพื้นที่งาน ${source} ไม่สำเร็จ:`, error);
      }
    }
    if (items.length) return deduplicateItems(items);

    const keys = Object.keys(localStorage).filter((key) => /shopee|lazada|import/i.test(key));
    for (const key of keys) {
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        const rows = Array.isArray(raw) ? raw : (raw?.items || raw?.rows || []);
        const found = rows.filter((row) => String(row.tracking_number || row.tracking || row.order_number || '').trim() === tracking);
        const source = /lazada/i.test(key) ? 'LAZADA' : 'SHOPEE';
        items.push(...found.map((row) => normalizeSourceRow(row, source, tracking)));
      } catch {}
    }
    return deduplicateItems(items);
  }

  async function findSource(tracking) {
    const serverRows = await readServerRows(tracking);
    if (serverRows.length) return { items: deduplicateItems(serverRows), location: 'SERVER' };
    const localRows = await readLocalMarketplaceRows(tracking);
    if (localRows.length) return { items: localRows, location: 'LOCAL' };
    return { items: [], location: 'NONE' };
  }

  async function loadRemoteCategoryRules(items) {
    const client = await waitClient();
    if (!client) return;
    const skus = unique(items.flatMap((item) => [ENGINE.normalizeSku(item.sku), ENGINE.normalizeSku(item.sourceSku)])).filter(Boolean);
    if (!skus.length) return;
    for (let start = 0; start < skus.length; start += 100) {
      try {
        const { data, error } = await client
          .from('sorting_sku_category_rules')
          .select('sku,category,updated_at')
          .in('sku', skus.slice(start, start + 100));
        if (error) throw error;
        for (const rule of data || []) {
          const sku = ENGINE.normalizeSku(rule.sku);
          const category = ENGINE.isKnownCategory(rule.category);
          if (sku && category) categoryMemory[sku] = { category, updatedAt: rule.updated_at || nowIso() };
        }
      } catch (error) {
        console.warn('อ่านกฎหมวด SKU จากฐานข้อมูลไม่สำเร็จ:', error);
        break;
      }
    }
    ENGINE.saveLocalMemory(categoryMemory);
  }

  function suggestItemCategory(item, force = false) {
    if (item.categoryConfirmed && !force) return;
    const remembered = ENGINE.getRememberedCategory(categoryMemory, item.sku, item.sourceSku);
    const result = ENGINE.classify(item, remembered);
    item.suggestedCategory = result.category || '';
    item.categoryOrigin = result.origin;
    item.categoryConfidence = result.confidence;
    item.categoryReason = result.reason;
    if (result.autoConfirm && result.category) {
      item.category = result.category;
      item.categoryConfirmed = true;
      item.status = 'CLASSIFIED';
    } else {
      item.category = result.category || '';
      item.categoryConfirmed = false;
      item.status = result.category ? 'SUGGESTED' : 'PENDING';
    }
  }

  async function prepareCategorySuggestions(items) {
    await loadRemoteCategoryRules(items);
    categoryMemory = ENGINE.loadLocalMemory();
    for (const item of items) suggestItemCategory(item, false);
  }

  async function rememberCategory(item, category) {
    const normalized = ENGINE.isKnownCategory(category);
    if (!normalized) return;
    for (const sku of unique([ENGINE.normalizeSku(item.sku), ENGINE.normalizeSku(item.sourceSku)])) {
      if (!sku) continue;
      ENGINE.rememberSku(sku, normalized);
      categoryMemory[sku] = { category: normalized, updatedAt: nowIso() };
    }
    const client = await waitClient();
    if (!client) return;
    const payload = unique([ENGINE.normalizeSku(item.sku), ENGINE.normalizeSku(item.sourceSku)])
      .filter(Boolean)
      .map((sku) => ({ sku, category: normalized, source: item.source || 'MANUAL', updated_at: nowIso() }));
    if (!payload.length) return;
    const { error } = await client.from('sorting_sku_category_rules').upsert(payload, { onConflict: 'sku' });
    if (error) console.warn('บันทึกกฎหมวด SKU ไม่สำเร็จ:', error);
  }

  function setCategory(item, category, origin = 'MANUAL') {
    const normalized = ENGINE.isKnownCategory(category);
    if (!item || !normalized) return;
    item.category = normalized;
    item.suggestedCategory = normalized;
    item.categoryConfirmed = true;
    item.categoryOrigin = origin;
    item.categoryConfidence = 1;
    item.categoryReason = origin === 'BULK' ? 'กำหนดหมวดแบบกลุ่ม' : origin === 'CONFIRM_SUGGESTION' ? 'พนักงานยืนยันคำแนะนำของระบบ' : 'พนักงานเลือกหมวด';
    item.status = 'CLASSIFIED';
    state.expandedIds = state.expandedIds.filter((id) => id !== item.id);
    syncQueuedSnapshot(item);
    rememberCategory(item, normalized).catch(() => {});
    saveState();
    schedulePersist();
  }

  async function persistLot() {
    if (!state.lot) return null;
    const client = await waitClient();
    if (!client) return null;
    try {
      const { data, error } = await client.from('sorting_lots').upsert({
        lot_code: state.lot.code,
        tracking_number: state.lot.tracking,
        source: state.lot.source,
        status: state.lot.status || 'OPEN',
        note: state.lot.note || '',
        closed_at: state.lot.closedAt || null,
      }, { onConflict: 'lot_code' }).select('id').single();
      if (error) throw error;
      state.lot.id = data?.id || state.lot.id;
      saveState();
      return state.lot.id;
    } catch (error) {
      console.warn('บันทึกลอตไม่สำเร็จ:', error);
      return null;
    }
  }

  async function persistItems() {
    if (!state.lot || !state.items.length) return;
    const client = await waitClient();
    if (!client) return;
    const lotId = state.lot.id || await persistLot();
    if (!lotId) return;
    const rows = state.items.map((item) => ({
      lot_id: lotId,
      client_ref: item.id,
      source_item_id: String(item.sourceItemId || item.id),
      product_id: item.productId || null,
      source_sku: item.sourceSku || '',
      sku: item.sku || '',
      product_name: item.name,
      category: item.category || '',
      source_category: item.sourceCategory || '',
      category_origin: item.categoryOrigin || '',
      category_confidence: item.categoryConfidence || 0,
      category_confirmed: Boolean(item.categoryConfirmed),
      quantity: item.quantity,
      unit_cost: item.unitCost,
      cost_code: item.hasCost ? codeCost(item.unitCost) : '',
      status: item.status || 'PENDING',
      box_code: state.box?.items?.some((row) => row.id === item.id) ? state.box.code : null,
    }));
    for (let start = 0; start < rows.length; start += 300) {
      const { error } = await client
        .from('sorting_lot_items')
        .upsert(rows.slice(start, start + 300), { onConflict: 'lot_id,client_ref' });
      if (error) {
        console.warn('บันทึกรายการลอตไม่สำเร็จ:', error);
        return;
      }
    }
  }

  function schedulePersist(delay = 800) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistItems().catch(() => {}), delay);
  }

  async function loadTracking() {
    const tracking = $('trackingInput').value.trim();
    if (!tracking) return message('กรุณาสแกน Tracking ก่อน', 'error');
    $('loadTrackingBtn').disabled = true;
    $('loadTrackingBtn').textContent = 'กำลังค้นหา...';
    try {
      const result = await findSource(tracking);
      let items = result.items;
      if (!items.length) {
        items = [migrateItem({
          id: crypto.randomUUID(),
          source: $('sourceSelect').value,
          tracking,
          name: 'รายการใหม่ — ระบุชื่อ SKU ต้นทุน และหมวด',
          quantity: 1,
          unitCost: 0,
          hasCost: false,
        })];
        message('ไม่พบรายการจากไฟล์ จึงสร้างรายการรอระบุข้อมูล 1 รายการ', 'info');
      }

      await prepareCategorySuggestions(items);
      const sources = unique(items.map((item) => item.source));
      state.lot = {
        code: newLotCode(),
        tracking,
        source: sources.length === 1 ? sources[0] : $('sourceSelect').value,
        note: $('lotNote').value.trim(),
        openedAt: nowIso(),
        status: 'OPEN',
        dataLocation: result.location,
      };
      state.items = items;
      state.box = null;
      state.labelQueue = [];
      state.selectedIds = [];
      state.expandedIds = [];
      state.page = 1;
      $('lotCode').value = state.lot.code;
      await persistLot();
      schedulePersist(50);
      saveState();
      render();
      go(2);

      const autoCount = state.items.filter((item) => item.categoryConfirmed).length;
      const reviewCount = state.items.filter((item) => !item.categoryConfirmed && item.suggestedCategory).length;
      const locationText = result.location === 'SERVER' ? 'ฐานข้อมูลกลาง' : result.location === 'LOCAL' ? 'ไฟล์ในเครื่องนี้' : 'รายการใหม่';
      message(`โหลดจาก${locationText} ${items.length.toLocaleString('th-TH')} รายการ · ยืนยันหมวดอัตโนมัติ ${autoCount} · รอตรวจ ${reviewCount}`, 'success');
    } catch (error) {
      console.error(error);
      message(error.message || 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      $('loadTrackingBtn').disabled = false;
      $('loadTrackingBtn').textContent = 'โหลดรายการ';
    }
  }

  function go(step) {
    if (step < 1 || step > 5) return;
    state.step = step;
    document.querySelectorAll('.sp-panel').forEach((panel) => panel.classList.toggle('active', Number(panel.dataset.panel) === step));
    document.querySelectorAll('.sp-steps button').forEach((button) => button.classList.toggle('active', Number(button.dataset.step) === step));
    $('previousStepBtn').disabled = step === 1;
    $('nextStepBtn').textContent = step === 5 ? 'เริ่มล็อตถัดไป' : 'ถัดไป';
    $('actionHint').textContent = [
      'สแกน Tracking เพื่อเริ่มงาน',
      'ตรวจเฉพาะรายการที่ระบบยังไม่มั่นใจ',
      'ตรวจ SKU และต้นทุนก่อนเข้าคิว QR',
      'พิมพ์ QR แล้วใส่สินค้าเข้ากล่อง',
      'ตรวจจำนวนและประเภทก่อนปิดผนึก',
    ][step - 1];
    saveState();
    render();
    const activeStep = document.querySelector(`.sp-steps button[data-step="${step}"]`);
    activeStep?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function originLabel(item) {
    const labels = {
      SKU_MEMORY: 'จำจาก SKU',
      EXACT_SOURCE: 'หมวดตรงจากไฟล์',
      MARKETPLACE_CATEGORY: `แนะนำจาก ${item.source || 'Marketplace'}`,
      NAME_KEYWORD: 'แนะนำจากชื่อสินค้า',
      CONFIRM_SUGGESTION: 'ยืนยันคำแนะนำแล้ว',
      MANUAL: 'เลือกเอง',
      BULK: 'กำหนดแบบกลุ่ม',
      LEGACY_CONFIRMED: 'ยืนยันไว้แล้ว',
    };
    return labels[item.categoryOrigin] || 'รอตรวจ';
  }

  function renderSummary() {
    if (!state.lot) {
      $('sourceSummary').className = 'sp-empty';
      $('sourceSummary').textContent = 'ยังไม่ได้โหลดพัสดุ';
      $('totalCount').textContent = '0';
      $('classifiedCount').textContent = '0';
      return;
    }
    const totalQuantity = state.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = state.items.reduce((sum, item) => sum + (item.hasCost ? item.quantity * item.unitCost : 0), 0);
    const missingCost = state.items.filter((item) => !item.hasCost).length;
    const locationText = state.lot.dataLocation === 'SERVER' ? 'ฐานข้อมูลกลาง' : state.lot.dataLocation === 'LOCAL' ? 'ไฟล์ในเครื่อง' : 'กรอกใหม่';
    $('sourceSummary').className = 'sp-summary';
    $('sourceSummary').innerHTML = `<div class="sp-summary-grid">
      <article><span>Tracking</span><b>${esc(state.lot.tracking)}</b></article>
      <article><span>รายการ / ชิ้น</span><b>${state.items.length} / ${totalQuantity}</b></article>
      <article><span>ต้นทุนรวม</span><b>฿${money(totalCost)}</b></article>
      <article><span>แหล่งข้อมูล</span><b>${esc(locationText)}</b></article>
    </div>${missingCost ? `<p><strong>รอกรอกต้นทุน:</strong> ${missingCost} รายการ</p>` : ''}`;
    $('totalCount').textContent = String(state.items.length);
    $('classifiedCount').textContent = String(state.items.filter((item) => item.categoryConfirmed).length);
  }

  function renderCategories() {
    $('categoryQuick').innerHTML = CATEGORIES.map((category) => `<button type="button" data-cat-all="${esc(category)}">${esc(category)}</button>`).join('');
    const boxOptions = ['คละประเภท', ...CATEGORIES];
    $('boxCategory').innerHTML = boxOptions.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
    if (state.box?.category && boxOptions.includes(state.box.category)) $('boxCategory').value = state.box.category;
  }

  function categoryStats() {
    const autoOrigins = new Set(['SKU_MEMORY', 'EXACT_SOURCE', 'MARKETPLACE_CATEGORY']);
    return {
      auto: state.items.filter((item) => item.categoryConfirmed && autoOrigins.has(item.categoryOrigin)).length,
      suggested: state.items.filter((item) => !item.categoryConfirmed && item.suggestedCategory).length,
      missing: state.items.filter((item) => !item.categoryConfirmed && !item.suggestedCategory).length,
    };
  }

  function filteredItems() {
    const query = state.query.toLowerCase();
    return state.items.filter((item) => {
      const haystack = `${item.sku} ${item.sourceSku} ${item.name} ${item.tracking} ${item.sourceCategory} ${item.mainCategory} ${item.subCategory}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const autoOrigins = new Set(['SKU_MEMORY', 'EXACT_SOURCE', 'MARKETPLACE_CATEGORY']);
      const matchesStatus = state.statusFilter === 'ALL'
        || (state.statusFilter === 'REVIEW' && !item.categoryConfirmed)
        || (state.statusFilter === 'CONFIRMED' && item.categoryConfirmed)
        || (state.statusFilter === 'AUTO' && item.categoryConfirmed && autoOrigins.has(item.categoryOrigin));
      return matchesQuery && matchesStatus;
    });
  }

  function currentPageItems() {
    const rows = filteredItems();
    const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.max(1, Math.min(state.page, pages));
    return {
      rows,
      pages,
      slice: rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize),
    };
  }

  function renderCategoryDecision(item) {
    const confidence = Math.round((item.categoryConfidence || 0) * 100);
    if (item.categoryConfirmed) {
      return `<div class="sp-category-decision">
        <strong>${esc(item.category)}</strong>
        <small>${esc(originLabel(item))}${confidence ? ` · ความมั่นใจ ${confidence}%` : ''}</small>
        <div class="sp-decision-actions"><button type="button" data-toggle-categories>เปลี่ยนหมวด</button></div>
      </div>`;
    }
    if (item.suggestedCategory) {
      return `<div class="sp-category-decision">
        <strong>ระบบแนะนำ: ${esc(item.suggestedCategory)}</strong>
        <small>${esc(item.categoryReason)}${confidence ? ` · ${confidence}%` : ''}</small>
        <div class="sp-decision-actions">
          <button type="button" class="sp-confirm-suggestion" data-confirm-suggestion>ยืนยัน ${esc(item.suggestedCategory)}</button>
          <button type="button" data-toggle-categories>เลือกหมวดอื่น</button>
        </div>
      </div>`;
    }
    return `<div class="sp-category-decision">
      <strong>ยังแนะนำหมวดไม่ได้</strong>
      <small>${esc(item.categoryReason || 'กรุณาเลือกหมวดจากงานจริง')}</small>
      <div class="sp-decision-actions"><button type="button" class="sp-confirm-suggestion" data-toggle-categories>เลือกหมวดสินค้า</button></div>
    </div>`;
  }

  function renderItems() {
    const stats = categoryStats();
    $('autoCategoryCount').textContent = String(stats.auto);
    $('suggestedCategoryCount').textContent = String(stats.suggested);
    $('missingCategoryCount').textContent = String(stats.missing);
    $('selectedCount').textContent = String(state.selectedIds.length);

    const page = currentPageItems();
    $('pageInfo').textContent = `หน้า ${state.page} / ${page.pages} · ${page.rows.length} รายการ`;
    $('prevPage').disabled = state.page <= 1;
    $('nextPage').disabled = state.page >= page.pages;

    $('itemCards').innerHTML = page.slice.map((item) => {
      const selected = state.selectedIds.includes(item.id);
      const expanded = state.expandedIds.includes(item.id);
      const sourceCategory = [item.mainCategory, item.subCategory].filter(Boolean).join(' › ') || item.sourceCategory || 'ไม่ระบุ';
      const className = item.categoryConfirmed ? 'done' : item.suggestedCategory ? 'warn' : 'missing';
      const badgeClass = item.categoryConfirmed ? 'is-auto' : item.suggestedCategory ? 'is-review' : 'is-danger';
      return `<article class="sp-item ${className}${selected ? ' is-selected' : ''}" data-id="${esc(item.id)}">
        <label class="sp-item-select" aria-label="เลือกรายการ"><input type="checkbox" data-select-item ${selected ? 'checked' : ''}></label>
        <div class="sp-item-main">
          <div class="sp-qty"><b>${item.quantity}</b><small>ชิ้น</small></div>
          <h3>${esc(item.name)}</h3>
          <p>SKU: ${esc(item.sku || item.sourceSku || 'ยังไม่มี')} · Tracking: ${esc(item.tracking)}</p>
          <p class="cost">${item.hasCost ? `ต้นทุน ฿${money(item.unitCost)} / ชิ้น` : 'ยังไม่มีต้นทุนในไฟล์'}</p>
          <div class="sp-item-meta">
            <span class="sp-badge ${badgeClass}">${esc(originLabel(item))}</span>
            <span class="sp-badge is-source">${esc(item.source)}: ${esc(sourceCategory)}</span>
          </div>
        </div>
        ${renderCategoryDecision(item)}
        <div class="sp-category-picker" ${expanded ? '' : 'hidden'}>
          ${CATEGORIES.map((category) => `<button type="button" data-cat="${esc(category)}" class="${item.category === category ? 'selected' : ''}">${esc(category)}</button>`).join('')}
        </div>
      </article>`;
    }).join('') || '<div class="sp-empty">ไม่พบรายการตามตัวกรอง</div>';
  }

  function itemReadyForQueue(item) {
    return Boolean(item.categoryConfirmed && item.sku && item.hasCost);
  }

  function renderSku() {
    const ready = state.items.filter(itemReadyForQueue).length;
    const missingSku = state.items.filter((item) => !item.sku).length;
    const missingCost = state.items.filter((item) => !item.hasCost).length;
    $('skuReadiness').textContent = `พร้อมเข้าคิว ${ready}/${state.items.length} รายการ · ไม่มี SKU ${missingSku} · รอกรอกต้นทุน ${missingCost}`;
    $('skuCards').innerHTML = state.items.map((item) => {
      const readyItem = itemReadyForQueue(item);
      return `<article class="sp-item ${readyItem ? 'done' : 'warn'}" data-id="${esc(item.id)}">
        <div class="sp-qty"><b>${item.quantity}</b><small>ชิ้น</small></div>
        <div class="sp-item-main">
          <h3>${esc(item.name)}</h3>
          <p>หมวด: <b>${esc(item.category || 'ยังไม่ยืนยัน')}</b> · ${esc(originLabel(item))}</p>
          <div class="sp-field-stack">
            <label>SKU<input data-sku value="${esc(item.sku || item.sourceSku || '')}" placeholder="กรอกหรือสร้างอัตโนมัติ"></label>
            <label>ต้นทุนต่อชิ้น<input class="sp-cost-input ${item.hasCost ? '' : 'is-missing'}" data-cost type="number" inputmode="decimal" min="0" step="0.01" value="${item.hasCost ? esc(item.unitCost) : ''}" placeholder="0.00"></label>
          </div>
        </div>
        <div class="sp-item-actions">
          <button type="button" data-auto-sku>สร้าง SKU</button>
          <button type="button" data-queue-label class="${readyItem ? 'sp-primary' : ''}" ${readyItem ? '' : 'disabled'}>${item.labelQueued ? 'อัปเดตคิว QR' : 'เพิ่มเข้าคิว QR'}</button>
        </div>
      </article>`;
    }).join('') || '<div class="sp-empty">ยังไม่มีรายการสินค้า</div>';
  }

  function ensureBox() {
    if (!state.lot) return null;
    if (!state.box) {
      state.box = {
        code: newBoxCode(),
        category: 'คละประเภท',
        location: '',
        items: [],
        status: 'DRAFT',
      };
    }
    return state.box;
  }

  function syncQueuedSnapshot(item) {
    const queued = state.labelQueue.find((row) => row.id === item.id);
    if (queued) Object.assign(queued, cloneItem(item));
    const boxed = state.box?.items?.find((row) => row.id === item.id);
    if (boxed) Object.assign(boxed, cloneItem(item));
  }

  function queueItem(item) {
    if (!itemReadyForQueue(item)) return false;
    item.labelQueued = true;
    const snapshot = cloneItem(item);
    const queueIndex = state.labelQueue.findIndex((row) => row.id === item.id);
    if (queueIndex >= 0) state.labelQueue[queueIndex] = snapshot;
    else state.labelQueue.push(snapshot);
    const box = ensureBox();
    const boxIndex = box.items.findIndex((row) => row.id === item.id);
    if (boxIndex >= 0) box.items[boxIndex] = snapshot;
    else box.items.push(snapshot);
    item.status = 'QUEUED';
    saveState();
    schedulePersist();
    return true;
  }

  function labelUnits() {
    const units = [];
    for (const item of state.labelQueue) {
      const quantity = Math.max(1, Math.round(item.quantity));
      for (let index = 1; index <= quantity; index += 1) units.push({ item, index, quantity });
    }
    return units;
  }

  function renderBox() {
    const box = ensureBox();
    if (!box) {
      $('boxCode').value = '';
      $('boxContents').innerHTML = '<div class="sp-empty">กรุณาเปิดล็อตก่อน</div>';
      $('labelPreview').innerHTML = '';
      $('labelCount').textContent = '0';
      return;
    }
    $('boxCode').value = box.code;
    $('boxLocation').value = box.location || '';
    if ([...$('boxCategory').options].some((option) => option.value === box.category)) $('boxCategory').value = box.category;

    $('boxContents').innerHTML = box.items.map((item) => `<article class="sp-item done" data-id="${esc(item.id)}">
      <div class="sp-qty"><b>${item.quantity}</b><small>ชิ้น</small></div>
      <div class="sp-item-main"><h3>${esc(item.name)}</h3><p>${esc(item.sku)} · ${esc(item.category)} · (${codeCost(item.unitCost)})</p></div>
      <div class="sp-item-actions"><button type="button" data-remove-box="${esc(item.id)}">นำออกจากกล่อง</button></div>
    </article>`).join('') || '<div class="sp-empty">ยังไม่มีสินค้าในกล่อง</div>';

    const units = labelUnits();
    $('labelCount').textContent = String(units.length);
    $('labelPreview').innerHTML = units.map(({ item, index, quantity }) => `<article class="sp-label" data-label="${esc(item.id)}" data-unit="${index}">
      <canvas></canvas>
      <h4>${esc(item.name)}</h4>
      <small>${esc(item.sku)} · (${codeCost(item.unitCost)})${quantity > 1 ? ` · ${index}/${quantity}` : ''}</small>
    </article>`).join('');
    setTimeout(drawLabels, 0);
  }

  function drawLabels() {
    document.querySelectorAll('[data-label]').forEach((element) => {
      const item = state.labelQueue.find((row) => row.id === element.dataset.label);
      const canvas = element.querySelector('canvas');
      if (!item || !canvas) return;
      try {
        if (window.TKNQRCode?.toCanvas) window.TKNQRCode.toCanvas(canvas, `TKN-P-${item.sku}`, { width: 160, margin: 1 });
        else window.QRCode?.toCanvas?.(canvas, `TKN-P-${item.sku}`, { width: 160, margin: 1 });
      } catch (error) {
        console.warn('สร้าง QR สินค้าไม่สำเร็จ:', error);
      }
    });
  }

  function renderClose() {
    if (!state.box) {
      $('closeSummary').innerHTML = '<div class="sp-empty">ยังไม่มีกล่องร่าง</div>';
      return;
    }
    const quantity = state.box.items.reduce((sum, item) => sum + item.quantity, 0);
    const categories = unique(state.box.items.map((item) => item.category));
    const totalCost = state.box.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    $('closeSummary').innerHTML = `<div class="sp-summary-grid">
      <article><span>กล่อง</span><b>${esc(state.box.code)}</b></article>
      <article><span>SKU</span><b>${state.box.items.length}</b></article>
      <article><span>จำนวน</span><b>${quantity}</b></article>
      <article><span>ต้นทุนรวม</span><b>฿${money(totalCost)}</b></article>
    </div>
    <p><strong>ประเภทภายใน:</strong> ${categories.map(esc).join(', ') || '-'}</p>
    <p><strong>ตำแหน่ง:</strong> ${esc(state.box.location || '-')}</p>`;
  }

  function render() {
    renderSummary();
    renderCategories();
    renderItems();
    renderSku();
    renderBox();
    renderClose();
    $('lotStatus').textContent = state.lot ? `${state.lot.code} · ${state.lot.tracking}` : 'ยังไม่เปิดล็อต';
    $('pageSize').value = String(state.pageSize);
    $('categoryStatusFilter').value = state.statusFilter;
  }

  async function closeBox() {
    const box = ensureBox();
    if (!box?.items?.length) return message('ยังไม่มีสินค้าในกล่อง', 'error');
    if (!box.location.trim()) return message('กรุณาระบุตำแหน่งจัดเก็บก่อนปิดกล่อง', 'error');
    const quantity = box.items.reduce((sum, item) => sum + item.quantity, 0);
    if (!confirm(`ปิดผนึกกล่อง ${box.code} จำนวน ${quantity} ชิ้น?`)) return;

    box.status = 'CLOSED';
    box.closedAt = nowIso();
    state.lot.status = 'CLOSED';
    state.lot.closedAt = box.closedAt;
    state.items.forEach((item) => {
      if (box.items.some((row) => row.id === item.id)) item.status = 'BOXED';
    });

    const client = await waitClient();
    if (client) {
      try {
        await persistLot();
        await persistItems();
        const boxResult = await client.from('stock_boxes').upsert({
          box_code: box.code,
          status: 'CLOSED',
          location: box.location,
          source: 'SORT_PACK',
          closed_at: box.closedAt,
        }, { onConflict: 'box_code' }).select('id').single();
        if (boxResult.error) throw boxResult.error;
        for (const item of box.items) {
          const { error } = await client.from('stock_box_items').upsert({
            box_id: boxResult.data.id,
            product_id: item.productId || null,
            sku: item.sku,
            quantity: item.quantity,
          }, { onConflict: 'box_id,sku' });
          if (error) throw error;
        }
      } catch (error) {
        message(`ปิดกล่องในเครื่องสำเร็จ แต่ซิงก์ฐานข้อมูลไม่ครบ: ${error.message}`, 'error');
      }
    }

    saveState();
    const area = $('boxQrResult');
    area.innerHTML = `<h3>ปิดกล่องสำเร็จ</h3><canvas id="boxQrCanvas"></canvas><p><b>${esc(box.code)}</b></p><p>${box.items.length} SKU · ${quantity} ชิ้น</p>`;
    setTimeout(() => {
      const canvas = $('boxQrCanvas');
      try {
        if (window.TKNQRCode?.toCanvas) window.TKNQRCode.toCanvas(canvas, box.code, { width: 260, margin: 1 });
        else window.QRCode?.toCanvas?.(canvas, box.code, { width: 260, margin: 1 });
      } catch {}
    }, 0);
    message('ปิดผนึกและสร้าง QR กล่องแล้ว', 'success');
  }

  function validateCurrentStep() {
    if (state.step === 1) {
      if (!state.lot) { message('กรุณาโหลด Tracking ก่อน', 'error'); return false; }
    }
    if (state.step === 2) {
      const pending = state.items.filter((item) => !item.categoryConfirmed).length;
      if (pending) { message(`ยังมี ${pending} รายการที่ต้องยืนยันหมวด`, 'error'); return false; }
    }
    if (state.step === 3) {
      const missingSku = state.items.filter((item) => !item.sku).length;
      const missingCost = state.items.filter((item) => !item.hasCost).length;
      if (missingSku || missingCost) {
        message(`ยังไม่พร้อม: ไม่มี SKU ${missingSku} รายการ · ไม่มีต้นทุน ${missingCost} รายการ`, 'error');
        return false;
      }
    }
    if (state.step === 4) {
      if (!state.box?.items?.length) { message('กรุณาเพิ่มสินค้าเข้าคิว QR และกล่องก่อน', 'error'); return false; }
    }
    return true;
  }

  function nextStep() {
    if (state.step < 5) {
      if (validateCurrentStep()) go(state.step + 1);
      return;
    }
    if (state.box?.status !== 'CLOSED') return message('กรุณาปิดกล่องก่อนเริ่มล็อตใหม่', 'error');
    if (confirm('เริ่มล็อตใหม่และล้างงานบนหน้าจอ? กฎหมวด SKU ที่เรียนรู้ไว้จะยังอยู่')) {
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(LEGACY_STATE_KEY);
      location.reload();
    }
  }

  function navigateStep(target) {
    if (target <= state.step) return go(target);
    if (target === state.step + 1 && validateCurrentStep()) return go(target);
    message('กรุณาทำขั้นตอนปัจจุบันให้เรียบร้อยก่อน', 'error');
  }

  function selectCurrentPage() {
    const ids = currentPageItems().slice.map((item) => item.id);
    state.selectedIds = unique([...state.selectedIds, ...ids]);
    saveState();
    renderItems();
  }

  function applyBulkCategory(category) {
    if (!state.selectedIds.length) return message('กรุณาเลือกรายการก่อนกำหนดหมวด', 'error');
    let changed = 0;
    for (const item of state.items.filter((row) => state.selectedIds.includes(row.id))) {
      setCategory(item, category, 'BULK');
      changed += 1;
    }
    state.selectedIds = [];
    saveState();
    render();
    message(`กำหนดหมวด ${category} ให้ ${changed} รายการแล้ว`, 'success');
  }

  function acceptAllSuggestions() {
    const rows = state.items.filter((item) => !item.categoryConfirmed && item.suggestedCategory);
    if (!rows.length) return message('ไม่มีคำแนะนำที่รอยืนยัน', 'info');
    for (const item of rows) setCategory(item, item.suggestedCategory, 'CONFIRM_SUGGESTION');
    saveState();
    render();
    message(`ยืนยันคำแนะนำ ${rows.length} รายการแล้ว`, 'success');
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.step) return navigateStep(Number(button.dataset.step));

      const card = button.closest('[data-id]');
      const item = state.items.find((row) => row.id === card?.dataset.id);

      if (button.dataset.toggleCategories !== undefined && item) {
        state.expandedIds = state.expandedIds.includes(item.id)
          ? state.expandedIds.filter((id) => id !== item.id)
          : [...state.expandedIds, item.id];
        renderItems();
        return;
      }
      if (button.dataset.confirmSuggestion !== undefined && item) {
        setCategory(item, item.suggestedCategory, 'CONFIRM_SUGGESTION');
        render();
        return;
      }
      if (button.dataset.cat && item) {
        setCategory(item, button.dataset.cat, 'MANUAL');
        render();
        return;
      }
      if (button.dataset.catAll) {
        applyBulkCategory(button.dataset.catAll);
        return;
      }
      if (button.dataset.autoSku !== undefined && item) {
        item.sku = item.sourceSku || `${(item.category || 'GEN').replace(/\s+/g, '').slice(0, 3).toUpperCase()}-${String(Date.now()).slice(-6)}`;
        syncQueuedSnapshot(item);
        rememberCategory(item, item.category).catch(() => {});
        saveState();
        schedulePersist();
        renderSku();
        return;
      }
      if (button.dataset.queueLabel !== undefined && item) {
        if (queueItem(item)) {
          render();
          message(`เพิ่ม ${item.name} เข้าคิว QR และกล่องแล้ว`, 'success');
        }
        return;
      }
      if (button.dataset.removeBox) {
        state.box.items = state.box.items.filter((row) => row.id !== button.dataset.removeBox);
        const sourceItem = state.items.find((row) => row.id === button.dataset.removeBox);
        if (sourceItem) sourceItem.status = sourceItem.labelQueued ? 'QUEUED' : 'CLASSIFIED';
        saveState();
        schedulePersist();
        render();
      }
    });

    document.addEventListener('change', (event) => {
      const target = event.target;
      const card = target.closest('[data-id]');
      const item = state.items.find((row) => row.id === card?.dataset.id);
      if (target.matches('[data-select-item]') && item) {
        state.selectedIds = target.checked
          ? unique([...state.selectedIds, item.id])
          : state.selectedIds.filter((id) => id !== item.id);
        saveState();
        renderItems();
      }
      if (target.matches('[data-sku]') && item) {
        item.sku = target.value.trim();
        syncQueuedSnapshot(item);
        if (item.categoryConfirmed) rememberCategory(item, item.category).catch(() => {});
        saveState();
        schedulePersist();
        renderSku();
      }
      if (target.matches('[data-cost]') && item) {
        const raw = target.value.trim();
        item.hasCost = raw !== '' && numberValue(raw, -1) >= 0;
        item.unitCost = item.hasCost ? numberValue(raw, 0) : 0;
        syncQueuedSnapshot(item);
        saveState();
        schedulePersist();
        renderSku();
      }
    });

    $('loadTrackingBtn').addEventListener('click', loadTracking);
    $('trackingInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadTracking(); });
    $('nextStepBtn').addEventListener('click', nextStep);
    $('previousStepBtn').addEventListener('click', () => go(state.step - 1));

    $('itemSearch').addEventListener('input', (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = event.target.value;
        state.page = 1;
        saveState();
        renderItems();
      }, 250);
    });
    $('categoryStatusFilter').addEventListener('change', (event) => {
      state.statusFilter = event.target.value;
      state.page = 1;
      saveState();
      renderItems();
    });
    $('pageSize').addEventListener('change', (event) => {
      state.pageSize = Number(event.target.value);
      state.page = 1;
      saveState();
      renderItems();
    });
    $('clearSearchBtn').addEventListener('click', () => {
      $('itemSearch').value = '';
      $('categoryStatusFilter').value = 'ALL';
      state.query = '';
      state.statusFilter = 'ALL';
      state.page = 1;
      saveState();
      renderItems();
    });
    $('prevPage').addEventListener('click', () => { state.page = Math.max(1, state.page - 1); saveState(); renderItems(); });
    $('nextPage').addEventListener('click', () => { state.page += 1; saveState(); renderItems(); });
    $('selectPageBtn').addEventListener('click', selectCurrentPage);
    $('clearSelectionBtn').addEventListener('click', () => { state.selectedIds = []; saveState(); renderItems(); });
    $('acceptAllSuggestionsBtn').addEventListener('click', acceptAllSuggestions);

    $('queueAllBtn').addEventListener('click', () => {
      const readyItems = state.items.filter(itemReadyForQueue);
      let count = 0;
      for (const item of readyItems) if (queueItem(item)) count += 1;
      render();
      message(`เพิ่มรายการพร้อมแล้ว ${count} รายการ · ${labelUnits().length} ฉลาก`, 'success');
    });

    $('newBoxBtn').addEventListener('click', () => {
      if (state.box?.items?.length && !confirm('สร้างกล่องใหม่ รายการในกล่องปัจจุบันจะถูกล้างออกจากกล่องร่าง แต่คิวฉลากยังอยู่ ยืนยันหรือไม่?')) return;
      state.box = { code: newBoxCode(), category: 'คละประเภท', location: '', items: [], status: 'DRAFT' };
      saveState();
      render();
    });
    $('printLabelsBtn').addEventListener('click', () => {
      if (!state.labelQueue.length) return message('คิวฉลากว่าง', 'error');
      drawLabels();
      setTimeout(() => window.print(), 350);
    });
    $('clearLabelQueueBtn').addEventListener('click', () => {
      if (!confirm('ล้างคิวฉลากทั้งหมด? สินค้าที่อยู่ในกล่องร่างจะยังคงอยู่')) return;
      state.labelQueue = [];
      state.items.forEach((item) => { item.labelQueued = false; });
      saveState();
      render();
    });
    $('boxCategory').addEventListener('change', (event) => { const box = ensureBox(); if (box) { box.category = event.target.value; saveState(); } });
    $('boxLocation').addEventListener('input', (event) => { const box = ensureBox(); if (box) { box.location = event.target.value; saveState(); } });
    $('backToBoxBtn').addEventListener('click', () => go(4));
    $('closeBoxBtn').addEventListener('click', closeBox);
  }

  async function init() {
    loadState();
    bind();
    const client = await waitClient();
    setCloudStatus(client ? 'เชื่อมต่อฐานข้อมูลแล้ว' : 'โหมดเครื่องนี้');
    if (state.lot) {
      $('lotCode').value = state.lot.code;
      $('trackingInput').value = state.lot.tracking || '';
      $('lotNote').value = state.lot.note || '';
      $('itemSearch').value = state.query || '';
    }
    go(state.step || 1);
    render();
    document.body.classList.remove('tkn-auth-loading');
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
