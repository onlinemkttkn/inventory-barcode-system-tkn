const E = {
  branch: document.getElementById('branch'),
  search: document.getElementById('search'),
  loadBtn: document.getElementById('loadBtn'),
  body: document.getElementById('body'),
  message: document.getElementById('message')
};

let role = 'staff';
let canAdjust = false;
const pendingKeys = new Map();

function msg(text, cssClass = '') {
  E.message.textContent = text;
  E.message.className = `msg ${cssClass}`.trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;'
  })[char]);
}

function makeKey(productId, payload) {
  const fingerprint = JSON.stringify(payload);
  const current = pendingKeys.get(productId);
  if (current?.fingerprint === fingerprint) return current.key;

  const suffix = globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = { fingerprint, key: `direct-adjust:${suffix}` };
  pendingKeys.set(productId, next);
  return next.key;
}

async function init() {
  if (!window.TKNAuthGuard) throw new Error('ไม่พบระบบตรวจสอบ Session รุ่นใหม่');

  const access = await window.TKNAuthGuard.requireAccess('inventory.view', {
    loadingText: 'กำลังเปิดหน้าปรับสต็อก...'
  });
  if (!access) return;

  role = access.role || 'staff';
  const permissions = new Set(access.permissions || []);
  canAdjust = permissions.has('inventory.adjust');

  const { data, error } = await supabaseClient
    .from('branches')
    .select('id,code,name')
    .eq('is_active', true)
    .order('sort_order')
    .order('code');

  if (error) throw error;

  E.branch.innerHTML = (data || []).map(branch =>
    `<option value="${branch.id}">${esc(branch.code)} — ${esc(branch.name)}</option>`
  ).join('');

  window.TKNInventoryWorkspace?.setBranch(
    E.branch.selectedOptions[0]?.textContent || 'สาขาที่เลือก'
  );

  if (!canAdjust) msg('บัญชีนี้ดูสต็อกได้ แต่ไม่มีสิทธิ์ปรับจำนวน', 'error');
  await load();
  window.TKNAuthGuard.ready();
}

async function load() {
  E.loadBtn.disabled = true;
  msg('กำลังโหลดสินค้า...');
  pendingKeys.clear();

  try {
    const queryText = E.search.value.trim().replace(/[%_,()]/g, '');
    let query = supabaseClient
      .from('branch_inventory_list')
      .select('*')
      .eq('branch_id', E.branch.value)
      .order('product_name')
      .limit(1000);

    if (queryText) {
      query = query.or(
        `product_name.ilike.%${queryText}%,` +
        `product_code.ilike.%${queryText}%,` +
        `barcode.ilike.%${queryText}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    renderRows(data || []);
    msg(`พบ ${(data || []).length} รายการ · สิทธิ์ ${role}`);
  } catch (error) {
    msg(error.message, 'error');
  } finally {
    E.loadBtn.disabled = false;
  }
}

function renderRows(rows) {
  E.body.innerHTML = '';

  rows.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(item.product_code)}</td>
      <td>${esc(item.product_name)}</td>
      <td>${Number(item.quantity || 0).toLocaleString('th-TH')}</td>
      <td>${Number(item.minimum_stock || 0).toLocaleString('th-TH')}</td>
    `;

    const quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.min = '0';
    quantity.step = '.001';
    quantity.inputMode = 'decimal';
    quantity.value = item.quantity;
    quantity.disabled = !canAdjust;

    const minimum = document.createElement('input');
    minimum.type = 'number';
    minimum.min = '0';
    minimum.step = '.001';
    minimum.inputMode = 'decimal';
    minimum.value = item.minimum_stock;
    minimum.disabled = !canAdjust;

    const reason = document.createElement('input');
    reason.placeholder = 'เหตุผลอย่างน้อย 5 ตัวอักษร';
    reason.disabled = !canAdjust;

    const save = document.createElement('button');
    save.className = 'btn primary';
    save.type = 'button';
    save.textContent = canAdjust ? 'บันทึก' : 'ไม่มีสิทธิ์';
    save.disabled = !canAdjust;

    save.onclick = async () => {
      const newQuantity = Number(quantity.value);
      const newMinimum = Number(minimum.value);
      const reasonText = reason.value.trim();

      if (!Number.isFinite(newQuantity) || newQuantity < 0) {
        return msg('กรุณาระบุยอดใหม่ที่ไม่น้อยกว่า 0', 'error');
      }
      if (!Number.isFinite(newMinimum) || newMinimum < 0) {
        return msg('กรุณาระบุยอดขั้นต่ำที่ไม่น้อยกว่า 0', 'error');
      }
      if (reasonText.length < 5) {
        msg('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร', 'error');
        reason.focus();
        return;
      }

      const payload = {
        branchId: E.branch.value,
        productId: item.product_id,
        expected: Number(item.quantity),
        quantity: newQuantity,
        minimum: newMinimum,
        reason: reasonText
      };
      const key = makeKey(item.product_id, payload);

      save.disabled = true;
      quantity.disabled = true;
      minimum.disabled = true;
      reason.disabled = true;
      save.textContent = 'กำลังบันทึก...';
      msg('กำลังตรวจสอบและปรับสต็อก...');

      try {
        const { error: rpcError } = await supabaseClient.rpc(
          'set_branch_product_stock_safe',
          {
            p_branch_id: payload.branchId,
            p_product_id: payload.productId,
            p_expected_quantity: payload.expected,
            p_quantity: payload.quantity,
            p_minimum_stock: payload.minimum,
            p_reason: payload.reason,
            p_idempotency_key: key
          }
        );

        if (rpcError) throw rpcError;

        pendingKeys.delete(item.product_id);
        msg('ปรับสต็อกและบันทึกประวัติเรียบร้อย', 'ok');
        await load();
      } catch (error) {
        msg(error.message || 'ปรับสต็อกไม่สำเร็จ', 'error');
        save.disabled = !canAdjust;
        quantity.disabled = !canAdjust;
        minimum.disabled = !canAdjust;
        reason.disabled = !canAdjust;
        save.textContent = canAdjust ? 'บันทึก' : 'ไม่มีสิทธิ์';
      }
    };

    for (const node of [quantity, minimum, reason, save]) {
      const td = document.createElement('td');
      td.appendChild(node);
      tr.appendChild(td);
    }

    E.body.appendChild(tr);
  });
}

E.loadBtn.addEventListener('click', load);
E.branch.addEventListener('change', () => {
  window.TKNInventoryWorkspace?.setBranch(E.branch.selectedOptions[0]?.textContent || 'สาขาที่เลือก');
  load();
});
E.search.addEventListener('keydown', event => {
  if (event.key === 'Enter') load();
});

init().catch(error => {
  msg(error.message, 'error');
  if (error.code !== 'INVENTORY_PERMISSION_DENIED') {
    window.TKNAuthGuard?.fail(error, () => location.reload());
  }
});
