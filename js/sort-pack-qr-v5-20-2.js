(() => {
  'use strict';

  const VERSION = '5.22.14';
  const LABEL_SETTINGS_VERSION = 10;
  const STATE_KEY = 'tkn_sort_pack_v5202';
  const LEGACY_STATE_KEY = 'tkn_sort_pack_v5201';
  const ENGINE = window.TKNCategoryEngine;
  if (!ENGINE) throw new Error('ไม่พบ TKN Category Engine v5.20.1');
  const LABEL_PROFILES = Object.freeze({
    '30x20': { width: 30, height: 20, qr: 8, barcodeHeight: 3.5, nameFont: 5.5, skuFont: 5.5, nameWeight: 400, skuWeight: 400, nameLines: 1 },
    '32x25': { width: 32, height: 25, qr: 10, barcodeHeight: 4.5, nameFont: 6, skuFont: 6, nameWeight: 400, skuWeight: 400, nameLines: 1 },
    '40x30': { width: 40, height: 30, qr: 12, barcodeHeight: 5.5, nameFont: 6, skuFont: 6, nameWeight: 400, skuWeight: 400, nameLines: 2 },
    '50x40': { width: 50, height: 40, qr: 16, barcodeHeight: 7, nameFont: 7, skuFont: 7, nameWeight: 400, skuWeight: 400, nameLines: 2 },
  });
  const DEFAULT_LABEL_SETTINGS = Object.freeze({ printerMode: 'AUTO', dpi: 300, preset: '50x40', customWidth: 50, customHeight: 40, columns: 2, showName: true, ...LABEL_PROFILES['50x40'] });

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
    labelSettingsVersion: LABEL_SETTINGS_VERSION,
    labelSettings: { ...DEFAULT_LABEL_SETTINGS },
  };

  let persistTimer = null;
  let searchTimer = null;
  let categoryMemory = ENGINE.loadLocalMemory();
  let trackingCamera = null;

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
  const compactCost = (value) => {
    const amount = Math.round(Number(value || 0) * 100) / 100;
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };
  const randomLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const skuWithHiddenCost = (item) => item?.hasCost
    ? `${String(item.sku || '').trim()}-${item.costMaskLetter || 'X'}${compactCost(item.unitCost)}`
    : String(item?.sku || '').trim();
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
      barcode: item.barcode || '',
      name: item.name || 'สินค้าไม่ระบุชื่อ',
      quantity: Math.max(1, numberValue(item.quantity, 1)),
      unitCost: Math.max(0, numberValue(item.unitCost, 0)),
      hasCost: item.hasCost !== undefined ? Boolean(item.hasCost) : Number(item.unitCost || 0) > 0,
      sourcePrice: Math.max(0, numberValue(item.sourcePrice, 0)),
      sellingPrice: Math.max(0, numberValue(item.sellingPrice, 0)),
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
      costMaskLetter: /^[A-Z]$/.test(String(item.costMaskLetter || '').toUpperCase()) ? String(item.costMaskLetter).toUpperCase() : '',
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
      state.labelQueue.forEach((item) => { if (item.hasCost && !item.costMaskLetter) item.costMaskLetter = randomLetter(); });
      if (stored?.box?.items) stored.box.items = stored.box.items.map(migrateItem);
      state.box = stored?.box || null;
      state.selectedIds = Array.isArray(stored?.selectedIds) ? stored.selectedIds : [];
      state.expandedIds = [];
      if (Number(stored?.labelSettingsVersion) === LABEL_SETTINGS_VERSION) {
        state.labelSettings = { ...DEFAULT_LABEL_SETTINGS, ...(stored?.labelSettings || {}) };
      } else state.labelSettings = { ...DEFAULT_LABEL_SETTINGS };
      state.labelSettingsVersion = LABEL_SETTINGS_VERSION;
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
      const all = await requestResult(transaction.objectStore('records').getAll());
      const wanted = normalizeLookup(tracking);
      return (all || []).filter((row) => [
        row.tracking_number,
        row.handover_tracking_number,
        row.order_number,
        row.return_number,
        row.platform_return_item_id,
        row.rms_return_item_id,
        row.source_sku,
        row.sku_id,
        row.seller_sku,
        row.sku,
        row.product_code,
        row.barcode,
      ].some((value) => normalizeLookup(value) === wanted));
    } finally {
      db.close();
    }
  }

  function normalizeLookup(value) {
    return String(value ?? '').trim().replace(/^['"]+/, '').replace(/\s+/g, '').toUpperCase();
  }

  function scanCandidates(raw) {
    let value = String(raw ?? '').trim();
    try {
      const url = new URL(value);
      value = url.searchParams.get('id') || url.searchParams.get('code') || value;
    } catch {}
    const candidates = [value];
    const productCode = value.replace(/^TKN-P-/i, '').trim();
    if (productCode && productCode !== value) candidates.push(productCode);
    return unique(candidates.map((entry) => String(entry || '').trim()).filter(Boolean));
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
      barcode: String(row.barcode || '').trim(),
      name: String(row.product_name || row.item_name || row.name || 'สินค้าไม่ระบุชื่อ').trim(),
      quantity: row.quantity ?? row.item_quantity ?? row.actual_qty ?? 1,
      unitCost: costRaw,
      hasCost,
      sourcePrice: row.source_item_price ?? row.item_price_pp ?? 0,
      sellingPrice: row.selling_price ?? row.sale_price ?? row.source_item_price ?? row.item_price_pp ?? 0,
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
          if ((!result.data || !result.data.length) && table === 'marketplace_sorting_source_items') {
            let skuQuery = client.from(table).select('*').eq('source_sku', tracking);
            if (source) skuQuery = skuQuery.eq('source', source);
            result = await skuQuery;
          }
          if ((!result.data || !result.data.length) && table === 'marketplace_sorting_source_items') {
            let productCodeQuery = client.from(table).select('*').eq('sku', tracking);
            if (source) productCodeQuery = productCodeQuery.eq('source', source);
            result = await productCodeQuery;
          }
          if ((!result.data || !result.data.length) && table === 'marketplace_receiving_items') {
            result = await client.from(table).select('*').eq('sku', tracking);
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

    const keys = Object.keys(localStorage).filter((key) => /shopee|lazada|import|sort.source.rows/i.test(key));
    for (const key of keys) {
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        const rows = Array.isArray(raw) ? raw : (raw?.items || raw?.rows || []);
        const wanted = normalizeLookup(tracking);
        const found = rows.filter((row) => [
          row.tracking_number, row.tracking, row.handover_tracking_number, row.order_number,
          row.return_number, row.source_sku, row.sku_id, row.seller_sku, row.sku,
          row.product_code, row.barcode,
        ].some((value) => normalizeLookup(value) === wanted));
        const source = /lazada/i.test(key) ? 'LAZADA' : 'SHOPEE';
        items.push(...found.map((row) => normalizeSourceRow(row, source, tracking)));
      } catch {}
    }
    return deduplicateItems(items);
  }

  async function findProductByScan(raw) {
    const client = await waitClient();
    if (!client) return null;
    const candidates = scanCandidates(raw);
    for (const value of candidates) {
      for (const field of ['product_code', 'barcode']) {
        try {
          const result = await client.from('product_inventory_list')
            .select('id,product_code,barcode,name,category_name,cost_price,selling_price')
            .eq(field, value).limit(1).maybeSingle();
          if (!result.error && result.data) return result.data;
        } catch {}
        try {
          const result = await client.from('products')
            .select('id,product_code,barcode,name,cost_price,selling_price')
            .eq(field, value).limit(1).maybeSingle();
          if (!result.error && result.data) return result.data;
        } catch {}
      }
    }
    return null;
  }

  async function findSource(tracking) {
    const candidates = scanCandidates(tracking);
    for (const candidate of candidates) {
      const localRows = await readLocalMarketplaceRows(candidate);
      if (localRows.length) return { items: localRows, location: 'LOCAL', matchedBy: candidate };
    }
    for (const candidate of candidates) {
      const serverRows = await readServerRows(candidate);
      if (serverRows.length) return { items: deduplicateItems(serverRows), location: 'SERVER', matchedBy: candidate };
    }
    const product = await findProductByScan(tracking);
    if (product) {
      const costProvided = product.cost_price !== null && product.cost_price !== undefined && String(product.cost_price).trim() !== '';
      return {
        location: 'PRODUCT',
        matchedBy: product.product_code,
        items: [migrateItem({
          id: crypto.randomUUID(),
          sourceItemId: `PRODUCT:${product.id || product.product_code}`,
          source: 'PRODUCT',
          tracking: '',
          sourceSku: product.product_code,
          sku: product.product_code,
          barcode: product.barcode || '',
          name: product.name || 'สินค้าไม่ระบุชื่อ',
          quantity: 1,
          unitCost: product.cost_price,
          hasCost: costProvided,
          sellingPrice: product.selling_price,
          mainCategory: product.category_name || '',
          sourceCategory: product.category_name || '',
          productId: product.id || null,
        })],
      };
    }
    return { items: [], location: 'NONE' };
  }

  async function enrichItemsFromProducts(items) {
    const client = await waitClient();
    if (!client || !items.length) return items;
    const productIds = unique(items.map((item) => item.productId).filter(Boolean));
    const productCodes = unique(items.flatMap((item) => [item.sku, item.sourceSku])
      .map((value) => String(value || '').trim()).filter(Boolean));
    const products = [];
    try {
      for (let start = 0; start < productIds.length; start += 100) {
        const { data, error } = await client.from('products')
          .select('id,product_code,barcode,name,cost_price,selling_price')
          .in('id', productIds.slice(start, start + 100));
        if (error) throw error;
        products.push(...(data || []));
      }
      for (let start = 0; start < productCodes.length; start += 100) {
        const { data, error } = await client.from('products')
          .select('id,product_code,barcode,name,cost_price,selling_price')
          .in('product_code', productCodes.slice(start, start + 100));
        if (error) throw error;
        products.push(...(data || []));
      }
    } catch (error) {
      console.warn('อ่านชื่อและราคาสินค้าจาก SKU ไม่สำเร็จ:', error);
      return items;
    }
    const byId = new Map(products.map((product) => [String(product.id), product]));
    const byCode = new Map(products.map((product) => [String(product.product_code || '').trim().toUpperCase(), product]));
    items.forEach((item) => {
      const product = byId.get(String(item.productId || ''))
        || byCode.get(String(item.sku || item.sourceSku || '').trim().toUpperCase());
      if (!product) return;
      item.productId = product.id;
      item.sku = item.sku || product.product_code || item.sourceSku;
      item.barcode = product.barcode || item.barcode || '';
      if (!item.name || /^(สินค้าไม่ระบุชื่อ|รายการใหม่)/.test(item.name)) item.name = product.name || item.name;
      if (!item.hasCost && product.cost_price !== null && product.cost_price !== undefined && String(product.cost_price).trim() !== '') {
        item.unitCost = Math.max(0, numberValue(product.cost_price, 0));
        item.hasCost = true;
      }
      if (!item.sellingPrice && product.selling_price !== null && product.selling_price !== undefined) {
        item.sellingPrice = Math.max(0, numberValue(product.selling_price, 0));
      }
    });
    return items;
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

  function trackingCameraMessage(text, type = 'info') {
    if (type === 'error') message(text, 'error');
    else if (type === 'success') message(text, 'success');
  }

  async function openTrackingCamera() {
    if (!window.TKNTrackingCameraScanner) {
      message('ไฟล์กล้องสแกนโหลดไม่ครบ กรุณารีเฟรชหน้าแล้วลองใหม่', 'error');
      return;
    }
    if (!trackingCamera) {
      trackingCamera = new window.TKNTrackingCameraScanner({
        onMessage: trackingCameraMessage,
        onScan: async (value) => {
          const normalized = String(value || '').trim();
          if (!normalized) return;
          $('trackingInput').value = normalized;
          message(`สแกนสำเร็จ: ${normalized} · กำลังเพิ่ม SKU`, 'success');
          await loadTracking();
        },
      });
    }
    await trackingCamera.open();
  }

  async function loadTracking() {
    const tracking = $('trackingInput').value.trim();
    if (!tracking) return message('กรุณาสแกน SKU ก่อน', 'error');
    $('loadTrackingBtn').disabled = true;
    $('openTrackingCameraBtn').disabled = true;
    $('trackingInput').setAttribute('aria-busy', 'true');
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

      await enrichItemsFromProducts(items);

      await prepareCategorySuggestions(items);
      const sources = unique(items.map((item) => item.source));
      if (!state.lot || state.lot.status === 'CLOSED') {
        state.lot = {
          code: newLotCode(), tracking, scanCodes: [],
          source: sources.length === 1 ? sources[0] : $('sourceSelect').value,
          note: $('lotNote').value.trim(), openedAt: nowIso(), status: 'OPEN', dataLocation: result.location,
        };
        state.items = [];
        state.box = null;
        state.labelQueue = [];
        state.selectedIds = [];
        state.expandedIds = [];
        state.page = 1;
      }
      state.lot.scanCodes = unique([...(state.lot.scanCodes || []), tracking]);
      state.lot.note = $('lotNote').value.trim();
      state.lot.dataLocation = result.location || state.lot.dataLocation;
      let added = 0;
      let increased = 0;
      items.forEach((incoming) => {
        const key = String(incoming.sku || incoming.sourceSku || '').trim().toLowerCase();
        const existing = key && state.items.find((row) => String(row.sku || row.sourceSku || '').trim().toLowerCase() === key);
        if (existing) {
          existing.quantity += Math.max(1, Number(incoming.quantity) || 1);
          increased += 1;
        } else {
          state.items.push(incoming);
          added += 1;
        }
      });
      $('lotCode').value = state.lot.code;
      await persistLot();
      schedulePersist(50);
      saveState();
      render();
      $('trackingInput').value = '';
      $('trackingInput').focus();

      const autoCount = state.items.filter((item) => item.categoryConfirmed).length;
      const reviewCount = state.items.filter((item) => !item.categoryConfirmed && item.suggestedCategory).length;
      const locationText = result.location === 'SERVER' ? 'ฐานข้อมูลกลาง' : result.location === 'LOCAL' ? 'ไฟล์ในเครื่องนี้' : result.location === 'PRODUCT' ? 'ฐานสินค้า/บาร์โค้ด' : 'รายการใหม่';
      message(`เพิ่มจาก${locationText}แล้ว ${added} SKU${increased ? ` · SKU ซ้ำเพิ่มจำนวน ${increased}` : ''} · สะสม ${state.items.length} SKU · กดถัดไปเมื่อสแกนครบ`, 'success');
    } catch (error) {
      console.error(error);
      message(error.message || 'โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      $('loadTrackingBtn').disabled = false;
      $('openTrackingCameraBtn').disabled = false;
      $('trackingInput').removeAttribute('aria-busy');
      $('loadTrackingBtn').textContent = 'เพิ่ม SKU';
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
      'สแกน SKU ต่อเนื่อง แล้วกดถัดไปเมื่อครบ',
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
      $('sourceSummary').textContent = 'ยังไม่ได้เพิ่ม SKU';
      if ($('scanBatchList')) $('scanBatchList').innerHTML = '';
      $('totalCount').textContent = '0';
      $('classifiedCount').textContent = '0';
      return;
    }
    const totalQuantity = state.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = state.items.reduce((sum, item) => sum + (item.hasCost ? item.quantity * item.unitCost : 0), 0);
    const missingCost = state.items.filter((item) => !item.hasCost).length;
    const locationText = state.lot.dataLocation === 'SERVER' ? 'ฐานข้อมูลกลาง' : state.lot.dataLocation === 'LOCAL' ? 'ไฟล์ในเครื่อง' : state.lot.dataLocation === 'PRODUCT' ? 'ฐานสินค้า/บาร์โค้ด' : 'กรอกใหม่';
    $('sourceSummary').className = 'sp-summary';
    $('sourceSummary').innerHTML = `<div class="sp-summary-grid">
      <article><span>SKU ที่เพิ่ม</span><b>${state.items.length}</b></article>
      <article><span>รายการ / ชิ้น</span><b>${state.items.length} / ${totalQuantity}</b></article>
      <article><span>ต้นทุนรวม</span><b>฿${money(totalCost)}</b></article>
      <article><span>แหล่งข้อมูล</span><b>${esc(locationText)}</b></article>
    </div>${missingCost ? `<p><strong>รอกรอกต้นทุน:</strong> ${missingCost} รายการ</p>` : ''}`;
    if ($('scanBatchList')) {
      $('scanBatchList').innerHTML = `<div class="sp-scan-batch-head"><b>รายการ SKU ที่สแกนไว้</b><span>${state.items.length} SKU · ${totalQuantity} ชิ้น</span></div>
        <div class="sp-scan-batch-items">${state.items.map((item, index) => `<article>
          <span class="sp-scan-number">${index + 1}</span>
          <div><b>${esc(item.sku || item.sourceSku || 'ยังไม่มี SKU')}</b><small>${esc(item.name)} · ${item.quantity} ชิ้น</small></div>
          <button type="button" data-remove-scan="${esc(item.id)}">ลบ</button>
        </article>`).join('')}</div>`;
    }
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
          <p class="cost">${item.hasCost ? `ต้นทุน ฿${money(item.unitCost)} / ชิ้น` : 'ยังไม่มีต้นทุนในไฟล์'}${item.sellingPrice ? ` · ราคาขาย ฿${money(item.sellingPrice)}` : ''}</p>
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
    if (!item.costMaskLetter) item.costMaskLetter = randomLetter();
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
      <div class="sp-item-main"><h3>${esc(item.name)}</h3><p><b>SKU ${esc(item.sku)}</b> · ต้นทุน ฿${money(item.unitCost)}${item.sellingPrice ? ` · ราคาขาย ฿${money(item.sellingPrice)}` : ''} · ${esc(item.category)} · (${codeCost(item.unitCost)})</p></div>
      <div class="sp-item-actions"><button type="button" data-remove-box="${esc(item.id)}">นำออกจากกล่อง</button></div>
    </article>`).join('') || '<div class="sp-empty">ยังไม่มีสินค้าในกล่อง</div>';

    const units = labelUnits();
    applyLabelSettings(false);
    $('labelCount').textContent = String(units.length);
    $('labelPreview').innerHTML = units.map(({ item, index, quantity }) => `<article class="sp-label" data-label="${esc(item.id)}" data-unit="${index}">
      <div class="sp-label-qr-status" hidden></div><canvas class="sp-label-qr"></canvas>
      <svg class="sp-label-barcode" aria-label="Barcode ${esc(item.barcode || item.sku)}"></svg>
      <small>${esc(skuWithHiddenCost(item))}${quantity > 1 ? ` · ${index}/${quantity}` : ''}</small>
      <h4>${esc(item.name)}</h4>
    </article>`).join('');
    setTimeout(() => { void drawLabels(); }, 0);
  }

  async function drawLabels() {
    const ready = await (window.TKNQRHealth?.wait?.(2500)
      ?? Promise.resolve(Boolean(window.QRCode?.toCanvas || window.TKNQR?.toCanvas)));
    const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
    const elements = [...document.querySelectorAll('[data-label]')];
    await Promise.all(elements.map(async (element) => {
      const item = state.labelQueue.find((row) => row.id === element.dataset.label);
      const canvas = element.querySelector('.sp-label-qr');
      const barcodeSvg = element.querySelector('.sp-label-barcode');
      const status = element.querySelector('.sp-label-qr-status');
      if (!item || !canvas) return;
      try {
        if (!ready || typeof toCanvas !== 'function') throw new Error('ระบบ QR ยังไม่พร้อม');
        const dpi = Math.max(203, Number(state.labelSettings?.dpi) || 300);
        const pixelSize = Math.min(2048, Math.max(96, Math.round((Number(state.labelSettings?.qr || 20) / 25.4) * dpi)));
        await toCanvas(canvas, `TKN-P-${item.sku}`, { width: pixelSize, margin: 1, errorCorrectionLevel: 'M' });
        if (typeof window.JsBarcode !== 'function') throw new Error('ระบบ Barcode ยังไม่พร้อม');
        const barcodeValue = String(item.barcode || item.sku || '').trim();
        if (!barcodeValue) throw new Error('สินค้าไม่มี Barcode หรือ SKU');
        const barWidth = barcodeValue.length > 24 ? 0.65 : barcodeValue.length > 16 ? 0.85 : 1.15;
        window.JsBarcode(barcodeSvg, barcodeValue, {
          format: 'CODE128', displayValue: false, margin: 0,
          width: barWidth, height: 34, background: '#fff', lineColor: '#000',
        });
        if (status) { status.textContent = ''; status.hidden = true; }
      } catch (error) {
        console.warn('สร้าง QR สินค้าไม่สำเร็จ:', error);
        if (status) { status.textContent = `QR ไม่สำเร็จ: ${error.message || 'ลองใหม่'}`; status.className = 'sp-label-qr-status is-error'; status.hidden = false; }
      }
    }));
  }

  function labelProfile(preset, customWidth, customHeight) {
    if (preset !== 'CUSTOM') return LABEL_PROFILES[preset] || LABEL_PROFILES['50x40'];
    const width = Math.max(20, Math.min(120, numberValue(customWidth, 50)));
    const height = Math.max(15, Math.min(150, numberValue(customHeight, 40)));
    const shortSide = Math.min(width, height);
    return {
      width, height,
      qr: Math.max(9, Math.min(width - 4, height * 0.55, shortSide * 0.55)),
      barcodeHeight: Math.max(3.5, Math.min(8, shortSide * 0.18)),
      nameFont: Math.max(6, Math.min(9, shortSide / 5)),
      skuFont: Math.max(6, Math.min(9, shortSide / 5)),
      nameWeight: 400,
      skuWeight: 400,
      nameLines: shortSide >= 35 ? 4 : shortSide >= 25 ? 3 : 2,
    };
  }

  function readLabelSettings() {
    const preset = $('labelSizePreset')?.value || '50x40';
    const customWidth = numberValue($('labelCustomWidth')?.value, 50);
    const customHeight = numberValue($('labelCustomHeight')?.value, 40);
    const profile = labelProfile(preset, customWidth, customHeight);
    return {
      printerMode: $('labelPrinterMode')?.value || 'AUTO',
      dpi: [203, 300, 600].includes(Number($('labelPrinterDpi')?.value)) ? Number($('labelPrinterDpi').value) : 300,
      preset,
      customWidth,
      customHeight,
      columns: Math.max(1, Math.min(5, Math.round(numberValue($('labelColumns')?.value, 1)))),
      showName: Boolean($('labelShowName')?.checked),
      ...profile,
    };
  }

  function applyLabelSettings(save = true) {
    if ($('labelSizePreset')) state.labelSettings = readLabelSettings();
    const settings = state.labelSettings || {};
    const profile = labelProfile(settings.preset, settings.customWidth, settings.customHeight);
    const width = profile.width;
    const height = profile.height;
    const qr = profile.qr;
    Object.assign(state.labelSettings, profile);
    const printMode = settings.printerMode === 'AUTO' ? (Number(settings.columns || 1) === 1 ? 'ROLL' : 'SHEET') : settings.printerMode;
    const requestedColumns = Math.max(1, Number(settings.columns || 1));
    const maxSheetColumns = Math.max(1, Math.floor(200 / width));
    const effectiveColumns = printMode === 'ROLL' ? 1 : Math.min(requestedColumns, maxSheetColumns, 5);
    settings.columns = effectiveColumns;
    if ($('labelColumns')) $('labelColumns').value = String(effectiveColumns);
    const grid = $('labelPreview');
    if (grid) {
      grid.style.setProperty('--label-w', `${width}mm`);
      grid.style.setProperty('--label-h', `${height}mm`);
      grid.style.setProperty('--label-gap', '0mm');
      grid.style.setProperty('--label-cols', String(effectiveColumns));
      grid.style.setProperty('--qr-mm', `${qr}mm`);
      grid.style.setProperty('--barcode-mm', `${profile.barcodeHeight || 6}mm`);
      grid.style.setProperty('--name-font', `${profile.skuFont}px`);
      grid.style.setProperty('--sku-font', `${profile.skuFont}px`);
      grid.style.setProperty('--name-weight', String(profile.nameWeight));
      grid.style.setProperty('--sku-weight', String(profile.skuWeight));
      grid.style.setProperty('--name-lines', String(profile.nameLines));
    }
    document.body.dataset.labelShowName = String(Boolean(settings.showName));
    document.body.dataset.labelPrintMode = printMode;
    let printStyle = document.getElementById('tknDynamicLabelPage');
    if (!printStyle) {
      printStyle = document.createElement('style');
      printStyle.id = 'tknDynamicLabelPage';
      document.head.appendChild(printStyle);
    }
    printStyle.textContent = printMode === 'ROLL'
      ? `@page{size:${width}mm ${height}mm;margin:0}`
      : '@page{size:A4 portrait;margin:5mm}';
    if ($('labelSettingSummary')) $('labelSettingSummary').textContent = `${printMode === 'ROLL' ? 'DT ม้วน' : 'กระดาษแผ่น'} · ${width} × ${height} มม. · ${effectiveColumns} ดวง/แถว · ${settings.dpi || 300} DPI`;
    if (save) { saveState(); renderBox(); }
  }

  function fillLabelSettingInputs() {
    const settings = state.labelSettings || {};
    if (!$('labelSizePreset')) return;
    $('labelPrinterMode').value = settings.printerMode || 'AUTO';
    $('labelPrinterDpi').value = String(settings.dpi || 300);
    $('labelSizePreset').value = settings.preset || '50x40';
    $('labelCustomWidth').value = settings.customWidth || settings.width || 50;
    $('labelCustomHeight').value = settings.customHeight || settings.height || 40;
    $('labelColumns').value = settings.columns || 1;
    $('labelShowName').checked = settings.showName !== false;
    document.querySelectorAll('.sp-custom-label-size').forEach((field) => { field.hidden = $('labelSizePreset').value !== 'CUSTOM'; });
    applyLabelSettings(false);
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
    $('lotStatus').textContent = state.lot ? `${state.lot.code} · ${state.items.length} SKU` : 'ยังไม่เปิดล็อต';
    $('pageSize').value = String(state.pageSize);
    $('categoryStatusFilter').value = state.statusFilter;
  }

  async function drawBoxQr(box, quantity) {
    const area = $('boxQrResult');
    area.innerHTML = `<h3>ปิดกล่องสำเร็จ</h3>
      <div class="sp-box-qr-status" id="boxQrStatus">กำลังสร้าง QR กล่อง...</div>
      <canvas id="boxQrCanvas" aria-label="QR กล่อง ${esc(box.code)}"></canvas>
      <p><b>${esc(box.code)}</b></p>
      <p>${box.items.length} SKU · ${quantity} ชิ้น</p>
      <div class="sp-actions"><button id="printBoxQrBtn" type="button" class="sp-primary">พิมพ์ QR กล่อง</button></div>`;

    const canvas = $('boxQrCanvas');
    const status = $('boxQrStatus');
    $('printBoxQrBtn')?.addEventListener('click', () => {
      document.body.classList.add('sp-print-box-qr');
      window.addEventListener('afterprint', () => document.body.classList.remove('sp-print-box-qr'), { once: true });
      window.print();
    });
    try {
      const ready = await (window.TKNQRHealth?.wait?.(2500)
        ?? Promise.resolve(Boolean(window.QRCode?.toCanvas || window.TKNQR?.toCanvas)));
      const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
      if (!ready || typeof toCanvas !== 'function') throw new Error('ไม่พบระบบสร้าง QR ในเครื่อง');
      await toCanvas(canvas, box.code, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
      status.textContent = 'QR กล่องพร้อมพิมพ์';
      status.classList.add('is-success');
      return true;
    } catch (error) {
      console.error('สร้าง QR กล่องไม่สำเร็จ:', error);
      status.textContent = `สร้าง QR ไม่สำเร็จ: ${error.message || 'กรุณารีเฟรชหน้า'}`;
      status.classList.add('is-error');
      message('ปิดกล่องแล้ว แต่สร้างภาพ QR ไม่สำเร็จ กรุณารีเฟรชแล้วลองอีกครั้ง', 'error');
      return false;
    }
  }

  async function closeBox() {
    const box = ensureBox();
    if (!box?.items?.length) return message('ยังไม่มีสินค้าในกล่อง', 'error');
    const quantity = box.items.reduce((sum, item) => sum + item.quantity, 0);
    if (box.status === 'CLOSED') {
      await drawBoxQr(box, quantity);
      return message('กล่องนี้ปิดแล้ว ระบบแสดง QR กล่องให้อีกครั้ง', 'success');
    }
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
          location: box.location || null,
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
    const qrReady = await drawBoxQr(box, quantity);
    if (qrReady) message(`ปิดผนึกและสร้าง QR กล่องแล้ว${box.location ? '' : ' · ยังไม่ระบุตำแหน่งจัดเก็บ'}`, 'success');
  }

  function validateCurrentStep() {
    if (state.step === 1) {
      if (!state.lot || !state.items.length) { message('กรุณาเพิ่ม SKU อย่างน้อย 1 รายการก่อน', 'error'); return false; }
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

    $('openTrackingCameraBtn').addEventListener('click', openTrackingCamera);
    $('loadTrackingBtn').addEventListener('click', loadTracking);
    $('trackingInput').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      loadTracking();
    });
    $('scanBatchList')?.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-remove-scan]') : null;
      if (!button) return;
      const id = button.dataset.removeScan;
      state.items = state.items.filter((item) => item.id !== id);
      state.selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      state.labelQueue = state.labelQueue.filter((item) => item.id !== id);
      if (state.box?.items) state.box.items = state.box.items.filter((item) => item.id !== id);
      saveState();
      render();
      $('trackingInput').focus();
      message('ลบ SKU ออกจากรายการสแกนแล้ว', 'success');
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) trackingCamera?.close(); });
    window.addEventListener('pagehide', () => trackingCamera?.close());
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
    $('generateBoxQrBtn').addEventListener('click', async () => {
      const readyItems = state.items.filter(itemReadyForQueue);
      if (!readyItems.length) return message('ยังไม่มีรายการที่มี SKU ต้นทุน และหมวดครบ', 'error');
      readyItems.forEach(queueItem);
      renderBox();
      await drawLabels();
      const missing = state.items.length - readyItems.length;
      message(`สร้าง/อัปเดต QR แล้ว ${labelUnits().length} ดวง${missing ? ` · ยังไม่พร้อม ${missing} รายการ` : ''}`, missing ? 'info' : 'success');
    });
    $('labelSizePreset').addEventListener('change', (event) => {
      document.querySelectorAll('.sp-custom-label-size').forEach((field) => { field.hidden = event.target.value !== 'CUSTOM'; });
      applyLabelSettings(true);
    });
    ['labelPrinterMode', 'labelPrinterDpi', 'labelColumns', 'labelShowName', 'labelCustomWidth', 'labelCustomHeight'].forEach((id) => {
      $(id)?.addEventListener('change', () => applyLabelSettings(true));
    });
    $('applyLabelSettingsBtn').addEventListener('click', () => {
      applyLabelSettings(true);
      message('บันทึกขนาดฉลากและปรับตัวอย่างแล้ว', 'success');
    });
    $('printLabelsBtn').addEventListener('click', async () => {
      if (!state.labelQueue.length) return message('คิวฉลากว่าง', 'error');
      applyLabelSettings(false);
      await drawLabels();
      window.print();
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
    fillLabelSettingInputs();
    bind();
    const client = await waitClient();
    setCloudStatus(client ? 'เชื่อมต่อฐานข้อมูลแล้ว' : 'โหมดเครื่องนี้');
    if (state.lot) {
      $('lotCode').value = state.lot.code;
      $('trackingInput').value = '';
      $('lotNote').value = state.lot.note || '';
      $('itemSearch').value = state.query || '';
    }
    go(state.step || 1);
    render();
    document.body.classList.remove('tkn-auth-loading');
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
