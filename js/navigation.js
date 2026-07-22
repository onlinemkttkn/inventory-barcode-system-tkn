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

    try {
      if (window.supabaseClient) {
        const { data: { session } } =
          await window.supabaseClient.auth.getSession();

        if (session?.user?.id) {
          const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('role,is_active')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile?.is_active === true) {
            role = normalizedRole(profile.role);
            sessionStorage.setItem('tkn_user_role', role);
          }
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
    home.href = homeFor(role);
    home.textContent =
      DASHBOARD_ROLES.has(role) ? 'Dashboard' : 'หน้าหลัก';

    const title = document.createElement('span');
    title.className = 'tkn-nav-title';
    title.textContent = document.title || 'TKN POS / ERP';

    bar.append(home, title);
    document.body.prepend(bar);

    document.querySelectorAll('a[href*="dashboard"]').forEach(link => {
      if (DASHBOARD_ROLES.has(role)) {
        link.href = './dashboard.html';
      } else {
        link.href = homeFor(role);
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
