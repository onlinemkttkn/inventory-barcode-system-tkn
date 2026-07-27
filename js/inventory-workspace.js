(() => {
  'use strict';

  const BRANCH_ID_KEY = 'tkn_inventory_branch_id';
  const BRANCH_LABEL_KEY = 'tkn_inventory_branch_label';

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

  let branchRows = [];
  let branchSelect = null;
  let branchLoadRequest = null;
  let primaryObserver = null;
  let syncingBranch = false;

  function permissions() {
    try {
      return new Set(JSON.parse(sessionStorage.getItem('tkn_permissions') || '[]'));
    } catch {
      return new Set();
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function cleanBranchName(value) {
    return String(value || '')
      .trim()
      .replace(/^\s*[A-Zก-ฮ]{1,12}\s*[-_]?\d+\s*[—–-]\s*/iu, '')
      .replace(/^\s*\d+\s*[—–-]\s*/u, '')
      .trim();
  }

  function currentBranchId() {
    return sessionStorage.getItem(BRANCH_ID_KEY) || '';
  }

  function currentBranchLabel() {
    return cleanBranchName(sessionStorage.getItem(BRANCH_LABEL_KEY)) || 'เลือกสาขา';
  }

  function pageKey() {
    return document.body?.dataset.inventoryPage || '';
  }

  function primarySelector() {
    switch (pageKey()) {
      case 'receive':
      case 'issue':
      case 'transfer-receive':
      case 'count':
      case 'adjust':
        return '#branch';
      case 'transfer':
        return '#source';
      case 'history':
        return '#branchFilter';
      default:
        return '';
    }
  }

  function primaryPageSelect() {
    const selector = primarySelector();
    return selector ? document.querySelector(selector) : null;
  }

  function branchNameById(branchId) {
    return cleanBranchName(branchRows.find((branch) => branch.id === branchId)?.name || '');
  }

  function rememberBranch(branchId, label) {
    const name = cleanBranchName(label) || branchNameById(branchId) || 'เลือกสาขา';
    if (branchId) sessionStorage.setItem(BRANCH_ID_KEY, branchId);
    else if (pageKey() === 'history') sessionStorage.removeItem(BRANCH_ID_KEY);
    sessionStorage.setItem(BRANCH_LABEL_KEY, name);
    return name;
  }

  function setBranch(label, branchId = '') {
    const name = rememberBranch(branchId || currentBranchId(), label);
    if (!branchSelect) return;

    const targetId = branchId || currentBranchId();
    if ([...branchSelect.options].some((option) => option.value === targetId)) {
      branchSelect.value = targetId;
    }
    branchSelect.setAttribute('aria-label', `สาขารับสินค้า: ${name}`);
  }

  function renderPermissions(nav) {
    const granted = permissions();
    nav.querySelectorAll('[data-permission]').forEach(link => {
      const permission = link.dataset.permission;
      link.hidden = granted.size > 0 && !granted.has(permission);
    });
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

  function optionExists(select, value) {
    return Boolean(select && [...select.options].some((option) => option.value === value));
  }

  function syncTopDisabledState() {
    if (!branchSelect) return;
    const pageSelect = primaryPageSelect();
    if (!pageSelect) {
      branchSelect.disabled = branchRows.length === 0;
      branchSelect.title = '';
      return;
    }

    branchSelect.disabled = pageSelect.disabled || branchRows.length === 0;
    branchSelect.title = pageSelect.disabled
      ? 'ยังไม่สามารถเปลี่ยนสาขาได้ในขณะนี้'
      : '';
  }

  function syncPageSelect(branchId, { dispatch = true } = {}) {
    const pageSelect = primaryPageSelect();
    if (!pageSelect || !optionExists(pageSelect, branchId)) {
      syncTopDisabledState();
      return false;
    }

    if (pageSelect.disabled) {
      if (branchSelect && optionExists(branchSelect, pageSelect.value)) {
        branchSelect.value = pageSelect.value;
      }
      syncTopDisabledState();
      return false;
    }

    if (pageSelect.value === branchId) {
      syncTopDisabledState();
      return true;
    }

    syncingBranch = true;
    pageSelect.value = branchId;
    if (dispatch) pageSelect.dispatchEvent(new Event('change', { bubbles:true }));
    syncingBranch = false;
    syncTopDisabledState();
    return true;
  }

  function syncFromPageSelect() {
    const pageSelect = primaryPageSelect();
    if (!pageSelect || !branchSelect || syncingBranch) return;

    const branchId = pageSelect.value || '';
    const label = cleanBranchName(pageSelect.selectedOptions?.[0]?.textContent)
      || branchNameById(branchId)
      || (pageKey() === 'history' ? 'ทุกสาขา' : 'เลือกสาขา');

    if (optionExists(branchSelect, branchId)) branchSelect.value = branchId;
    rememberBranch(branchId, label);
    branchSelect.setAttribute('aria-label', `สาขารับสินค้า: ${label}`);
    syncTopDisabledState();
  }

  function observePrimarySelect() {
    primaryObserver?.disconnect();
    primaryObserver = null;

    const pageSelect = primaryPageSelect();
    if (!pageSelect) {
      syncTopDisabledState();
      return;
    }

    primaryObserver = new MutationObserver(() => {
      const storedId = currentBranchId();
      if (storedId && optionExists(pageSelect, storedId)) {
        syncPageSelect(storedId, { dispatch:true });
      } else {
        syncFromPageSelect();
      }
      syncTopDisabledState();
    });

    primaryObserver.observe(pageSelect, {
      attributes:true,
      attributeFilter:['disabled'],
      childList:true,
      subtree:true,
    });

    const storedId = currentBranchId();
    if (storedId && optionExists(pageSelect, storedId)) {
      syncPageSelect(storedId, { dispatch:true });
    } else {
      syncFromPageSelect();
    }
  }

  async function loadBranches() {
    if (branchLoadRequest) return branchLoadRequest;
    if (!branchSelect || !window.supabaseClient) return null;

    branchLoadRequest = (async () => {
      branchSelect.disabled = true;
      branchSelect.innerHTML = '<option value="">กำลังโหลดสาขา...</option>';

      try {
        await window.TKNAuthGuard?.getSession?.({ retries:1 });

        const { data, error } = await window.supabaseClient
          .from('branches')
          .select('id,code,name,sort_order')
          .eq('is_active', true)
          .order('sort_order')
          .order('code');

        if (error) throw error;
        branchRows = data || [];
        if (!branchRows.length) throw new Error('ไม่พบสาขาที่เปิดใช้งาน');

        const includeAll = pageKey() === 'history';
        branchSelect.innerHTML = (includeAll ? '<option value="">ทุกสาขา</option>' : '')
          + branchRows.map((branch) => (
            `<option value="${escapeHtml(branch.id)}">${escapeHtml(cleanBranchName(branch.name))}</option>`
          )).join('');

        const validIds = new Set(branchRows.map((branch) => branch.id));
        const access = window.TKNAuthGuard?.getCachedAccess?.() || null;
        const pageSelect = primaryPageSelect();
        const selectedId = [
          currentBranchId(),
          access?.branch_id,
          pageSelect?.value,
          branchRows[0]?.id,
        ].find((branchId) => branchId && validIds.has(branchId)) || (includeAll ? '' : branchRows[0].id);

        branchSelect.value = selectedId;
        const selectedName = selectedId
          ? branchNameById(selectedId)
          : 'ทุกสาขา';
        rememberBranch(selectedId, selectedName);
        branchSelect.setAttribute('aria-label', `สาขารับสินค้า: ${selectedName}`);

        observePrimarySelect();
        if (selectedId) syncPageSelect(selectedId, { dispatch:true });
        else syncFromPageSelect();
        syncTopDisabledState();
        return selectedId;
      } catch (error) {
        console.error('TKN inventory branch selector:', error);
        branchRows = [];
        branchSelect.innerHTML = '<option value="">โหลดสาขาไม่สำเร็จ</option>';
        branchSelect.disabled = true;
        branchSelect.title = error?.message || 'โหลดรายชื่อสาขาไม่สำเร็จ';
        return null;
      } finally {
        branchLoadRequest = null;
      }
    })();

    return branchLoadRequest;
  }

  function onTopBranchChange() {
    if (!branchSelect || syncingBranch) return;
    const branchId = branchSelect.value || '';
    const label = cleanBranchName(branchSelect.selectedOptions?.[0]?.textContent)
      || branchNameById(branchId)
      || (pageKey() === 'history' ? 'ทุกสาขา' : 'เลือกสาขา');

    rememberBranch(branchId, label);
    branchSelect.setAttribute('aria-label', `สาขารับสินค้า: ${label}`);

    window.dispatchEvent(new CustomEvent('tkn:inventory-branch-change', {
      detail:{ branchId, branchName:label, source:'workspace' },
    }));

    if (branchId || pageKey() === 'history') {
      syncPageSelect(branchId, { dispatch:true });
    }
  }

  function build() {
    const page = pageKey();
    const main = document.querySelector('main');
    if (!page || !main || document.querySelector('.inventory-workspace-nav')) return;

    document.body.classList.add('inventory-workspace-page');
    const nav = document.createElement('section');
    nav.className = 'inventory-workspace-nav no-print';
    nav.setAttribute('aria-label', 'เมนูลัดคลังสินค้า');
    nav.innerHTML = `
      <div class="inventory-workspace-head">
        <div class="inventory-workspace-title">คลังสินค้า — เลือกงานได้ทันที</div>
        <label class="inventory-workspace-branch-control" for="tknInventoryBranchSelect">
          <span>สาขารับสินค้า</span>
          <select id="tknInventoryBranchSelect" disabled aria-label="สาขารับสินค้า">
            <option value="">กำลังโหลดสาขา...</option>
          </select>
        </label>
      </div>
      <nav class="inventory-workspace-links">
        ${items.map(item => `
          <a class="inventory-workspace-link${item.key === page ? ' active' : ''}"
            data-inventory-route data-permission="${item.permission}"
            href="${item.href}">${item.label}</a>`).join('')}
      </nav>`;

    main.parentNode.insertBefore(nav, main);
    branchSelect = nav.querySelector('#tknInventoryBranchSelect');
    branchSelect.addEventListener('change', onTopBranchChange);

    renderPermissions(nav);
    installPrefetchLinks();

    if (!document.documentElement.dataset.inventoryNavigationBound) {
      document.documentElement.dataset.inventoryNavigationBound = 'true';
      document.addEventListener('click', navigate);
      document.addEventListener('change', (event) => {
        if (event.target === primaryPageSelect()) syncFromPageSelect();
      });
    }

    window.addEventListener('tkn:access-ready', () => {
      renderPermissions(nav);
      loadBranches();
    });

    loadBranches();
  }

  async function guardHub() {
    if (pageKey() !== 'hub') return;
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

  window.TKNInventoryWorkspace = Object.freeze({
    setBranch,
    setBranchById(branchId, label = '') {
      setBranch(label || branchNameById(branchId), branchId);
      syncPageSelect(branchId, { dispatch:true });
    },
    getBranchId: currentBranchId,
    getBranchLabel: currentBranchLabel,
    build,
  });

  const start = () => {
    build();
    guardHub();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
