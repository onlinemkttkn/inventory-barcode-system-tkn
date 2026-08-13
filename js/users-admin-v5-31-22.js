import { supabaseClient } from './supabase-client.js';
import { loadAccessContext, guardPage } from './access-control.js';

const E = {
  search: document.getElementById('search'),
  reload: document.getElementById('reload'),
  rows: document.getElementById('rows'),
  message: document.getElementById('message'),
  roleFilter: document.getElementById('roleFilter'),
  statusFilter: document.getElementById('statusFilter'),
  permissionRole: document.getElementById('permissionRole'),
  permissionGrid: document.getElementById('permissionGrid'),
  permissionMessage: document.getElementById('permissionMessage'),
  savePermissions: document.getElementById('savePermissions'),
  permissionCard: document.getElementById('permissionCard'),
  userCard: document.getElementById('userCard'),
  rpcStatus: document.getElementById('rpcStatus'),
  actorStatus: document.getElementById('actorStatus'),
  createEmployeeBtn: document.getElementById('createEmployeeBtn'),
  createEmployeeDialog: document.getElementById('createEmployeeDialog'),
  createEmployeeForm: document.getElementById('createEmployeeForm'),
  closeEmployeeDialog: document.getElementById('closeEmployeeDialog'),
  cancelEmployeeBtn: document.getElementById('cancelEmployeeBtn'),
  submitEmployeeBtn: document.getElementById('submitEmployeeBtn'),
  createEmployeeMessage: document.getElementById('createEmployeeMessage'),
  newEmployeeCode: document.getElementById('newEmployeeCode'),
  newDisplayName: document.getElementById('newDisplayName'),
  newRole: document.getElementById('newRole'),
  newBranch: document.getElementById('newBranch'),
  newLoginPassword: document.getElementById('newLoginPassword'),
  confirmLoginPassword: document.getElementById('confirmLoginPassword'),
  newPin: document.getElementById('newPin'),
  newMaxDiscount: document.getElementById('newMaxDiscount'),
  newCanOpenDrawer: document.getElementById('newCanOpenDrawer'),
  newIsActive: document.getElementById('newIsActive'),
  newLoginPreview: document.getElementById('newLoginPreview')
};

let accessContext = null;
let roles = [];
let branches = [];
let users = [];
let permissions = [];
let rolePermissions = new Map();
let busyUsers = new Set();
let pageBusy = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[char]);

const roleLabel = role => `${role.name_th || role.code} (${role.code})`;
const canManageOwner = () => accessContext?.role === 'owner';
const INTERNAL_LOGIN_DOMAIN = 'staff.tkn.local';
const isInternalLogin = email => String(email || '').toLowerCase().endsWith(`@${INTERNAL_LOGIN_DOMAIN}`);
const normalizeEmployeeCode = code => String(code || '').trim().toUpperCase();
const internalEmailFor = code => `${normalizeEmployeeCode(code).toLowerCase()}@${INTERNAL_LOGIN_DOMAIN}`;

function setCreateMessage(text, type = '') {
  if (!E.createEmployeeMessage) return;
  E.createEmployeeMessage.textContent = text || '';
  E.createEmployeeMessage.className = type ? `employee-dialog-message ${type}` : 'employee-dialog-message';
}

