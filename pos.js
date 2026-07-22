"use strict";

window.goToUnifiedDashboard = function goToUnifiedDashboard() {
  window.location.assign("./dashboard.html");
};

const E = {
  branch: document.getElementById("branch"),
  payment: document.getElementById("payment"),
  customerName: document.getElementById("customerName"),
  customerPhone: document.getElementById("customerPhone"),
  searchForm: document.getElementById("searchForm"),
  search: document.getElementById("search"),
  results: document.getElementById("results"),
  searchMsg: document.getElementById("searchMsg"),
  cart: document.getElementById("cart"),
  subtotal: document.getElementById("subtotal"),
  discount: document.getElementById("discount"),
  netTotal: document.getElementById("netTotal"),
  receivedField: document.getElementById("receivedField"),
  received: document.getElementById("received"),
  change: document.getElementById("change"),
  notes: document.getElementById("notes"),
  checkout: document.getElementById("checkout"),
  actionMsg: document.getElementById("actionMsg"),
};

const cart = new Map();

// รับเงินจะตามยอดสุทธิอัตโนมัติ จนกว่าพนักงานจะกรอกยอดเอง
let receivedManuallyEdited = false;
let lastAutoReceivedValue = 0;


function msg(element, text, cssClass = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `msg ${cssClass}`.trim();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(toNumber(value));
}

async function requireSession() {
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();

  if (error) {
    msg(E.actionMsg, error.message, "error");
    return null;
  }

  if (!session) {
    location.href = "./dashboard.html";
    return null;
  }

  return session;
}

async function init() {
  const session = await requireSession();
  if (!session) return;

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("role,is_active")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_active !== true) {
    await supabaseClient.auth.signOut();
    location.replace("./dashboard.html");
    return;
  }

  const role = String(profile.role || "staff").toLowerCase();
  sessionStorage.setItem("tkn_user_role", role);

  const dashboardButton = document.getElementById("dashboardButton");
  if (dashboardButton) {
    const canSeeDashboard = ["owner", "admin", "secretary"].includes(role);
    dashboardButton.hidden = !canSeeDashboard;
  }

  const { data, error } = await supabaseClient
    .from("branches")
    .select("id,code,name")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    msg(E.actionMsg, error.message, "error");
    return;
  }

  E.branch.innerHTML = (data || [])
    .map(
      (branch) =>
        `<option value="${branch.id}">${esc(branch.code)} — ${esc(
          branch.name
        )}</option>`
    )
    .join("");

  renderCart();
  E.search.focus();
}

E.branch.addEventListener("change", () => {
  cart.clear();
  renderCart();
  E.results.innerHTML = "";
  msg(E.searchMsg, "");
});

E.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const keyword = E.search.value.trim().replace(/[%_,()]/g, "");

  if (!keyword) {
    msg(E.searchMsg, "กรุณากรอกชื่อ รหัสสินค้า หรือบาร์โค้ด", "error");
    return;
  }

  msg(E.searchMsg, "กำลังค้นหา...");

  const { data: inventoryRows, error: inventoryError } =
    await supabaseClient
      .from("branch_inventory_list")
      .select("*")
      .eq("branch_id", E.branch.value)
      .gt("quantity", 0)
      .or(
        `product_name.ilike.%${keyword}%,product_code.ilike.%${keyword}%,barcode.eq.${keyword}`
      )
      .limit(20);

  if (inventoryError) {
    msg(E.searchMsg, inventoryError.message, "error");
    return;
  }

  const rows = inventoryRows || [];

  if (!rows.length) {
    E.results.innerHTML = "";
    msg(E.searchMsg, "ไม่พบสินค้า หรือสินค้าหมดสต๊อก", "error");
    return;
  }

  /*
   * ดึงราคาจาก products โดยตรง
   * เพราะ branch_inventory_list บางเวอร์ชันไม่มี selling_price
   */
  const productIds = [...new Set(rows.map((row) => row.product_id))];

  const { data: productRows, error: productError } =
    await supabaseClient
      .from("products")
      .select("id,selling_price,cost_price,is_active")
      .in("id", productIds);

  if (productError) {
    msg(E.searchMsg, productError.message, "error");
    return;
  }

  const priceMap = new Map(
    (productRows || []).map((product) => [
      product.id,
      {
        sellingPrice: toNumber(product.selling_price),
        costPrice: toNumber(product.cost_price),
        isActive: product.is_active,
      },
    ])
  );

  const products = rows
    .map((row) => {
      const price = priceMap.get(row.product_id) || {};

      return {
        productId: row.product_id,
        productCode: row.product_code,
        productName: row.product_name,
        barcode: row.barcode,
        stockQuantity: toNumber(row.quantity),
        minimumStock: toNumber(row.minimum_stock),
        unitName: row.unit_name || "",
        sellingPrice: toNumber(
          row.selling_price,
          toNumber(price.sellingPrice)
        ),
        costPrice: toNumber(row.cost_price, toNumber(price.costPrice)),
        isActive: price.isActive !== false,
      };
    })
    .filter((product) => product.isActive);

  E.results.innerHTML = "";

  products.forEach((product) => {
    const row = document.createElement("div");
    row.className = "item";

    const info = document.createElement("div");
    info.innerHTML = `
      <b>${esc(product.productName)}</b>
      <small>
        ${esc(product.productCode)}
        • คงเหลือ ${product.stockQuantity.toLocaleString("th-TH")}
        • ราคา ${money(product.sellingPrice)}
      </small>
    `;

    const addButton = document.createElement("button");
    addButton.className = "btn primary";
    addButton.type = "button";
    addButton.textContent = "เพิ่ม";
    addButton.addEventListener("click", () => addProduct(product));

    row.append(info, addButton);
    E.results.appendChild(row);
  });

  /*
   * เมื่อยิงบาร์โค้ดแล้วพบสินค้าเพียงรายการเดียว
   * ให้เพิ่มเข้าตะกร้าอัตโนมัติ
   */
  if (products.length === 1) {
    addProduct(products[0]);
    E.search.value = "";
    E.search.focus();
  }

  msg(E.searchMsg, `พบ ${products.length} รายการ`);
});

