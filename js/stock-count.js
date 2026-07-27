const E = {
  branch: document.getElementById('branch'),
  notes: document.getElementById('notes'),
  start: document.getElementById('start'),
  sessionText: document.getElementById('sessionText'),
  searchForm: document.getElementById('searchForm'),
  search: document.getElementById('search'),
  results: document.getElementById('results'),
  searchMsg: document.getElementById('searchMsg'),
  counted: document.getElementById('counted'),
  complete: document.getElementById('complete'),
  cancel: document.getElementById('cancel'),
  actionMsg: document.getElementById('actionMsg')
};

let session = null;
const items = new Map();
let busy = false;

async function initialize() {
  const access = await scAccess('inventory.count');
  if (!access) return;

  const list = await scBranches();
  E.branch.innerHTML = list.map(branch =>
    `<option value="${branch.id}">${scEsc(branch.code)} — ${scEsc(branch.name)}</option>`
  ).join('');

  await resumeActiveSession();
  render();
  if (!session) scMsg(E.actionMsg, `พร้อมตรวจนับ · สิทธิ์ ${access.role_name_th || access.role || '-'}`);
}


async function resumeActiveSession() {
  if (!E.branch.value) return;

  const { data: sessions, error: sessionError } = await supabaseClient
    .from('stock_count_session_list')
    .select('*')
    .eq('branch_id', E.branch.value)
    .eq('status', 'COUNTING')
    .order('created_at', { ascending: false })
    .limit(1);

  if (sessionError) throw sessionError;
  const active = sessions?.[0];
  if (!active) {
    session = null;
    items.clear();
    return;
  }

  session = active;
  E.notes.value = active.notes || '';
  items.clear();

  const { data: countedRows, error: itemError } = await supabaseClient
    .from('stock_count_item_list')
    .select('*')
    .eq('session_id', active.id)
    .order('product_name');

  if (itemError) throw itemError;
  (countedRows || []).forEach(item => items.set(item.product_id, item));
  scMsg(E.actionMsg, `กลับเข้าสู่รอบ ${active.count_no} ที่ยังไม่ปิด`, 'ok');
}

function setSessionControls(active) {
  E.branch.disabled = active;
  E.notes.disabled = active;
  E.start.disabled = active || busy;
  E.search.disabled = !active || busy;
  E.complete.disabled = !active || !items.size || busy;
  E.cancel.disabled = !active || busy;
}

function render() {
  E.counted.innerHTML = '';

  for (const item of items.values()) {
    const row = document.createElement('div');
    row.className = 'item';

    const variance = Number(item.counted_quantity) - Number(item.system_quantity);
    const varianceClass = variance > 0
      ? 'variance-plus'
      : variance < 0 ? 'variance-minus' : 'variance-zero';

    row.innerHTML = `
      <div>
        <b>${scEsc(item.product_name)}</b>
        <small>${scEsc(item.product_code)} · ระบบตอนเริ่ม ${scNum(item.system_quantity)}</small>
      </div>
      <div>
        นับจริง <b>${scNum(item.counted_quantity)}</b><br>
        <span class="${varianceClass}">ต่าง ${variance > 0 ? '+' : ''}${scNum(variance)}</span>
      </div>
    `;
    E.counted.appendChild(row);
  }

  E.sessionText.textContent = session
    ? `รอบ ${session.count_no} · ${items.size} รายการ`
    : 'ยังไม่ได้เริ่มรอบ';

  setSessionControls(Boolean(session));
}

E.start.onclick = async () => {
  if (busy || session) return;
  if (!E.branch.value) return scMsg(E.actionMsg, 'กรุณาเลือกสาขา', 'error');

  busy = true;
  E.start.disabled = true;
  scMsg(E.actionMsg, 'กำลังเริ่มรอบตรวจนับ...');

  try {
    const { data, error } = await supabaseClient.rpc('create_stock_count_session', {
      p_branch_id: E.branch.value,
      p_notes: E.notes.value.trim() || null
    });
    if (error) throw error;

    session = data;
    items.clear();
    E.results.innerHTML = '';
    E.search.value = '';
    scMsg(E.actionMsg, `เริ่มรอบ ${data.count_no} แล้ว`, 'ok');
  } catch (error) {
    scMsg(E.actionMsg, error.message || 'เริ่มรอบไม่สำเร็จ', 'error');
  } finally {
    busy = false;
    render();
  }
};