async function invokeEmployeeFunction(body) {
  const { data, error } = await supabaseClient.functions.invoke('admin-employee-account', { body });
  if (error) {
    let detail = error.message || 'เรียก Employee Account Function ไม่สำเร็จ';
    try {
      const response = error.context;
      if (response?.json) {
        const payload = await response.json();
        if (payload?.error) detail = payload.error;
      }
    } catch (_) {}
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function setMessage(element, text, type = '') {
  if (!element) return;
  element.textContent = text || '';
  element.className = type ? `message ${type}` : 'message';
}

function setPageBusy(value) {
  pageBusy = Boolean(value);
  E.permissionCard?.classList.toggle('is-busy', pageBusy);
  E.userCard?.classList.toggle('is-busy', pageBusy);
  E.reload.disabled = pageBusy;
  E.savePermissions.disabled = pageBusy;
}

function normalizeCatalog(data) {
  const value = data && typeof data === 'object' ? data : {};
  return {
    roles: Array.isArray(value.roles) ? value.roles : [],
    permissions: Array.isArray(value.permissions) ? value.permissions : [],
    rolePermissions: Array.isArray(value.role_permissions)
      ? value.role_permissions
      : [],
    branches: Array.isArray(value.branches) ? value.branches : []
  };
}

async function loadCatalog() {
  const { data, error } = await supabaseClient.rpc(
    'admin_access_control_catalog'
  );
  if (error) throw error;

  const catalog = normalizeCatalog(data);
  roles = catalog.roles;
  permissions = catalog.permissions;
  branches = catalog.branches;

  rolePermissions = new Map();
  for (const row of catalog.rolePermissions) {
    if (!rolePermissions.has(row.role_id)) {
      rolePermissions.set(row.role_id, new Set());
    }
    rolePermissions.get(row.role_id).add(row.permission_id);
  }

  const allRoleOptions = roles.map(role =>
    `<option value="${esc(role.code)}">${esc(roleLabel(role))}</option>`
  ).join('');

  const manageableRoles = roles.filter(
    role => canManageOwner() || !['owner', 'admin'].includes(role.code)
  );

  E.roleFilter.innerHTML =
    '<option value="ALL">ทุก Role</option>' + allRoleOptions;

  E.permissionRole.innerHTML = manageableRoles.map(role =>
    `<option value="${esc(role.code)}">${esc(roleLabel(role))}</option>`
  ).join('');

  renderPermissionGrid();
  renderCreateOptions();
}

function normalizeUsersPayload(data) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.users)
      ? data.users
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return rows
    .filter(row => row && typeof row === 'object' && row.user_id)
    .map(row => ({
      user_id: String(row.user_id),
      email: row.email == null ? '' : String(row.email),
      full_name: row.full_name == null ? '' : String(row.full_name),
      role_code: row.role_code == null ? 'staff' : String(row.role_code),
      role_name_th: row.role_name_th == null ? '' : String(row.role_name_th),
      is_active: row.is_active !== false,
      last_sign_in_at: row.last_sign_in_at || null,
      employee_code: row.employee_code == null ? '' : String(row.employee_code),
      cashier_display_name: row.cashier_display_name == null
        ? ''
        : String(row.cashier_display_name),
      cashier_branch_id: row.cashier_branch_id || null,
      max_discount_percent: Number(row.max_discount_percent || 0),
      can_open_drawer: row.can_open_drawer === true,
      cashier_is_active: row.cashier_is_active === true
    }));
}

async function loadUsers() {
  setMessage(E.message, 'กำลังโหลด...');

  const { data, error } = await supabaseClient.rpc('admin_list_users');
  if (error) throw error;

  users = normalizeUsersPayload(data);
  renderUsers();

  setMessage(
    E.message,
    users.length
      ? `พบ ${users.length} บัญชี`
      : 'RPC ทำงาน แต่ไม่พบข้อมูลผู้ใช้',
    users.length ? 'success' : ''
  );
}

async function init() {
  if (pageBusy) return;
  setPageBusy(true);

  try {
    accessContext = await loadAccessContext(supabaseClient);
    if (!guardPage(accessContext, 'user.manage')) return;

    E.rpcStatus.textContent = 'RPC 3.5.5 พร้อมใช้งาน';
    E.actorStatus.textContent =
      `${accessContext.role_name_th || accessContext.role} · ` +
      `${accessContext.full_name || accessContext.email || '-'}`;

    await loadCatalog();
    await loadUsers();
  } catch (error) {
    console.error('Users admin init error:', error);
    E.rpcStatus.textContent = 'RPC ยังไม่พร้อม';
    setMessage(
      E.message,
      error.message || 'เปิดหน้าจัดการสิทธิ์ไม่สำเร็จ',
      'error'
    );
  } finally {
    setPageBusy(false);
  }
}

