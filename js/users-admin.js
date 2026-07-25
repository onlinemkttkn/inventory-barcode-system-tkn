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
  actorStatus: document.getElementById('actorStatus')
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
}

async function loadUsers() {
  setMessage(E.message, 'กำลังโหลด...');
  const { data, error } = await supabaseClient.rpc('admin_list_users');
  if (error) throw error;
  users = Array.isArray(data) ? data : [];
  renderUsers();
  setMessage(E.message, `พบ ${users.length} บัญชี`, 'success');
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
        <strong>${esc(user.full_name || '-')}</strong><br>
        <small>${esc(user.email || '-')}</small>
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
        user.last_sign_in_at
          ? `${new Date(user.last_sign_in_at).toLocaleDateString('th-TH')}
             <br><small>${
               new Date(user.last_sign_in_at).toLocaleTimeString('th-TH')
             }</small>`
          : '-'
      }</td>
      <td class="cashier-fields">
        <input class="display-name"
          placeholder="ชื่อแคชเชียร์บนใบเสร็จ"
          value="${esc(user.cashier_display_name || user.full_name || '')}"
          ${protectedOwner ? 'disabled' : ''}>
        <input class="employee-code"
          placeholder="รหัสพนักงาน"
          value="${esc(user.employee_code || '')}"
          ${protectedOwner ? 'disabled' : ''}>
        <input class="pin" type="password" inputmode="numeric"
          minlength="4"
          placeholder="${
            user.employee_code
              ? 'PIN ใหม่ (เว้นว่าง=ไม่เปลี่ยน)'
              : 'PIN อย่างน้อย 4 ตัว'
          }"
          ${protectedOwner ? 'disabled' : ''}>
        <label>
          <input class="drawer" type="checkbox"
            ${user.can_open_drawer ? 'checked' : ''}
            ${protectedOwner ? 'disabled' : ''}>
          เปิดลิ้นชักเองได้
        </label>
        <input class="max-discount" type="number"
          min="0" max="100" step=".01"
          value="${Number(user.max_discount_percent || 0)}"
          placeholder="ส่วนลดสูงสุด %"
          ${protectedOwner ? 'disabled' : ''}>
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
    .map(([moduleName, items]) => `
      <fieldset class="permission-module">
        <legend>${esc(moduleName)}</legend>
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
      </fieldset>
    `).join('');
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

init();
