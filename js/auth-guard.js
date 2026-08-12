(() => {
  'use strict';

  const ACCESS_CACHE_KEY = 'tkn_access_context_v3';
  const ACCESS_CACHE_TTL = 60_000;
  const ACCESS_STALE_TTL = 10 * 60_000;
  let accessRequest = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function client() {
    if (!window.supabaseClient) {
      const error = new Error('ยังไม่พร้อมเชื่อมต่อ Supabase');
      error.code = 'SUPABASE_CLIENT_MISSING';
      throw error;
    }
    return window.supabaseClient;
  }

  function setLoadingText(text) {
    if (!document.body) return;
    document.body.dataset.loadingText = text || 'กำลังตรวจสอบผู้ใช้งาน...';
  }

  function start(text = 'กำลังตรวจสอบผู้ใช้งาน...') {
    if (!document.body) return;
    setLoadingText(text);
    document.body.classList.remove('tkn-auth-ready', 'tkn-page-leaving');
    document.body.classList.add('tkn-auth-loading');
  }

  function removeErrorPanel() {
    document.getElementById('tknAuthErrorPanel')?.remove();
  }

  function ready() {
    if (!document.body) return;
    removeErrorPanel();
    document.body.classList.remove('tkn-auth-loading', 'tkn-page-leaving');
    document.body.classList.add('tkn-auth-ready');
    window.dispatchEvent(new CustomEvent('tkn:page-ready'));
  }

  function parseCache() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(ACCESS_CACHE_KEY) || 'null');
      return parsed && parsed.data && parsed.savedAt ? parsed : null;
    } catch {
      return null;
    }
  }

  function cachedAccess({ maxAge = ACCESS_STALE_TTL, userId = null } = {}) {
    const cache = parseCache();
    if (!cache) return null;
    if (Date.now() - cache.savedAt > maxAge) return null;
    if (userId && cache.data.user_id !== userId) return null;
    return cache.data;
  }

  function saveAccess(access) {
    if (!access?.user_id) return;
    sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      data: access,
    }));
    sessionStorage.setItem('tkn_user_role', access.role || 'staff');
    sessionStorage.setItem('tkn_permissions', JSON.stringify(access.permissions || []));
    window.dispatchEvent(new CustomEvent('tkn:access-ready', { detail: access }));
  }

  function clearAccessCache() {
    sessionStorage.removeItem(ACCESS_CACHE_KEY);
    sessionStorage.removeItem('tkn_user_role');
    sessionStorage.removeItem('tkn_permissions');
  }

  function showConnectionWarning(text) {
    let box = document.getElementById('tknConnectionWarning');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tknConnectionWarning';
      box.className = 'tkn-connection-warning';
      document.body.appendChild(box);
    }
    box.textContent = text;
    clearTimeout(showConnectionWarning.timer);
    showConnectionWarning.timer = setTimeout(() => box.remove(), 6500);
  }

  function fail(error, retry) {
    console.error('TKN auth guard:', error);
    if (!document.body) return;
    document.body.classList.remove('tkn-auth-loading', 'tkn-page-leaving');

    let panel = document.getElementById('tknAuthErrorPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'tknAuthErrorPanel';
      panel.className = 'tkn-auth-error-panel';
      panel.innerHTML = `
        <div class="tkn-auth-error-card" role="alert">
          <h2>เชื่อมต่อระบบไม่สำเร็จชั่วคราว</h2>
          <p id="tknAuthErrorMessage"></p>
          <div class="tkn-auth-error-actions">
            <button class="tkn-auth-retry" type="button">ลองใหม่</button>
            <a class="tkn-auth-dashboard" href="./dashboard.html">ไป Dashboard</a>
          </div>
        </div>`;
      document.body.appendChild(panel);
    }

    panel.querySelector('#tknAuthErrorMessage').textContent =
      error?.message || 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง ระบบจะไม่ออกจากบัญชีอัตโนมัติ';
    panel.querySelector('.tkn-auth-retry').onclick = () => {
      panel.remove();
      start('กำลังลองเชื่อมต่ออีกครั้ง...');
      if (typeof retry === 'function') retry();
      else location.reload();
    };
  }

  async function getSession({ retries = 1, retryDelay = 280 } = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const { data, error } = await client().auth.getSession();
        if (error) {
          lastError = error;
        } else if (data?.session?.user?.id) {
          return data.session;
        } else if (attempt === retries) {
          return null;
        }
      } catch (error) {
        lastError = error;
      }

      if (attempt < retries) await sleep(retryDelay);
    }

    if (lastError) {
      lastError.code ||= 'SESSION_LOOKUP_FAILED';
      throw lastError;
    }
    return null;
  }

  function redirectToLogin() {
    const current = `${location.pathname.split('/').pop() || ''}${location.search || ''}`;
    sessionStorage.setItem('tkn_return_after_login', current);
    location.replace(`./dashboard.html?return=${encodeURIComponent(current)}`);
  }

  async function fetchAccess(session, { forceRefresh = false } = {}) {
    const freshCache = cachedAccess({ maxAge: ACCESS_CACHE_TTL, userId: session.user.id });
    if (!forceRefresh && freshCache) return freshCache;

    if (!accessRequest) {
      accessRequest = (async () => {
        let result = await client().rpc('current_access_context');
        if (result.error) {
          await sleep(260);
          result = await client().rpc('current_access_context');
        }

        if (result.error) {
          const stale = cachedAccess({ maxAge: ACCESS_STALE_TTL, userId: session.user.id });
          if (stale) {
            showConnectionWarning('การเชื่อมต่อสะดุดชั่วคราว กำลังใช้สิทธิ์ล่าสุดที่บันทึกไว้');
            return stale;
          }
          result.error.code ||= 'ACCESS_LOOKUP_FAILED';
          throw result.error;
        }

        const access = result.data;
        if (access?.is_active === false) {
          clearAccessCache();
          await client().auth.signOut();
          redirectToLogin();
          const error = new Error('บัญชีถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
          error.code = 'ACCOUNT_INACTIVE';
          throw error;
        }

        if (!access?.user_id || access.is_active !== true) {
          const error = new Error('ไม่สามารถยืนยันข้อมูลสิทธิ์ของบัญชีได้');
          error.code = 'ACCESS_CONTEXT_INVALID';
          throw error;
        }

        saveAccess(access);
        return access;
      })().finally(() => {
        accessRequest = null;
      });
    }

    return accessRequest;
  }

  async function requireAccess(requiredPermission = null, options = {}) {
    if (options.suppressLoading !== true) {
      start(options.loadingText || 'กำลังตรวจสอบสิทธิ์การใช้งาน...');
    }

    const session = options.session || await getSession({ retries: 1 });
    if (!session?.user?.id) {
      clearAccessCache();
      if (options.redirect !== false) redirectToLogin();
      return null;
    }

    const access = await fetchAccess(session, options);
    const permissions = new Set(Array.isArray(access.permissions) ? access.permissions : []);

    if (requiredPermission && !permissions.has(requiredPermission)) {
      const error = new Error('บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้');
      error.code = 'INVENTORY_PERMISSION_DENIED';
      error.redirectTo = access.landing_page || './dashboard.html';
      if (options.redirect !== false) location.replace(error.redirectTo);
      throw error;
    }

    return access;
  }

  function beginNavigation(text = 'กำลังเปิดหน้าถัดไป...') {
    if (!document.body) return;
    document.body.dataset.loadingText = text;
    document.body.classList.remove('tkn-auth-ready');
    document.body.classList.add('tkn-page-leaving');
  }

  window.TKNAuthGuard = Object.freeze({
    start,
    ready,
    fail,
    getSession,
    requireAccess,
    getCachedAccess: cachedAccess,
    clearAccessCache,
    beginNavigation,
    showConnectionWarning,
  });

  if (document.body?.classList.contains('tkn-auth-loading')) {
    start(document.body.dataset.loadingText || 'กำลังตรวจสอบผู้ใช้งาน...');
  }
})();
