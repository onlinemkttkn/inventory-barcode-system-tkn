(() => {
  'use strict';

  const items = [
    { key:'hub', href:'./inventory-operations.html', label:'ศูนย์คลัง', permission:'inventory.view' },
    { key:'receive', href:'./receive.html', label:'รับเข้า', permission:'inventory.receive' },
    { key:'issue', href:'./issue.html', label:'เบิกสินค้า', permission:'inventory.issue' },
    { key:'transfer', href:'./transfer-create.html', label:'โอนสาขา', permission:'inventory.transfer' },
    { key:'transfer-receive', href:'./transfer-receive.html', label:'ตรวจรับโอน', permission:'inventory.transfer' },
    { key:'history', href:'./transactions.html', label:'ประวัติ', permission:'inventory.view' },
    { key:'count', href:'./stock-count.html', label:'ตรวจนับ', permission:'inventory.count' },
    { key:'adjust', href:'./product-stock-admin.html', label:'ปรับสต็อก', permission:'inventory.adjust' },
  ];

  function permissions() {
    try {
      return new Set(JSON.parse(sessionStorage.getItem('tkn_permissions') || '[]'));
    } catch {
      return new Set();
    }
  }

  function currentBranchLabel() {
    return sessionStorage.getItem('tkn_inventory_branch_label') || 'ยังไม่ได้เลือกสาขา';
  }

  function renderPermissions(nav) {
    const granted = permissions();
    nav.querySelectorAll('[data-permission]').forEach(link => {
      const permission = link.dataset.permission;
      link.hidden = granted.size > 0 && !granted.has(permission);
    });
  }

  function setBranch(label) {
    const text = String(label || '').trim() || 'ยังไม่ได้เลือกสาขา';
    sessionStorage.setItem('tkn_inventory_branch_label', text);
    const badge = document.getElementById('tknInventoryBranchBadge');
    if (badge) badge.textContent = text;
  }

  function installPrefetchLinks() {
    items.forEach(item => {
      if (document.head.querySelector(`link[rel="prefetch"][href="${item.href}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = item.href;
      document.head.appendChild(link);
    });
  }

  function navigate(event) {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = new URL(link.href, location.href);
    const inventoryFiles = new Set(items.map(item => item.href.replace('./', '')));
    const targetFile = target.pathname.split('/').pop();
    if (target.origin !== location.origin || !inventoryFiles.has(targetFile)) return;
    event.preventDefault();
    window.TKNAuthGuard?.beginNavigation(`กำลังเปิด ${link.textContent.trim()}...`);
    setTimeout(() => location.href = target.href, 55);
  }

  function build() {
    const page = document.body?.dataset.inventoryPage;
    const main = document.querySelector('main');
    if (!page || !main || document.querySelector('.inventory-workspace-nav')) return;

    document.body.classList.add('inventory-workspace-page');
    const nav = document.createElement('section');
    nav.className = 'inventory-workspace-nav no-print';
    nav.setAttribute('aria-label', 'เมนูลัดคลังสินค้า');
    nav.innerHTML = `
      <div class="inventory-workspace-head">
        <div class="inventory-workspace-title">คลังสินค้า — เลือกงานได้ทันที</div>
        <div id="tknInventoryBranchBadge" class="inventory-workspace-branch">${currentBranchLabel()}</div>
      </div>
      <nav class="inventory-workspace-links">
        ${items.map(item => `
          <a class="inventory-workspace-link${item.key === page ? ' active' : ''}"
            data-inventory-route data-permission="${item.permission}"
            href="${item.href}">${item.label}</a>`).join('')}
      </nav>`;

    main.parentNode.insertBefore(nav, main);
    renderPermissions(nav);
    installPrefetchLinks();
    if (!document.documentElement.dataset.inventoryNavigationBound) {
      document.documentElement.dataset.inventoryNavigationBound = 'true';
      document.addEventListener('click', navigate);
    }
    window.addEventListener('tkn:access-ready', () => renderPermissions(nav));
  }

  async function guardHub() {
    if (document.body?.dataset.inventoryPage !== 'hub') return;
    try {
      await window.TKNAuthGuard.requireAccess('inventory.view', {
        loadingText:'กำลังเปิดศูนย์จัดการคลังสินค้า...'
      });
      window.TKNAuthGuard.ready();
    } catch (error) {
      if (error.code !== 'INVENTORY_PERMISSION_DENIED') {
        window.TKNAuthGuard.fail(error, guardHub);
      }
    }
  }

  window.TKNInventoryWorkspace = Object.freeze({ setBranch, build });

  const start = () => {
    build();
    guardHub();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
