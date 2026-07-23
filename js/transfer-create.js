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

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
})[char]);

function message(element, text, type='') {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

async function initialize() {
  if (!await auth()) return;
  const list = await branches();
  const options = list.map(branch =>
    `<option value="${branch.id}">${esc(branch.code)} — ${esc(branch.name)}</option>`
  ).join('');
  E.source.innerHTML = options;
  E.dest.innerHTML = options;
  if (list.length > 1) E.dest.selectedIndex = 1;
}

async function search(query = E.search.value.trim()) {
  const q = String(query || '').trim().replace(/[%_,()]/g, '');
  if (!q) return message(E.searchMsg, 'กรุณากรอกหรือสแกนสินค้า', 'error');

  const { data, error } = await supabaseClient
    .from('branch_inventory_list')
    .select('*')
    .eq('branch_id', E.source.value)
    .or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.eq.${q}`)
    .limit(20);

  if (error) return message(E.searchMsg, error.message, 'error');

  renderResults(data || []);
  message(E.searchMsg, `พบ ${(data || []).length} รายการ`);

  if ((data || []).length === 1 && query !== E.search.value.trim()) {
    add(data[0]);
  }
}

function renderResults(items) {
  E.results.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item operation-item';
    row.innerHTML = `<div><b>${esc(item.product_name)}</b>
      <small>${esc(item.product_code)} · คงเหลือ ${item.quantity}</small></div>`;
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
  renderCart();
}

function renderCart() {
  E.cart.innerHTML = '';
  for (const item of cart.values()) {
    const row = document.createElement('div');
    row.className = 'item operation-cart-item';

    const info = document.createElement('div');
    info.innerHTML = `<b>${esc(item.product_name)}</b>
      <small>${esc(item.product_code)} · คงเหลือ ${item.quantity}</small>`;

    const quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.min = '.001';
    quantity.max = item.quantity;
    quantity.step = '.001';
    quantity.inputMode = 'decimal';
    quantity.value = item.move;
    quantity.onchange = () => {
      item.move = Math.max(
        .001,
        Math.min(Number(quantity.value) || 0, Number(item.quantity))
      );
      quantity.value = item.move;
      updateSummary();
    };

    const remove = document.createElement('button');
    remove.className = 'btn danger';
    remove.type = 'button';
    remove.textContent = 'ลบ';
    remove.onclick = () => {
      cart.delete(item.product_id);
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

E.searchForm.onsubmit = event => {
  event.preventDefault();
  search();
};

const scanner = new MobileBarcodeScanner({
  messageElement: E.searchMsg,
  onScan: async value => {
    E.search.value = value;
    await search(value);
  }
});
E.scan.onclick = () => scanner.open();

E.save.onclick = async () => {
  if (E.source.value === E.dest.value) {
    return message(E.actionMsg, 'ต้นทางและปลายทางต้องต่างกัน', 'error');
  }

  const items = [...cart.values()]
    .filter(item => Number(item.move) > 0)
    .map(item => ({
      product_id: item.product_id,
      quantity: Number(item.move)
    }));

  if (!items.length) {
    return message(E.actionMsg, 'กรุณาเพิ่มสินค้า', 'error');
  }

  E.save.disabled = true;
  message(E.actionMsg, 'กำลังสร้างเอกสารโอน...');

  const { data, error } = await supabaseClient.rpc(
    'create_branch_transfer',
    {
      p_source_branch_id: E.source.value,
      p_destination_branch_id: E.dest.value,
      p_items: items,
      p_reference_no: E.ref.value.trim() || null,
      p_notes: E.notes.value.trim() || null
    }
  );

  E.save.disabled = false;
  if (error) return message(E.actionMsg, error.message, 'error');

  message(E.actionMsg, `สำเร็จ ${data.transfer_no}`, 'success-text');
  cart.clear();
  renderCart();
  E.ref.value = '';
  E.notes.value = '';
};

initialize().catch(error => message(E.actionMsg, error.message, 'error'));
