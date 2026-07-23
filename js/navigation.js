(() => {
  'use strict';

  const DASHBOARD_ROLES = new Set(['owner', 'admin', 'secretary']);

  function normalizedRole(value) {
    const role = String(value || '').trim().toLowerCase();
    return ({
      administrator: 'admin',
      employee: 'staff',
      employee_staff: 'staff',
      store_manager: 'manager'
    })[role] || role || 'staff';
  }

  function homeFor(role) {
    if (DASHBOARD_ROLES.has(role)) return './dashboard.html';
    if (role === 'warehouse') return './product-stock-admin.html';
    if (role === 'accounting') return './phase-9-2-bill-search.html';
    return './pos.html';
  }

  async function start() {
    const current = location.pathname.split('/').pop() || 'index.html';
    if (current === 'index.html' || current === 'dashboard.html') return;

    let role = normalizedRole(sessionStorage.getItem('tkn_user_role'));
    let landingPage = homeFor(role);

    try {
      if (window.supabaseClient) {
        const { data: access, error } =
          await window.supabaseClient.rpc('current_access_context');

        if (error) throw error;

        if (access?.user_id && access.is_active === true) {
          role = normalizedRole(access.role);
          landingPage = access.landing_page || homeFor(role);
          sessionStorage.setItem('tkn_user_role', role);
          sessionStorage.setItem(
            'tkn_permissions',
            JSON.stringify(access.permissions || [])
          );
        }
      }
    } catch (error) {
      console.warn('Navigation role lookup failed:', error);
    }

    const bar = document.createElement('nav');
    bar.className = 'tkn-nav-bar no-print';
    bar.setAttribute('aria-label', 'เมนูนำทาง');

    const home = document.createElement('a');
    home.className = 'tkn-nav-btn';
    home.href = landingPage;
    home.textContent =
      DASHBOARD_ROLES.has(role) ? 'Dashboard' : 'หน้าหลัก';

    const title = document.createElement('span');
    title.className = 'tkn-nav-title';
    title.textContent = document.title || 'TKN POS / ERP';

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'tkn-nav-btn tkn-logout-btn';
    logout.textContent = 'ออกจากระบบ';
    logout.addEventListener('click', async () => {
      try {
        await window.supabaseClient?.auth.signOut();
      } finally {
        sessionStorage.clear();
        window.location.replace('./index.html');
      }
    });

    bar.append(home, title, logout);
    document.body.prepend(bar);

    document.querySelectorAll('a[href*="dashboard"]').forEach(link => {
      if (DASHBOARD_ROLES.has(role)) {
        link.href = './dashboard.html';
      } else {
        link.href = landingPage;
        link.textContent = 'หน้าหลัก';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
