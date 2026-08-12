(() => {
  'use strict';

  const E = {
    branch: document.getElementById('branch'),
    search: document.getElementById('search'),
    body: document.getElementById('body'),
    message: document.getElementById('message'),
  };

  let rows = [];
  let loadingToken = 0;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[char]);
  }

  function msg(text, type = '') {
    if (!E.message) return;
    E.message.textContent = text || '';
    E.message.className = `msg ${type}`.trim();
  }

  function qty(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString('th-TH', { maximumFractionDigits: 3 })
      : '0';
  }

  function setRowsMessage(text) {
    if (!E.body) return;
    E.body.innerHTML = `<tr><td colspan="5">${esc(text)}</td></tr>`;
  }

  function render() {
    if (!E.body || !E.search) return;
    const query = E.search.value.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (!query) return true;
      return `${row.product_code || ''} ${row.product_name || ''} ${row.barcode || ''}`
        .toLowerCase()
        .includes(query);
    });

    if (!filtered.length) {
      setRowsMessage(rows.length ? 'ไม่พบสินค้าที่ตรงกับคำค้นหา' : 'ไม่พบสินค้าในสาขานี้');
      return;
    }

    E.body.innerHTML = filtered.map((row) => `
      <tr>
        <td>${esc(row.product_code || '-')}</td>
        <td>${esc(row.product_name || '-')}</td>
        <td>${esc(row.barcode || '-')}</td>
        <td>${qty(row.quantity)}</td>
        <td>${esc(row.unit_name || '-')}</td>
      </tr>
    `).join('');
  }

  async function loadStock() {
    const token = ++loadingToken;
    const branchId = E.branch?.value || '';
    if (!branchId) {
      rows = [];
      setRowsMessage('กรุณาเลือกสาขา');
      msg('');
      return;
    }

    E.branch.disabled = true;
    E.search.disabled = true;
    setRowsMessage('กำลังโหลดสต็อก...');
    msg('กำลังโหลดข้อมูล...');

    try {
      const { data, error } = await window.supabaseClient
        .from('branch_inventory_list')
        .select('*')
        .eq('branch_id', branchId)
        .order('product_name');

      if (token !== loadingToken) return;
      if (error) throw error;

      rows = Array.isArray(data) ? data : [];
      render();
      msg(`พบ ${rows.length.toLocaleString('th-TH')} รายการ`, 'success');
    } catch (error) {
      if (token !== loadingToken) return;
      rows = [];
      setRowsMessage('โหลดสต็อกไม่สำเร็จ');
      msg(error?.message || 'โหลดสต็อกไม่สำเร็จ', 'error');
      console.error('Branch stock load error:', error);
    } finally {
      if (token === loadingToken) {
        E.branch.disabled = false;
        E.search.disabled = false;
      }
    }
  }

  async function loadBranches(access) {
    const { data, error } = await window.supabaseClient
      .from('branches')
      .select('id,code,name,sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('code');

    if (error) throw error;

    let branches = Array.isArray(data) ? data : [];

    // Respect a single-branch access context when the backend provides one.
    // Do not guess a branch when the access context does not expose branch scope.
    const scopedBranchId = access?.has_all_branches === false
      ? (access?.branch_id || access?.default_branch_id || '')
      : '';
    if (scopedBranchId) {
      branches = branches.filter((branch) => branch.id === scopedBranchId);
    }

    if (!branches.length) throw new Error('ไม่พบสาขาที่บัญชีนี้สามารถใช้งานได้');

    E.branch.innerHTML = branches.map((branch) => (
      `<option value="${esc(branch.id)}">${esc(branch.name || branch.code || branch.id)}</option>`
    )).join('');
    E.branch.disabled = false;
    E.search.disabled = false;
  }

  async function init() {
    try {
      if (!window.supabaseClient) throw new Error('ยังไม่พร้อมเชื่อมต่อ Supabase');
      if (!window.TKNAuthGuard?.requireAccess) {
        throw new Error('ไม่พบระบบตรวจสอบ Session รุ่นใหม่');
      }

      const access = await window.TKNAuthGuard.requireAccess('inventory.view', {
        loadingText: 'กำลังตรวจสอบสิทธิ์และโหลดสต็อกแยกสาขา...',
      });
      if (!access) return;

      await loadBranches(access);
      await loadStock();
      window.TKNAuthGuard.ready();
    } catch (error) {
      console.error('Branch stock initialization error:', error);
      E.branch.disabled = true;
      E.search.disabled = true;
      setRowsMessage('ไม่สามารถเปิดสต็อกแยกสาขาได้');
      msg(error?.message || 'ไม่สามารถเปิดสต็อกแยกสาขาได้', 'error');
      if (window.TKNAuthGuard?.fail) {
        window.TKNAuthGuard.fail(error, () => location.reload());
      }
    }
  }

  E.branch?.addEventListener('change', loadStock);
  E.search?.addEventListener('input', render);
  init();
})();