E.searchForm.onsubmit = async event => {
  event.preventDefault();
  if (!session) return scMsg(E.searchMsg, 'กรุณาเริ่มรอบตรวจนับก่อน', 'error');

  const q = E.search.value.trim().replace(/[%_,()]/g, '');
  if (!q) return scMsg(E.searchMsg, 'กรุณากรอกชื่อ รหัส หรือบาร์โค้ด', 'error');

  scMsg(E.searchMsg, 'กำลังค้นหา...');
  const { data, error } = await supabaseClient
    .from('branch_inventory_list')
    .select('*')
    .eq('branch_id', session.branch_id)
    .or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.eq.${q}`)
    .limit(20);

  if (error) return scMsg(E.searchMsg, error.message, 'error');

  renderSearchResults(data || []);
  scMsg(E.searchMsg, `พบ ${(data || []).length} รายการ`);
};

function renderSearchResults(rows) {
  E.results.innerHTML = '';

  rows.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `<div><b>${scEsc(item.product_name)}</b>
      <small>${scEsc(item.product_code)} · ระบบปัจจุบัน ${scNum(item.quantity)}</small></div>`;

    const input = document.createElement('input');
    input.className = 'qty';
    input.type = 'number';
    input.min = '0';
    input.step = '.001';
    input.inputMode = 'decimal';
    input.placeholder = 'ยอดนับจริง';
    input.value = items.get(item.product_id)?.counted_quantity ?? '';

    const button = document.createElement('button');
    button.className = 'btn primary';
    button.type = 'button';
    button.textContent = 'บันทึกยอดนับ';
    button.onclick = () => saveCount(item, input, button);

    const controls = document.createElement('div');
    controls.className = 'row';
    controls.append(input, button);
    row.appendChild(controls);
    E.results.appendChild(row);
  });
}

async function saveCount(product, input, button) {
  if (busy || !session) return;

  const counted = Number(input.value);
  if (!Number.isFinite(counted) || counted < 0) {
    return scMsg(E.searchMsg, 'กรอกยอดนับจริงให้ถูกต้อง', 'error');
  }

  busy = true;
  button.disabled = true;
  button.textContent = 'กำลังบันทึก...';

  try {
    const { data, error } = await supabaseClient.rpc('save_stock_count_item', {
      p_session_id: session.id,
      p_product_id: product.product_id,
      p_counted_quantity: counted,
      p_note: null
    });
    if (error) throw error;

    items.set(product.product_id, {
      ...product,
      system_quantity: data.system_quantity,
      counted_quantity: data.counted_quantity,
      variance: data.variance
    });

    scMsg(E.searchMsg, `บันทึก ${product.product_code} แล้ว`, 'ok');
  } catch (error) {
    scMsg(E.searchMsg, error.message || 'บันทึกยอดนับไม่สำเร็จ', 'error');
  } finally {
    busy = false;
    button.disabled = false;
    button.textContent = 'บันทึกยอดนับ';
    render();
  }
}

E.complete.onclick = async () => {
  if (busy || !session) return;
  if (!items.size) return scMsg(E.actionMsg, 'ยังไม่มีรายการที่นับ', 'error');

  const totalVariance = [...items.values()].reduce(
    (sum, item) => sum + Math.abs(Number(item.counted_quantity) - Number(item.system_quantity)),
    0
  );

  if (!confirm(
    `ยืนยันปิดรอบ ${session.count_no}?\n` +
    `${items.size} รายการ · ผลต่างรวม ${scNum(totalVariance)} หน่วย\n` +
    'ระบบจะหยุดทันทีหากสต็อกเปลี่ยนระหว่างตรวจนับ'
  )) return;

  busy = true;
  E.complete.disabled = true;
  scMsg(E.actionMsg, 'กำลังตรวจสอบและปรับยอด...');

  try {
    const { data, error } = await supabaseClient.rpc('complete_stock_count_session', {
      p_session_id: session.id
    });
    if (error) throw error;

    scMsg(E.actionMsg, `ปิดรอบ ${data.count_no} เรียบร้อย`, 'ok');
    session = null;
    items.clear();
    E.results.innerHTML = '';
    E.notes.value = '';
    E.search.value = '';
  } catch (error) {
    scMsg(E.actionMsg, error.message || 'ปิดรอบไม่สำเร็จ', 'error');
  } finally {
    busy = false;
    render();
  }
};


E.branch.addEventListener('change', async () => {
  if (session) return;
  try {
    await resumeActiveSession();
    render();
  } catch (error) {
    scMsg(E.actionMsg, error.message, 'error');
  }
});

E.cancel.onclick = async () => {
  if (busy || !session) return;
  const reason = prompt(`เหตุผลที่ยกเลิกรอบ ${session.count_no}`, 'ยกเลิกเพื่อเริ่มตรวจนับใหม่');
  if (reason === null) return;
  if (reason.trim().length < 5) {
    return scMsg(E.actionMsg, 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร', 'error');
  }
  if (!confirm(`ยืนยันยกเลิกรอบ ${session.count_no}?\nการยกเลิกจะไม่เปลี่ยนยอดสต็อก`)) return;

  busy = true;
  E.cancel.disabled = true;
  scMsg(E.actionMsg, 'กำลังยกเลิกรอบ...');

  try {
    const { data, error } = await supabaseClient.rpc('cancel_stock_count_session', {
      p_session_id: session.id,
      p_reason: reason.trim()
    });
    if (error) throw error;

    scMsg(E.actionMsg, `ยกเลิกรอบ ${data.count_no} เรียบร้อย`, 'ok');
    session = null;
    items.clear();
    E.results.innerHTML = '';
    E.notes.value = '';
    E.search.value = '';
  } catch (error) {
    scMsg(E.actionMsg, error.message || 'ยกเลิกรอบไม่สำเร็จ', 'error');
  } finally {
    busy = false;
    render();
  }
};

initialize().catch(error => scMsg(E.actionMsg, error.message, 'error'));