function renderUsers() {
  if (!E.rows) return;

  const q = E.search.value.trim().toLowerCase();
  const roleFilter = E.roleFilter.value;
  const statusFilter = E.statusFilter.value;

  const filtered = users.filter(user =>
    (roleFilter === 'ALL' || user.role_code === roleFilter) &&
    (
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' ? user.is_active : !user.is_active)
    ) &&
    (
      !q ||
      [
        user.email,
        user.full_name,
        user.role_code,
        user.employee_code
      ].some(value =>
        String(value || '').toLowerCase().includes(q)
      )
    )
  );

  E.rows.innerHTML = filtered.map(user => {
    const protectedOwner =
      user.role_code === 'owner' && !canManageOwner();

    const availableRoles = roles.filter(
      role => canManageOwner() || role.code !== 'owner'
    );

    return `<tr data-id="${esc(user.user_id)}">
      <td>
        <strong>${esc(user.cashier_display_name || user.full_name || user.employee_code || '-')}</strong><br>
        <small>${esc(isInternalLogin(user.email) ? (user.employee_code || 'รหัสพนักงาน') : (user.email || '-'))}</small>
        ${isInternalLogin(user.email) ? '<span class="internal-login-label">Login ด้วยรหัสพนักงาน</span>' : ''}
      </td>
      <td>
        <select class="role" ${protectedOwner ? 'disabled' : ''}>
          ${availableRoles.map(role =>
            `<option value="${esc(role.code)}" ${
              role.code === user.role_code ? 'selected' : ''
            }>${esc(roleLabel(role))}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <select class="branch" ${protectedOwner ? 'disabled' : ''}>
          <option value="">ทุกสาขา/ไม่ระบุ</option>
          ${branches.map(branch =>
            `<option value="${esc(branch.id)}" ${
              branch.id === user.cashier_branch_id ? 'selected' : ''
            }>${esc(branch.code)} — ${esc(branch.name)}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <label class="active-label">
          <input class="active" type="checkbox"
            ${user.is_active ? 'checked' : ''}
            ${protectedOwner ? 'disabled' : ''}>
          ใช้งาน
        </label>
      </td>
      <td>${
        user.last_sign_in_at && !Number.isNaN(Date.parse(user.last_sign_in_at))
          ? `${new Date(user.last_sign_in_at).toLocaleDateString('th-TH')}
             <br><small>${
               new Date(user.last_sign_in_at).toLocaleTimeString('th-TH')
             }</small>`
          : '-'
      }</td>
      <td class="cashier-cell">
        <details class="cashier-disclosure" open>
          <summary>ข้อมูลพนักงานและสิทธิ์การขาย</summary>
          <div class="cashier-fields">
            <label class="cashier-field">
              <span>ชื่อแคชเชียร์บนใบเสร็จ</span>
              <input class="display-name"
                placeholder="ชื่อที่แสดงบนใบเสร็จ"
                value="${esc(user.cashier_display_name || user.full_name || '')}"
                ${protectedOwner ? 'disabled' : ''}>
            </label>
            <label class="cashier-field">
              <span>รหัสพนักงาน</span>
              <input class="employee-code"
                placeholder="เช่น STAFF001"
                value="${esc(user.employee_code || '')}"
                ${protectedOwner ? 'disabled' : ''}>
            </label>
            <label class="cashier-field">
              <span>กำหนด PIN ใหม่</span>
              <input class="pin" type="password" inputmode="numeric"
                minlength="4"
                placeholder="${
                  user.employee_code
                    ? 'เว้นว่างหากไม่เปลี่ยน PIN'
                    : 'ตัวเลขอย่างน้อย 4 ตัว'
                }"
                ${protectedOwner ? 'disabled' : ''}>
            </label>
            <div class="login-account-box">
              <div class="login-account-status">
                <strong>รหัสผ่านเข้า TKN</strong>
                <small>${isInternalLogin(user.email) ? 'Login: ' + esc(user.employee_code || user.email) : 'บัญชีอีเมลเดิม'}</small>
              </div>
              <div class="employee-password-row">
                <input class="login-password" type="password" minlength="8" maxlength="72" autocomplete="new-password" placeholder="รหัสผ่านใหม่อย่างน้อย 8 ตัว" ${protectedOwner ? 'disabled' : ''}>
                <button class="button secondary reset-login-password" type="button" ${protectedOwner ? 'disabled' : ''}>ตั้งรหัสผ่าน</button>
              </div>
            </div>
            <label class="cashier-field">
              <span>ส่วนลดสูงสุด (%)</span>
              <input class="max-discount" type="number"
                min="0" max="100" step=".01"
                value="${Number(user.max_discount_percent || 0)}"
                placeholder="0–100"
                ${protectedOwner ? 'disabled' : ''}>
            </label>
            <label class="cashier-toggle">
              <input class="drawer" type="checkbox"
                ${user.can_open_drawer ? 'checked' : ''}
                ${protectedOwner ? 'disabled' : ''}>
              <span>
                <strong>สิทธิ์เปิดลิ้นชักเงินสด</strong>
                <small>อนุญาตให้พนักงานเปิดลิ้นชักได้ด้วยตนเอง</small>
              </span>
            </label>
          </div>
        </details>
      </td>
      <td>
        <button class="button save"
          ${protectedOwner ? 'disabled' : ''}>
          บันทึก
        </button>
      </td>
    </tr>`;
  }).join('') ||
    '<tr><td colspan="7">ไม่พบข้อมูล</td></tr>';

  E.rows.querySelectorAll('.save').forEach(button => {
    button.addEventListener(
      'click',
      () => saveUser(button.closest('tr'))
    );
  });
  E.rows.querySelectorAll('.reset-login-password').forEach(button => {
    button.addEventListener('click', () => resetLoginPassword(button.closest('tr')));
  });
}

function refreshPermissionCount(moduleElement) {
  const inputs = [
    ...moduleElement.querySelectorAll('input[type="checkbox"]')
  ];
  const checked = inputs.filter(input => input.checked).length;
  const count = moduleElement.querySelector('.permission-count');
  if (count) count.textContent = `${checked}/${inputs.length} สิทธิ์`;
}

function renderPermissionGrid() {
  const role = roles.find(
    item => item.code === E.permissionRole.value
  ) || roles.find(
    item => canManageOwner() || !['owner', 'admin'].includes(item.code)
  );

  if (!role) {
    E.permissionGrid.textContent = 'ไม่พบ Role ที่จัดการได้';
    return;
  }

  E.permissionRole.value = role.code;
  const selected = rolePermissions.get(role.id) || new Set();
  const modules = new Map();

  for (const permission of permissions) {
    const moduleName = permission.module || 'other';
    if (!modules.has(moduleName)) modules.set(moduleName, []);
    modules.get(moduleName).push(permission);
  }

  E.permissionGrid.innerHTML = [...modules.entries()]
    .map(([moduleName, items], index) => `
      <details class="permission-module" ${index === 0 ? 'open' : ''}>
        <summary>
          <span>${esc(moduleName)}</span>
          <span class="permission-count">${
            items.filter(permission => selected.has(permission.id)).length
          }/${items.length} สิทธิ์</span>
        </summary>
        <div class="permission-items">
          ${items.map(permission => `
            <label class="permission-item">
              <input type="checkbox"
                value="${esc(permission.code)}"
                ${selected.has(permission.id) ? 'checked' : ''}>
              <span>
                <strong>${esc(permission.name_th || permission.code)}</strong>
                <small>${esc(permission.code)}</small>
              </span>
            </label>
          `).join('')}
        </div>
      </details>
    `).join('');

  E.permissionGrid.querySelectorAll('.permission-module').forEach(module => {
    module.addEventListener('change', () => refreshPermissionCount(module));
  });
}

async function saveUser(row) {
  const userId = row?.dataset.id;
  if (!userId || busyUsers.has(userId)) return;

  const user = users.find(item => item.user_id === userId);
  const role = row.querySelector('.role').value;
  const branch = row.querySelector('.branch').value || null;
  const active = row.querySelector('.active').checked;
  const displayName =
    row.querySelector('.display-name').value.trim();
  const employeeCode =
    row.querySelector('.employee-code').value.trim();
  const pin = row.querySelector('.pin').value.trim();
  const drawer = row.querySelector('.drawer').checked;
  const maxDiscount =
    Number(row.querySelector('.max-discount').value) || 0;
  const button = row.querySelector('.save');

  if (pin && !/^\d{4,12}$/.test(pin)) {
    setMessage(
      E.message,
      'PIN ต้องเป็นตัวเลข 4–12 หลัก',
      'error'
    );
    return;
  }

  if (maxDiscount < 0 || maxDiscount > 100) {
    setMessage(
      E.message,
      'ส่วนลดสูงสุดต้องอยู่ระหว่าง 0–100%',
      'error'
    );
    return;
  }

  if (!employeeCode && pin) {
    setMessage(
      E.message,
      'กรุณาระบุรหัสพนักงานก่อนกำหนด PIN',
      'error'
    );
    return;
  }

  busyUsers.add(userId);
  button.disabled = true;
  setMessage(E.message, 'กำลังบันทึก...');

  try {
    const roleResult = await supabaseClient.rpc(
      'admin_set_user_role_safe',
      {
        p_user_id: userId,
        p_role_code: role,
        p_branch_id: branch,
        p_is_active: active
      }
    );
    if (roleResult.error) throw roleResult.error;

    if (employeeCode) {
      const cashierResult = await supabaseClient.rpc(
        'admin_set_cashier_profile',
        {
          p_user_id: userId,
          p_employee_code: employeeCode,
          p_display_name:
            displayName || user.full_name || user.email,
          p_pin: pin || null,
          p_branch_id: branch,
          p_max_discount_percent: maxDiscount,
          p_can_open_drawer: drawer,
          p_is_active: active
        }
      );
      if (cashierResult.error) throw cashierResult.error;
    }

    if (isInternalLogin(user.email) && employeeCode && internalEmailFor(employeeCode) !== String(user.email).toLowerCase()) {
      await invokeEmployeeFunction({
        action: 'sync_login',
        user_id: userId,
        employee_code: employeeCode
      });
    }

    setMessage(
      E.message,
      'บันทึก Role และข้อมูลพนักงานเรียบร้อย',
      'success'
    );
    await loadCatalog();
    await loadUsers();
  } catch (error) {
    console.error('Save user access error:', error);
    setMessage(
      E.message,
      error.message || 'บันทึกไม่สำเร็จ',
      'error'
    );
  } finally {
    busyUsers.delete(userId);
    button.disabled = false;
  }
}


function renderCreateOptions() {
  if (!E.newRole || !E.newBranch) return;
  const availableRoles = roles.filter(role => canManageOwner() || role.code !== 'owner');
  E.newRole.innerHTML = availableRoles.map(role =>
    `<option value="${esc(role.code)}">${esc(roleLabel(role))}</option>`
  ).join('');
  if (availableRoles.some(role => role.code === 'cashier')) E.newRole.value = 'cashier';
  E.newBranch.innerHTML = '<option value="">ทุกสาขา/ไม่ระบุ</option>' + branches.map(branch =>
    `<option value="${esc(branch.id)}">${esc(branch.code)} — ${esc(branch.name)}</option>`
  ).join('');
}

function updateNewLoginPreview() {
  const code = normalizeEmployeeCode(E.newEmployeeCode?.value);
  E.newLoginPreview.textContent = code ? `${code}  →  Login ด้วยรหัสพนักงานนี้` : 'กรอกรหัสพนักงาน';
}

function openCreateEmployee() {
  if (!E.createEmployeeDialog) return;
  E.createEmployeeForm?.reset();
  E.newMaxDiscount.value = '0';
  E.newIsActive.checked = true;
  renderCreateOptions();
  setCreateMessage('');
  updateNewLoginPreview();
  E.createEmployeeDialog.showModal();
  setTimeout(() => E.newEmployeeCode?.focus(), 0);
}

function closeCreateEmployee() {
  if (E.createEmployeeDialog?.open) E.createEmployeeDialog.close();
}

async function createEmployee(event) {
  event.preventDefault();
  const employeeCode = normalizeEmployeeCode(E.newEmployeeCode.value);
  const displayName = E.newDisplayName.value.trim();
  const roleCode = E.newRole.value;
  const branchId = E.newBranch.value || null;
  const password = E.newLoginPassword.value;
  const confirmPassword = E.confirmLoginPassword.value;
  const pin = E.newPin.value.trim();
  const maxDiscount = Number(E.newMaxDiscount.value || 0);

  if (!/^[A-Z0-9._-]{2,32}$/.test(employeeCode)) {
    return setCreateMessage('รหัสพนักงานใช้ A-Z, 0-9, จุด, ขีดกลาง หรือ _ ความยาว 2–32 ตัว', 'error');
  }
  if (!displayName) return setCreateMessage('กรุณากรอกชื่อพนักงาน', 'error');
  if (password.length < 8 || password.length > 72) return setCreateMessage('รหัสผ่าน Login ต้องมี 8–72 ตัว', 'error');
  if (password !== confirmPassword) return setCreateMessage('ยืนยันรหัสผ่านไม่ตรงกัน', 'error');
  if (!/^\d{4,12}$/.test(pin)) return setCreateMessage('PIN ต้องเป็นตัวเลข 4–12 หลัก', 'error');
  if (maxDiscount < 0 || maxDiscount > 100) return setCreateMessage('ส่วนลดสูงสุดต้องอยู่ระหว่าง 0–100%', 'error');

  E.submitEmployeeBtn.disabled = true;
  setCreateMessage('กำลังสร้างบัญชีพนักงาน...');
  try {
    const result = await invokeEmployeeFunction({
      action: 'create',
      employee_code: employeeCode,
      display_name: displayName,
      role_code: roleCode,
      branch_id: branchId,
      password,
      pin,
      max_discount_percent: maxDiscount,
      can_open_drawer: E.newCanOpenDrawer.checked,
      is_active: E.newIsActive.checked
    });
    setCreateMessage(`สร้างบัญชี ${result?.employee_code || employeeCode} เรียบร้อย`, 'success');
    await loadCatalog();
    await loadUsers();
    setTimeout(closeCreateEmployee, 650);
  } catch (error) {
    console.error('Create employee error:', error);
    setCreateMessage(error.message || 'สร้างบัญชีไม่สำเร็จ', 'error');
  } finally {
    E.submitEmployeeBtn.disabled = false;
  }
}

async function resetLoginPassword(row) {
  const userId = row?.dataset.id;
  const input = row?.querySelector('.login-password');
  const button = row?.querySelector('.reset-login-password');
  const password = input?.value || '';
  if (!userId || !input || !button) return;
  if (password.length < 8 || password.length > 72) {
    return setMessage(E.message, 'รหัสผ่าน Login ใหม่ต้องมี 8–72 ตัว', 'error');
  }
  if (!confirm('ยืนยันตั้งรหัสผ่าน Login ใหม่ให้บัญชีนี้หรือไม่')) return;
  button.disabled = true;
  setMessage(E.message, 'กำลังตั้งรหัสผ่าน Login ใหม่...');
  try {
    await invokeEmployeeFunction({ action: 'reset_password', user_id: userId, password });
    input.value = '';
    setMessage(E.message, 'ตั้งรหัสผ่าน Login ใหม่เรียบร้อย', 'success');
  } catch (error) {
    console.error('Reset login password error:', error);
    setMessage(E.message, error.message || 'ตั้งรหัสผ่านไม่สำเร็จ', 'error');
  } finally {
    button.disabled = false;
  }
}

async function saveRolePermissions() {
  const role = E.permissionRole.value;
  if (!role || pageBusy) return;

  const codes = [
    ...E.permissionGrid.querySelectorAll(
      'input[type="checkbox"]:checked'
    )
  ].map(input => input.value);

  if (!confirm(`ยืนยันบันทึกสิทธิ์ของ Role "${role}" หรือไม่`)) {
    return;
  }

  E.savePermissions.disabled = true;
  setMessage(E.permissionMessage, 'กำลังบันทึก...');

  try {
    const { data, error } = await supabaseClient.rpc(
      'admin_set_role_permissions',
      {
        p_role_code: role,
        p_permission_codes: codes
      }
    );
    if (error) throw error;

    setMessage(
      E.permissionMessage,
      `บันทึกสิทธิ์ ${data?.permission_count ?? codes.length} รายการแล้ว`,
      'success'
    );
    await loadCatalog();
  } catch (error) {
    console.error('Save role permissions error:', error);
    setMessage(
      E.permissionMessage,
      error.message || 'บันทึกสิทธิ์ไม่สำเร็จ',
      'error'
    );
  } finally {
    E.savePermissions.disabled = false;
  }
}

E.reload.addEventListener('click', init);
E.search.addEventListener('input', renderUsers);
E.roleFilter.addEventListener('change', renderUsers);
E.statusFilter.addEventListener('change', renderUsers);
E.permissionRole.addEventListener('change', renderPermissionGrid);
E.savePermissions.addEventListener('click', saveRolePermissions);
E.createEmployeeBtn?.addEventListener('click', openCreateEmployee);
E.closeEmployeeDialog?.addEventListener('click', closeCreateEmployee);
E.cancelEmployeeBtn?.addEventListener('click', closeCreateEmployee);
E.createEmployeeForm?.addEventListener('submit', createEmployee);
E.newEmployeeCode?.addEventListener('input', updateNewLoginPreview);
E.createEmployeeDialog?.addEventListener('click', (event) => {
  if (event.target === E.createEmployeeDialog) closeCreateEmployee();
});

init();
