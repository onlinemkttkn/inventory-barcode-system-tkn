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
let printBusy = false;
let renderRevision = 0;

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
    window.TKNAuthGuard?.fail(
      new Error("ยังไม่ได้ตั้งค่า Supabase"),
      () => location.reload()
    );
    return;
  }

  try {
    const access = await window.TKNAuthGuard.requireAccess("inventory.view", {
      loadingText: "กำลังตรวจสอบสิทธิ์พิมพ์ป้ายสินค้า...",
    });
    if (!access) return;

    el.loginSection.classList.add("hidden");
    el.workspace.classList.remove("hidden");
    el.searchInput.focus();
    supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) return;
      window.TKNAuthGuard.clearAccessCache();
      location.replace("./dashboard.html");
    });
    window.TKNAuthGuard.ready();
  } catch (error) {
    if (error?.code === "INVENTORY_PERMISSION_DENIED") return;
    window.TKNAuthGuard?.fail(error, () => location.reload());
  }
}

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
    .from("product_management_list")
    .select("id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active")
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

const PRESET_CONFIG = Object.freeze({
  label58: { pageWidth: 58, pageHeight: 38, qrOnly: 68, qrBoth: 56, barcodeHeight: 38, barcodeBothHeight: 30, barcodeWidth: 1.25, fontSize: 9 },
  peripage57: { pageWidth: 57, pageHeight: 35, qrOnly: 58, qrBoth: 52, barcodeHeight: 34, barcodeBothHeight: 27, barcodeWidth: 1.15, fontSize: 9 },
  portable50x30: { pageWidth: 50, pageHeight: 30, qrOnly: 48, qrBoth: 38, barcodeHeight: 27, barcodeBothHeight: 22, barcodeWidth: 1.0, fontSize: 8 },
  portable40x30: { pageWidth: 40, pageHeight: 30, qrOnly: 42, qrBoth: 32, barcodeHeight: 24, barcodeBothHeight: 19, barcodeWidth: 0.85, fontSize: 7 },
  label80: { pageWidth: 80, pageHeight: 48, qrOnly: 96, qrBoth: 78, barcodeHeight: 48, barcodeBothHeight: 38, barcodeWidth: 1.55, fontSize: 11 },
  "a4-40x30": { pageWidth: 210, pageHeight: 297, qrOnly: 42, qrBoth: 32, barcodeHeight: 24, barcodeBothHeight: 18, barcodeWidth: 0.9, fontSize: 7 },
  "a4-50x30": { pageWidth: 210, pageHeight: 297, qrOnly: 46, qrBoth: 36, barcodeHeight: 27, barcodeBothHeight: 20, barcodeWidth: 1.0, fontSize: 8 },
  "a4-70x40": { pageWidth: 210, pageHeight: 297, qrOnly: 64, qrBoth: 48, barcodeHeight: 36, barcodeBothHeight: 28, barcodeWidth: 1.25, fontSize: 9 }
});

function presetConfig() {
  return PRESET_CONFIG[el.paperPreset.value] || PRESET_CONFIG.label58;
}

function updatePrintPageStyle() {
  const preset = el.paperPreset.value;
  const cfg = presetConfig();
  let style = document.getElementById("tknPrintLabelsDynamicPage");
  if (!style) {
    style = document.createElement("style");
    style.id = "tknPrintLabelsDynamicPage";
    document.head.appendChild(style);
  }

  if (preset.startsWith("a4-")) {
    style.textContent = "@page{size:A4 portrait;margin:0}";
  } else {
    style.textContent = `@page{size:${cfg.pageWidth}mm ${cfg.pageHeight}mm;margin:0}`;
  }
}