function addProduct(product) {
  if (product.sellingPrice <= 0) {
    msg(
      E.actionMsg,
      `สินค้า ${product.productName} ยังไม่ได้กำหนดราคาขาย`,
      "error"
    );
    return;
  }

  const existing = cart.get(product.productId);
  const nextCartQuantity = existing
    ? existing.cartQuantity + 1
    : 1;

  if (nextCartQuantity > product.stockQuantity) {
    msg(E.actionMsg, "จำนวนในตะกร้าเกินสต๊อก", "error");
    return;
  }

  if (existing) {
    existing.cartQuantity = nextCartQuantity;
  } else {
    cart.set(product.productId, {
      ...product,
      cartQuantity: 1,
      unitPrice: product.sellingPrice,
      lineDiscount: 0,
    });
  }

  msg(E.actionMsg, "");
  renderCart();
}

function renderCart() {
  E.cart.innerHTML = "";

  if (!cart.size) {
    E.cart.innerHTML =
      '<div class="item"><small>ยังไม่มีสินค้าในตะกร้า</small></div>';
    updateTotals();
    return;
  }

  for (const item of cart.values()) {
    const row = document.createElement("div");
    row.className = "item";

    const info = document.createElement("div");
    info.innerHTML = `
      <b>${esc(item.productName)}</b>
      <small>
        ${esc(item.productCode)}
        • สต๊อก ${item.stockQuantity.toLocaleString("th-TH")}
        • ${money(item.unitPrice)} / หน่วย
      </small>
    `;

    const controls = document.createElement("div");
    controls.className = "row";

    const quantityInput = document.createElement("input");
    quantityInput.className = "qty";
    quantityInput.type = "number";
    quantityInput.min = "0.001";
    quantityInput.max = String(item.stockQuantity);
    quantityInput.step = "0.001";
    quantityInput.value = String(item.cartQuantity);
    quantityInput.title = "จำนวนขาย";

    quantityInput.addEventListener("input", () => {
      let value = toNumber(quantityInput.value);

      if (value > item.stockQuantity) {
        value = item.stockQuantity;
        quantityInput.value = String(value);
        msg(E.actionMsg, "จำนวนขายเกินสต๊อก ระบบปรับให้เท่าสต๊อก", "error");
      }

      item.cartQuantity = Math.max(value, 0);

      if (item.cartQuantity <= 0) {
        cart.delete(item.productId);
        renderCart();
        return;
      }

      updateTotals();
    });

    const priceInput = document.createElement("input");
    priceInput.className = "price";
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.value = String(item.unitPrice);
    priceInput.title = "ราคาขาย";

    priceInput.addEventListener("input", () => {
      item.unitPrice = Math.max(
        toNumber(priceInput.value),
        0
      );
      updateTotals();
    });

    const removeButton = document.createElement("button");
    removeButton.className = "btn danger";
    removeButton.type = "button";
    removeButton.textContent = "ลบ";

    removeButton.addEventListener("click", () => {
      cart.delete(item.productId);
      renderCart();
    });

    controls.append(quantityInput, priceInput, removeButton);
    row.append(info, controls);
    E.cart.appendChild(row);
  }

  updateTotals();
}

