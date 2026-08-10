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
  conciseName: document.getElementById("conciseName"),
  showName: document.getElementById("showName"),
  showPrice: document.getElementById("showPrice"),
  showProductCode: document.getElementById("showProductCode"),
  showBarcodeText: document.getElementById("showBarcodeText"),
  customWidth: document.getElementById("customWidth"),
  customHeight: document.getElementById("customHeight"),
  labelColumns: document.getElementById("labelColumns"),
  labelGap: document.getElementById("labelGap"),
  pageMargin: document.getElementById("pageMargin"),
  qrSize: document.getElementById("qrSize"),
  barcodeHeight: document.getElementById("barcodeHeight"),
  labelFontSize: document.getElementById("labelFontSize"),
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
const PATTERN = window.TKNProductPattern;
const SETTINGS_KEY = 'tkn_print_label_settings_v5302';

function numberSetting(node, fallback, min, max) {
  const value = Number(node?.value);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function saveSettings() {
  const data = {
    paperPreset: el.paperPreset.value,
    codeMode: el.codeMode.value,
    barcodeSource: el.barcodeSource.value,
    conciseName: el.conciseName.checked,
    showName: el.showName.checked,
    showPrice: el.showPrice.checked,
    showProductCode: el.showProductCode.checked,
    showBarcodeText: el.showBarcodeText.checked,
    customWidth: el.customWidth.value,
    customHeight: el.customHeight.value,
    labelColumns: el.labelColumns.value,
    labelGap: el.labelGap.value,
    pageMargin: el.pageMargin.value,
    qrSize: el.qrSize.value,
    barcodeHeight: el.barcodeHeight.value,
    labelFontSize: el.labelFontSize.value
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    Object.entries(data).forEach(([key, value]) => {
      const node = el[key];
      if (!node) return;
      if (node.type === 'checkbox') node.checked = Boolean(value);
      else node.value = String(value);
    });
  } catch (error) {
    console.warn('ข้ามการตั้งค่าฉลากเดิม:', error);
  }
  el.barcodeSource.value = 'product_code';
}

function message(node, text, type = "") {
  node.textContent = text;
  node.className = `message ${type}`.trim();
}

function isConfigured() {
  return !SUPABASE_PUBLISHABLE_KEY.includes("ใส่_") &&
         SUPABASE_URL.startsWith("https://");
}

async function fetchSelectedProductFromUrl() {
  const params = new URLSearchParams(location.search);
  const productId = String(params.get("product") || params.get("product_id") || "").trim();
  const productCode = String(params.get("code") || params.get("sku") || "").replace(/^TKN-P-/i, "").trim();
  const productName = String(params.get("name") || "").trim();

  if (!productId && !productCode && !productName) return null;

  message(el.searchMessage, "กำลังโหลดสินค้าที่เลือก...");
  const views = ["product_management_list_v5250", "product_management_list"];

  for (const view of views) {
    try {
      let query = supabaseClient.from(view).select("*");
      if (productId) query = query.eq("id", productId);
      else if (productCode) query = query.eq("product_code", productCode);
      else query = query.ilike("name", productName);

      const { data, error } = await query.limit(1);
      if (error) continue;
      if (data?.[0]) return data[0];
    } catch (error) {
      console.warn(`ข้ามการโหลดจาก ${view}:`, error);
    }
  }

  if (productCode) {
    for (const view of views) {
      try {
        const { data, error } = await supabaseClient
          .from(view)
          .select("*")
          .or(`barcode.eq.${productCode},source_barcode.eq.${productCode}`)
          .limit(1);
        if (!error && data?.[0]) return data[0];
      } catch (error) {
        console.warn(`ข้ามการค้นหารหัสสำรองจาก ${view}:`, error);
      }
    }
  }

  return null;
}

async function loadSelectedProductFromUrl() {
  const params = new URLSearchParams(location.search);
  const hasSelection = params.has("product") || params.has("product_id") || params.has("code") || params.has("sku") || params.has("name");
  if (!hasSelection) return false;

  const product = await fetchSelectedProductFromUrl();
  if (!product) {
    const fallback = params.get("code") || params.get("name") || params.get("product") || "";
    el.searchInput.value = fallback;
    message(el.searchMessage, "ไม่พบสินค้าที่ส่งมาจากหน้าจัดการสินค้า กรุณาค้นหาอีกครั้ง", "error");
    return false;
  }

  el.searchInput.value = product.name || product.product_code || "";
  addProduct(product);
  message(el.searchMessage, `เพิ่ม ${getLabelName(product)} เข้ารายการพิมพ์แล้ว`, "success");
  return true;
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
    loadSettings();
    syncCodeModeUi();
    const loadedFromUrl = await loadSelectedProductFromUrl();
    if (!loadedFromUrl) el.searchInput.focus();
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

  const clean = query.replace(/^TKN-P-/i, "").replace(/[,%()]/g, "");
  const fields = "id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active,brand_name,source_barcode,product_type_th,model_name,label_name,base_sku,cost_price";
  let result = await supabaseClient
    .from("product_management_list_v5250")
    .select(fields)
    .or(`name.ilike.%${clean}%,product_code.ilike.%${clean}%,barcode.eq.${clean},source_barcode.eq.${clean}`)
    .eq("is_active", true)
    .order("name")
    .limit(30);

  if (result.error) {
    result = await supabaseClient
      .from("product_management_list")
      .select("id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active,brand_name,cost_price")
      .or(`name.ilike.%${clean}%,product_code.ilike.%${clean}%,barcode.eq.${clean}`)
      .eq("is_active", true)
      .order("name")
      .limit(30);
  }
  const { data, error } = result;
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
    name.textContent = getLabelName(product);
    const detail = document.createElement("small");
    detail.textContent =
      `${getCanonicalSku(product) || "-"} • Barcode/QR มาตรฐานเดียว • ฿${Number(product.selling_price || 0).toLocaleString("th-TH")}`;
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
      `${getCanonicalSku(product) || "-"} • QR: ${getProductQrValue(product) || "-"}`;

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

function getCanonicalSku(product) {
  return PATTERN?.resolveLotSku?.(product)
    || PATTERN?.barcodeValue?.(product?.product_code)
    || String(product?.product_code || '').trim();
}

function getBarcodeValue(product) {
  // มาตรฐานเดียวทั้งระบบ: Barcode ต้องใช้ SKU ของล็อตที่มีต้นทุนแฝงเท่านั้น
  return getCanonicalSku(product);
}

function getProductQrValue(product) {
  // QR สินค้าใช้ prefix TKN-P- และอ้างอิง SKU เดียวกับ Barcode
  return PATTERN?.qrValue?.(product) || (getCanonicalSku(product) ? `TKN-P-${getCanonicalSku(product)}` : '');
}

function getLabelName(product) {
  if (!el.conciseName.checked) return product.label_name || product.name || '';
  return PATTERN?.conciseLabel(product, { maxChars: 52, maxLines: 2 }) || product.label_name || product.name || '';
}

function syncCodeModeUi() {
  const usesBarcode = el.codeMode.value === "barcode" || el.codeMode.value === "both";
  el.barcodeSource.disabled = true;
  el.showBarcodeText.disabled = !usesBarcode;
}

const PRESET_CONFIG = Object.freeze({
  label58: { pageWidth: 58, pageHeight: 38, qrOnly: 68, qrBoth: 56, barcodeHeight: 38, barcodeBothHeight: 30, barcodeWidth: 1.25, fontSize: 9 },
  peripage57: { pageWidth: 57, pageHeight: 35, qrOnly: 58, qrBoth: 52, barcodeHeight: 34, barcodeBothHeight: 27, barcodeWidth: 1.15, fontSize: 9 },
  portable50x30: { pageWidth: 50, pageHeight: 30, qrOnly: 48, qrBoth: 38, barcodeHeight: 27, barcodeBothHeight: 22, barcodeWidth: 1.0, fontSize: 8 },
  portable40x30: { pageWidth: 40, pageHeight: 30, qrOnly: 42, qrBoth: 32, barcodeHeight: 24, barcodeBothHeight: 19, barcodeWidth: 0.85, fontSize: 7 },
  label80: { pageWidth: 80, pageHeight: 48, qrOnly: 96, qrBoth: 78, barcodeHeight: 48, barcodeBothHeight: 38, barcodeWidth: 1.55, fontSize: 11 },
  "a4-40x30": { pageWidth: 210, pageHeight: 297, qrOnly: 42, qrBoth: 32, barcodeHeight: 24, barcodeBothHeight: 18, barcodeWidth: 0.9, fontSize: 7 },
  "a4-50x30": { pageWidth: 210, pageHeight: 297, qrOnly: 46, qrBoth: 36, barcodeHeight: 27, barcodeBothHeight: 20, barcodeWidth: 1.0, fontSize: 8 },
  "a4-70x40": { pageWidth: 210, pageHeight: 297, qrOnly: 64, qrBoth: 48, barcodeHeight: 36, barcodeBothHeight: 28, barcodeWidth: 1.25, fontSize: 9 },
  custom: { pageWidth: 50, pageHeight: 30, qrOnly: 56, qrBoth: 44, barcodeHeight: 30, barcodeBothHeight: 24, barcodeWidth: 1.0, fontSize: 10 }
});

function presetConfig() {
  const base = PRESET_CONFIG[el.paperPreset.value] || PRESET_CONFIG.label58;
  const preset = el.paperPreset.value;
  const customWidth = numberSetting(el.customWidth, 50, 20, 210);
  const customHeight = numberSetting(el.customHeight, 30, 15, 297);
  const physical = window.TKNLabelLayout?.sizeFor?.(preset, customWidth, customHeight, [58,38])
    || [preset === 'custom' ? customWidth : base.pageWidth, preset === 'custom' ? customHeight : base.pageHeight];
  const profile = window.TKNLabelLayout?.productProfile?.({
    preset, width: physical[0], height: physical[1], customWidth, customHeight, dpi: 300
  });
  const qrDefault = profile?.qrPx || base.qrBoth;
  const barcodeDefault = profile?.barcodePx || base.barcodeBothHeight;
  return {
    ...base,
    pageWidth: preset === 'custom' ? customWidth : base.pageWidth,
    pageHeight: preset === 'custom' ? customHeight : base.pageHeight,
    labelWidth: physical[0], labelHeight: physical[1], profile,
    qrOnly: profile ? qrDefault : numberSetting(el.qrSize, qrDefault, 28, 420),
    qrBoth: profile ? qrDefault : numberSetting(el.qrSize, qrDefault, 28, 420),
    barcodeHeight: profile ? barcodeDefault : numberSetting(el.barcodeHeight, barcodeDefault, 12, 180),
    barcodeBothHeight: profile ? barcodeDefault : numberSetting(el.barcodeHeight, barcodeDefault, 12, 180),
    fontSize: profile ? profile.skuFont : numberSetting(el.labelFontSize, base.fontSize, 6, 30)
  };
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

  const margin = numberSetting(el.pageMargin, 0, 0, 30);
  const columns = Math.round(numberSetting(el.labelColumns, 1, 1, 8));
  const gap = numberSetting(el.labelGap, 2, 0, 20);
  el.printSheet.style.setProperty('--label-width', `${cfg.pageWidth}mm`);
  el.printSheet.style.setProperty('--label-height', `${cfg.pageHeight}mm`);
  el.printSheet.style.setProperty('--label-columns', String(columns));
  el.printSheet.style.setProperty('--label-gap', `${gap}mm`);
  el.printSheet.style.setProperty('--page-margin', `${margin}mm`);
  el.printSheet.style.setProperty('--label-font-size', `${cfg.fontSize}px`);
  if (cfg.profile) {
    window.TKNLabelLayout?.applyProductVars?.(el.printSheet, cfg.profile);
    if (el.qrSize) el.qrSize.value = String(cfg.qrBoth);
    if (el.barcodeHeight) el.barcodeHeight.value = String(cfg.barcodeBothHeight);
    if (el.labelFontSize) el.labelFontSize.value = String(Math.round(cfg.fontSize));
  }

  if (preset.startsWith("a4-")) {
    style.textContent = "@page{size:A4 portrait;margin:0}";
  } else if (preset === 'custom' && columns > 1) {
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
    const qrValue = getProductQrValue(product);
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
  label.className = "product-label tkn-label-product";
  const codeMode = el.codeMode.value;

  if (codeMode === "qr" || codeMode === "both") {
    const value = getProductQrValue(product);
    const holder = document.createElement("div");
    holder.className = "qr-holder tkn-label-qr-holder";
    if (!window.TKNQRHealth?.isReady?.() && typeof window.QRCode !== "function") {
      holder.classList.add("code-error");
      holder.textContent = window.TKNQRHealth?.errorText?.() || "QR engine unavailable";
    } else {
      try {
        const staging = document.createElement("div");
        const qr = new QRCode(staging, { text:value, width:cfg.qrBoth, height:cfg.qrBoth, correctLevel:QRCode.CorrectLevel.M });
        const svg = buildQrSvg(qr?._oQRCode, cfg.qrBoth);
        svg.classList.add("tkn-label-qr");
        holder.appendChild(svg);
      } catch (error) {
        holder.classList.add("code-error");
        holder.textContent = "QR error";
        console.error("QR render failed:", error);
      }
    }
    label.appendChild(holder);
  }

  if (codeMode === "barcode" || codeMode === "both") {
    const value = getBarcodeValue(product);
    const holder = document.createElement("div");
    holder.className = "barcode-holder tkn-label-barcode-holder";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("tkn-label-barcode");
    holder.appendChild(svg);
    try {
      JsBarcode(svg, value, {
        format:"CODE128", displayValue:el.showBarcodeText.checked,
        width:cfg.barcodeWidth, height:cfg.barcodeBothHeight, margin:0,
        fontSize:Math.max(6,cfg.fontSize-1), background:"#ffffff", lineColor:"#000000",
      });
    } catch (error) {
      holder.classList.add("code-error");
      holder.textContent = "Barcode error";
      console.error("Barcode render failed:", error);
    }
    label.appendChild(holder);
  }

  if (el.showProductCode.checked) {
    const code = document.createElement("div");
    code.className = "label-product-code tkn-label-sku";
    code.textContent = getCanonicalSku(product);
    label.appendChild(code);
  }

  if (el.showName.checked) {
    const name = document.createElement("div");
    name.className = "label-name tkn-label-name";
    name.textContent = getLabelName(product);
    label.appendChild(name);
  }

  if (el.showPrice.checked) {
    const price = document.createElement("div");
    price.className = "label-price tkn-label-price";
    price.textContent = new Intl.NumberFormat("th-TH", {style:"currency",currency:"THB",minimumFractionDigits:2}).format(Number(product.selling_price || 0));
    label.appendChild(price);
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
  el.conciseName,
  el.showName,
  el.showPrice,
  el.showProductCode,
  el.showBarcodeText,
  el.customWidth,
  el.customHeight,
  el.labelColumns,
  el.labelGap,
  el.pageMargin,
  el.qrSize,
  el.barcodeHeight,
  el.labelFontSize,
].forEach((node) => node.addEventListener("change", () => {
  syncCodeModeUi();
  saveSettings();
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