async function waitForPrintReady() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch (error) {
    console.warn("Font readiness check skipped:", error);
  }
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function buildQrSvg(model, pixelSize) {
  if (!model || typeof model.getModuleCount !== "function") {
    throw new Error("ไม่สามารถสร้าง QR Code สำหรับพิมพ์ได้");
  }

  const moduleCount = model.getModuleCount();
  const quietZone = 4;
  const viewSize = moduleCount + (quietZone * 2);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${viewSize} ${viewSize}`);
  svg.setAttribute("width", String(pixelSize));
  svg.setAttribute("height", String(pixelSize));
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-label", "QR Code");

  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("width", String(viewSize));
  bg.setAttribute("height", String(viewSize));
  bg.setAttribute("fill", "#fff");
  svg.appendChild(bg);

  let d = "";
  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!model.isDark(row, column)) continue;
      d += `M${column + quietZone} ${row + quietZone}h1v1h-1z`;
    }
  }

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#000");
  svg.appendChild(path);
  return svg;
}

function validateQueueForCurrentMode() {
  const mode = el.codeMode.value;
  const invalid = [];

  queue.forEach(({ product }) => {
    const barcodeValue = getBarcodeValue(product);
    const qrValue = product.barcode || product.product_code;
    if ((mode === "barcode" || mode === "both") && !barcodeValue) {
      invalid.push(`${product.name}: ไม่มีค่าที่ใช้สร้าง Barcode`);
    }
    if ((mode === "qr" || mode === "both") && !qrValue) {
      invalid.push(`${product.name}: ไม่มีค่าที่ใช้สร้าง QR Code`);
    }
  });

  return invalid;
}

async function renderLabels(options = {}) {
  const revision = ++renderRevision;
  el.printSheet.innerHTML = "";
  el.printSheet.className = `print-sheet preset-${el.paperPreset.value} code-mode-${el.codeMode.value}`;
  updatePrintPageStyle();

  if (!queue.size) {
    message(el.actionMessage, "กรุณาเพิ่มสินค้าในรายการรอพิมพ์", "error");
    return false;
  }

  const invalid = validateQueueForCurrentMode();
  if (invalid.length) {
    message(el.actionMessage, invalid.slice(0, 3).join(" | "), "error");
    return false;
  }

  const totalLabels = [...queue.values()].reduce((sum, item) => sum + item.copies, 0);
  if (totalLabels > 500) {
    message(el.actionMessage, "จำนวนป้ายรวมเกิน 500 ป้าย กรุณาแบ่งพิมพ์เป็นรอบ", "error");
    return false;
  }

  for (const { product, copies } of queue.values()) {
    for (let copy = 0; copy < copies; copy += 1) {
      el.printSheet.appendChild(createLabel(product));
    }
  }

  await waitForPrintReady();
  if (revision !== renderRevision) return false;

  const barcodeErrors = el.printSheet.querySelectorAll(".code-error");
  if (barcodeErrors.length) {
    message(el.actionMessage, "พบ Barcode หรือ QR Code ที่สร้างไม่สำเร็จ กรุณาตรวจข้อมูลสินค้า", "error");
    return false;
  }

  message(
    el.actionMessage,
    options.forPrint
      ? `เตรียมงานพิมพ์ครบ ${totalLabels} ป้ายแล้ว`
      : `สร้างตัวอย่างครบ ${totalLabels} ป้ายแล้ว`,
    "success"
  );
  return true;
}

function createLabel(product) {
  const cfg = presetConfig();
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
    const holder = document.createElement("div");
    holder.className = "barcode-holder";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    holder.appendChild(svg);
    codeRow.appendChild(holder);

    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: el.showBarcodeText.checked,
        width: cfg.barcodeWidth,
        height: codeMode === "both" ? cfg.barcodeBothHeight : cfg.barcodeHeight,
        margin: 0,
        fontSize: cfg.fontSize,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (error) {
      holder.classList.add("code-error");
      holder.textContent = "Barcode error";
      console.error("Barcode render failed:", error);
    }
  }

  if (codeMode === "qr" || codeMode === "both") {
    const value = product.barcode || product.product_code;
    const holder = document.createElement("div");
    holder.className = "qr-holder";
    codeRow.appendChild(holder);

    try {
      const staging = document.createElement("div");
      const qr = new QRCode(staging, {
        text: value,
        width: codeMode === "both" ? cfg.qrBoth : cfg.qrOnly,
        height: codeMode === "both" ? cfg.qrBoth : cfg.qrOnly,
        correctLevel: QRCode.CorrectLevel.M,
      });
      holder.appendChild(buildQrSvg(
        qr?._oQRCode,
        codeMode === "both" ? cfg.qrBoth : cfg.qrOnly
      ));
    } catch (error) {
      holder.classList.add("code-error");
      holder.textContent = "QR error";
      console.error("QR render failed:", error);
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

el.previewBtn.addEventListener("click", async () => {
  await renderLabels();
});

el.printBtn.addEventListener("click", async () => {
  if (printBusy) return;
  if (!queue.size) {
    message(el.actionMessage, "ไม่มีรายการสำหรับพิมพ์", "error");
    return;
  }

  printBusy = true;
  el.printBtn.disabled = true;
  try {
    const ready = await renderLabels({ forPrint: true });
    if (!ready) return;
    window.print();
  } catch (error) {
    console.error(error);
    message(el.actionMessage, `เตรียมงานพิมพ์ไม่สำเร็จ: ${error.message}`, "error");
  } finally {
    printBusy = false;
    el.printBtn.disabled = false;
  }
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
  const ready = await renderLabels();
  if (!ready || !el.printSheet.children.length) return null;

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
