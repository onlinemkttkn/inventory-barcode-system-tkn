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

    let access = null;
    try {
      if (window.supabaseClient) {
        const result = await window.supabaseClient.rpc('current_access_context');
        if (!result.error && result.data?.user_id) {
          access = result.data;
          sessionStorage.setItem('tkn_user_role', access.role || 'staff');
          sessionStorage.setItem(
            'tkn_permissions',
            JSON.stringify(access.permissions || [])
          );
        }
      }
    } catch (error) {
      console.warn('Navigation access lookup failed:', error);
    }

    const permissions = new Set(access?.permissions || [...parsePermissions()]);
    const landing = access?.landing_page || './pos.html';

    const items = [
      ['dashboard.view', './dashboard.html', 'ภาพรวม'],
      ['pos.use', './pos.html', 'ขายหน้าร้าน'],
      ['report.view', './reports.html', 'รายงาน'],
      ['product.manage', './products-admin.html', 'สินค้า'],
      ['inventory.view', './inventory-operations.html', 'คลังสินค้า'],
      ['user.manage', './users-admin.html', 'ผู้ใช้และสิทธิ์'],
      ['audit.view', './audit-log.html', 'Audit Log']
    ].filter(([permission]) => permissions.has(permission));

    const nav = document.createElement('aside');
    nav.className = 'tkn-nav-bar no-print';
    nav.innerHTML = `
      <div class="tkn-nav-brand">
        <span class="tkn-brand-mark">TKN</span>
        <div><strong>POS / ERP</strong><small>Master 3.4 LTS</small></div>
      </div>
      <div class="tkn-nav-user">
        <strong>${String(access?.full_name || access?.email || 'ผู้ใช้งาน')}</strong>
        <small>${String(access?.role_name_th || access?.role || 'staff')}</small>
      </div>
      <nav class="tkn-nav-menu"></nav>
      <div class="tkn-nav-footer">
        <a class="tkn-nav-btn" href="${landing}">หน้าหลักของฉัน</a>
        <button class="tkn-nav-btn tkn-logout-btn" type="button">ออกจากระบบ</button>
      </div>
    `;

    const menu = nav.querySelector('.tkn-nav-menu');
    for (const [, href, label] of items) {
      const link = document.createElement('a');
      link.className = 'tkn-nav-btn';
      link.href = href;
      link.textContent = label;
      if (current === href.replace('./', '')) link.classList.add('active');
      menu.appendChild(link);
    }

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