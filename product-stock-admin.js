const E = {
  branch: document.getElementById('branch'),
  search: document.getElementById('search'),
  loadBtn: document.getElementById('loadBtn'),
  body: document.getElementById('body'),
  message: document.getElementById('message')
};

let currentRole = 'staff';
let canAdjustStock = false;

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

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session?.user?.id) {
    location.replace('./dashboard.html');
    return;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('role,is_active')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profileError) return msg(profileError.message, 'error');

  if (!profile || profile.is_active !== true) {
    await supabaseClient.auth.signOut();
    location.replace('./dashboard.html');
    return;
  }

  currentRole = String(profile.role || 'staff').toLowerCase();
  sessionStorage.setItem('tkn_user_role', currentRole);

  canAdjustStock = ['owner', 'admin', 'warehouse'].includes(currentRole);

  const { data, error } = await supabaseClient
    .from('branches')
    .select('id,code,name')
    .eq('is_active', true)
    .order('sort_order');

  if (error) return msg(error.message, 'error');

  E.branch.innerHTML = (data || []).map(branch =>
    `<option value="${branch.id}">${esc(branch.code)} — ${esc(branch.name)}</option>`
  ).join('');

  if (!canAdjustStock) {
    msg('บัญชีนี้ดูสต็อกได้ แต่ไม่มีสิทธิ์ปรับจำนวน', 'error');
  }

  await load();
}

async function load() {
  const queryText = E.search.value.trim().replace(/[%_,()]/g, '');

  let query = supabaseClient
    .from('branch_inventory_list')
    .select('*')
    .eq('branch_id', E.branch.value)
    .order('product_name')
    .limit(1000);

  if (queryText) {
    query = query.or(
      `product_name.ilike.%${queryText}%,`
      + `product_code.ilike.%${queryText}%,`
      + `barcode.ilike.%${queryText}%`
    );
  }

  const { data, error } = await query;
  if (error) return msg(error.message, 'error');

  E.body.innerHTML = '';

  (data || []).forEach(item => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${esc(item.product_code)}</td>
      <td>${esc(item.product_name)}</td>
      <td>${Number(item.quantity || 0)}</td>
      <td>${Number(item.minimum_stock || 0)}</td>
    `;

    const quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.min = '0';
    quantity.step = '.001';
    quantity.value = item.quantity;
    quantity.disabled = !canAdjustStock;

    const minimum = document.createElement('input');
    minimum.type = 'number';
    minimum.min = '0';
    minimum.step = '.001';
    minimum.value = item.minimum_stock;
    minimum.disabled = !canAdjustStock;

    const reason = document.createElement('input');
    reason.placeholder = 'เหตุผลอย่างน้อย 5 ตัวอักษร';
    reason.disabled = !canAdjustStock;

    const save = document.createElement('button');
    save.className = 'btn primary';
    save.textContent = canAdjustStock ? 'บันทึก' : 'ไม่มีสิทธิ์';
    save.disabled = !canAdjustStock;

    save.onclick = async () => {
      if (!canAdjustStock) return;

      const reasonText = reason.value.trim();
      if (reasonText.length < 5) {
        msg('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร', 'error');
        reason.focus();
        return;
      }

      save.disabled = true;
      msg('กำลังปรับสต็อก...');

      const { error: rpcError } = await supabaseClient.rpc(
        'set_branch_product_stock',
        {
          p_branch_id: E.branch.value,
          p_product_id: item.product_id,
          p_quantity: Number(quantity.value) || 0,
          p_minimum_stock: Number(minimum.value) || 0,
          p_reason: reasonText
        }
      );

      save.disabled = false;

      if (rpcError) return msg(rpcError.message, 'error');

      msg('ปรับสต็อกเรียบร้อยและบันทึก Audit Log แล้ว', 'ok');
      await load();
    };

    [quantity, minimum, reason, save].forEach(node => {
      const td = document.createElement('td');
      td.appendChild(node);
      tr.appendChild(td);
    });

    E.body.appendChild(tr);
  });

  if (canAdjustStock) {
    msg(`พบ ${(data || []).length} รายการ · สิทธิ์ ${currentRole}`);
  }
}

E.loadBtn.onclick = load;
E.branch.onchange = load;
E.search.onkeydown = event => {
  if (event.key === 'Enter') load();
};

init();
