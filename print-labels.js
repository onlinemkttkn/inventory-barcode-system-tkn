const el = {
  configWarning: document.getElementById("configWarning"),
  loginSection: document.getElementById("loginSection"),
  workspace: document.getElementById("workspace"),
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginMessage: document.getElementById("loginMessage"),
  logoutBtn: document.getElementById("logoutBtn"),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  searchMessage: document.getElementById("searchMessage"),
  searchResults: document.getElementById("searchResults"),
  paperPreset: document.getElementById("paperPreset"),
  codeMode: document.getElementById("codeMode"),
  barcodeSource: document.getElementById("barcodeSource"),
  showName: document.getElementById("showName"),
  showPrice: document.getElementById("showPrice"),
  showProductCode: document.getElementById("showProductCode"),
  showBarcodeText: document.getElementById("showBarcodeText"),
  previewBtn: document.getElementById("previewBtn"),
  printBtn: document.getElementById("printBtn"),
  downloadPngBtn: document.getElementById("downloadPngBtn"),
  sharePngBtn: document.getElementById("sharePngBtn"),
  clearBtn: document.getElementById("clearBtn"),
  actionMessage: document.getElementById("actionMessage"),
  printQueue: document.getElementById("printQueue"),
  queueSummary: document.getElementById("queueSummary"),
  printSheet: document.getElementById("printSheet"),
  template: document.getElementById("queueItemTemplate"),
};

const queue = new Map();

function message(node, text, type = "") {
  node.textContent = text;
  node.className = `message ${type}`.trim();
}

function isConfigured() {
  return !SUPABASE_PUBLISHABLE_KEY.includes("ใส่_") &&
         SUPABASE_URL.startsWith("https://");
}

async function init() {
  if (!isConfigured()) {
    el.configWarning.textContent =
      "กรุณาใส่ Publishable Key ในไฟล์ js/supabase-config.js";
    el.configWarning.classList.remove("hidden");
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  renderSession(Boolean(session));

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    renderSession(Boolean(session));
  });
}

function renderSession(loggedIn) {
  el.loginSection.classList.toggle("hidden", loggedIn);
  el.workspace.classList.toggle("hidden", !loggedIn);
  el.logoutBtn.classList.toggle("hidden", !loggedIn);
  if (loggedIn) el.searchInput.focus();
}

el.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  message(el.loginMessage, "กำลังเข้าสู่ระบบ...");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: el.email.value.trim(),
    password: el.password.value,
  });

  if (error) {
    message(el.loginMessage, error.message, "error");
    return;
  }

  el.password.value = "";
  message(el.loginMessage, "");
});

el.logoutBtn.addEventListener("click", () => supabaseClient.auth.signOut());

el.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = el.searchInput.value.trim();

  if (!query) {
    message(el.searchMessage, "กรุณากรอกคำค้นหา", "error");
    return;
  }

  message(el.searchMessage, "กำลังค้นหา...");
  el.searchResults.innerHTML = "";

  const clean = query.replace(/[,%()]/g, "");
  const { data, error } = await supabaseClient
    .from("product_list")
    .select("id,product_code,barcode,name,selling_price,quantity,category_code,category_name,unit_name,is_active")
    .or(`name.ilike.%${clean}%,product_code.ilike.%${clean}%,barcode.eq.${clean}`)
    .eq("is_active", true)
    .order("name")
    .limit(30);

  if (error) {
    message(el.searchMessage, error.message, "error");
    return;
  }

  if (!data?.length) {
    message(el.searchMessage, "ไม่พบสินค้า", "error");
    return;
  }

  message(el.searchMessage, `พบ ${data.length} รายการ`, "success");

  data.forEach((product) => {
    const card = document.createElement("article");
    card.className = "result-card";

    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = product.name;
    const detail = document.createElement("small");
    detail.textContent =
      `${product.product_code || "-"} • ${product.barcode || "ไม่มีบาร์โค้ด"} • ฿${Number(product.selling_price || 0).toLocaleString("th-TH")}`;
    info.append(name, detail);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn primary";
    button.textContent = queue.has(product.id) ? "เพิ่มอีก 1" : "เพิ่ม";
    button.addEventListener("click", () => addProduct(product));

    card.append(info, button);
    el.searchResults.appendChild(card);
  });
});

function addProduct(product) {
  const existing = queue.get(product.id);
  if (existing) {
    existing.copies += 1;
  } else {
    queue.set(product.id, { product, copies: 1 });
  }
  renderQueue();
  renderLabels();
}

function renderQueue() {
  el.printQueue.innerHTML = "";

  let copies = 0;
  queue.forEach(({ product, copies: qty }, id) => {
    copies += qty;
    const node = el.template.content.cloneNode(true);
    node.querySelector(".queue-name").textContent = product.name;
    node.querySelector(".queue-detail").textContent =
      `${product.product_code || "-"} • ${product.barcode || "ไม่มีบาร์โค้ด"}`;

    const input = node.querySelector(".copy-input");
    input.value = qty;
    input.addEventListener("change", () => {
      const next = Math.max(1, Math.min(999, Number(input.value || 1)));
      queue.get(id).copies = next;
      input.value = next;
      renderQueueSummary();
      renderLabels();
    });

    node.querySelector(".remove-btn").addEventListener("click", () => {
      queue.delete(id);
      renderQueue();
      renderLabels();
    });

    el.printQueue.appendChild(node);
  });

  renderQueueSummary(copies);
}

function renderQueueSummary(copiesArg) {
  const copies = copiesArg ?? [...queue.values()]
    .reduce((sum, item) => sum + item.copies, 0);
  el.queueSummary.textContent =
    queue.size ? `${queue.size} สินค้า รวม ${copies} ป้าย` : "ยังไม่มีสินค้า";
}

