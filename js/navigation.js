(() => {
  'use strict';

  const ACCESS_CACHE_KEY = 'tkn_access_context_v3';
  const ACCESS_CACHE_TTL = 10 * 60_000;
  const ACCESS_RPC = 'current_access_context';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function parseJson(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function readCachedAccess() {
    const cached = parseJson(sessionStorage.getItem(ACCESS_CACHE_KEY), null);
    if (!cached?.data?.user_id || !cached?.savedAt) return null;
    if (Date.now() - Number(cached.savedAt) > ACCESS_CACHE_TTL) return null;
    return cached.data;
  }

  function parsePermissions() {
    const values = parseJson(sessionStorage.getItem('tkn_permissions'), []);
    return new Set(Array.isArray(values) ? values : []);
  }

  function cacheAccess(access) {
    if (!access?.user_id) return;

    sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      data: access
    }));
    sessionStorage.setItem('tkn_user_role', access.role || 'staff');
    sessionStorage.setItem(
      'tkn_permissions',
      JSON.stringify(Array.isArray(access.permissions) ? access.permissions : [])
    );
    sessionStorage.setItem(
      'tkn_current_actor',
      access.full_name || access.email || access.user_id
    );
  }

  function clearAccessCache() {
    sessionStorage.removeItem(ACCESS_CACHE_KEY);
    sessionStorage.removeItem('tkn_user_role');
    sessionStorage.removeItem('tkn_permissions');
    sessionStorage.removeItem('tkn_current_actor');
  }

  async function signOut() {
    try {
      await window.supabaseClient?.auth.signOut();
    } finally {
      sessionStorage.clear();
      localStorage.removeItem('tkn_cashier_unlock');
      location.replace('./index.html');
    }
  }

  async function waitForSupabaseClient(timeoutMs = 2500) {
    const startedAt = Date.now();
    while (!window.supabaseClient && Date.now() - startedAt < timeoutMs) {
      await sleep(40);
    }
    return window.supabaseClient || null;
  }

  async function fetchAccessDirectly() {
    const client = await waitForSupabaseClient();
    if (!client?.auth?.getSession || !client?.rpc) return null;

    let session = null;
    let sessionError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await client.auth.getSession();
        sessionError = result.error || null;
        session = result.data?.session || null;
        if (session?.user?.id) break;
      } catch (error) {
        sessionError = error;
      }
      await sleep(180);
    }

    if (!session?.user?.id) {
      if (sessionError) console.warn('Navigation session lookup failed:', sessionError);
      return null;
    }

    let accessResult = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      accessResult = await client.rpc(ACCESS_RPC);
      if (!accessResult.error && accessResult.data?.user_id) break;
      await sleep(220);
    }

    if (accessResult?.error) {
      console.warn('Navigation access lookup failed:', accessResult.error);
      return null;
    }

    const access = accessResult?.data || null;
    if (!access?.user_id || access.user_id !== session.user.id) return null;

    if (access.is_active !== true) {
      clearAccessCache();
      try {
        await client.auth.signOut();
      } catch (error) {
        console.warn('Navigation inactive-account sign-out failed:', error);
      }
      location.replace('./dashboard.html');
      return null;
    }

    cacheAccess(access);
    return access;
  }

  async function resolveAccess() {
    const guardCache = window.TKNAuthGuard?.getCachedAccess?.() || null;
    if (guardCache?.user_id) return guardCache;

    const ownCache = readCachedAccess();
    if (ownCache?.user_id) return ownCache;

    if (window.TKNAuthGuard && window.supabaseClient) {
      try {
        const guarded = await window.TKNAuthGuard.requireAccess(null, {
          loadingText: 'กำลังเตรียมเมนูใช้งาน...',
          suppressLoading: true,
          redirect: false
        });
        if (guarded?.user_id) {
          cacheAccess(guarded);
          return guarded;
        }
      } catch (error) {
        console.warn('Navigation guard lookup failed:', error);
      }
    }

    return fetchAccessDirectly();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character]);
  }

  function roleLabel(access) {
    if (access?.role_name_th) return access.role_name_th;
    return ({
      owner: 'เจ้าของกิจการ',
      admin: 'ผู้ดูแลระบบ',
      secretary: 'เลขานุการ',
      warehouse: 'คลังสินค้า',
      sales: 'ฝ่ายขาย',
      cashier: 'แคชเชียร์',
      accounting: 'บัญชี',
      staff: 'พนักงาน'
    })[String(access?.role || '').toLowerCase()] || access?.role || 'ผู้ใช้งาน';
  }

  async function start() {
    const current = location.pathname.split('/').pop() || 'index.html';
    if (current === 'index.html') return;
    if (document.querySelector('.tkn-nav-bar')) return;

    const access = await resolveAccess();

    /*
     * ห้ามสร้างเมนูปลอมเป็น staff เมื่อเปิดหน้าในแท็บใหม่
     * เพราะ sessionStorage ไม่ถูกคัดลอกไปยังแท็บใหม่เสมอไป
     * เมนูต้องสร้างจาก current_access_context ของผู้ใช้จริงเท่านั้น
     */
    if (!access?.user_id) {
      const cachedPermissions = parsePermissions();
      if (!cachedPermissions.size) {
        console.warn('Navigation was not rendered because access context is unavailable.');
        return;
      }
    }

    const permissions = new Set(
      Array.isArray(access?.permissions)
        ? access.permissions
        : [...parsePermissions()]
    );

    const items = [
      ['dashboard.view', './dashboard.html', 'Dashboard', 'dashboard'],
      ['pos.use', './pos.html', 'POS / ขายหน้าร้าน', 'pos'],
      ['pos.search_bill', './phase-9-2-bill-search.html', 'ค้นหาบิลย้อนหลัง', 'bill-search'],
      ['product.manage', './products-admin.html', 'สินค้า', 'product'],
      ['inventory.view', './inventory-operations.html', 'คลังสินค้า', 'inventory'],
      ['report.view', './reports.html', 'รายงาน', 'report'],
      ['user.manage', './users-admin.html', 'ผู้ใช้และสิทธิ์', 'users'],
      ['audit.view', './audit-log.html', 'Audit Log', 'audit']
    ].filter(([permission]) => permissions.has(permission));

    const nav = document.createElement('aside');
    nav.className = 'tkn-nav-bar no-print';
    nav.innerHTML = `
      <div class="tkn-nav-brand">
        <img class="tkn-brand-logo" src="./assets/tkn-company-logo.png?v=5.18.0" alt="เถ้าแก่น้อย ชลบุรี">
        <div class="tkn-brand-copy">
          <strong>ระบบบริหารร้านค้า</strong>
          <small>Final v5.18.0</small>
        </div>
        <button
          class="tkn-nav-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="tknPrimaryNavigation"
          aria-label="เปิดเมนู">
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>
      </div>
      <div class="tkn-nav-user">
        <strong>${escapeHtml(access?.full_name || access?.email || 'ผู้ใช้งาน')}</strong>
        <small>${escapeHtml(roleLabel(access))}</small>
      </div>
      <div class="tkn-mobile-drawer" id="tknPrimaryNavigation">
        <nav class="tkn-nav-menu"></nav>
        <div class="tkn-mobile-footer-slot"></div>
      </div>
      <div class="tkn-nav-footer">
        <button class="tkn-nav-btn tkn-logout-btn" type="button">ออกจากระบบ</button>
      </div>
    `;

    const menu = nav.querySelector('.tkn-nav-menu');
    const inventoryPages = new Set([
      'inventory-operations.html', 'receive.html', 'issue.html',
      'transfer-create.html', 'transfer-receive.html', 'transactions.html',
      'stock-count.html', 'product-stock-admin.html'
    ]);

    for (const [, href, label, key] of items) {
      const link = document.createElement('a');
      link.className = 'tkn-nav-btn';
      link.dataset.navKey = key || '';
      link.href = href;
      link.textContent = label;
      if (key === 'pos') link.classList.add('tkn-pos-entry');
      if (key === 'bill-search') link.classList.add('tkn-bill-history-entry');
      if (
        current === href.replace('./', '') ||
        (key === 'inventory' && inventoryPages.has(current))
      ) {
        link.classList.add('active');
      }
      menu.appendChild(link);
    }

    const toggle = nav.querySelector('.tkn-nav-toggle');

    function setMobileMenu(open) {
      nav.classList.toggle('tkn-mobile-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
      document.documentElement.classList.toggle('tkn-nav-lock', open);
    }

    toggle.addEventListener('click', () => {
      setMobileMenu(!nav.classList.contains('tkn-mobile-open'));
    });

    nav.addEventListener('click', event => {
      if (
        event.target.closest('.tkn-nav-menu a') &&
        window.matchMedia('(max-width:780px)').matches
      ) {
        setMobileMenu(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setMobileMenu(false);
    });

    nav.querySelector('.tkn-logout-btn').addEventListener('click', signOut);
    document.body.prepend(nav);
    document.body.classList.add('tkn-has-sidebar');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
