import { MobileBarcodeScanner } from './mobile-scanner.js';
import {
  createIdempotencyKey,
  findBranchProducts,
  loadActiveBranches,
  loadInventoryAccess,
  populateBranchSelect,
  rememberInventoryBranch,
  selectedBranchLabel,
} from './inventory-branch-common.js?v=3.6.11';

const receiveCart = new Map();
let pageReady = false;
let saving = false;
let previousBranchId = '';
let pendingIdempotencyKey = null;

const el = {
  branch: document.getElementById('branch'),
  supplierName: document.getElementById('supplierName'),
  referenceNo: document.getElementById('referenceNo'),
  notes: document.getElementById('notes'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  scanBtn: document.getElementById('scanBtn'),
  results: document.getElementById('results'),
  searchMessage: document.getElementById('searchMessage'),
  cartList: document.getElementById('cartList'),
  totalLines: document.getElementById('totalLines'),
  totalQty: document.getElementById('totalQty'),
  saveBtn: document.getElementById('saveBtn'),
  actionMessage: document.getElementById('actionMessage'),
};

function resetPendingRequest() {
  pendingIdempotencyKey = null;
}

function setPageControls(enabled) {
  pageReady = enabled;
  el.branch.disabled = !enabled;
  el.searchInput.disabled = !enabled;
  el.scanBtn.disabled = !enabled;
  el.searchForm.querySelector('button[type="submit"]').disabled = !enabled;
  updateSaveButton();
}

function updateSaveButton() {
  const hasItems = [...receiveCart.values()]
    .some((product) => Number(product.quantityToMove) > 0);
  el.saveBtn.disabled = !pageReady || saving || !hasItems;
}

async function searchProducts(query = el.searchInput.value, autoAddSingle = false) {
  const q = String(query || '').trim();

  if (!el.branch.value) {
    return showMessage(el.searchMessage, 'กรุณาเลือกสาขารับสินค้า', 'error');
  }

  if (!q) {
    return showMessage(el.searchMessage, 'กรุณากรอกหรือสแกนสินค้า', 'error');
  }

  try {
    showMessage(el.searchMessage, 'กำลังค้นหา...');
    const products = await findBranchProducts(el.branch.value, q);
    renderResults(products);
    showMessage(
      el.searchMessage,
      products.length
        ? `พบ ${products.length} รายการใน ${selectedBranchLabel(el.branch)}`
        : `ไม่พบสินค้าใน ${selectedBranchLabel(el.branch)}`,
      products.length ? '' : 'error'
    );

    if (autoAddSingle && products.length === 1) addToCart(products[0]);
  } catch (error) {
    showMessage(el.searchMessage, error.message, 'error');
  }
}

function renderResults(products) {
  el.results.innerHTML = '';

  products.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'result-item';

    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(product.name)}</strong>
      <small>${escapeHtml(product.product_code)} • ${escapeHtml(product.barcode || 'ไม่มีบาร์โค้ด')} • คงเหลือสาขานี้ ${formatNumber(product.quantity)} ${escapeHtml(product.unit_name || '')}</small>`;

    const button = document.createElement('button');
    button.className = 'btn primary';
    button.type = 'button';
    button.textContent = 'เพิ่ม';
    button.addEventListener('click', () => addToCart(product));

    row.append(info, button);
    el.results.appendChild(row);
  });
}

function addToCart(product) {
  const existing = receiveCart.get(product.id);

  receiveCart.set(product.id, {
    ...product,
    quantityToMove: existing ? existing.quantityToMove + 1 : 1,
  });

  resetPendingRequest();
  renderCart();
}

function renderCart() {
  el.cartList.innerHTML = '';

  for (const product of receiveCart.values()) {
    const row = document.createElement('div');
    row.className = 'cart-item';

    const info = document.createElement('div');
    info.innerHTML = `<strong>${escapeHtml(product.name)}</strong>
      <small>${escapeHtml(product.product_code)} • คงเหลือสาขานี้ ${formatNumber(product.quantity)} ${escapeHtml(product.unit_name || '')}</small>`;

    const qty = document.createElement('div');
    qty.className = 'qty-box';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.001';
    input.step = '0.001';
    input.value = product.quantityToMove;

    const updateQuantity = () => {
      const value = Number(input.value);
      product.quantityToMove = Number.isFinite(value) && value > 0 ? value : 0;
      resetPendingRequest();
      renderTotals();
    };

    input.addEventListener('input', updateQuantity);
    input.addEventListener('change', updateQuantity);

    const remove = document.createElement('button');
    remove.className = 'btn danger';
    remove.type = 'button';
    remove.textContent = 'ลบ';
    remove.addEventListener('click', () => {
      receiveCart.delete(product.id);
      resetPendingRequest();
      renderCart();
    });

    qty.append(input, remove);
    row.append(info, qty);
    el.cartList.appendChild(row);
  }

  renderTotals();
}

function renderTotals() {
  const items = [...receiveCart.values()]
    .filter((product) => Number(product.quantityToMove) > 0);

  el.totalLines.textContent = items.length;
  el.totalQty.textContent = formatNumber(
    items.reduce((sum, product) => sum + Number(product.quantityToMove), 0)
  );
  updateSaveButton();
}

function clearBranchWork() {
  receiveCart.clear();
  el.results.innerHTML = '';
  el.searchInput.value = '';
  resetPendingRequest();
  renderCart();
  showMessage(el.searchMessage, '');
  showMessage(el.actionMessage, '');
}

el.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await searchProducts();
});

const receiveScanner = new MobileBarcodeScanner({
  messageElement: el.searchMessage,
  onScan: async (value) => {
    el.searchInput.value = value;
    await searchProducts(value, true);
  },
});

el.scanBtn.addEventListener('click', () => receiveScanner.open());

el.branch.addEventListener('change', () => {
  if (receiveCart.size > 0) {
    const confirmed = confirm('เมื่อเปลี่ยนสาขา รายการรับเข้าที่เพิ่มไว้จะถูกล้าง ต้องการเปลี่ยนสาขาหรือไม่?');
    if (!confirmed) {
      el.branch.value = previousBranchId;
      return;
    }
  }

  previousBranchId = el.branch.value;
  rememberInventoryBranch(previousBranchId, selectedBranchLabel(el.branch));
  clearBranchWork();
  showMessage(el.actionMessage, `เลือก ${selectedBranchLabel(el.branch)} แล้ว`);
});

for (const field of [el.supplierName, el.referenceNo, el.notes]) {
  field.addEventListener('input', resetPendingRequest);
}

el.saveBtn.addEventListener('click', async () => {
  if (saving) return;

  if (!el.branch.value) {
    return showMessage(el.actionMessage, 'กรุณาเลือกสาขารับสินค้า', 'error');
  }

  const items = [...receiveCart.values()]
    .filter((product) => Number(product.quantityToMove) > 0)
    .map((product) => ({
      product_id: product.id,
      quantity: Number(product.quantityToMove),
      note: '',
    }));

  if (!items.length) {
    return showMessage(el.actionMessage, 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'error');
  }

  pendingIdempotencyKey ||= createIdempotencyKey('receive');
  saving = true;
  updateSaveButton();
  showMessage(el.actionMessage, `กำลังบันทึกรับสินค้าเข้า ${selectedBranchLabel(el.branch)}...`);

  try {
    const { data, error } = await supabaseClient.rpc('receive_branch_inventory', {
      p_branch_id: el.branch.value,
      p_items: items,
      p_supplier_name: el.supplierName.value.trim() || null,
      p_reference_no: el.referenceNo.value.trim() || null,
      p_notes: el.notes.value.trim() || null,
      p_idempotency_key: pendingIdempotencyKey,
    });

    if (error) throw error;

    showMessage(
      el.actionMessage,
      `บันทึกสำเร็จ เลขเอกสาร ${data.document_no} • ${selectedBranchLabel(el.branch)}`,
      'success-text'
    );

    receiveCart.clear();
    el.results.innerHTML = '';
    el.searchInput.value = '';
    el.referenceNo.value = '';
    el.notes.value = '';
    pendingIdempotencyKey = null;
    renderCart();
    el.searchInput.focus();
  } catch (error) {
    showMessage(
      el.actionMessage,
      `${error.message} — กดบันทึกซ้ำได้ ระบบจะใช้เลขคำขอเดิมเพื่อป้องกันรายการซ้ำ`,
      'error'
    );
  } finally {
    saving = false;
    updateSaveButton();
  }
});

async function init() {
  setPageControls(false);
  renderCart();

  try {
    const access = await loadInventoryAccess('inventory.receive');
    if (!access) return;

    const branches = await loadActiveBranches();
    if (!branches.length) throw new Error('ไม่พบสาขาที่เปิดใช้งาน');

    previousBranchId = populateBranchSelect(el.branch, branches, access) || '';
    setPageControls(true);
    showMessage(el.actionMessage, `พร้อมรับสินค้าเข้า ${selectedBranchLabel(el.branch)}`);
    el.searchInput.focus();
    window.TKNAuthGuard?.ready();
  } catch (error) {
    showMessage(el.actionMessage, error.message, 'error');
    setPageControls(false);

    if (error.code === 'INVENTORY_PERMISSION_DENIED') return;
    window.TKNAuthGuard?.fail(error, () => location.reload());
  }
}

init();