function subtotalValue() {
  return [...cart.values()].reduce((sum, item) => {
    const lineTotal =
      item.cartQuantity * item.unitPrice -
      toNumber(item.lineDiscount);

    return sum + Math.max(lineTotal, 0);
  }, 0);
}

function discountValue() {
  return Math.max(toNumber(E.discount.value), 0);
}

function netValue() {
  return Math.max(subtotalValue() - discountValue(), 0);
}

function updateTotals() {
  const subtotal = subtotalValue();
  const net = netValue();
  const isCash = E.payment.value === "CASH";

  E.subtotal.textContent = money(subtotal);
  E.netTotal.textContent = money(net);
  E.receivedField.style.display = isCash ? "grid" : "none";

  if (isCash && !receivedManuallyEdited) {
    E.received.value = net > 0 ? String(net) : "0";
    lastAutoReceivedValue = net;
  }

  const received = isCash
    ? Math.max(toNumber(E.received.value), 0)
    : net;

  E.change.textContent = money(
    isCash ? Math.max(received - net, 0) : 0
  );
}

E.discount.addEventListener("input", () => {
  // ถ้ายอดรับเงินยังเป็นค่าที่ระบบเติมให้ ให้ตามยอดสุทธิต่อไป
  if (
    Math.abs(toNumber(E.received.value) - lastAutoReceivedValue) < 0.0001
  ) {
    receivedManuallyEdited = false;
  }
  updateTotals();
});

E.received.addEventListener("input", () => {
  receivedManuallyEdited = true;
  updateTotals();
});

E.payment.addEventListener("change", () => {
  receivedManuallyEdited = false;
  updateTotals();
});

E.checkout.addEventListener("click", async () => {
  const items = [...cart.values()]
    .filter((item) => item.cartQuantity > 0)
    .map((item) => ({
      product_id: item.productId,
      quantity: item.cartQuantity,
      unit_price: item.unitPrice,
      discount_amount: toNumber(item.lineDiscount),
    }));

  if (!items.length) {
    msg(E.actionMsg, "กรุณาเพิ่มสินค้า", "error");
    return;
  }

  if (
    [...cart.values()].some(
      (item) => item.unitPrice <= 0
    )
  ) {
    msg(
      E.actionMsg,
      "มีสินค้าที่ยังไม่ได้กำหนดราคาขาย",
      "error"
    );
    return;
  }

  const net = netValue();

  if (
    E.payment.value === "CASH" &&
    toNumber(E.received.value) < net
  ) {
    msg(
      E.actionMsg,
      "จำนวนเงินรับน้อยกว่ายอดสุทธิ",
      "error"
    );
    return;
  }

  if (
    !confirm(
      `ยืนยันขายสินค้า ${items.length} รายการ ยอดสุทธิ ${money(net)} ?`
    )
  ) {
    return;
  }

  E.checkout.disabled = true;
  msg(E.actionMsg, "กำลังบันทึกการขาย...");

  try {
    const { data, error } = await supabaseClient.rpc(
      "create_pos_sale",
      {
        p_branch_id: E.branch.value,
        p_items: items,
        p_discount_amount: discountValue(),
        p_payment_method: E.payment.value,
        p_received_amount:
          E.payment.value === "CASH"
            ? toNumber(E.received.value)
            : net,
        p_customer_name:
          E.customerName.value.trim() || null,
        p_customer_phone:
          E.customerPhone.value.trim() || null,
        p_notes: E.notes.value.trim() || null,
      }
    );

    if (error) {
      msg(E.actionMsg, error.message, "error");
      return;
    }

    msg(
      E.actionMsg,
      `ขายสำเร็จ เลขที่ ${data.sale_no} • เงินทอน ${money(
        data.change_amount
      )}`,
      "ok"
    );

    cart.clear();
    E.discount.value = "0";
    E.received.value = "0";
    receivedManuallyEdited = false;
    lastAutoReceivedValue = 0;
    E.customerName.value = "";
    E.customerPhone.value = "";
    E.notes.value = "";
    E.results.innerHTML = "";

    renderCart();
    E.search.focus();

    /*
     * เปิดใบเสร็จหลังขายสำเร็จ
     */
    setTimeout(() => {
      location.href = `./receipt.html?sale_no=${encodeURIComponent(
        data.sale_no
      )}`;
    }, 800);
  } catch (error) {
    console.error("Checkout error:", error);
    msg(
      E.actionMsg,
      `บันทึกการขายไม่สำเร็จ: ${error.message}`,
      "error"
    );
  } finally {
    E.checkout.disabled = false;
  }
});



init();
