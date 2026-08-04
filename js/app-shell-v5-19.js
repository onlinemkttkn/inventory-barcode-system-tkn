(() => {
  'use strict';

  const VERSION = '5.22.3';
  const COMPANY = 'เถ้าแก่น้อย ชลบุรี';
  const SESSION_CACHE_KEY = 'tkn_access_context_v3';
  const SHARED_CACHE_KEY = 'tkn_access_context_shared_v4';
  const SHARED_CACHE_TTL = 5 * 60_000;
  const ACCESS_RPC = 'current_access_context';
  const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const PUBLIC_PAGES = new Set(['index.html', 'offline.html']);
  const PRINT_PAGES = new Set([
    'receipt.html', 'phase-9-2-reprint-receipt.html',
    'sales-return-receipt.html', 'sales-return-receipt-v2-3.html'
  ]);
  const SKIP_SHELL = new Set([...PUBLIC_PAGES, ...PRINT_PAGES]);

  const ICONS = Object.freeze({
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z"/></svg>',
    pos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-1.2 5.5a3 3 0 0 1-2.9 2.4H8.1a3 3 0 0 1-2.9-2.4z"/><path d="M6 13v7h12v-7M9 20v-4h6v4"/></svg>',
    scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h1v1h-1zM16 13h1v3h-3v-1"/></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/></svg>',
    products: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"/><path d="M15 4v5h5M8 13h8M8 17h6"/></svg>',
    warehouse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-5 9 5v11H3z"/><path d="M7 12h10v8H7zM10 12v8M14 12v8"/></svg>',
    receive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M12 3v10M8 9l4 4 4-4"/></svg>',
    issue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M12 21V11M8 15l4-4 4 4"/></svg>',
    transfer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3"/></svg>',
    count: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3H7zM5 5h14v16H5z"/><path d="m8 13 2 2 5-5M8 18h8"/></svg>',
    supplier: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h12v10H3zM15 11h4l2 3v4h-6z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></svg>',
    import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 17v3h16v-3"/></svg>',
    shopee: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2"/><path d="M9 13c1.5-1 4.5-1 6 0-1 3-5 4-6 0z"/></svg>',
    lazada: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4v10l-8 4-8-4z"/><path d="m8 10 4 2 4-2M12 12v5"/></svg>',
    bill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v5l3 2"/></svg>',
    report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h4v10zM10 20V4h4v16zM16 20v-7h4v7z"/></svg>',
    return: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M5 12h9a5 5 0 0 1 5 5v2"/></svg>',
    member: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M17 7v6M14 10h6"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M2 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 4"/></svg>',
    audit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/><circle cx="18" cy="18" r="3"/></svg>',
    hardware: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M6 17H4V9h16v8h-2"/><path d="M7 14h10v7H7zM17 11h.01"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></svg>',
    install: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  });

  const ROUTES = Object.freeze([
    { key:'dashboard', group:'งานหลัก', label:'หน้าหลัก', short:'หน้าหลัก', href:'./dashboard.html', icon:'home', any:['dashboard.view'], pages:['dashboard.html','dashboard-integrated-phase-9-5-v1-1.html'] },
    { key:'pos', group:'งานหลัก', label:'POS / ขายหน้าร้าน', short:'ขาย', href:'./pos.html', icon:'pos', any:['pos.use'], pages:['pos.html','pos-member.html'] },
    { key:'scan', group:'งานหลัก', label:'สแกน QR / ตรวจสต็อก', short:'สแกน', href:'./mobile-stock-check.html', icon:'scan', any:['inventory.view','inventory.count','product.manage','pos.use'], pages:['mobile-stock-check.html','scanner.html'] },
    { key:'sortPack', group:'งานหลัก', label:'แยกสินค้า / ปิดกล่อง', short:'แยกสินค้า', href:'./sort-pack-qr.html', icon:'box', any:['product.manage'], pages:['sort-pack-qr.html'] },
    { key:'box', group:'งานหลัก', label:'Box QR / จัดกล่อง', short:'Box QR', href:'./box-qr-stock.html', icon:'box', any:['product.manage'], pages:['box-qr-stock.html'] },

    { key:'products', group:'สินค้าและคลัง', label:'จัดการสินค้า', short:'สินค้า', href:'./products-admin.html', icon:'products', any:['product.manage'], pages:['products-admin.html','categories-admin.html','product-stock-admin.html'] },
    { key:'labels', group:'สินค้าและคลัง', label:'พิมพ์ QR / ป้ายสินค้า', short:'พิมพ์ป้าย', href:'./print-labels.html', icon:'scan', any:['inventory.view'], pages:['print-labels.html','generator.html'] },
    { key:'inventory', group:'สินค้าและคลัง', label:'คลังสินค้า', short:'คลัง', href:'./inventory-operations.html', icon:'warehouse', any:['inventory.view'], pages:['inventory-operations.html','transactions.html','branch-stock.html'] },
    { key:'receive', group:'สินค้าและคลัง', label:'รับสินค้า', short:'รับเข้า', href:'./receive.html', icon:'receive', any:['inventory.receive','inventory.view'], pages:['receive.html','purchase-order-create.html','purchase-order-history.html'] },
    { key:'issue', group:'สินค้าและคลัง', label:'เบิกสินค้า', short:'เบิก', href:'./issue.html', icon:'issue', any:['inventory.issue','inventory.view'], pages:['issue.html'] },
    { key:'transfer', group:'สินค้าและคลัง', label:'โอนสินค้า', short:'โอน', href:'./transfer-create.html', icon:'transfer', any:['inventory.transfer','inventory.view'], pages:['transfer-create.html','transfer-receive.html','transfer-history.html'] },
    { key:'count', group:'สินค้าและคลัง', label:'ตรวจนับสต็อก', short:'นับสต็อก', href:'./stock-count.html', icon:'count', any:['inventory.count','inventory.view'], pages:['stock-count.html','stock-count-history.html','stock-alerts.html'] },
    { key:'suppliers', group:'สินค้าและคลัง', label:'ผู้ขาย / จัดซื้อ', short:'ผู้ขาย', href:'./suppliers.html', icon:'supplier', any:['inventory.receive','product.manage'], pages:['suppliers.html'] },

    { key:'import', group:'Marketplace / นำเข้า', label:'Import / Export', short:'นำเข้า', href:'./import-export.html', icon:'import', any:['product.manage'], pages:['import-export.html'] },
    { key:'shopee', group:'Marketplace / นำเข้า', label:'นำเข้า Shopee', short:'Shopee', href:'./shopee-import.html', icon:'shopee', any:['product.manage'], pages:['shopee-import.html'] },
    { key:'lazada', group:'Marketplace / นำเข้า', label:'นำเข้า Lazada', short:'Lazada', href:'./lazada-import.html', icon:'lazada', any:['product.manage'], pages:['lazada-import.html'] },
    { key:'manualImport', group:'Marketplace / นำเข้า', label:'นำเข้าสินค้าด้วยตนเอง', short:'นำเข้าเอง', href:'./manual-product-import.html', icon:'products', any:['product.manage'], pages:['manual-product-import.html'] },

    { key:'billSearch', group:'รายงานและตรวจสอบ', label:'ค้นหาบิลย้อนหลัง', short:'ค้นหาบิล', href:'./phase-9-2-bill-search.html', icon:'bill', any:['pos.search_bill','bill.view'], pages:['phase-9-2-bill-search.html','phase-9-2-bill-search-v2-1.html','phase-9-2-bill-search-v2-2.html','phase-9-2-bill-search-integrated-v1-1.html','phase-9-2-reprint-receipt.html','phase-9-2-void-bill.html'] },
    { key:'salesHistory', group:'รายงานและตรวจสอบ', label:'ประวัติการขาย', short:'ประวัติขาย', href:'./sales-history.html', icon:'history', any:['report.view','reports.view','pos.search_bill'], pages:['sales-history.html'] },
    { key:'reports', group:'รายงานและตรวจสอบ', label:'รายงาน', short:'รายงาน', href:'./reports.html', icon:'report', any:['report.view','reports.view'], pages:['reports.html','sales-return-report.html','sales-return-report-integrated-v1-1.html'] },
    { key:'returns', group:'รายงานและตรวจสอบ', label:'คืนสินค้า / ประวัติคืน', short:'คืนสินค้า', href:'./sales-return.html', icon:'return', any:['pos.return_create','report.view','reports.view'], pages:['sales-return.html','sales-return-v2-1.html','sales-return-v2-2.html','sales-return-history.html','sales-return-history-integrated-v1-1.html'] },

    { key:'members', group:'สมาชิกและผู้ดูแล', label:'สมาชิก', short:'สมาชิก', href:'./members.html', icon:'member', any:['member.view','member.create','member.apply'], pages:['members.html','member-history.html'] },
    { key:'users', group:'สมาชิกและผู้ดูแล', label:'ผู้ใช้และสิทธิ์', short:'ผู้ใช้', href:'./users-admin.html', icon:'users', any:['user.manage'], pages:['users-admin.html'] },
    { key:'audit', group:'สมาชิกและผู้ดูแล', label:'Audit Log', short:'Audit', href:'./audit-log.html', icon:'audit', any:['audit.view'], pages:['audit-log.html'] },
    { key:'hardware', group:'สมาชิกและผู้ดูแล', label:'ตั้งค่าเครื่องพิมพ์', short:'เครื่องพิมพ์', href:'./hardware-settings.html', icon:'hardware', any:['hardware.manage','user.manage'], pages:['hardware-settings.html'] }
  ]);

  const PAGE_NAMES = Object.freeze({
    'dashboard.html':'หน้าหลัก', 'pos.html':'ขายหน้าร้าน', 'pos-member.html':'สมาชิกใน POS',
    'mobile-stock-check.html':'สแกนตรวจสต็อก', 'sort-pack-qr.html':'แยกสินค้าและปิดกล่อง', 'scanner.html':'สแกน', 'box-qr-stock.html':'Box QR',
    'products-admin.html':'จัดการสินค้า', 'categories-admin.html':'หมวดสินค้า', 'product-stock-admin.html':'สต็อกสินค้า',
    'inventory-operations.html':'คลังสินค้า', 'receive.html':'รับสินค้า', 'issue.html':'เบิกสินค้า',
    'transfer-create.html':'สร้างใบโอน', 'transfer-receive.html':'รับโอน', 'transfer-history.html':'ประวัติโอน',
    'transactions.html':'รายการเคลื่อนไหว', 'stock-count.html':'ตรวจนับสต็อก', 'stock-count-history.html':'ประวัติตรวจนับ',
    'stock-alerts.html':'แจ้งเตือนสต็อก', 'reports.html':'รายงาน', 'sales-history.html':'ประวัติการขาย',
    'phase-9-2-bill-search.html':'ค้นหาบิลย้อนหลัง', 'import-export.html':'นำเข้า / ส่งออก',
    'shopee-import.html':'นำเข้า Shopee', 'lazada-import.html':'นำเข้า Lazada',
    'manual-product-import.html':'นำเข้าสินค้าด้วยตนเอง', 'hardware-settings.html':'ตั้งค่าเครื่องพิมพ์',
    'users-admin.html':'ผู้ใช้และสิทธิ์', 'audit-log.html':'Audit Log', 'members.html':'สมาชิก',
    'member-history.html':'ประวัติสมาชิก', 'suppliers.html':'ผู้ขาย / จัดซื้อ', 'purchase-order-create.html':'สร้างใบสั่งซื้อ',
    'purchase-order-history.html':'ประวัติใบสั่งซื้อ', 'sales-return.html':'คืนสินค้า',
    'sales-return-history.html':'ประวัติคืนสินค้า', 'sales-return-report.html':'รายงานคืนสินค้า'
  });

  function parseJson(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function normalizePermissions(value) {
    if (Array.isArray(value)) return value.map(String);
    if (value && typeof value === 'object') return Object.keys(value).filter(key => value[key]);
    return [];
  }

  function normalizeAccess(value) {
    const access = Array.isArray(value) ? value[0] : value;
    if (!access || typeof access !== 'object' || !access.user_id) return null;
    return {
      ...access,
      role: String(access.role || '').trim().toLowerCase() || 'staff',
      permissions: normalizePermissions(access.permissions)
    };
  }

  function readCache(storage, key, { maxAge = SHARED_CACHE_TTL, userId = null } = {}) {
    const cached = parseJson(storage.getItem(key), null);
    const access = normalizeAccess(cached?.data);
    const savedAt = Number(cached?.savedAt || 0);
    if (!access || !savedAt || Date.now() - savedAt > maxAge) return null;
    if (userId && access.user_id !== userId) return null;
    return access;
  }

  function persistedAuthUserId() {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const stored = parseJson(localStorage.getItem(key), null);
      const userId = stored?.user?.id || stored?.session?.user?.id || stored?.currentSession?.user?.id || stored?.data?.session?.user?.id;
      if (userId) return userId;
    }
    return null;
  }

  function saveAccess(rawAccess) {
    const access = normalizeAccess(rawAccess);
    if (!access) return null;
    const packet = JSON.stringify({ savedAt: Date.now(), data: access });
    sessionStorage.setItem(SESSION_CACHE_KEY, packet);
    localStorage.setItem(SHARED_CACHE_KEY, packet);
    sessionStorage.setItem('tkn_user_role', access.role);
    sessionStorage.setItem('tkn_permissions', JSON.stringify(access.permissions));
    sessionStorage.setItem('tkn_current_actor', access.full_name || access.email || access.user_id);
    window.TKNCurrentAccess = access;
    window.dispatchEvent(new CustomEvent('tkn:access-ready', { detail: access }));
    return access;
  }

  function clearAccessCache() {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    sessionStorage.removeItem('tkn_user_role');
    sessionStorage.removeItem('tkn_permissions');
    sessionStorage.removeItem('tkn_current_actor');
    localStorage.removeItem(SHARED_CACHE_KEY);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const absolute = new URL(src, location.href).href;
      const existing = [...document.scripts].find(script => script.src === absolute);
      if (existing) {
        if (window.supabaseClient) resolve();
        else {
          existing.addEventListener('load', resolve, { once:true });
          existing.addEventListener('error', reject, { once:true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`โหลดสคริปต์ไม่สำเร็จ: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabaseClient(timeoutMs = 2400) {
    const startedAt = Date.now();
    while (!window.supabaseClient && Date.now() - startedAt < timeoutMs) await sleep(40);
    if (window.supabaseClient) return window.supabaseClient;
    try {
      if (!window.supabase?.createClient) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      if (!window.supabaseClient) await loadScript('./js/supabase-config.js?v=5.19.0');
    } catch (error) {
      console.warn('App shell Supabase bootstrap failed:', error);
    }
    return window.supabaseClient || null;
  }

  async function getSession(client) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) lastError = error;
        if (data?.session?.user?.id) return data.session;
      } catch (error) { lastError = error; }
      if (attempt < 2) await sleep(180);
    }
    if (lastError) console.warn('App shell session lookup failed:', lastError);
    return null;
  }

  async function fetchAccess(client, session) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await client.rpc(ACCESS_RPC);
        const access = normalizeAccess(result.data);
        if (!result.error && access?.user_id === session.user.id) {
          if (access.is_active !== true) {
            clearAccessCache();
            try { await client.auth.signOut(); } catch {}
            location.replace('./index.html');
            return null;
          }
          return saveAccess(access);
        }
        lastError = result.error || new Error('ข้อมูลสิทธิ์ไม่ตรงกับผู้ใช้งานปัจจุบัน');
      } catch (error) { lastError = error; }
      if (attempt < 2) await sleep(220);
    }
    if (lastError) console.warn('App shell access lookup failed:', lastError);
    return null;
  }

  async function resolveAccess() {
    const guardCache = normalizeAccess(window.TKNAuthGuard?.getCachedAccess?.());
    if (guardCache) return saveAccess(guardCache);
    const persistedUserId = persistedAuthUserId();
    const sharedBeforeNetwork = persistedUserId ? readCache(localStorage, SHARED_CACHE_KEY, { userId:persistedUserId }) : null;
    if (sharedBeforeNetwork) return saveAccess(sharedBeforeNetwork);
    const client = await ensureSupabaseClient();
    if (!client?.auth?.getSession || !client?.rpc) {
      return readCache(localStorage, SHARED_CACHE_KEY) || readCache(sessionStorage, SESSION_CACHE_KEY);
    }
    const session = await getSession(client);
    if (!session?.user?.id) {
      clearAccessCache();
      return null;
    }
    return await fetchAccess(client, session) || readCache(localStorage, SHARED_CACHE_KEY, { userId:session.user.id });
  }

  function isAdmin(access) {
    return ['owner','admin'].includes(String(access?.role || '').toLowerCase());
  }

  function can(access, permission) {
    if (!permission) return true;
    if (isAdmin(access)) return true;
    const permissions = new Set(normalizePermissions(access?.permissions));
    if (permission === 'report.view') return permissions.has('report.view') || permissions.has('reports.view');
    if (permission === 'reports.view') return permissions.has('reports.view') || permissions.has('report.view');
    if (permission === 'pos.search_bill') return permissions.has('pos.search_bill') || permissions.has('bill.view');
    if (permission === 'hardware.manage') return permissions.has('hardware.manage') || permissions.has('user.manage');
    return permissions.has(permission);
  }

  function canRoute(access, route) {
    return !route?.any?.length || route.any.some(permission => can(access, permission));
  }

  function allowedRoutes(access) {
    return ROUTES.filter(route => canRoute(access, route));
  }

  function routeForPage(page = currentPage) {
    return ROUTES.find(route => route.pages.includes(page)) || null;
  }

  function roleLabel(access) {
    if (access?.role_name_th) return access.role_name_th;
    return ({
      owner:'เจ้าของกิจการ', admin:'ผู้ดูแลระบบ', secretary:'เลขานุการ', manager:'ผู้จัดการ',
      supervisor:'หัวหน้างาน', warehouse:'คลังสินค้า', sales:'ฝ่ายขาย', cashier:'แคชเชียร์',
      accounting:'บัญชี', staff:'พนักงาน'
    })[access?.role] || access?.role || 'ผู้ใช้งาน';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    })[character]);
  }

  function pageTitle() {
    if (PAGE_NAMES[currentPage]) return PAGE_NAMES[currentPage];
    const h1 = [...document.querySelectorAll('h1')].find(node => node.textContent?.trim());
    return h1?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 42) || 'ระบบบริหารร้านค้า';
  }

  function isHome() {
    return currentPage === 'dashboard.html' || currentPage === 'dashboard-integrated-phase-9-5-v1-1.html';
  }

  function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function safeBack() {
    if (isHome()) return;
    if (window.TKNSafeBack?.go) {
      window.TKNSafeBack.go({ fallback:'./dashboard.html' });
      return;
    }
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (history.length > 1 && ref?.origin === location.origin) {
        history.back();
        return;
      }
    } catch {}
    location.href = './dashboard.html';
  }

  async function signOut() {
    try {
      const client = await ensureSupabaseClient();
      await client?.auth?.signOut?.();
    } catch (error) {
      console.warn('Sign out warning:', error);
    } finally {
      clearAccessCache();
      sessionStorage.clear();
      localStorage.removeItem('tkn_cashier_unlock');
      location.replace('./index.html');
    }
  }

  function toast(message, duration = 2600) {
    let node = document.querySelector('.tkn-app-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'tkn-app-toast';
      node.setAttribute('role', 'status');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(node._tknTimer);
    node._tknTimer = setTimeout(() => node.classList.remove('is-visible'), duration);
  }

  function routeLink(route, { compact = false } = {}) {
    const link = document.createElement('a');
    link.href = route.href;
    link.dataset.routeKey = route.key;
    link.className = compact ? 'tkn-shell-dock-item' : 'tkn-shell-menu-item';
    if (route.pages.includes(currentPage)) link.classList.add('active');
    link.innerHTML = `<span class="tkn-shell-icon">${ICONS[route.icon] || ICONS.products}</span><span>${compact ? route.short : route.label}</span>`;
    return link;
  }

  function groupRoutes(routes) {
    const grouped = new Map();
    routes.forEach(route => {
      if (!grouped.has(route.group)) grouped.set(route.group, []);
      grouped.get(route.group).push(route);
    });
    return grouped;
  }

  function renderDesktopSidebar(access, routes) {
    const sidebar = document.createElement('aside');
    sidebar.className = 'tkn-desktop-sidebar no-print';
    sidebar.setAttribute('aria-label', 'เมนูระบบ');
    sidebar.innerHTML = `
      <a class="tkn-shell-brand" href="./dashboard.html" aria-label="${COMPANY}">
        <img src="./assets/tkn-company-logo.png?v=${VERSION}" alt="${COMPANY}">
        <span><strong>ระบบบริหารร้านค้า</strong><small>Final v${VERSION}</small></span>
      </a>
      <div class="tkn-shell-user">
        <span class="tkn-shell-avatar" aria-hidden="true">${escapeHtml((access.full_name || access.email || 'U').trim().charAt(0).toUpperCase())}</span>
        <span><strong>${escapeHtml(access.full_name || access.email || 'ผู้ใช้งาน')}</strong><small>${escapeHtml(roleLabel(access))}</small></span>
      </div>
      <div class="tkn-shell-desktop-menu"></div>
      <div class="tkn-shell-sidebar-footer">
        <button class="tkn-shell-menu-item tkn-logout-btn" type="button"><span class="tkn-shell-icon">${ICONS.logout}</span><span>ออกจากระบบ</span></button>
      </div>`;
    const menu = sidebar.querySelector('.tkn-shell-desktop-menu');
    groupRoutes(routes).forEach((groupItems, groupName) => {
      const section = document.createElement('section');
      section.className = 'tkn-shell-menu-group';
      section.innerHTML = `<h2>${escapeHtml(groupName)}</h2>`;
      groupItems.forEach(route => section.appendChild(routeLink(route)));
      menu.appendChild(section);
    });
    sidebar.querySelector('.tkn-logout-btn').addEventListener('click', signOut);
    document.body.prepend(sidebar);
  }

  function renderMobileTopbar() {
    const header = document.createElement('header');
    header.className = `tkn-mobile-topbar no-print${isHome() ? ' is-home' : ''}`;
    header.innerHTML = `
      ${isHome() ? '' : `<button class="tkn-mobile-back" type="button" aria-label="ย้อนกลับ" title="ย้อนกลับ"><span class="tkn-shell-icon">${ICONS.back}</span></button>`}
      <a class="tkn-mobile-brand" href="./dashboard.html" aria-label="${COMPANY}">
        <img src="./assets/tkn-company-logo.png?v=${VERSION}" alt="${COMPANY}">
        <span class="tkn-mobile-title-copy"><strong>${escapeHtml(pageTitle())}</strong><small>Final v${VERSION}</small></span>
      </a>`;
    header.querySelector('.tkn-mobile-back')?.addEventListener('click', safeBack);
    document.body.prepend(header);
  }

  function renderLauncher(access, routes) {
    const launcher = document.createElement('div');
    launcher.className = 'tkn-app-launcher no-print';
    launcher.setAttribute('aria-hidden', 'true');
    launcher.innerHTML = `
      <section class="tkn-app-launcher-sheet" role="dialog" aria-modal="true" aria-label="เมนูระบบ">
        <div class="tkn-app-launcher-head">
          <div class="tkn-launcher-profile">
            <span class="tkn-shell-avatar" aria-hidden="true">${escapeHtml((access.full_name || access.email || 'U').trim().charAt(0).toUpperCase())}</span>
            <span><strong>${escapeHtml(access.full_name || access.email || 'ผู้ใช้งาน')}</strong><small>${escapeHtml(roleLabel(access))} · Final v${VERSION}</small></span>
          </div>
          <button class="tkn-app-launcher-close" type="button" aria-label="ปิดเมนู"><span class="tkn-shell-icon">${ICONS.close}</span></button>
        </div>
        <div class="tkn-app-launcher-content"></div>
        <div class="tkn-app-launcher-footer">
          <button class="tkn-install-entry" type="button" hidden><span class="tkn-shell-icon">${ICONS.install}</span><span>ติดตั้งเป็นแอป</span></button>
          <button class="tkn-logout-btn" type="button"><span class="tkn-shell-icon">${ICONS.logout}</span><span>ออกจากระบบ</span></button>
        </div>
      </section>`;
    const content = launcher.querySelector('.tkn-app-launcher-content');
    groupRoutes(routes).forEach((groupItems, groupName) => {
      const section = document.createElement('section');
      section.className = 'tkn-launcher-group';
      section.innerHTML = `<h2>${escapeHtml(groupName)}</h2><div class="tkn-app-launcher-grid"></div>`;
      const grid = section.querySelector('.tkn-app-launcher-grid');
      groupItems.forEach(route => grid.appendChild(routeLink(route)));
      content.appendChild(section);
    });

    const close = () => {
      launcher.classList.remove('is-open');
      launcher.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('tkn-launcher-lock');
    };
    const open = () => {
      launcher.classList.add('is-open');
      launcher.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('tkn-launcher-lock');
      launcher.querySelector('.tkn-app-launcher-close')?.focus();
    };
    launcher.querySelector('.tkn-app-launcher-close').addEventListener('click', close);
    launcher.querySelector('.tkn-logout-btn').addEventListener('click', signOut);
    launcher.addEventListener('click', event => { if (event.target === launcher) close(); });
    launcher.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && launcher.classList.contains('is-open')) close(); });
    document.body.appendChild(launcher);
    return { launcher, open, close };
  }

  function renderMobileDock(routes, openLauncher) {
    const preferred = ['dashboard','pos','scan','box'];
    const pinned = preferred.map(key => routes.find(route => route.key === key)).filter(Boolean).slice(0, 4);
    if (!pinned.length) pinned.push(...routes.slice(0, 4));
    const dock = document.createElement('nav');
    dock.className = 'tkn-mobile-dock no-print';
    dock.setAttribute('aria-label', 'เมนูด่วนมือถือ');
    pinned.forEach(route => dock.appendChild(routeLink(route, { compact:true })));
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'tkn-shell-dock-item';
    more.innerHTML = `<span class="tkn-shell-icon">${ICONS.more}</span><span>เมนู</span>`;
    more.addEventListener('click', openLauncher);
    dock.appendChild(more);
    document.body.appendChild(dock);
  }

  function wrapTables() {
    document.querySelectorAll('table').forEach(table => {
      if (table.closest('.tkn-table-scroll') || table.closest('[data-no-mobile-wrap]')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'tkn-table-scroll';
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', 'ตารางข้อมูล เลื่อนได้ในแนวนอน');
      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function improveDialogs() {
    document.querySelectorAll('dialog,[role="dialog"],.modal,.popup').forEach(dialog => {
      if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
        const heading = dialog.querySelector('h1,h2,h3,.modal-title,.dialog-title');
        if (heading?.textContent?.trim()) dialog.setAttribute('aria-label', heading.textContent.trim());
      }
    });
  }

  function createNetworkStatus() {
    const status = document.createElement('div');
    status.className = 'tkn-network-status no-print';
    status.setAttribute('role', 'status');
    status.textContent = 'ออฟไลน์ — งานที่ต้องบันทึกข้อมูลจะใช้งานไม่ได้ชั่วคราว';
    document.body.appendChild(status);
    const update = () => {
      status.classList.toggle('is-offline', !navigator.onLine);
      if (navigator.onLine && status.dataset.wasOffline === 'true') toast('กลับมาออนไลน์แล้ว');
      status.dataset.wasOffline = String(!navigator.onLine);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  function setupInstallPrompt(launcher) {
    if (isStandalone()) return;
    let deferredPrompt = null;
    const button = launcher.querySelector('.tkn-install-entry');
    button.addEventListener('click', async () => {
      if (!deferredPrompt) {
        toast('เปิดเมนู Browser แล้วเลือก “เพิ่มไปยังหน้าจอหลัก”');
        return;
      }
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') button.hidden = true;
      deferredPrompt = null;
    });
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      button.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      button.hidden = true;
      toast(`ติดตั้ง ${COMPANY} แล้ว`);
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker-v5.20.6.js', { scope:'./' })
        .catch(error => console.warn('Service worker registration failed:', error));
    });
  }

  function observeDynamicContent() {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        wrapTables();
        improveDialogs();
      });
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  function removeLegacyShell() {
    document.querySelectorAll('.tkn-nav-bar[data-tkn-dynamic-nav],.tkn-mobile-topbar,.tkn-mobile-dock,.tkn-app-launcher,.tkn-app-install').forEach(node => node.remove());
    document.body.classList.remove('tkn-has-sidebar');
  }

  function firstAllowedRoute(access) {
    return allowedRoutes(access)[0] || null;
  }

  function enforceCurrentRoute(access) {
    const route = routeForPage();
    if (!route || canRoute(access, route)) return true;
    const fallback = firstAllowedRoute(access);
    alert(`บัญชีนี้ไม่มีสิทธิ์ใช้งานฟังก์ชัน “${route.label}”`);
    location.replace(access.landing_page || fallback?.href || './index.html');
    return false;
  }

  let mounted = false;

  function mountShell(access) {
    if (mounted || !access?.user_id) return;
    if (!enforceCurrentRoute(access)) return;
    mounted = true;
    removeLegacyShell();
    const routes = allowedRoutes(access);
    document.body.classList.add('tkn-unified-shell', 'tkn-shell-ready');
    if (isStandalone()) document.body.classList.add('tkn-app-standalone');
    if (isHome()) document.body.classList.add('tkn-home-page');

    renderDesktopSidebar(access, routes);
    renderMobileTopbar();
    const launcherApi = renderLauncher(access, routes);
    renderMobileDock(routes, launcherApi.open);
    setupInstallPrompt(launcherApi.launcher);
    createNetworkStatus();
    wrapTables();
    improveDialogs();
    observeDynamicContent();
    registerServiceWorker();
    document.body.classList.remove('tkn-shell-loading');
  }

  async function start() {
    document.body.classList.add('tkn-shell-loading');
    if (SKIP_SHELL.has(currentPage)) {
      if (PRINT_PAGES.has(currentPage)) document.body.classList.add('tkn-print-page');
      document.body.classList.remove('tkn-shell-loading');
      registerServiceWorker();
      return;
    }

    removeLegacyShell();
    const access = await resolveAccess();
    if (access?.user_id) {
      mountShell(access);
      return;
    }

    document.body.classList.remove('tkn-shell-loading');
    if (!isHome()) {
      location.replace('./index.html');
      return;
    }

    const lateMount = event => mountShell(normalizeAccess(event.detail));
    window.addEventListener('tkn:access-ready', lateMount, { once:true });
    window.addEventListener('tkn-security-ready', lateMount, { once:true });
  }

  window.TKNAppNavigation = Object.freeze({ version:VERSION, routes:ROUTES, icons:ICONS, can, canRoute, routeForPage });
  window.TKNAppShell = Object.freeze({ version:VERSION, toast, safeBack, signOut });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
