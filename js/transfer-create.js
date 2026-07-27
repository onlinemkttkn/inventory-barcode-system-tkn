import { MobileBarcodeScanner } from './mobile-scanner.js';

const E = {
  source: document.getElementById('source'),
  dest: document.getElementById('dest'),
  ref: document.getElementById('ref'),
  notes: document.getElementById('notes'),
  searchForm: document.getElementById('searchForm'),
  search: document.getElementById('search'),
  scan: document.getElementById('scanBtn'),
  results: document.getElementById('results'),
  cart: document.getElementById('cart'),
  cartSummary: document.getElementById('cartSummary'),
  save: document.getElementById('save'),
  searchMsg: document.getElementById('searchMsg'),
  actionMsg: document.getElementById('actionMsg')
};

const cart = new Map();
let pendingRequest = null;
let saving = false;
let previousSource = '';

const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
})[char]);

function message(element, text, type='') {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function invalidatePendingRequest() {
  pendingRequest = null;
}

function clearCart(reason = '') {
  cart.clear();
  E.results.innerHTML = '';
  renderCart();
  invalidatePendingRequest();
  if (reason) message(E.actionMsg, reason);
}

async function initialize() {
  const access = await inventoryAccess('inventory.transfer');
  if (!access) return;

  const list = await branches();
  if (list.length < 2) {
    E.save.disabled = true;
    throw new Error('ต้องมีสาขาที่เปิดใช้งานอย่างน้อย 2 สาขา');
  }

  const options = list.map(branch =>
    `<option value="${branch.id}">${html(branch.code)} — ${html(branch.name)}</option>`
  ).join('');

  E.source.innerHTML = options;
  E.dest.innerHTML = options;
  E.dest.selectedIndex = 1;
  previousSource = E.source.value;
  window.TKNInventoryWorkspace?.setBranch(E.source.selectedOptions[0]?.textContent || 'สาขาต้นทาง');
  message(E.actionMsg, `พร้อมใช้งาน · สิทธิ์ ${access.role_name_th || access.role || '-'}`);
  window.TKNAuthGuard?.ready();
}

async function search(query = E.search.value.trim()) {
  const q = String(query || '').trim().replace(/[%_,()]/g, '');
  if (!q) return message(E.searchMsg, 'กรุณากรอกหรือสแกนสินค้า', 'error');
  if (!E.source.value) return message(E.searchMsg, 'กรุณาเลือกสาขาต้นทาง', 'error');

  message(E.searchMsg, 'กำลังค้นหา...');
  const { data, error } = await supabaseClient
    .from('branch_inventory_list')
    .select('*')
    .eq('branch_id', E.source.value)
    .or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.eq.${q}`)
    .limit(20);

  if (error) return message(E.searchMsg, error.message, 'error');

  const items = (data || []).filter(item => Number(item.quantity) > 0);
  renderResults(items);
  message(E.searchMsg, `พบสินค้าที่โอนได้ ${items.length} รายการ`);

  if (items.length === 1 && query !== E.search.value.trim()) add(items[0]);
}

function renderResults(items) {
  E.results.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item operation-item';
    row.innerHTML = `<div><b>${html(item.product_name)}</b>
      <small>${html(item.product_code)} · คงเหลือ ${Number(item.quantity).toLocaleString('th-TH')}</small></div>`;

    const button = document.createElement('button');
    button.className = 'btn primary';
    button.type = 'button';
    button.textContent = 'เพิ่ม';
    button.onclick = () => add(item);
    row.appendChild(button);
    E.results.appendChild(row);
  });
}

function add(item) {
  const existing = cart.get(item.product_id);
  const next = existing ? Number(existing.move) + 1 : 1;
  if (next > Number(item.quantity)) {
    return message(E.actionMsg, 'จำนวนเกินยอดคงเหลือ', 'error');
  }
  cart.set(item.product_id, { ...item, move: next });
  invalidatePendingRequest();
  renderCart();
}

function renderCart() {
  E.cart.innerHTML = '';
  for (const item of cart.values()) {
    const row = document.createElement('div');
    row.className = 'item operation-cart-item';

    const info = document.createElement('div');
    info.innerHTML = `<b>${html(item.product_name)}</b>
      <small>${html(item.product_code)} · คงเหลือ ${Number(item.quantity).toLocaleString('th-TH')}</small>`;

    const quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.min = '.001';
    quantity.max = item.quantity;
    quantity.step = '.001';
    quantity.inputMode = 'decimal';
    quantity.value = item.move;
    quantity.onchange = () => {
      const entered = Number(quantity.value);
      if (!Number.isFinite(entered) || entered <= 0) {
        quantity.value = item.move;
        return message(E.actionMsg, 'จำนวนโอนต้องมากกว่า 0', 'error');
      }
      item.move = Math.min(entered, Number(item.quantity));
      quantity.value = item.move;
      invalidatePendingRequest();
      updateSummary();
    };

    const remove = document.createElement('button');
    remove.className = 'btn danger';
    remove.type = 'button';
    remove.textContent = 'ลบ';
    remove.onclick = () => {
      cart.delete(item.product_id);
      invalidatePendingRequest();
      renderCart();
    };

    row.append(info, quantity, remove);
    E.cart.appendChild(row);
  }
  updateSummary();
}

function updateSummary() {
  const items = [...cart.values()].filter(item => Number(item.move) > 0);
  const qty = items.reduce((sum, item) => sum + Number(item.move), 0);
  E.cartSummary.textContent = `${items.length} รายการ / ${qty.toLocaleString('th-TH')} หน่วย`;
}

function requestPayload() {
  const items = [...cart.values()]
    .filter(item => Number(item.move) > 0)
    .map(item => ({ product_id: item.product_id, quantity: Number(item.move) }))
    .sort((a, b) => a.product_id.localeCompare(b.product_id));

  return {
    source: E.source.value,
    destination: E.dest.value,
    reference: E.ref.value.trim() || null,
    notes: E.notes.value.trim() || null,
    items
  };
}

function pendingKeyFor(payload) {
  const fingerprint = JSON.stringify(payload);
  if (!pendingRequest || pendingRequest.fingerprint !== fingerprint) {
    pendingRequest = {
      fingerprint,
      key: makeIdempotencyKey('transfer')
    };
  }
  return pendingRequest.key;
}

E.searchForm.onsubmit = event => {
  event.preventDefault();
  search().catch(error => message(E.searchMsg, error.message, 'error'));
};

const scanner = new MobileBarcodeScanner({
  messageElement: E.searchMsg,
  onScan: async value => {
    E.search.value = value;
    await search(value);
  }
});
E.scan.onclick = () => scanner.open();

E.source.addEventListener('change', () => {
  window.TKNInventoryWorkspace?.setBranch(E.source.selectedOptions[0]?.textContent || 'สาขาต้นทาง');
  const selected = E.source.value;
  if (cart.size && !confirm('เปลี่ยนสาขาต้นทางแล้วล้างรายการโอนเดิมหรือไม่?')) {
    E.source.value = previousSource;
    return;
  }
  previousSource = selected;
  clearCart('เปลี่ยนสาขาต้นทางแล้ว กรุณาค้นหาสินค้าใหม่');
});
E.dest.addEventListener('change', invalidatePendingRequest);
E.ref.addEventListener('input', invalidatePendingRequest);
E.notes.addEventListener('input', invalidatePendingRequest);

E.save.onclick = async () => {
  if (saving) return;
  if (E.source.value === E.dest.value) {
    return message(E.actionMsg, 'ต้นทางและปลายทางต้องต่างกัน', 'error');
  }

  const payload = requestPayload();
  if (!payload.items.length) {
    return message(E.actionMsg, 'กรุณาเพิ่มสินค้า', 'error');
  }

  const key = pendingKeyFor(payload);
  saving = true;
  E.save.disabled = true;
  message(E.actionMsg, 'กำลังสร้างเอกสารโอน...');

  try {
    const { data, error } = await supabaseClient.rpc('create_branch_transfer', {
      p_source_branch_id: payload.source,
      p_destination_branch_id: payload.destination,
      p_items: payload.items,
      p_reference_no: payload.reference,
      p_notes: payload.notes,
      p_idempotency_key: key
    });

    if (error) throw error;

    message(E.actionMsg, `สร้างใบโอน ${data.transfer_no} เรียบร้อย`, 'success-text');
    cart.clear();
    renderCart();
    E.ref.value = '';
    E.notes.value = '';
    E.results.innerHTML = '';
    pendingRequest = null;
  } catch (error) {
    message(E.actionMsg, error.message || 'สร้างใบโอนไม่สำเร็จ', 'error');
  } finally {
    saving = false;
    E.save.disabled = false;
  }
};

initialize().catch(error => {
  message(E.actionMsg, error.message, 'error');
  if (error.code !== 'INVENTORY_PERMISSION_DENIED') {
    window.TKNAuthGuard?.fail(error, () => location.reload());
  }
});
