const els = {
  loginSection: document.getElementById("loginSection"),
  scannerSection: document.getElementById("scannerSection"),
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginMessage: document.getElementById("loginMessage"),
  logoutBtn: document.getElementById("logoutBtn"),
  startScanBtn: document.getElementById("startScanBtn"),
  stopScanBtn: document.getElementById("stopScanBtn"),
  video: document.getElementById("video"),
  cameraStatus: document.getElementById("cameraStatus"),
  barcodeInput: document.getElementById("barcodeInput"),
  searchForm: document.getElementById("searchForm"),
  searchMessage: document.getElementById("searchMessage"),
  productResult: document.getElementById("productResult"),
  configWarning: document.getElementById("configWarning"),
};

let codeReader = null;
let scanControls = null;
let lastDetectedCode = "";
let lastDetectedAt = 0;

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function setCameraStatus(text, active = false) {
  els.cameraStatus.textContent = text;
  els.cameraStatus.classList.toggle("active", active);
}

function isConfigReady() {
  return !SUPABASE_URL.includes("ใส่_") &&
    !SUPABASE_PUBLISHABLE_KEY.includes("ใส่_");
}

async function handleSession() {
  if (!isConfigReady()) {
    els.configWarning.textContent =
      "ยังไม่ได้ใส่ Project URL และ Publishable Key ใน js/supabase-config.js";
    els.configWarning.classList.remove("hidden");
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  renderSession(Boolean(session));

  supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
    renderSession(Boolean(nextSession));
  });
}

function renderSession(isLoggedIn) {
  els.loginSection.classList.toggle("hidden", isLoggedIn);
  els.scannerSection.classList.toggle("hidden", !isLoggedIn);
  els.logoutBtn.classList.toggle("hidden", !isLoggedIn);

  if (!isLoggedIn) {
    stopScanner();
    clearProduct();
  } else {
    els.barcodeInput.focus();
  }
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(els.loginMessage, "กำลังเข้าสู่ระบบ...");

  const { error } = await supabaseClient.auth.signInWithPassword({
    email: els.email.value.trim(),
    password: els.password.value,
  });

  if (error) {
    setMessage(els.loginMessage, error.message, "error");
    return;
  }

  els.password.value = "";
  setMessage(els.loginMessage, "");
});

els.logoutBtn.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

els.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await searchByBarcode(els.barcodeInput.value);
});

els.startScanBtn.addEventListener("click", startScanner);
els.stopScanBtn.addEventListener("click", stopScanner);

async function startScanner() {
  if (!window.ZXingBrowser) {
    setMessage(els.searchMessage, "โหลดระบบสแกนไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต", "error");
    return;
  }

  try {
    setCameraStatus("กำลังเปิดกล้อง...");
    els.startScanBtn.disabled = true;

    codeReader = codeReader || new ZXingBrowser.BrowserMultiFormatReader();

    const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
    if (!devices.length) {
      throw new Error("ไม่พบกล้องในอุปกรณ์นี้");
    }

    const preferred =
      devices.find((d) => /back|rear|environment/i.test(d.label)) || devices.at(-1);

    scanControls = await codeReader.decodeFromVideoDevice(
      preferred.deviceId,
      els.video,
      async (result, error) => {
        if (result) {
          const code = result.getText().trim();
          const now = Date.now();

          if (code && (code !== lastDetectedCode || now - lastDetectedAt > 1800)) {
            lastDetectedCode = code;
            lastDetectedAt = now;
            els.barcodeInput.value = code;

            if (navigator.vibrate) navigator.vibrate(100);
            await searchByBarcode(code);
          }
        }

        if (error &&
            !(error instanceof ZXingBrowser.NotFoundException)) {
          console.debug("Scanner:", error);
        }
      }
    );

    els.stopScanBtn.disabled = false;
    setCameraStatus("กำลังสแกน", true);
  } catch (error) {
    console.error(error);
    setCameraStatus("เปิดกล้องไม่สำเร็จ");
    setMessage(
      els.searchMessage,
      `${error.message || "ไม่สามารถเปิดกล้องได้"} กรุณาอนุญาตสิทธิ์กล้องและเปิดผ่าน HTTPS`,
      "error"
    );
    els.startScanBtn.disabled = false;
  }
}

function stopScanner() {
  if (scanControls) {
    scanControls.stop();
    scanControls = null;
  }

  const stream = els.video.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    els.video.srcObject = null;
  }

  els.startScanBtn.disabled = false;
  els.stopScanBtn.disabled = true;
  setCameraStatus("หยุดกล้องแล้ว");
}

async function searchByBarcode(rawBarcode) {
  const barcode = String(rawBarcode || "").trim();

  if (!barcode) {
    setMessage(els.searchMessage, "กรุณากรอกหรือสแกนบาร์โค้ด", "error");
    clearProduct();
    return;
  }

  setMessage(els.searchMessage, `กำลังค้นหา ${barcode}...`);
  clearProduct(false);

  const { data, error } = await supabaseClient
    .from("product_list")
    .select(`
      id,
      product_code,
      barcode,
      name,
      category_code,
      category_name,
      unit_code,
      unit_name,
      cost_price,
      selling_price,
      quantity,
      minimum_stock,
      stock_status,
      is_active
    `)
    .eq("barcode", barcode)
    .maybeSingle();

  if (error) {
    console.error(error);
    setMessage(els.searchMessage, `ค้นหาไม่สำเร็จ: ${error.message}`, "error");
    return;
  }

  if (!data) {
    setMessage(els.searchMessage, `ไม่พบสินค้าที่มีบาร์โค้ด ${barcode}`, "error");
    clearProduct();
    return;
  }

  setMessage(els.searchMessage, "พบสินค้าแล้ว", "success");
  renderProduct(data);
}

function renderProduct(product) {
  document.getElementById("productName").textContent = product.name || "-";
  document.getElementById("productCode").textContent =
    `รหัสสินค้า ${product.product_code || "-"}`;
  document.getElementById("resultBarcode").textContent = product.barcode || "-";
  document.getElementById("resultCategory").textContent =
    [product.category_code, product.category_name].filter(Boolean).join(" — ") || "-";
  document.getElementById("resultUnit").textContent =
    product.unit_name || product.unit_code || "-";
  document.getElementById("resultQuantity").textContent =
    `${Number(product.quantity || 0).toLocaleString("th-TH")} ${product.unit_name || ""}`;
  document.getElementById("resultCost").textContent = formatMoney(product.cost_price);
  document.getElementById("productPrice").textContent = formatMoney(product.selling_price);
  document.getElementById("resultActive").textContent =
    product.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน";

  const badge = document.getElementById("stockBadge");
  const statusMap = {
    IN_STOCK: ["มีสินค้า", "ok"],
    LOW_STOCK: ["สินค้าใกล้หมด", "low"],
    OUT_OF_STOCK: ["สินค้าหมด", "out"],
  };
  const [label, className] = statusMap[product.stock_status] || ["ไม่ทราบสถานะ", ""];
  badge.textContent = label;
  badge.className = `stock-badge ${className}`.trim();

  els.productResult.classList.remove("hidden");
}

function clearProduct(hide = true) {
  if (hide) els.productResult.classList.add("hidden");
}

function formatMoney(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

window.addEventListener("beforeunload", stopScanner);
handleSession();
