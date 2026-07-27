const E = {
  branch: document.getElementById('branch'),
  load: document.getElementById('load'),
  body: document.getElementById('body'),
  message: document.getElementById('message')
};

let receivingId = null;

async function initialize() {
  const access = await inventoryAccess('inventory.transfer');
  if (!access) return;

  const list = await branches();
  E.branch.innerHTML = list.map(branch =>
    `<option value="${branch.id}">${esc(branch.code)} — ${esc(branch.name)}</option>`
  ).join('');

  window.TKNInventoryWorkspace?.setBranch(E.branch.selectedOptions[0]?.textContent || 'สาขาปลายทาง');
  await loadTransfers();
  window.TKNAuthGuard?.ready();
}

async function loadTransfers() {
  if (!E.branch.value) return;
  E.load.disabled = true;
  msg(E.message, 'กำลังโหลดรายการรอรับ...');

  try {
    const { data, error } = await supabaseClient
      .from('transfer_document_list')
      .select('*')
      .eq('status', 'IN_TRANSIT')
      .eq('destination_branch_id', E.branch.value)
      .order('sent_at', { ascending: false });

    if (error) throw error;

    renderTransfers(data || []);
    msg(E.message, `พบ ${(data || []).length} ใบโอนที่รอรับ`);
  } catch (error) {
    msg(E.message, error.message, 'error');
  } finally {
    E.load.disabled = false;
  }
}

function renderTransfers(rows) {
  E.body.innerHTML = '';

  rows.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(item.transfer_no)}</td>
      <td>${esc(item.source_branch_name)}</td>
      <td>${Number(item.total_lines || 0).toLocaleString('th-TH')}</td>
      <td>${Number(item.total_quantity || 0).toLocaleString('th-TH')}</td>
      <td>${item.sent_at ? new Date(item.sent_at).toLocaleString('th-TH') : '-'}</td>
    `;

    const actionCell = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'btn success';
    button.type = 'button';
    button.textContent = receivingId === item.id ? 'กำลังรับ...' : 'ยืนยันรับ';
    button.disabled = Boolean(receivingId);
    button.onclick = () => receiveTransfer(item, button);
    actionCell.appendChild(button);
    tr.appendChild(actionCell);
    E.body.appendChild(tr);
  });
}

async function receiveTransfer(item, button) {
  if (receivingId) return;
  if (!confirm(`ยืนยันรับสินค้าใบโอน ${item.transfer_no}?\nต้นทาง: ${item.source_branch_name}\nจำนวน: ${item.total_quantity} หน่วย`)) return;

  receivingId = item.id;
  button.disabled = true;
  button.textContent = 'กำลังรับ...';
  msg(E.message, `กำลังรับใบโอน ${item.transfer_no}...`);

  try {
    const { data, error } = await supabaseClient.rpc('receive_branch_transfer', {
      p_transfer_id: item.id
    });
    if (error) throw error;

    msg(E.message, `รับสินค้า ${data.transfer_no} เรียบร้อย`, 'ok');
    await loadTransfers();
  } catch (error) {
    msg(E.message, error.message || 'รับสินค้าไม่สำเร็จ', 'error');
  } finally {
    receivingId = null;
    button.disabled = false;
    button.textContent = 'ยืนยันรับ';
  }
}

E.load.onclick = loadTransfers;
E.branch.onchange = () => {
  window.TKNInventoryWorkspace?.setBranch(E.branch.selectedOptions[0]?.textContent || 'สาขาปลายทาง');
  loadTransfers();
};

initialize().catch(error => {
  msg(E.message, error.message, 'error');
  if (error.code !== 'INVENTORY_PERMISSION_DENIED') {
    window.TKNAuthGuard?.fail(error, () => location.reload());
  }
});