function getBarcodeValue(product) {
  return el.barcodeSource.value === "product_code"
    ? product.product_code
    : product.barcode;
}

function renderLabels() {
  el.printSheet.innerHTML = "";
  el.printSheet.className = `print-sheet preset-${el.paperPreset.value}`;

  if (!queue.size) {
    message(el.actionMessage, "กรุณาเพิ่มสินค้าในรายการรอพิมพ์", "error");
    return;
  }

  for (const { product, copies } of queue.values()) {
    for (let copy = 0; copy < copies; copy += 1) {
      el.printSheet.appendChild(createLabel(product));
    }
  }

  message(el.actionMessage, "สร้างตัวอย่างเรียบร้อย", "success");
}

function createLabel(product) {
  const label = document.createElement("article");
  label.className = "product-label";

  if (el.showName.checked) {
    const name = document.createElement("div");
    name.className = "label-name";
    name.textContent = product.name;
    label.appendChild(name);
  }

  if (el.showPrice.checked) {
    const price = document.createElement("div");
    price.className = "label-price";
    price.textContent = new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
      minimumFractionDigits: 2,
    }).format(Number(product.selling_price || 0));
    label.appendChild(price);
  }

  const codeMode = el.codeMode.value;
  const codeRow = document.createElement("div");
  codeRow.className = "codes-row";

  if (codeMode === "barcode" || codeMode === "both") {
    const value = getBarcodeValue(product);
    if (value) {
      const holder = document.createElement("div");
      holder.className = "barcode-holder";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      holder.appendChild(svg);
      codeRow.appendChild(holder);

      requestAnimationFrame(() => {
        try {
          JsBarcode(svg, value, {
            format: "CODE128",
            displayValue: el.showBarcodeText.checked,
            width: el.paperPreset.value.includes("40x30") ? 1 : 1.45,
            height: el.paperPreset.value.startsWith("a4") ? 28 : 42,
            margin: 0,
            fontSize: 10,
            background: "#ffffff",
            lineColor: "#000000",
          });
        } catch (error) {
          holder.textContent = "Barcode error";
        }
      });
    }
  }

  if (codeMode === "qr" || codeMode === "both") {
    const value = product.barcode || product.product_code;
    if (value) {
      const holder = document.createElement("div");
      holder.className = "qr-holder";
      codeRow.appendChild(holder);

      requestAnimationFrame(() => {
        new QRCode(holder, {
          text: value,
          width: el.paperPreset.value.includes("40x30") ? 50 : 72,
          height: el.paperPreset.value.includes("40x30") ? 50 : 72,
          correctLevel: QRCode.CorrectLevel.M,
        });
      });
    }
  }

  label.appendChild(codeRow);

  if (el.showProductCode.checked) {
    const code = document.createElement("div");
    code.className = "label-product-code";
    code.textContent = product.product_code || "";
    label.appendChild(code);
  }

  return label;
}

el.previewBtn.addEventListener("click", renderLabels);

el.printBtn.addEventListener("click", () => {
  if (!queue.size) {
    message(el.actionMessage, "ไม่มีรายการสำหรับพิมพ์", "error");
    return;
  }
  renderLabels();
  setTimeout(() => window.print(), 300);
});

el.clearBtn.addEventListener("click", () => {
  queue.clear();
  renderQueue();
  el.printSheet.innerHTML = "";
  message(el.actionMessage, "ล้างรายการแล้ว", "success");
});

[
  el.paperPreset,
  el.codeMode,
  el.barcodeSource,
  el.showName,
  el.showPrice,
  el.showProductCode,
  el.showBarcodeText,
].forEach((node) => node.addEventListener("change", () => {
  if (queue.size) renderLabels();
}));

init();


async function renderPrintSheetToBlob() {
  if (!el.printSheet.children.length) {
    message(el.actionMessage, "กรุณาสร้างตัวอย่างป้ายก่อน", "error");
    return null;
  }

  const canvas = await html2canvas(el.printSheet, {
    backgroundColor: "#ffffff",
    scale: 3,
    useCORS: true
  });

  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
}

async function downloadPrintSheetPng() {
  try {
    const blob = await renderPrintSheetToBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `labels-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    message(el.actionMessage, "ดาวน์โหลด PNG เรียบร้อย", "success");
  } catch (error) {
    console.error(error);
    message(el.actionMessage, `สร้าง PNG ไม่สำเร็จ: ${error.message}`, "error");
  }
}

async function sharePrintSheetPng() {
  try {
    const blob = await renderPrintSheetToBlob();
    if (!blob) return;

    const file = new File([blob], `labels-${Date.now()}.png`, {
      type: "image/png"
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "ป้ายสินค้า",
        text: "เปิดไฟล์นี้ในแอปเครื่องพิมพ์ เช่น PeriPage",
        files: [file]
      });
      message(el.actionMessage, "เปิดเมนูแชร์แล้ว", "success");
    } else {
      await downloadPrintSheetPng();
      message(
        el.actionMessage,
        "อุปกรณ์นี้ไม่รองรับการแชร์ไฟล์โดยตรง ระบบดาวน์โหลด PNG ให้แทน",
        "success"
      );
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(error);
      message(el.actionMessage, `แชร์ไฟล์ไม่สำเร็จ: ${error.message}`, "error");
    }
  }
}

el.downloadPngBtn?.addEventListener("click", downloadPrintSheetPng);
el.sharePngBtn?.addEventListener("click", sharePrintSheetPng);
