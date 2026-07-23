import { MobileBarcodeScanner } from './mobile-scanner.js';

const issueCart = new Map();

const el = {
  requesterName: document.getElementById("requesterName"),
  department: document.getElementById("department"),
  referenceNo: document.getElementById("referenceNo"),
  notes: document.getElementById("notes"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  results: document.getElementById("results"),
  searchMessage: document.getElementById("searchMessage"),
  cartList: document.getElementById("cartList"),
  totalLines: document.getElementById("totalLines"),
  totalQty: document.getElementById("totalQty"),
  saveBtn: document.getElementById("saveBtn"),
  actionMessage: document.getElementById("actionMessage"),
  scanBtn: document.getElementById("scanBtn"),
};

el.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const q = el.searchInput.value.trim();
  if (!q) return showMessage(el.searchMessage, "กรุณากรอกคำค้นหา", "error");

  try {
    showMessage(el.searchMessage, "กำลังค้นหา...");
    const products = await findProducts(q);
    renderResults(products);
    showMessage(el.searchMessage, products.length ? `พบ ${products.length} รายการ` : "ไม่พบสินค้า");
  } catch (error) {
    showMessage(el.searchMessage, error.message, "error");
  }
});

function renderResults(products) {
  el.results.innerHTML = "";
  products.forEach((product) => {
    const row = document.createElement("div");
    row.className = "result-item";

    const info = document.createElement("div");
    info.innerHTML = `<strong>${escapeHtml(product.name)}</strong>
      <small>${escapeHtml(product.product_code)} • คงเหลือ ${formatNumber(product.quantity)} ${escapeHtml(product.unit_name || "")}</small>`;

    const button = document.createElement("button");
    button.className = "btn primary";
    button.type = "button";
    button.textContent = "เพิ่ม";
    button.disabled = Number(product.quantity) <= 0;
    button.addEventListener("click", () => addToCart(product));

    row.append(info, button);
    el.results.appendChild(row);
  });
}

function addToCart(product) {
  const existing = issueCart.get(product.id);
  const nextQty = existing ? existing.quantityToMove + 1 : 1;

  if (nextQty > Number(product.quantity)) {
    return showMessage(el.actionMessage, `สินค้า ${product.name} มีคงเหลือไม่เพียงพอ`, "error");
  }

  issueCart.set(product.id, { ...product, quantityToMove: nextQty });
  renderCart();
}

function renderCart() {
  el.cartList.innerHTML = "";

  for (const product of issueCart.values()) {
    const row = document.createElement("div");
    row.className = "cart-item";

    const info = document.createElement("div");
    info.innerHTML = `<strong>${escapeHtml(product.name)}</strong>
      <small>${escapeHtml(product.product_code)} • คงเหลือ ${formatNumber(product.quantity)}</small>`;

    const qty = document.createElement("div");
    qty.className = "qty-box";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.001";
    input.max = product.quantity;
    input.step = "0.001";
    input.value = product.quantityToMove;
    input.addEventListener("change", () => {
      const value = Number(input.value) || 0;
      if (value > Number(product.quantity)) {
        input.value = product.quantity;
        product.quantityToMove = Number(product.quantity);
        showMessage(el.actionMessage, "จำนวนเบิกเกินยอดคงเหลือ ระบบปรับเป็นยอดสูงสุดให้แล้ว", "error");
      } else {
        product.quantityToMove = Math.max(value, 0);
      }
      renderTotals();
    });

    const remove = document.createElement("button");
    remove.className = "btn danger";
    remove.type = "button";
    remove.textContent = "ลบ";
    remove.addEventListener("click", () => {
      issueCart.delete(product.id);
      renderCart();
    });

    qty.append(input, remove);
    row.append(info, qty);
    el.cartList.appendChild(row);
  }

  renderTotals();
}

function renderTotals() {
  const items = [...issueCart.values()].filter((p) => p.quantityToMove > 0);
  el.totalLines.textContent = items.length;
  el.totalQty.textContent = formatNumber(items.reduce((sum, p) => sum + Number(p.quantityToMove), 0));
}

el.saveBtn.addEventListener("click", async () => {
  if (!el.requesterName.value.trim()) {
    return showMessage(el.actionMessage, "กรุณาระบุชื่อผู้เบิก", "error");
  }

  const items = [...issueCart.values()]
    .filter((p) => Number(p.quantityToMove) > 0)
    .map((p) => ({
      product_id: p.id,
      quantity: Number(p.quantityToMove),
      note: ""
    }));

  if (!items.length) return showMessage(el.actionMessage, "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ", "error");

  el.saveBtn.disabled = true;
  showMessage(el.actionMessage, "กำลังบันทึกการเบิก...");

  const { data, error } = await supabaseClient.rpc("issue_inventory", {
    p_items: items,
    p_requester_name: el.requesterName.value.trim(),
    p_department: el.department.value.trim() || null,
    p_reference_no: el.referenceNo.value.trim() || null,
    p_notes: el.notes.value.trim() || null
  });

  el.saveBtn.disabled = false;

  if (error) return showMessage(el.actionMessage, error.message, "error");

  showMessage(el.actionMessage, `บันทึกสำเร็จ เลขเอกสาร ${data.document_no}`, "success-text");
  issueCart.clear();
  renderCart();
  el.referenceNo.value = "";
  el.notes.value = "";
});

requireActiveSession();
renderCart();


const issueScanner = new MobileBarcodeScanner({
  messageElement: el.searchMessage,
  onScan: async (value) => {
    el.searchInput.value = value;
    try {
      const products = await findProducts(value);
      renderResults(products);
      showMessage(
        el.searchMessage,
        products.length ? `พบ ${products.length} รายการ` : 'ไม่พบสินค้า'
      );
      if (products.length === 1) addToCart(products[0]);
    } catch (error) {
      showMessage(el.searchMessage, error.message, 'error');
    }
  }
});

el.scanBtn?.addEventListener('click', () => issueScanner.open());
