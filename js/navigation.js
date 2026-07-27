(() => {
  'use strict';

  function parsePermissions() {
    try {
      return new Set(JSON.parse(sessionStorage.getItem('tkn_permissions') || '[]'));
    } catch {
      return new Set();
    }
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

  async function start() {
    const current = location.pathname.split('/').pop() || 'index.html';
    if (current === 'index.html') return;
    if (document.querySelector('.tkn-nav-bar')) return;

    let access = window.TKNAuthGuard?.getCachedAccess?.() || null;
    try {
      if (!access && window.TKNAuthGuard && window.supabaseClient) {
        access = await window.TKNAuthGuard.requireAccess(null, {
          loadingText: 'กำลังเตรียมเมนูใช้งาน...',
          suppressLoading: true
        });
      }
    } catch (error) {
      console.warn('Navigation access lookup failed:', error);
    }

    const permissions = new Set(access?.permissions || [...parsePermissions()]);
    const landing = access?.landing_page || './pos.html';

    const items = [
      ['dashboard.view', './dashboard.html', 'Dashboard', 'dashboard'],
      ['pos.use', './pos.html', 'POS / ขายหน้าร้าน', 'pos'],
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
        <span class="tkn-brand-mark">TKN</span>
        <div class="tkn-brand-copy">
          <strong>POS / ERP</strong>
          <small>Master 3.4 LTS</small>
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
        <strong>${String(access?.full_name || access?.email || 'ผู้ใช้งาน')}</strong>
        <small>${String(access?.role_name_th || access?.role || 'staff')}</small>
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
    for (const [, href, label, key] of items) {
      const link = document.createElement('a');
      link.className = 'tkn-nav-btn';
      link.dataset.navKey = key || '';
      link.href = href;
      link.textContent = label;
      if (key === 'pos') link.classList.add('tkn-pos-entry');
      const inventoryPages = new Set([
        'inventory-operations.html','receive.html','issue.html',
        'transfer-create.html','transfer-receive.html','transactions.html',
        'stock-count.html','product-stock-admin.html'
      ]);
      if (
        current === href.replace('./', '') ||
        (key === 'inventory' && inventoryPages.has(current))
      ) link.classList.add('active');
      menu.appendChild(link);
    }

    const toggle = nav.querySelector('.tkn-nav-toggle');
    const drawer = nav.querySelector('.tkn-mobile-drawer');

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