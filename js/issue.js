import { MobileBarcodeScanner } from './mobile-scanner.js';
import {
  createIdempotencyKey,
  findBranchProducts,
  loadActiveBranches,
  loadInventoryAccess,
  populateBranchSelect,
  rememberInventoryBranch,
  selectedBranchLabel,
} from './inventory-branch-common.js';

const issueCart = new Map();
let pageReady = false;
let saving = false;
let previousBranchId = '';
let pendingIdempotencyKey = null;

const el = {
  branch: document.getElementById('branch'),
  requesterName: document.getElementById('requesterName'),
  department: document.getElementById('department'),
  referenceNo: document.getElementById('referenceNo'),
  notes: document.getElementById('notes'),
  searchForm: document.getElementById('searchForm'),
  searchInput: document.getElementById('searchInput'),
  results: document.getElementById('results'),
  searchMessage: document.getElementById('searchMessage'),
  cartList: document.getElementById('cartList'),
  totalLines: document.getElementById('totalLines'),
  totalQty: document.getElementById('totalQty'),
  saveBtn: document.getElementById('saveBtn'),
  actionMessage: document.getElementById('actionMessage'),
  scanBtn: document.getElementById('scanBtn'),
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
  const hasItems = [...issueCart.values()]
    .some((product) => Number(product.quantityToMove) > 0);
  el.saveBtn.disabled = !pageReady || saving || !hasItems;
}

async function searchProducts(query = el.searchInput.value, autoAddSingle = false) {
  const q = String(query || '').trim();

  if (!el.branch.value) {
    return showMessage(el.searchMessage, 'กรุณาเลือกสาขาที่เบิกสินค้า', 'error');
  }

  if (!q) {
    return showMessage(el.searchMessage, 'กรุณากรอกหรือสแกนสินค้า', 'error');
  }

  try {
    showMessage(el.searchMessage, 'กำลังค้นหา...');
    const products = await findBranchProducts(
      el.branch.value,
      q,
      { inStockOnly: true }
    );

    renderResults(products);
    showMessage(
      el.searchMessage,
      products.length
        ? `พบ ${products.length} รายการใน ${selectedBranchLabel(el.branch)}`
        : `ไม่พบสินค้า หรือสินค้าในสาขานี้หมดสต็อก`,
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
      <small>${escapeHtml(product.product_code)} • คงเหลือสาขานี้ ${formatNumber(product.quantity)} ${escapeHtml(product.unit_name || '')}</small>`;

    const button = document.createElement('button');
    button.className = 'btn primary';
    button.type = 'button';
    button.textContent = 'เพิ่ม';
    button.disabled = Number(product.quantity) <= 0;
    button.addEventListener('click', () => addToCart(product));

    row.append(info, button);
    el.results.appendChild(row);
  });
}

function addToCart(product) {
  const existing = issueCart.get(product.id);
  const nextQty = existing ? existing.quantityToMove + 1 : 1;

  if (nextQty > Number(product.quantity)) {
    return showMessage(
      el.actionMessage,
      `สินค้า ${product.name} ในสาขานี้มีคงเหลือไม่เพียงพอ`,
      'error'
    );
  }

  issueCart.set(product.id, { ...product, quantityToMove: nextQty });
  resetPendingRequest();
  renderCart();
}

function renderCart() {
  el.cartList.innerHTML = '';

  for (const product of issueCart.values()) {
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
    input.max = product.quantity;
    input.step = '0.001';
    input.value = product.quantityToMove;

    const updateQuantity = () => {
      const value = Number(input.value);

      if (!Number.isFinite(value) || value <= 0) {
        product.quantityToMove = 0;
      } else if (value > Number(product.quantity)) {
        input.value = product.quantity;
        product.quantityToMove = Number(product.quantity);
        showMessage(
          el.actionMessage,
          'จำนวนเบิกเกินยอดคงเหลือ ระบบปรับเป็นยอดสูงสุดให้แล้ว',
          'error'
        );
      } else {
        product.quantityToMove = value;
      }

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
      issueCart.delete(product.id);
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
  const items = [...issueCart.values()]
    .filter((product) => Number(product.quantityToMove) > 0);

  el.totalLines.textContent = items.length;
  el.totalQty.textContent = formatNumber(
    items.reduce((sum, product) => sum + Number(product.quantityToMove), 0)
  );
  updateSaveButton();
}

function clearBranchWork() {
  issueCart.clear();
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

const issueScanner = new MobileBarcodeScanner({
  messageElement: el.searchMessage,
  onScan: async (value) => {
    el.searchInput.value = value;
    await searchProducts(value, true);
  },
});

el.scanBtn.addEventListener('click', () => issueScanner.open());

el.branch.addEventListener('change', () => {
  if (issueCart.size > 0) {
    const confirmed = confirm('เมื่อเปลี่ยนสาขา รายการเบิกที่เพิ่มไว้จะถูกล้าง ต้องการเปลี่ยนสาขาหรือไม่?');
    if (!confirmed) {
      el.branch.value = previousBranchId;
      return;
    }
  }

  previousBranchId = el.branch.value;
  rememberInventoryBranch(previousBranchId);
  clearBranchWork();
  showMessage(el.actionMessage, `เลือก ${selectedBranchLabel(el.branch)} แล้ว`);
});

for (const field of [el.requesterName, el.department, el.referenceNo, el.notes]) {
  field.addEventListener('input', resetPendingRequest);
}

el.saveBtn.addEventListener('click', async () => {
  if (saving) return;

  if (!el.branch.value) {
    return showMessage(el.actionMessage, 'กรุณาเลือกสาขาที่เบิกสินค้า', 'error');
  }

  if (!el.requesterName.value.trim()) {
    return showMessage(el.actionMessage, 'กรุณาระบุชื่อผู้เบิก', 'error');
  }

  const items = [...issueCart.values()]
    .filter((product) => Number(product.quantityToMove) > 0)
    .map((product) => ({
      product_id: product.id,
      quantity: Number(product.quantityToMove),
      note: '',
    }));

  if (!items.length) {
    return showMessage(el.actionMessage, 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'error');
  }

  pendingIdempotencyKey ||= createIdempotencyKey('issue');
  saving = true;
  updateSaveButton();
  showMessage(el.actionMessage, `กำลังบันทึกการเบิกจาก ${selectedBranchLabel(el.branch)}...`);

  try {
    const { data, error } = await supabaseClient.rpc('issue_branch_inventory', {
      p_branch_id: el.branch.value,
      p_items: items,
      p_requester_name: el.requesterName.value.trim(),
      p_department: el.department.value.trim() || null,
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

    issueCart.clear();
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
    const access = await loadInventoryAccess('inventory.issue');
    if (!access) return;

    const branches = await loadActiveBranches();
    if (!branches.length) throw new Error('ไม่พบสาขาที่เปิดใช้งาน');

    previousBranchId = populateBranchSelect(el.branch, branches, access) || '';
    setPageControls(true);
    showMessage(el.actionMessage, `พร้อมเบิกสินค้าจาก ${selectedBranchLabel(el.branch)}`);
    el.requesterName.focus();
  } catch (error) {
    showMessage(el.actionMessage, error.message, 'error');
    setPageControls(false);

    if (error.code === 'INVENTORY_PERMISSION_DENIED') {
      setTimeout(() => location.replace(error.redirectTo), 1500);
    }
  }
}

init();
