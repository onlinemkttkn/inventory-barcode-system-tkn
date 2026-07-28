(() => {
  'use strict';

  const NAV_VERSION = '5.3.7';
  const SESSION_CACHE_KEY = 'tkn_access_context_v3';
  const SHARED_CACHE_KEY = 'tkn_access_context_shared_v4';
  const SHARED_CACHE_TTL = 5 * 60_000;
  const ACCESS_RPC = 'current_access_context';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  window.TKNNavigationVersion = NAV_VERSION;

  function parseJson(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function normalizeAccess(value) {
    const access = Array.isArray(value) ? value[0] : value;
    if (!access || typeof access !== 'object' || !access.user_id) return null;
    return {
      ...access,
      role: String(access.role || '').trim().toLowerCase() || 'staff',
      permissions: Array.isArray(access.permissions) ? access.permissions : []
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

  function readSessionCache(userId = null) {
    return readCache(sessionStorage, SESSION_CACHE_KEY, { userId });
  }

  function readSharedCache(userId = null) {
    return readCache(localStorage, SHARED_CACHE_KEY, { userId });
  }

  function persistedAuthUserId() {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const stored = parseJson(localStorage.getItem(key), null);
      const userId =
        stored?.user?.id ||
        stored?.session?.user?.id ||
        stored?.currentSession?.user?.id ||
        stored?.data?.session?.user?.id ||
        null;
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
    sessionStorage.setItem(
      'tkn_current_actor',
      access.full_name || access.email || access.user_id
    );
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
      const existing = [...document.scripts].find(script => script.src === new URL(src, location.href).href);
      if (existing) {
        if (existing.dataset.loaded === 'true' || window.supabaseClient) resolve();
        else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error(`โหลดสคริปต์ไม่สำเร็จ: ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabaseClient(timeoutMs = 2200) {
    const startedAt = Date.now();
    while (!window.supabaseClient && Date.now() - startedAt < timeoutMs) {
      await sleep(40);
    }
    if (window.supabaseClient) return window.supabaseClient;

    try {
      if (!window.supabase?.createClient) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      }
      if (!window.supabaseClient) {
        await loadScript('./js/supabase-config.js?v=4.9.1-final');
      }
    } catch (error) {
      console.warn('Navigation Supabase bootstrap failed:', error);
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
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) await sleep(220);
    }
    if (lastError) console.warn('Navigation session lookup failed:', lastError);
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
            location.replace('./dashboard.html');
            return null;
          }
          return saveAccess(access);
        }
        lastError = result.error || new Error('ข้อมูลสิทธิ์ไม่ตรงกับผู้ใช้งานปัจจุบัน');
      } catch (error) {
        lastError = error;
      }
      if (attempt < 2) await sleep(260);
    }
    if (lastError) console.warn('Navigation access lookup failed:', lastError);
    return null;
  }

  async function resolveAccess() {
    const guardCache = normalizeAccess(window.TKNAuthGuard?.getCachedAccess?.());
    if (guardCache) return saveAccess(guardCache);

    // Supabase เก็บ Session ใน localStorage ส่วน sessionStorage แยกต่อแท็บ
    // จึงอ่าน user id จาก Session ที่ Supabase บันทึกไว้ แล้วใช้ Cache สิทธิ์ข้ามแท็บที่ตรงกับ user คนเดียวกัน
    const persistedUserId = persistedAuthUserId();
    const sharedBeforeNetwork = persistedUserId ? readSharedCache(persistedUserId) : null;
    if (sharedBeforeNetwork) return saveAccess(sharedBeforeNetwork);

    const client = await ensureSupabaseClient();
    if (!client?.auth?.getSession || !client?.rpc) {
      return readSharedCache() || readSessionCache();
    }

    const session = await getSession(client);
    if (!session?.user?.id) {
      clearAccessCache();
      return null;
    }

    const direct = await fetchAccess(client, session);
    if (direct) return direct;

    // ใช้แคชข้ามแท็บเฉพาะเมื่อเป็นผู้ใช้คนเดียวกัน และไม่สร้าง role ปลอมเป็น staff
    return readSharedCache(session.user.id) || readSessionCache(session.user.id);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
  }

  function roleLabel(access) {
    if (access?.role_name_th) return access.role_name_th;
    return ({
      owner: 'เจ้าของกิจการ',
      admin: 'ผู้ดูแลระบบ',
      secretary: 'เลขานุการ',
      manager: 'ผู้จัดการ',
      supervisor: 'หัวหน้างาน',
      warehouse: 'คลังสินค้า',
      sales: 'ฝ่ายขาย',
      cashier: 'แคชเชียร์',
      accounting: 'บัญชี',
      staff: 'พนักงาน'
    })[access?.role] || access?.role || 'ผู้ใช้งาน';
  }

  async function signOut() {
    try {
      await window.supabaseClient?.auth.signOut();
    } finally {
      clearAccessCache();
      sessionStorage.clear();
      localStorage.removeItem('tkn_cashier_unlock');
      location.replace('./index.html');
    }
  }

  function renderNavigation(access) {
    const current = location.pathname.split('/').pop() || 'index.html';
    const permissions = new Set(access.permissions);
    const items = [
      ['dashboard.view', './dashboard.html', 'Dashboard', 'dashboard'],
      ['pos.use', './pos.html', 'POS / ขายหน้าร้าน', 'pos'],
      ['pos.search_bill', './phase-9-2-bill-search.html', 'ค้นหาบิลย้อนหลัง', 'bill-search'],
      ['product.manage', './products-admin.html', 'จัดการสินค้า', 'product'],
      ['inventory.view', './inventory-operations.html', 'คลังสินค้า', 'inventory'],
      ['report.view', './reports.html', 'รายงาน', 'report'],
      ['user.manage', './users-admin.html', 'ผู้ใช้และสิทธิ์', 'users'],
      ['audit.view', './audit-log.html', 'Audit Log', 'audit']
    ].filter(([permission]) => permissions.has(permission));

    // ถ้าอ่านสิทธิ์ไม่ได้จริง จะไม่แสดงเมนู staff ปลอมและไม่ลดเมนูเหลือหน้าเดียว
    if (!items.length) {
      console.warn('Navigation permissions are empty; navigation was not rendered.');
      return;
    }

    document.querySelectorAll('.tkn-nav-bar[data-tkn-dynamic-nav]').forEach(node => node.remove());

    const nav = document.createElement('aside');
    nav.className = 'tkn-nav-bar no-print';
    nav.dataset.tknDynamicNav = NAV_VERSION;
    nav.innerHTML = `
      <div class="tkn-nav-brand">
        <span class="tkn-brand-mark">TKN</span>
        <div class="tkn-brand-copy">
          <strong>POS / ERP</strong>
          <small>Master 3.4 LTS</small>
        </div>
        <button class="tkn-nav-toggle" type="button" aria-expanded="false"
          aria-controls="tknPrimaryNavigation" aria-label="เปิดเมนู">
          <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
        </button>
      </div>
      <div class="tkn-nav-user">
        <strong>${escapeHtml(access.full_name || access.email || 'ผู้ใช้งาน')}</strong>
        <small>${escapeHtml(roleLabel(access))}</small>
      </div>
      <div class="tkn-mobile-drawer" id="tknPrimaryNavigation">
        <nav class="tkn-nav-menu"></nav>
        <div class="tkn-nav-footer">
          <button class="tkn-nav-btn tkn-logout-btn" type="button">ออกจากระบบ</button>
        </div>
      </div>`;

    const menu = nav.querySelector('.tkn-nav-menu');
    const inventoryPages = new Set([
      'inventory-operations.html', 'receive.html', 'issue.html',
      'transfer-create.html', 'transfer-receive.html', 'transactions.html',
      'stock-count.html', 'product-stock-admin.html'
    ]);

    for (const [, href, label, key] of items) {
      const link = document.createElement('a');
      link.className = 'tkn-nav-btn';
      link.dataset.navKey = key;
      link.href = href;
      link.textContent = label;
      if (key === 'pos') link.classList.add('tkn-pos-entry');
      if (key === 'bill-search') link.classList.add('tkn-bill-history-entry');
      if (current === href.replace('./', '') || (key === 'inventory' && inventoryPages.has(current))) {
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

    toggle.addEventListener('click', () => setMobileMenu(!nav.classList.contains('tkn-mobile-open')));
    nav.addEventListener('click', event => {
      if (event.target.closest('.tkn-nav-menu a') && window.matchMedia('(max-width:780px)').matches) {
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

  async function start() {
    const current = location.pathname.split('/').pop() || 'index.html';
    if (current === 'index.html') return;

    const access = await resolveAccess();
    if (!access?.user_id) return;
    renderNavigation(access);
  }

  window.addEventListener('storage', event => {
    if (event.key === SHARED_CACHE_KEY && !event.newValue) {
      document.querySelector('.tkn-nav-bar[data-tkn-dynamic-nav]')?.remove();
      document.body.classList.remove('tkn-has-sidebar');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
