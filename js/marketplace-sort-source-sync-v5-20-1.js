(() => {
  'use strict';

  const VERSION = '5.20.1';
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const config = page.includes('lazada')
    ? { source: 'LAZADA', dbName: 'tkn_marketplace_import_lazada_v1' }
    : page.includes('shopee')
      ? { source: 'SHOPEE', dbName: 'tkn_marketplace_import_v1' }
      : null;
  if (!config || !('indexedDB' in window)) return;

  const RECORD_STORE = 'records';
  const META_STORE = 'meta';
  const syncKey = `tkn_sort_source_sync_${config.source.toLowerCase()}_v1`;
  let running = false;
  let timer = null;

  function injectStyle() {
    if (document.getElementById('tknSortSyncStyle')) return;
    const style = document.createElement('style');
    style.id = 'tknSortSyncStyle';
    style.textContent = `
      .tkn-sort-sync-badge{display:inline-flex;align-items:center;gap:8px;min-height:34px;margin-top:8px;padding:7px 11px;border:1px solid #d9dde5;border-radius:999px;background:#fff;color:#2b3038;font-size:.82rem;font-weight:800;box-shadow:0 5px 15px rgba(0,0,0,.05)}
      .tkn-sort-sync-badge::before{content:"";width:9px;height:9px;border-radius:50%;background:#d7a800;box-shadow:0 0 0 4px rgba(255,196,0,.18)}
      .tkn-sort-sync-badge.is-ok::before{background:#218b4a;box-shadow:0 0 0 4px rgba(33,139,74,.16)}
      .tkn-sort-sync-badge.is-error::before{background:#c8101e;box-shadow:0 0 0 4px rgba(200,16,30,.14)}
      @media(max-width:760px){.tkn-sort-sync-badge{width:100%;justify-content:center;border-radius:12px;text-align:center}}
    `;
    document.head.appendChild(style);
  }

  function getBadge() {
    let badge = document.getElementById('tknSortSyncBadge');
    if (badge) return badge;
    injectStyle();
    badge = document.createElement('span');
    badge.id = 'tknSortSyncBadge';
    badge.className = 'tkn-sort-sync-badge';
    badge.textContent = 'ข้อมูลไฟล์พร้อมใช้บนเครื่องนี้';
    const anchor = document.getElementById('workspaceStatus');
    const host = anchor?.parentElement || document.querySelector('.hero-card,.page-hero,main') || document.body;
    host.appendChild(badge);
    return badge;
  }

  function setBadge(text, type = '') {
    const badge = getBadge();
    badge.textContent = text;
    badge.classList.toggle('is-ok', type === 'ok');
    badge.classList.toggle('is-error', type === 'error');
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

  async function openDatabase(name) {
    if (!(await databaseExists(name))) return null;
    return new Promise((resolve, reject) => {
      let created = false;
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { created = request.oldVersion === 0; };
      request.onsuccess = () => {
        if (created || !request.result.objectStoreNames.contains(RECORD_STORE)) {
          request.result.close();
          if (created) indexedDB.deleteDatabase(name);
          resolve(null);
          return;
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('เปิดข้อมูล Marketplace ไม่สำเร็จ'));
    });
  }

  async function readWorkspace() {
    const db = await openDatabase(config.dbName);
    if (!db) return { rows: [], savedAt: '' };
    try {
      const stores = [RECORD_STORE];
      if (db.objectStoreNames.contains(META_STORE)) stores.push(META_STORE);
      const tx = db.transaction(stores, 'readonly');
      const rowsPromise = requestResult(tx.objectStore(RECORD_STORE).getAll());
      let metaPromise = Promise.resolve([]);
      if (stores.includes(META_STORE)) metaPromise = requestResult(tx.objectStore(META_STORE).getAll());
      const [rows, metaRows] = await Promise.all([rowsPromise, metaPromise]);
      const meta = Object.fromEntries((metaRows || []).map((entry) => [entry.key, entry.value]));
      return { rows: rows || [], savedAt: String(meta.savedAt || '') };
    } finally {
      db.close();
    }
  }

  async function waitForClient() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    return null;
  }

  function numberOrZero(value) {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeRows(rows) {
    return rows
      .filter((row) => row?.tracking_number && row?.sku_id)
      .map((row) => {
        const costText = String(row.cost_price ?? '').replace(/,/g, '').trim();
        const parsedCost = Number(costText);
        const costProvided = costText !== '' && Number.isFinite(parsedCost) && parsedCost >= 0;
        return {
          source: config.source,
          tracking_number: String(row.tracking_number).trim(),
          order_number: String(row.order_number || '').trim(),
          source_sku: String(row.sku_id || '').trim(),
          sku: String(row.product_code || row.sku_id || '').trim(),
          product_name: String(row.item_name || 'สินค้าไม่ระบุชื่อ').trim(),
          category: String(row.sub_category || row.main_category || '').trim(),
          main_category: String(row.main_category || '').trim(),
          sub_category: String(row.sub_category || '').trim(),
          quantity: Math.max(0, numberOrZero(row.item_quantity) || 1),
          unit_cost: costProvided ? parsedCost : 0,
          source_item_price: numberOrZero(row.source_item_price),
          raw_data: {
            return_status: row.return_status || '',
            order_status: row.order_status || '',
            imported_at: row.imported_at || '',
            cost_provided: costProvided,
            sync_version: VERSION,
          },
          updated_at: new Date().toISOString(),
        };
      });
  }

  async function syncWorkspace(force = false) {
    if (running) return;
    running = true;
    try {
      const workspace = await readWorkspace();
      if (!workspace.rows.length) {
        setBadge('ยังไม่มีข้อมูลไฟล์สำหรับโมดูลแยกสินค้า');
        return;
      }

      const previous = JSON.parse(localStorage.getItem(syncKey) || '{}');
      if (!force && workspace.savedAt && previous.savedAt === workspace.savedAt && previous.rowCount === workspace.rows.length) {
        setBadge(`พร้อมใช้ในโมดูลแยกสินค้า ${workspace.rows.length.toLocaleString('th-TH')} รายการ`, 'ok');
        return;
      }

      const client = await waitForClient();
      if (!client) {
        setBadge(`พร้อมใช้บนเครื่องนี้ ${workspace.rows.length.toLocaleString('th-TH')} รายการ`);
        return;
      }

      const payload = normalizeRows(workspace.rows);
      setBadge(`กำลังส่ง ${payload.length.toLocaleString('th-TH')} รายการไปโมดูลแยกสินค้า...`);
      for (let start = 0; start < payload.length; start += 400) {
        const chunk = payload.slice(start, start + 400);
        const { error } = await client
          .from('marketplace_sorting_source_items')
          .upsert(chunk, { onConflict: 'source,tracking_number,source_sku' });
        if (error) throw error;
        setBadge(`กำลังซิงก์ ${Math.min(start + chunk.length, payload.length).toLocaleString('th-TH')} / ${payload.length.toLocaleString('th-TH')} รายการ`);
      }

      localStorage.setItem(syncKey, JSON.stringify({
        savedAt: workspace.savedAt,
        rowCount: workspace.rows.length,
        syncedAt: new Date().toISOString(),
      }));
      setBadge(`พร้อมใช้ในโมดูลแยกสินค้า ${payload.length.toLocaleString('th-TH')} รายการ`, 'ok');
    } catch (error) {
      console.warn('Marketplace → Sort Pack sync failed:', error);
      const workspace = await readWorkspace().catch(() => ({ rows: [] }));
      if (workspace.rows.length) {
        setBadge(`พร้อมใช้บนเครื่องนี้ แต่ยังซิงก์ข้ามเครื่องไม่ได้: ${error.message || 'เกิดข้อผิดพลาด'}`, 'error');
      } else {
        setBadge(`ซิงก์ข้อมูลไม่สำเร็จ: ${error.message || 'เกิดข้อผิดพลาด'}`, 'error');
      }
    } finally {
      running = false;
    }
  }

  function schedule(delay = 800) {
    clearTimeout(timer);
    timer = setTimeout(() => syncWorkspace(false), delay);
  }

  document.addEventListener('DOMContentLoaded', () => {
    getBadge();
    schedule(1200);
    window.addEventListener('focus', () => schedule(300));
    document.getElementById('sourceFileInput')?.addEventListener('change', () => schedule(2500));
    setInterval(() => schedule(0), 20_000);
  });

  window.TKNSortSourceSync = Object.freeze({ syncNow: () => syncWorkspace(true), version: VERSION });
})();
