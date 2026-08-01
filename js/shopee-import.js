(() => {
  "use strict";

  const VERSION = "5.10.0";
  const SOURCE = "SHOPEE";
  const DB_NAME = "tkn_marketplace_import_v1";
  const DB_VERSION = 1;
  const RECORD_STORE = "records";
  const META_STORE = "meta";
  const ALL_VALUE = "__ALL__";
  const EMPTY_VALUE = "__EMPTY__";
  const REQUIRED_SOURCE_HEADERS = [
    "tracking_number",
    "sku_id",
    "item_quantity",
    "item_name",
    "main_category",
    "sub_category",
  ];

  const E = {
    dropZone: document.getElementById("dropZone"),
    sourceFileInput: document.getElementById("sourceFileInput"),
    sourceFileName: document.getElementById("sourceFileName"),
    workspaceStatus: document.getElementById("workspaceStatus"),
    draftSavedAt: document.getElementById("draftSavedAt"),
    draftStateText: document.getElementById("draftStateText"),
    clearWorkspaceBtn: document.getElementById("clearWorkspaceBtn"),
    parseProgressWrap: document.getElementById("parseProgressWrap"),
    parseProgressText: document.getElementById("parseProgressText"),
    parseProgressPercent: document.getElementById("parseProgressPercent"),
    parseProgressBar: document.getElementById("parseProgressBar"),
    rawCount: document.getElementById("rawCount"),
    cleanCount: document.getElementById("cleanCount"),
    trackingCount: document.getElementById("trackingCount"),
    skuCount: document.getElementById("skuCount"),
    missingPriceCount: document.getElementById("missingPriceCount"),
    syncedPriceCount: document.getElementById("syncedPriceCount"),
    exportCleanBtn: document.getElementById("exportCleanBtn"),
    trackingSearch: document.getElementById("trackingSearch"),
    reviewStatusFilter: document.getElementById("reviewStatusFilter"),
    reviewPageSizeSelect: document.getElementById("reviewPageSizeSelect"),
    clearReviewFilterBtn: document.getElementById("clearReviewFilterBtn"),
    trackingResult: document.getElementById("trackingResult"),
    trackingResultNumber: document.getElementById("trackingResultNumber"),
    trackingResultSkuCount: document.getElementById("trackingResultSkuCount"),
    trackingResultQty: document.getElementById("trackingResultQty"),
    trackingResultItems: document.getElementById("trackingResultItems"),
    previewBody: document.getElementById("previewBody"),
    reviewPrevPageBtn: document.getElementById("reviewPrevPageBtn"),
    reviewNextPageBtn: document.getElementById("reviewNextPageBtn"),
    reviewPageInfo: document.getElementById("reviewPageInfo"),
    mainCategoryFilter: document.getElementById("mainCategoryFilter"),
    subCategoryFilter: document.getElementById("subCategoryFilter"),
    skuSearch: document.getElementById("skuSearch"),
    skuStatusFilter: document.getElementById("skuStatusFilter"),
    clearPriceFilterBtn: document.getElementById("clearPriceFilterBtn"),
    categorySkuCount: document.getElementById("categorySkuCount"),
    categoryReadyCount: document.getElementById("categoryReadyCount"),
    categoryMissingCount: document.getElementById("categoryMissingCount"),
    categorySyncedCount: document.getElementById("categorySyncedCount"),
    selectedCount: document.getElementById("selectedCount"),
    selectVisibleCheckbox: document.getElementById("selectVisibleCheckbox"),
    clearSelectionBtn: document.getElementById("clearSelectionBtn"),
    saveDraftBtn: document.getElementById("saveDraftBtn"),
    exportCategoryBtn: document.getElementById("exportCategoryBtn"),
    priceEditorBody: document.getElementById("priceEditorBody"),
    pricePageSizeSelect: document.getElementById("pricePageSizeSelect"),
    pricePrevPageBtn: document.getElementById("pricePrevPageBtn"),
    priceNextPageBtn: document.getElementById("priceNextPageBtn"),
    pricePageInfo: document.getElementById("pricePageInfo"),
    exportAllPriceBtn: document.getElementById("exportAllPriceBtn"),
    choosePriceFileBtn: document.getElementById("choosePriceFileBtn"),
    priceFileInput: document.getElementById("priceFileInput"),
    priceImportSummary: document.getElementById("priceImportSummary"),
    createMissingToggle: document.getElementById("createMissingToggle"),
    createDefaults: document.getElementById("createDefaults"),
    defaultCategory: document.getElementById("defaultCategory"),
    defaultUnit: document.getElementById("defaultUnit"),
    defaultBrand: document.getElementById("defaultBrand"),
    syncSelectedReady: document.getElementById("syncSelectedReady"),
    matchedProductCount: document.getElementById("matchedProductCount"),
    unmatchedProductCount: document.getElementById("unmatchedProductCount"),
    syncSuccessCount: document.getElementById("syncSuccessCount"),
    updateSelectedBtn: document.getElementById("updateSelectedBtn"),
    updateCategoryBtn: document.getElementById("updateCategoryBtn"),
    syncProgressWrap: document.getElementById("syncProgressWrap"),
    syncProgressText: document.getElementById("syncProgressText"),
    syncProgressPercent: document.getElementById("syncProgressPercent"),
    syncProgressBar: document.getElementById("syncProgressBar"),
    syncResultNotice: document.getElementById("syncResultNotice"),
    message: document.getElementById("message"),
  };

  const state = {
    db: null,
    rows: [],
    rowsBySku: new Map(),
    skuRows: [],
    skuById: new Map(),
    filteredReviewRows: [],
    filteredSkuRows: [],
    reviewPage: 1,
    reviewPageSize: Number(E.reviewPageSizeSelect?.value || 50),
    pricePage: 1,
    pricePageSize: Number(E.pricePageSizeSelect?.value || 50),
    rawCount: 0,
    removedCount: 0,
    sourceFileName: "",
    selectedSkus: new Set(),
    dirtySkus: new Set(),
    saveTimer: null,
    savePromise: Promise.resolve(),
    productsLoaded: false,
    products: [],
    productByCode: new Map(),
    productByBarcode: new Map(),
    matches: new Map(),
    optionsLoaded: false,
    busy: false,
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[char]);
  }

  function normalizeHeader(value) {
    return String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function normalizeCode(value) {
    return normalizeText(value).toUpperCase();
  }

  function normalizeQuantity(value) {
    const text = normalizeText(value).replace(/,/g, "");
    if (!text) return 0;
    const number = Number(text);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function parseOptionalMoney(value) {
    const text = normalizeText(value).replace(/,/g, "");
    if (text === "") return { empty: true, valid: true, value: null };
    const number = Number(text);
    return { empty: false, valid: Number.isFinite(number) && number >= 0, value: number };
  }

  function money(value) {
    if (value === null || value === undefined || value === "") return "-";
    return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  }

  function integer(value) {
    return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 }).format(Number(value || 0));
  }

  function formatDateTime(value) {
    if (!value) return "ยังไม่มี";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "ยังไม่มี";
    return new Intl.DateTimeFormat("th-TH", {
      day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    }).format(date);
  }

  function categoryToken(value) {
    return normalizeText(value) || EMPTY_VALUE;
  }

  function tokenLabel(value, fallback) {
    return value === EMPTY_VALUE ? fallback : value;
  }

  function setMessage(text, type = "info") {
    E.message.textContent = text || "";
    E.message.className = `message ${text ? `is-${type}` : ""}`.trim();
  }

  function setNotice(element, html, type = "info") {
    if (!element) return;
    element.innerHTML = html || "";
    element.hidden = !html;
    element.className = `notice${type === "info" ? "" : ` is-${type}`}`;
  }

  function setParseProgress(percent, text) {
    const safe = Math.max(0, Math.min(100, Number(percent || 0)));
    E.parseProgressWrap.hidden = false;
    E.parseProgressBar.style.width = `${safe}%`;
    E.parseProgressPercent.textContent = `${Math.round(safe)}%`;
    if (text) E.parseProgressText.textContent = text;
  }

  function setSyncProgress(percent, text) {
    const safe = Math.max(0, Math.min(100, Number(percent || 0)));
    E.syncProgressWrap.hidden = false;
    E.syncProgressBar.style.width = `${safe}%`;
    E.syncProgressPercent.textContent = `${Math.round(safe)}%`;
    if (text) E.syncProgressText.textContent = text;
  }

  function setDraftState(text, mode = "saved") {
    E.draftStateText.textContent = text;
    const container = E.draftStateText.closest(".draft-state");
    container?.classList.toggle("is-saving", mode === "saving");
    container?.classList.toggle("is-error", mode === "error");
  }

  function csvEscape(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function downloadCsv(filename, headers, rows) {
    const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))];
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text) {
    const matrix = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"') {
        if (inQuotes && next === '"') { field += '"'; index += 1; }
        else inQuotes = !inQuotes;
        continue;
      }
      if (char === "," && !inQuotes) { row.push(field); field = ""; continue; }
      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(field); field = "";
        if (row.some((item) => normalizeText(item) !== "")) matrix.push(row);
        row = [];
        continue;
      }
      field += char;
    }
    row.push(field);
    if (row.some((item) => normalizeText(item) !== "")) matrix.push(row);
    return matrix;
  }

  function recordKey(trackingNumber, skuId) {
    return `${normalizeText(trackingNumber)}\u001F${normalizeText(skuId)}`;
  }

  function priceStatus(item) {
    const cost = parseOptionalMoney(item.cost_price);
    const selling = parseOptionalMoney(item.selling_price);
    if (!cost.valid || !selling.valid) return "invalid";
    if (cost.empty || selling.empty) return "missing";
    if (selling.value < cost.value) return "invalid";
    return "ready";
  }

  function workflowStatus(item) {
    const base = priceStatus(item);
    if (base !== "ready") return base;
    if (!item.last_synced_at) return "ready";
    const sameCost = Number(item.synced_cost_price) === Number(parseOptionalMoney(item.cost_price).value);
    const sameSelling = Number(item.synced_selling_price) === Number(parseOptionalMoney(item.selling_price).value);
    const sameCode = !normalizeText(item.product_code) || normalizeCode(item.synced_product_code) === normalizeCode(item.product_code);
    return sameCost && sameSelling && sameCode ? "synced" : "changed";
  }

  function isReadyForUpdate(item) {
    return priceStatus(item) === "ready";
  }

  function statusBadge(status) {
    if (status === "ready") return '<span class="badge badge-ready">พร้อมอัปเดต</span>';
    if (status === "changed") return '<span class="badge badge-changed">แก้หลังอัปเดต</span>';
    if (status === "synced") return '<span class="badge badge-synced">อัปเดตแล้ว</span>';
    if (status === "invalid") return '<span class="badge badge-invalid">ราคาไม่ถูกต้อง</span>';
    return '<span class="badge badge-missing">ยังไม่กรอก</span>';
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RECORD_STORE)) {
          const store = db.createObjectStore(RECORD_STORE, { keyPath: "key" });
          store.createIndex("tracking_number", "tracking_number", { unique: false });
          store.createIndex("sku_id", "sku_id", { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("เปิดฐานข้อมูลในเครื่องไม่สำเร็จ"));
    });
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB error"));
    });
  }

  async function saveWorkspace(rows, meta) {
    const transaction = state.db.transaction([RECORD_STORE, META_STORE], "readwrite");
    const recordStore = transaction.objectStore(RECORD_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    recordStore.clear();
    rows.forEach((row) => recordStore.put(row));
    Object.entries(meta).forEach(([key, value]) => metaStore.put({ key, value }));
    await transactionDone(transaction, "บันทึกพื้นที่ทำงานไม่สำเร็จ");
  }

  async function saveSkuIds(skuIds) {
    const ids = new Set(skuIds);
    if (!ids.size) return;
    const transaction = state.db.transaction(RECORD_STORE, "readwrite");
    const store = transaction.objectStore(RECORD_STORE);
    ids.forEach((skuId) => (state.rowsBySku.get(skuId) || []).forEach((row) => store.put(row)));
    await transactionDone(transaction, "บันทึกราคาไม่สำเร็จ");
  }

  function transactionDone(transaction, fallback) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error(fallback));
      transaction.onabort = () => reject(transaction.error || new Error(fallback));
    });
  }

  async function saveMeta(key, value) {
    const transaction = state.db.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put({ key, value });
    await transactionDone(transaction, "บันทึกสถานะไม่สำเร็จ");
  }

  async function loadWorkspace() {
    const transaction = state.db.transaction([RECORD_STORE, META_STORE], "readonly");
    const [rows, metaRows] = await Promise.all([
      idbRequest(transaction.objectStore(RECORD_STORE).getAll()),
      idbRequest(transaction.objectStore(META_STORE).getAll()),
    ]);
    const meta = Object.fromEntries(metaRows.map((item) => [item.key, item.value]));
    state.rows = Array.isArray(rows) ? rows : [];
    state.rawCount = Number(meta.rawCount || 0);
    state.removedCount = Number(meta.removedCount || 0);
    state.sourceFileName = String(meta.sourceFileName || "");
    rebuildSkuIndex();
    if (state.rows.length) {
      E.sourceFileName.textContent = state.sourceFileName || "ข้อมูลที่บันทึกไว้ในเครื่อง";
      E.workspaceStatus.textContent = "กู้คืนข้อมูลล่าสุดแล้ว";
      E.draftSavedAt.textContent = formatDateTime(meta.draftSavedAt || meta.savedAt);
    }
    refreshAll();
  }

  async function clearWorkspace() {
    const transaction = state.db.transaction([RECORD_STORE, META_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(META_STORE).clear();
    await transactionDone(transaction, "ล้างข้อมูลไม่สำเร็จ");
    state.rows = [];
    state.rowsBySku.clear();
    state.skuRows = [];
    state.skuById.clear();
    state.selectedSkus.clear();
    state.dirtySkus.clear();
    state.rawCount = 0;
    state.removedCount = 0;
    state.sourceFileName = "";
    state.productsLoaded = false;
    state.products = [];
    state.productByCode.clear();
    state.productByBarcode.clear();
    state.matches.clear();
    state.reviewPage = 1;
    state.pricePage = 1;
    E.sourceFileInput.value = "";
    E.priceFileInput.value = "";
    E.sourceFileName.textContent = "ยังไม่ได้เลือกไฟล์";
    E.workspaceStatus.textContent = "พร้อมเริ่มงาน";
    E.draftSavedAt.textContent = "ยังไม่มี";
    E.trackingSearch.value = "";
    E.skuSearch.value = "";
    E.reviewStatusFilter.value = "all";
    E.skuStatusFilter.value = "all";
    E.priceImportSummary.hidden = true;
    E.syncResultNotice.hidden = true;
    E.trackingResult.hidden = true;
    populateCategoryFilters(true);
    refreshAll();
    setMessage("ล้างข้อมูล Shopee และร่างราคาในเครื่องแล้ว", "success");
  }

  function rebuildSkuIndex() {
    state.rowsBySku = new Map();
    for (const row of state.rows) {
      const skuId = normalizeText(row.sku_id);
      if (!skuId) continue;
      if (!state.rowsBySku.has(skuId)) state.rowsBySku.set(skuId, []);
      state.rowsBySku.get(skuId).push(row);
    }

    state.skuRows = [];
    state.skuById = new Map();
    for (const [skuId, sourceRows] of state.rowsBySku.entries()) {
      const first = sourceRows[0];
      const latestSync = sourceRows.reduce((latest, row) => {
        if (!row.last_synced_at) return latest;
        return !latest || new Date(row.last_synced_at) > new Date(latest.last_synced_at) ? row : latest;
      }, null);
      const item = {
        sku_id: skuId,
        item_name: sourceRows.find((row) => row.item_name)?.item_name || "",
        main_category: sourceRows.find((row) => row.main_category)?.main_category || "",
        sub_category: sourceRows.find((row) => row.sub_category)?.sub_category || "",
        product_code: sourceRows.find((row) => normalizeText(row.product_code))?.product_code || "",
        cost_price: sourceRows.find((row) => normalizeText(row.cost_price) !== "")?.cost_price ?? "",
        selling_price: sourceRows.find((row) => normalizeText(row.selling_price) !== "")?.selling_price ?? "",
        tracking_count: new Set(sourceRows.map((row) => row.tracking_number)).size,
        total_quantity: sourceRows.reduce((sum, row) => sum + Number(row.item_quantity || 0), 0),
        last_synced_at: latestSync?.last_synced_at || first.last_synced_at || "",
        synced_cost_price: latestSync?.synced_cost_price ?? first.synced_cost_price ?? null,
        synced_selling_price: latestSync?.synced_selling_price ?? first.synced_selling_price ?? null,
        synced_product_code: latestSync?.synced_product_code ?? first.synced_product_code ?? "",
        sync_target: latestSync?.sync_target || first.sync_target || "",
        sourceRows,
      };
      state.skuRows.push(item);
      state.skuById.set(skuId, item);
    }
    state.skuRows.sort((a, b) =>
      a.main_category.localeCompare(b.main_category, "th") ||
      a.sub_category.localeCompare(b.sub_category, "th") ||
      a.item_name.localeCompare(b.item_name, "th") ||
      a.sku_id.localeCompare(b.sku_id, "th")
    );
    for (const skuId of Array.from(state.selectedSkus)) if (!state.skuById.has(skuId)) state.selectedSkus.delete(skuId);
  }

  async function processSourceFile(file) {
    if (!file || state.busy) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setMessage("รองรับเฉพาะไฟล์ CSV เท่านั้น", "error");
      return;
    }
    if (state.rows.length && !window.confirm("การอัปโหลดไฟล์ Shopee ใหม่จะแทนที่พื้นที่ทำงานและร่างราคาชุดเดิมในเครื่องนี้ ยืนยันหรือไม่?")) {
      E.sourceFileInput.value = "";
      return;
    }

    state.busy = true;
    disableActions(true);
    setMessage("");
    E.sourceFileName.textContent = file.name;
    E.workspaceStatus.textContent = "กำลังอ่านไฟล์";
    setParseProgress(5, "กำลังเปิดไฟล์...");

    try {
      const text = await file.text();
      setParseProgress(22, "กำลังแยกคอลัมน์ CSV...");
      await nextFrame();
      const matrix = parseCsv(text);
      if (matrix.length < 2) throw new Error("ไฟล์ไม่มีรายการข้อมูล");
      const headers = matrix[0].map(normalizeHeader);
      const missing = REQUIRED_SOURCE_HEADERS.filter((header) => !headers.includes(header));
      if (missing.length) throw new Error(`ไฟล์ขาดคอลัมน์: ${missing.join(", ")}`);
      const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
      const aggregated = new Map();
      let removed = 0;
      setParseProgress(38, "กำลังตรวจ Tracking และ SKU...");

      for (let index = 1; index < matrix.length; index += 1) {
        const values = matrix[index];
        const trackingNumber = normalizeText(values[positions.tracking_number]);
        const skuId = normalizeText(values[positions.sku_id]);
        if (!trackingNumber || !skuId) { removed += 1; continue; }
        const key = recordKey(trackingNumber, skuId);
        const quantity = normalizeQuantity(values[positions.item_quantity]);
        const existing = aggregated.get(key);
        if (existing) {
          existing.item_quantity += quantity;
          existing.merged_rows += 1;
          continue;
        }
        aggregated.set(key, {
          key,
          source: SOURCE,
          tracking_number: trackingNumber,
          sku_id: skuId,
          item_quantity: quantity,
          item_name: normalizeText(values[positions.item_name]),
          main_category: normalizeText(values[positions.main_category]),
          sub_category: normalizeText(values[positions.sub_category]),
          source_item_price: positions.item_price_pp !== undefined ? normalizeText(values[positions.item_price_pp]) : "",
          product_code: positions.product_code !== undefined ? normalizeText(values[positions.product_code]) : "",
          cost_price: positions.cost_price !== undefined ? normalizeText(values[positions.cost_price]) : "",
          selling_price: positions.selling_price !== undefined ? normalizeText(values[positions.selling_price]) : "",
          merged_rows: 1,
          imported_at: new Date().toISOString(),
        });
      }

      setParseProgress(72, "กำลังรวม Tracking + SKU ที่ซ้ำกัน...");
      await nextFrame();
      const rows = Array.from(aggregated.values()).sort((a, b) =>
        a.tracking_number.localeCompare(b.tracking_number, "th") || a.sku_id.localeCompare(b.sku_id, "th")
      );
      if (!rows.length) throw new Error("ไม่พบรายการที่มี Tracking และ SKU ครบถ้วน");

      const now = new Date().toISOString();
      setParseProgress(87, "กำลังสร้างพื้นที่ทำงาน...");
      await saveWorkspace(rows, {
        sourceFileName: file.name,
        rawCount: matrix.length - 1,
        removedCount: removed,
        savedAt: now,
        draftSavedAt: now,
        version: VERSION,
      });

      state.rows = rows;
      state.rawCount = matrix.length - 1;
      state.removedCount = removed;
      state.sourceFileName = file.name;
      state.selectedSkus.clear();
      state.matches.clear();
      state.reviewPage = 1;
      state.pricePage = 1;
      rebuildSkuIndex();
      populateCategoryFilters(true);
      E.workspaceStatus.textContent = "พร้อมแยกหมวดและกรอกราคา";
      E.draftSavedAt.textContent = formatDateTime(now);
      setParseProgress(100, "นำเข้าข้อมูลเรียบร้อย");
      refreshAll();
      setMessage(`นำเข้าสำเร็จ ${integer(rows.length)} รายการ จาก ${integer(state.skuRows.length)} SKU สามารถเลือกหมวดและทยอยกรอกราคาได้ทันที`, "success");
      document.getElementById("pricePanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      E.workspaceStatus.textContent = "อ่านไฟล์ไม่สำเร็จ";
      setMessage(error?.message || "อ่านไฟล์ Shopee ไม่สำเร็จ", "error");
      setParseProgress(0, "เกิดข้อผิดพลาด");
    } finally {
      state.busy = false;
      disableActions(false);
      setTimeout(() => { if (E.parseProgressBar.style.width === "100%") E.parseProgressWrap.hidden = true; }, 1000);
    }
  }

  function populateCategoryFilters(reset = false) {
    const previousMain = reset ? ALL_VALUE : E.mainCategoryFilter.value;
    const previousSub = reset ? ALL_VALUE : E.subCategoryFilter.value;
    const mainValues = Array.from(new Set(state.skuRows.map((item) => categoryToken(item.main_category))))
      .sort((a, b) => tokenLabel(a, "ไม่ระบุหมวดหลัก").localeCompare(tokenLabel(b, "ไม่ระบุหมวดหลัก"), "th"));
    E.mainCategoryFilter.innerHTML = `<option value="${ALL_VALUE}">ทุกหมวดหลัก</option>` + mainValues.map((value) =>
      `<option value="${esc(value)}">${esc(tokenLabel(value, "ไม่ระบุหมวดหลัก"))}</option>`
    ).join("");
    E.mainCategoryFilter.value = Array.from(E.mainCategoryFilter.options).some((option) => option.value === previousMain) ? previousMain : ALL_VALUE;
    populateSubCategoryFilter(previousSub);
  }

  function populateSubCategoryFilter(preferred = ALL_VALUE) {
    const main = E.mainCategoryFilter.value;
    const source = state.skuRows.filter((item) => main === ALL_VALUE || categoryToken(item.main_category) === main);
    const values = Array.from(new Set(source.map((item) => categoryToken(item.sub_category))))
      .sort((a, b) => tokenLabel(a, "ไม่ระบุหมวดย่อย").localeCompare(tokenLabel(b, "ไม่ระบุหมวดย่อย"), "th"));
    E.subCategoryFilter.innerHTML = `<option value="${ALL_VALUE}">ทุกหมวดย่อย</option>` + values.map((value) =>
      `<option value="${esc(value)}">${esc(tokenLabel(value, "ไม่ระบุหมวดย่อย"))}</option>`
    ).join("");
    E.subCategoryFilter.value = Array.from(E.subCategoryFilter.options).some((option) => option.value === preferred) ? preferred : ALL_VALUE;
  }

  function refreshAll() {
    applyReviewFilters();
    applyPriceFilters();
    renderGlobalSummary();
    updateActionState();
  }

  function applyReviewFilters() {
    const query = normalizeText(E.trackingSearch.value).toLowerCase();
    const status = E.reviewStatusFilter.value;
    state.reviewPageSize = Number(E.reviewPageSizeSelect.value || 50);
    state.filteredReviewRows = state.rows.filter((row) => {
      const sku = state.skuById.get(row.sku_id) || row;
      const matchesQuery = !query || [row.tracking_number, row.sku_id, row.item_name, row.main_category, row.sub_category, row.product_code]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = status === "all" || workflowStatus(sku) === status;
      return matchesQuery && matchesStatus;
    });
    const pages = Math.max(1, Math.ceil(state.filteredReviewRows.length / state.reviewPageSize));
    state.reviewPage = Math.min(Math.max(1, state.reviewPage), pages);
    renderReviewTable();
    renderTrackingResult(query);
  }

  function renderReviewTable() {
    if (!state.rows.length) {
      E.previewBody.innerHTML = '<tr><td colspan="9" class="empty-cell">เลือกไฟล์ Shopee เพื่อเริ่มตรวจสอบ</td></tr>';
      E.reviewPageInfo.textContent = "หน้า 0 / 0";
      E.reviewPrevPageBtn.disabled = true;
      E.reviewNextPageBtn.disabled = true;
      return;
    }
    if (!state.filteredReviewRows.length) {
      E.previewBody.innerHTML = '<tr><td colspan="9" class="empty-cell">ไม่พบรายการตามตัวกรอง</td></tr>';
      E.reviewPageInfo.textContent = "หน้า 0 / 0";
      E.reviewPrevPageBtn.disabled = true;
      E.reviewNextPageBtn.disabled = true;
      return;
    }
    const totalPages = Math.ceil(state.filteredReviewRows.length / state.reviewPageSize);
    const start = (state.reviewPage - 1) * state.reviewPageSize;
    const pageRows = state.filteredReviewRows.slice(start, start + state.reviewPageSize);
    E.previewBody.innerHTML = pageRows.map((row, offset) => {
      const sku = state.skuById.get(row.sku_id) || row;
      return `<tr>
        <td>${start + offset + 1}</td>
        <td class="code">${esc(row.tracking_number)}</td>
        <td class="code">${esc(row.sku_id)}</td>
        <td class="main-cell"><strong>${esc(row.item_name || "-")}</strong><small>รวมจาก ${integer(row.merged_rows || 1)} แถว</small></td>
        <td><strong>${esc(row.main_category || "-")}</strong><br><small>${esc(row.sub_category || "-")}</small></td>
        <td class="num"><strong>${integer(row.item_quantity)}</strong></td>
        <td class="num money">${money(sku.cost_price)}</td>
        <td class="num money">${money(sku.selling_price)}</td>
        <td>${statusBadge(workflowStatus(sku))}</td>
      </tr>`;
    }).join("");
    E.reviewPageInfo.textContent = `หน้า ${integer(state.reviewPage)} / ${integer(totalPages)} · ${integer(state.filteredReviewRows.length)} รายการ`;
    E.reviewPrevPageBtn.disabled = state.reviewPage <= 1;
    E.reviewNextPageBtn.disabled = state.reviewPage >= totalPages;
  }

  function renderTrackingResult(query) {
    if (!query || !state.rows.length) { E.trackingResult.hidden = true; return; }
    const exact = state.rows.filter((row) => row.tracking_number.toLowerCase() === query);
    const candidate = exact[0]?.tracking_number || state.rows.find((row) => row.tracking_number.toLowerCase().includes(query))?.tracking_number;
    if (!candidate) { E.trackingResult.hidden = true; return; }
    const items = state.rows.filter((row) => row.tracking_number === candidate);
    E.trackingResultNumber.textContent = candidate;
    E.trackingResultSkuCount.textContent = integer(items.length);
    E.trackingResultQty.textContent = integer(items.reduce((sum, row) => sum + Number(row.item_quantity || 0), 0));
    E.trackingResultItems.innerHTML = items.map((row) => `<article class="tracking-item">
      <div><strong>${esc(row.item_name || row.sku_id)}</strong><small>${esc(row.sku_id)} · ${esc(row.sub_category || row.main_category || "ไม่ระบุหมวดหมู่")}</small></div>
      <span class="qty">${integer(row.item_quantity)} ชิ้น</span>
    </article>`).join("");
    E.trackingResult.hidden = false;
  }

  function applyPriceFilters() {
    const main = E.mainCategoryFilter.value;
    const sub = E.subCategoryFilter.value;
    const query = normalizeText(E.skuSearch.value).toLowerCase();
    const status = E.skuStatusFilter.value;
    state.pricePageSize = Number(E.pricePageSizeSelect.value || 50);
    state.filteredSkuRows = state.skuRows.filter((item) => {
      const matchesMain = main === ALL_VALUE || categoryToken(item.main_category) === main;
      const matchesSub = sub === ALL_VALUE || categoryToken(item.sub_category) === sub;
      const matchesQuery = !query || [item.sku_id, item.item_name, item.product_code, item.main_category, item.sub_category]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = status === "all" || workflowStatus(item) === status;
      return matchesMain && matchesSub && matchesQuery && matchesStatus;
    });
    const pages = Math.max(1, Math.ceil(state.filteredSkuRows.length / state.pricePageSize));
    state.pricePage = Math.min(Math.max(1, state.pricePage), pages);
    renderPriceEditor();
    renderCategorySummary();
    updateActionState();
  }

  function currentPricePageRows() {
    const start = (state.pricePage - 1) * state.pricePageSize;
    return state.filteredSkuRows.slice(start, start + state.pricePageSize);
  }

  function profitInfo(item) {
    const cost = parseOptionalMoney(item.cost_price);
    const selling = parseOptionalMoney(item.selling_price);
    if (cost.empty || selling.empty || !cost.valid || !selling.valid) return { text: "-", sub: "", className: "" };
    const profit = selling.value - cost.value;
    const margin = selling.value > 0 ? (profit / selling.value) * 100 : 0;
    return {
      text: money(profit),
      sub: `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(margin)}%`,
      className: profit < 0 ? "profit-negative" : "profit-positive",
    };
  }

  function renderPriceEditor() {
    if (!state.skuRows.length) {
      E.priceEditorBody.innerHTML = '<tr><td colspan="10" class="empty-cell">อัปโหลดไฟล์ Shopee ก่อนเริ่มกรอกราคา</td></tr>';
      E.pricePageInfo.textContent = "หน้า 0 / 0";
      E.pricePrevPageBtn.disabled = true;
      E.priceNextPageBtn.disabled = true;
      E.selectVisibleCheckbox.checked = false;
      E.selectVisibleCheckbox.indeterminate = false;
      return;
    }
    if (!state.filteredSkuRows.length) {
      E.priceEditorBody.innerHTML = '<tr><td colspan="10" class="empty-cell">ไม่พบ SKU ตามหมวดหรือตัวกรองที่เลือก</td></tr>';
      E.pricePageInfo.textContent = "หน้า 0 / 0";
      E.pricePrevPageBtn.disabled = true;
      E.priceNextPageBtn.disabled = true;
      E.selectVisibleCheckbox.checked = false;
      E.selectVisibleCheckbox.indeterminate = false;
      return;
    }
    const totalPages = Math.ceil(state.filteredSkuRows.length / state.pricePageSize);
    const start = (state.pricePage - 1) * state.pricePageSize;
    const pageRows = currentPricePageRows();
    E.priceEditorBody.innerHTML = pageRows.map((item, offset) => {
      const status = workflowStatus(item);
      const selected = state.selectedSkus.has(item.sku_id);
      const profit = profitInfo(item);
      const match = state.matches.get(item.sku_id);
      const matchBadge = match?.type === "existing"
        ? '<span class="badge badge-match">พบสินค้าเดิม</span>'
        : match?.type === "missing"
          ? '<span class="badge badge-missing-product">ยังไม่พบสินค้า</span>'
          : statusBadge(status);
      return `<tr data-price-row="${esc(item.sku_id)}" class="${selected ? "is-selected" : ""} ${status === "invalid" ? "is-invalid" : ""}">
        <td class="check-col"><input class="price-select" type="checkbox" data-select-sku="${esc(item.sku_id)}" ${selected ? "checked" : ""} ${!isReadyForUpdate(item) ? "disabled" : ""}></td>
        <td>${start + offset + 1}</td>
        <td class="main-cell"><strong>${esc(item.item_name || "-")}</strong><small class="code">${esc(item.sku_id)}</small></td>
        <td><strong>${esc(item.main_category || "-")}</strong><br><small>${esc(item.sub_category || "-")}</small></td>
        <td class="num"><strong>${integer(item.tracking_count)} / ${integer(item.total_quantity)}</strong></td>
        <td><input class="code-input" data-sku="${esc(item.sku_id)}" data-price-field="product_code" value="${esc(item.product_code)}" placeholder="ใช้ SKU หากเว้นว่าง"></td>
        <td><input class="price-input ${status === "invalid" ? "is-error" : ""}" type="number" min="0" step="0.01" data-sku="${esc(item.sku_id)}" data-price-field="cost_price" value="${esc(item.cost_price)}" placeholder="0.00"></td>
        <td><input class="price-input ${status === "invalid" ? "is-error" : ""}" type="number" min="0" step="0.01" data-sku="${esc(item.sku_id)}" data-price-field="selling_price" value="${esc(item.selling_price)}" placeholder="0.00"></td>
        <td class="num profit-cell ${profit.className}"><strong data-profit-value>${profit.text}</strong><small data-profit-margin>${profit.sub}</small></td>
        <td data-status-cell>${matchBadge}${item.last_synced_at ? `<small class="sync-time">${esc(formatDateTime(item.last_synced_at))}</small>` : ""}</td>
      </tr>`;
    }).join("");
    E.pricePageInfo.textContent = `หน้า ${integer(state.pricePage)} / ${integer(totalPages)} · ${integer(state.filteredSkuRows.length)} SKU`;
    E.pricePrevPageBtn.disabled = state.pricePage <= 1;
    E.priceNextPageBtn.disabled = state.pricePage >= totalPages;
    updateSelectVisibleState();
  }

  function renderCategorySummary() {
    const rows = state.filteredSkuRows;
    const ready = rows.filter((item) => ["ready", "changed"].includes(workflowStatus(item))).length;
    const missing = rows.filter((item) => workflowStatus(item) === "missing").length;
    const synced = rows.filter((item) => workflowStatus(item) === "synced").length;
    E.categorySkuCount.textContent = integer(rows.length);
    E.categoryReadyCount.textContent = integer(ready);
    E.categoryMissingCount.textContent = integer(missing);
    E.categorySyncedCount.textContent = integer(synced);
    E.selectedCount.textContent = integer(state.selectedSkus.size);
    E.syncSelectedReady.textContent = integer(Array.from(state.selectedSkus).filter((skuId) => isReadyForUpdate(state.skuById.get(skuId) || {})).length);
  }

  function renderGlobalSummary() {
    const trackingSet = new Set(state.rows.map((row) => row.tracking_number));
    E.rawCount.textContent = integer(state.rawCount);
    E.cleanCount.textContent = integer(state.rows.length);
    E.trackingCount.textContent = integer(trackingSet.size);
    E.skuCount.textContent = integer(state.skuRows.length);
    E.missingPriceCount.textContent = integer(state.skuRows.filter((item) => workflowStatus(item) === "missing").length);
    E.syncedPriceCount.textContent = integer(state.skuRows.filter((item) => workflowStatus(item) === "synced").length);
  }

  function updateSelectVisibleState() {
    const eligible = currentPricePageRows().filter(isReadyForUpdate);
    const selected = eligible.filter((item) => state.selectedSkus.has(item.sku_id)).length;
    E.selectVisibleCheckbox.checked = eligible.length > 0 && selected === eligible.length;
    E.selectVisibleCheckbox.indeterminate = selected > 0 && selected < eligible.length;
    E.selectVisibleCheckbox.disabled = eligible.length === 0;
  }

  function updateSkuField(skuId, field, value) {
    const item = state.skuById.get(skuId);
    if (!item || !["product_code", "cost_price", "selling_price"].includes(field)) return;
    item[field] = value;
    item.sourceRows.forEach((row) => { row[field] = value; });
    state.matches.delete(skuId);
    if (!isReadyForUpdate(item)) state.selectedSkus.delete(skuId);
    scheduleDraftSave(skuId);
  }

  function updatePriceRowVisual(skuId) {
    const item = state.skuById.get(skuId);
    const row = Array.from(E.priceEditorBody.querySelectorAll("[data-price-row]")).find((element) => element.dataset.priceRow === skuId);
    if (!item || !row) return;
    const status = workflowStatus(item);
    const profit = profitInfo(item);
    row.classList.toggle("is-invalid", status === "invalid");
    row.querySelectorAll(".price-input").forEach((input) => input.classList.toggle("is-error", status === "invalid"));
    const profitValue = row.querySelector("[data-profit-value]");
    const profitMargin = row.querySelector("[data-profit-margin]");
    const profitCell = row.querySelector(".profit-cell");
    if (profitValue) profitValue.textContent = profit.text;
    if (profitMargin) profitMargin.textContent = profit.sub;
    profitCell?.classList.toggle("profit-negative", profit.className === "profit-negative");
    profitCell?.classList.toggle("profit-positive", profit.className === "profit-positive");
    const statusCell = row.querySelector("[data-status-cell]");
    if (statusCell) statusCell.innerHTML = statusBadge(status) + (item.last_synced_at ? `<small class="sync-time">${esc(formatDateTime(item.last_synced_at))}</small>` : "");
    const checkbox = row.querySelector("[data-select-sku]");
    if (checkbox) {
      checkbox.disabled = !isReadyForUpdate(item);
      checkbox.checked = state.selectedSkus.has(skuId);
    }
    row.classList.toggle("is-selected", state.selectedSkus.has(skuId));
    renderGlobalSummary();
    renderCategorySummary();
    updateSelectVisibleState();
    updateActionState();
  }

  function scheduleDraftSave(skuId) {
    state.dirtySkus.add(skuId);
    setDraftState("กำลังรอบันทึกร่าง...", "saving");
    E.saveDraftBtn.disabled = false;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => flushDraftSave(), 650);
  }

  async function flushDraftSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    const skuIds = Array.from(state.dirtySkus);
    if (!skuIds.length) return state.savePromise;
    state.dirtySkus.clear();
    setDraftState("กำลังบันทึกร่าง...", "saving");
    state.savePromise = state.savePromise.then(async () => {
      try {
        await saveSkuIds(skuIds);
        const now = new Date().toISOString();
        await saveMeta("draftSavedAt", now);
        E.draftSavedAt.textContent = formatDateTime(now);
        setDraftState("บันทึกร่างแล้ว", "saved");
      } catch (error) {
        skuIds.forEach((skuId) => state.dirtySkus.add(skuId));
        console.error(error);
        setDraftState("บันทึกร่างไม่สำเร็จ", "error");
        setMessage(error?.message || "บันทึกร่างราคาไม่สำเร็จ", "error");
      } finally {
        updateActionState();
      }
    });
    return state.savePromise;
  }

  function exportCleanFile() {
    if (!state.rows.length) return;
    const headers = ["source", "tracking_number", "sku_id", "item_quantity", "item_name", "main_category", "sub_category", "merged_rows", "product_code", "cost_price", "selling_price"];
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`shopee-clean-${date}.csv`, headers, state.rows);
    setMessage("ดาวน์โหลดไฟล์ Shopee ที่รวม Tracking + SKU แล้ว", "success");
  }

  function priceExportRows(rows) {
    return rows.map((item) => ({
      sku_id: item.sku_id,
      item_name: item.item_name,
      main_category: item.main_category,
      sub_category: item.sub_category,
      tracking_count: item.tracking_count,
      total_quantity: item.total_quantity,
      product_code: item.product_code,
      cost_price: item.cost_price,
      selling_price: item.selling_price,
      status: workflowStatus(item),
      last_synced_at: item.last_synced_at || "",
    }));
  }

  function exportPriceRows(rows, prefix) {
    if (!rows.length) { setMessage("ไม่พบ SKU สำหรับส่งออก", "error"); return; }
    const headers = ["sku_id", "item_name", "main_category", "sub_category", "tracking_count", "total_quantity", "product_code", "cost_price", "selling_price", "status", "last_synced_at"];
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`${prefix}-${date}.csv`, headers, priceExportRows(rows));
    setMessage(`ส่งออกข้อมูลราคา ${integer(rows.length)} SKU แล้ว`, "success");
  }

  async function importPriceFile(file) {
    if (!file || !state.skuRows.length || state.busy) return;
    state.busy = true;
    disableActions(true);
    setNotice(E.priceImportSummary, "");
    try {
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error("ไฟล์ราคายังไม่มีข้อมูล");
      const headers = matrix[0].map(normalizeHeader);
      const required = ["sku_id", "cost_price", "selling_price"];
      const missing = required.filter((header) => !headers.includes(header));
      if (missing.length) throw new Error(`ไฟล์ราคาขาดคอลัมน์: ${missing.join(", ")}`);
      const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
      const seen = new Map();
      const conflicts = new Set();
      let unknown = 0;
      let blank = 0;
      const changed = new Set();

      for (let index = 1; index < matrix.length; index += 1) {
        const values = matrix[index];
        const skuId = normalizeText(values[positions.sku_id]);
        if (!skuId) { blank += 1; continue; }
        const item = state.skuById.get(skuId);
        if (!item) { unknown += 1; continue; }
        const candidate = {
          product_code: positions.product_code !== undefined ? normalizeText(values[positions.product_code]) : "",
          cost_price: normalizeText(values[positions.cost_price]),
          selling_price: normalizeText(values[positions.selling_price]),
        };
        const previous = seen.get(skuId);
        if (previous && JSON.stringify(previous) !== JSON.stringify(candidate)) { conflicts.add(skuId); continue; }
        seen.set(skuId, candidate);
      }
      if (conflicts.size) throw new Error(`พบข้อมูลราคาไม่ตรงกันใน SKU เดียวกัน ${integer(conflicts.size)} SKU`);

      for (const [skuId, candidate] of seen.entries()) {
        const item = state.skuById.get(skuId);
        if (!item) continue;
        let changedItem = false;
        for (const field of ["product_code", "cost_price", "selling_price"]) {
          if (candidate[field] === "" && field !== "product_code") continue;
          if (candidate[field] !== "" && normalizeText(item[field]) !== candidate[field]) {
            item[field] = candidate[field];
            item.sourceRows.forEach((row) => { row[field] = candidate[field]; });
            changedItem = true;
          }
        }
        if (changedItem) { changed.add(skuId); state.matches.delete(skuId); }
      }
      await saveSkuIds(changed);
      const now = new Date().toISOString();
      await saveMeta("draftSavedAt", now);
      E.draftSavedAt.textContent = formatDateTime(now);
      refreshAll();
      const ready = Array.from(changed).filter((skuId) => isReadyForUpdate(state.skuById.get(skuId) || {})).length;
      setNotice(E.priceImportSummary,
        `รับไฟล์ <strong>${esc(file.name)}</strong> แล้ว · อัปเดตร่าง ${integer(changed.size)} SKU · พร้อมอัปเดต ${integer(ready)} SKU${unknown ? ` · ไม่พบในชุด Shopee ${integer(unknown)} SKU` : ""}${blank ? ` · ข้าม ${integer(blank)} แถว` : ""}`,
        "success"
      );
      setMessage(`นำเข้าราคา CSV แบบทยอยสำเร็จ ${integer(changed.size)} SKU`, "success");
    } catch (error) {
      console.error(error);
      setNotice(E.priceImportSummary, esc(error?.message || "อ่านไฟล์ราคาไม่สำเร็จ"), "error");
      setMessage(error?.message || "อ่านไฟล์ราคาไม่สำเร็จ", "error");
    } finally {
      state.busy = false;
      disableActions(false);
      E.priceFileInput.value = "";
    }
  }

  async function loadOptions() {
    if (state.optionsLoaded) return;
    const [categories, units, brands] = await Promise.all([
      supabaseClient.from("categories").select("id,code,name").order("name"),
      supabaseClient.from("units").select("id,name").order("name"),
      supabaseClient.from("brands").select("id,code,name").eq("is_active", true).order("name"),
    ]);
    const error = [categories.error, units.error, brands.error].find(Boolean);
    if (error) throw error;
    E.defaultCategory.innerHTML = (categories.data || []).map((item) => `<option value="${esc(item.code)}">${esc(item.code)} — ${esc(item.name)}</option>`).join("");
    E.defaultUnit.innerHTML = (units.data || []).map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
    E.defaultBrand.innerHTML = '<option value="">ไม่ระบุยี่ห้อ</option>' + (brands.data || []).map((item) => `<option value="${esc(item.code)}">${esc(item.code)} — ${esc(item.name)}</option>`).join("");
    state.optionsLoaded = true;
  }

  async function loadAllProducts() {
    if (state.productsLoaded) return;
    state.products = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseClient
        .from("products")
        .select("id,product_code,name,barcode,category_id,unit_id,brand_id,cost_price,selling_price,minimum_stock,vat_rate,description,image_url,is_active")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = data || [];
      state.products.push(...batch);
      if (batch.length < pageSize) break;
    }
    state.productByCode = new Map(state.products.filter((item) => item.product_code).map((item) => [normalizeCode(item.product_code), item]));
    state.productByBarcode = new Map(state.products.filter((item) => item.barcode).map((item) => [normalizeText(item.barcode), item]));
    state.productsLoaded = true;
  }

  function matchSkuItems(items) {
    const matches = new Map();
    let matched = 0;
    let unmatched = 0;
    for (const item of items) {
      const requestedCode = normalizeCode(item.product_code || item.sku_id);
      const product = state.productByCode.get(requestedCode) || state.productByBarcode.get(normalizeText(item.sku_id));
      if (product) { matches.set(item.sku_id, { type: "existing", product, price: item }); matched += 1; }
      else { matches.set(item.sku_id, { type: "missing", product: null, price: item }); unmatched += 1; }
    }
    state.matches = matches;
    E.matchedProductCount.textContent = integer(matched);
    E.unmatchedProductCount.textContent = integer(unmatched);
    return { matches, matched, unmatched };
  }

  async function updateSkuPrices(skuIds, label) {
    if (state.busy) return;
    await flushDraftSave();
    const uniqueIds = Array.from(new Set(skuIds));
    const items = uniqueIds.map((skuId) => state.skuById.get(skuId)).filter((item) => item && isReadyForUpdate(item));
    if (!items.length) { setMessage("ยังไม่มีรายการที่กรอกราคาครบและผ่านเงื่อนไข", "error"); return; }

    state.busy = true;
    disableActions(true);
    setNotice(E.syncResultNotice, "");
    setMessage("กำลังตรวจจับคู่สินค้าเดิม...", "info");
    setSyncProgress(5, "กำลังโหลดสินค้าเดิม...");

    try {
      await loadAllProducts();
      if (E.createMissingToggle.checked) await loadOptions();
      const { matches, matched, unmatched } = matchSkuItems(items);
      renderPriceEditor();
      const createMissing = E.createMissingToggle.checked;
      if (createMissing && (!E.defaultCategory.value || !E.defaultUnit.value)) throw new Error("กรุณาเลือกหมวดหมู่และหน่วยนับเริ่มต้นสำหรับสินค้าที่สร้างใหม่");
      const jobs = Array.from(matches.entries()).filter(([, match]) => match.type === "existing" || (match.type === "missing" && createMissing));
      const skipped = unmatched - (createMissing ? unmatched : 0);
      if (!jobs.length) throw new Error("ไม่พบสินค้าเดิมที่จะอัปเดต และยังไม่ได้เปิดการสร้างสินค้าใหม่");

      const confirmation = [
        `${label}: ${jobs.length.toLocaleString("th-TH")} SKU`,
        `พบสินค้าเดิม ${matched.toLocaleString("th-TH")} SKU`,
        `ไม่พบสินค้า ${unmatched.toLocaleString("th-TH")} SKU${createMissing ? " (จะสร้างใหม่ สต็อก 0)" : " (จะข้าม)"}`,
        "",
        "ยืนยันอัปเดตราคาโดยไม่ปรับยอดสต็อกเดิมหรือไม่?",
      ].join("\n");
      if (!window.confirm(confirmation)) {
        setMessage("ยกเลิกการอัปเดตราคาแล้ว", "info");
        return;
      }

      E.syncSuccessCount.textContent = "0";
      let success = 0;
      let failed = 0;
      const failures = [];
      const successfulSkuIds = [];

      for (let index = 0; index < jobs.length; index += 1) {
        const [skuId, match] = jobs[index];
        const item = match.price;
        const cost = parseOptionalMoney(item.cost_price).value;
        const selling = parseOptionalMoney(item.selling_price).value;
        let result;
        try {
          if (match.type === "existing") {
            const product = match.product;
            result = await supabaseClient.rpc("update_product_admin", {
              p_product_id: product.id,
              p_product_code: product.product_code,
              p_name: product.name,
              p_barcode: product.barcode || null,
              p_category_id: product.category_id,
              p_unit_id: product.unit_id,
              p_brand_id: product.brand_id || null,
              p_cost_price: cost,
              p_selling_price: selling,
              p_minimum_stock: Number(product.minimum_stock || 0),
              p_vat_rate: Number(product.vat_rate || 0),
              p_description: product.description || null,
              p_image_url: product.image_url || null,
              p_is_active: product.is_active !== false,
            });
          } else {
            result = await supabaseClient.rpc("import_product_row", {
              p_product_code: normalizeText(item.product_code || skuId),
              p_name: item.item_name || `Shopee SKU ${skuId}`,
              p_barcode: null,
              p_category_code: E.defaultCategory.value,
              p_unit_name: E.defaultUnit.value,
              p_brand_code: E.defaultBrand.value || null,
              p_cost_price: cost,
              p_selling_price: selling,
              p_minimum_stock: 0,
              p_vat_rate: 0,
              p_initial_branch_code: null,
              p_initial_quantity: 0,
              p_description: `SHOPEE_SKU:${skuId}`,
            });
          }
          if (result.error) throw result.error;
          const now = new Date().toISOString();
          item.last_synced_at = now;
          item.synced_cost_price = cost;
          item.synced_selling_price = selling;
          item.synced_product_code = item.product_code || match.product?.product_code || skuId;
          item.sync_target = match.type;
          item.sourceRows.forEach((row) => {
            row.last_synced_at = now;
            row.synced_cost_price = cost;
            row.synced_selling_price = selling;
            row.synced_product_code = item.synced_product_code;
            row.sync_target = match.type;
          });
          successfulSkuIds.push(skuId);
          state.selectedSkus.delete(skuId);
          success += 1;
        } catch (error) {
          failed += 1;
          failures.push(`${skuId}: ${error?.message || "ไม่สำเร็จ"}`);
        }
        const percent = 10 + ((index + 1) / jobs.length) * 90;
        setSyncProgress(percent, `กำลังอัปเดต ${index + 1}/${jobs.length}`);
        E.syncSuccessCount.textContent = integer(success);
        if ((index + 1) % 10 === 0) await nextFrame();
      }

      if (successfulSkuIds.length) await saveSkuIds(successfulSkuIds);
      state.productsLoaded = false;
      state.matches.clear();
      refreshAll();
      const skippedText = skipped > 0 ? ` · ข้าม SKU ที่ไม่พบ ${integer(skipped)}` : "";
      const failureText = failed ? ` · ล้มเหลว ${integer(failed)}` : "";
      setNotice(E.syncResultNotice,
        `อัปเดตสำเร็จ <strong>${integer(success)} SKU</strong>${failureText}${skippedText}<br><small>ระบบไม่ได้ปรับยอดสต็อกเดิม${failures.length ? ` · ${esc(failures.slice(0, 5).join(" | "))}` : ""}</small>`,
        failed ? "error" : "success"
      );
      setMessage(failed ? `อัปเดตบางรายการไม่สำเร็จ: สำเร็จ ${integer(success)} SKU, ล้มเหลว ${integer(failed)} SKU` : `อัปเดตราคาสำเร็จ ${integer(success)} SKU โดยไม่ปรับยอดสต็อกเดิม`, failed ? "error" : "success");
    } catch (error) {
      console.error(error);
      setNotice(E.syncResultNotice, esc(error?.message || "อัปเดตราคาไม่สำเร็จ"), "error");
      setMessage(error?.message || "อัปเดตราคาไม่สำเร็จ", "error");
    } finally {
      state.busy = false;
      disableActions(false);
    }
  }

  function currentCategoryReadySkuIds() {
    const hasCategory = E.mainCategoryFilter.value !== ALL_VALUE || E.subCategoryFilter.value !== ALL_VALUE;
    if (!hasCategory) return [];
    return state.filteredSkuRows
      .filter((item) => ["ready", "changed"].includes(workflowStatus(item)))
      .map((item) => item.sku_id);
  }

  function updateActionState() {
    const hasRows = state.rows.length > 0;
    const selectedReady = Array.from(state.selectedSkus).filter((skuId) => isReadyForUpdate(state.skuById.get(skuId) || {}));
    const categoryReady = currentCategoryReadySkuIds();
    E.exportCleanBtn.disabled = !hasRows || state.busy;
    E.exportCategoryBtn.disabled = !state.filteredSkuRows.length || state.busy;
    E.exportAllPriceBtn.disabled = !state.skuRows.length || state.busy;
    E.choosePriceFileBtn.disabled = !state.skuRows.length || state.busy;
    E.saveDraftBtn.disabled = (!state.dirtySkus.size && !hasRows) || state.busy;
    E.clearSelectionBtn.disabled = !state.selectedSkus.size || state.busy;
    E.updateSelectedBtn.disabled = !selectedReady.length || state.busy;
    E.updateCategoryBtn.disabled = !categoryReady.length || state.busy;
    E.syncSelectedReady.textContent = integer(selectedReady.length);
    E.selectedCount.textContent = integer(state.selectedSkus.size);
  }

  function disableActions(disabled) {
    [
      E.exportCleanBtn, E.exportCategoryBtn, E.exportAllPriceBtn, E.choosePriceFileBtn,
      E.saveDraftBtn, E.clearSelectionBtn, E.updateSelectedBtn, E.updateCategoryBtn,
      E.clearWorkspaceBtn,
    ].forEach((button) => { if (button) button.disabled = disabled; });
    if (!disabled) updateActionState();
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function bindEvents() {
    E.dropZone.addEventListener("click", () => E.sourceFileInput.click());
    E.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); E.sourceFileInput.click(); }
    });
    ["dragenter", "dragover"].forEach((name) => E.dropZone.addEventListener(name, (event) => {
      event.preventDefault(); E.dropZone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach((name) => E.dropZone.addEventListener(name, (event) => {
      event.preventDefault(); E.dropZone.classList.remove("is-dragging");
    }));
    E.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) processSourceFile(file);
    });
    E.sourceFileInput.addEventListener("change", () => {
      const file = E.sourceFileInput.files?.[0];
      if (file) processSourceFile(file);
    });
    E.clearWorkspaceBtn.addEventListener("click", async () => {
      if (!state.rows.length || window.confirm("ยืนยันล้างข้อมูล Shopee และร่างราคาทั้งหมดที่บันทึกไว้ในเครื่องนี้?")) await clearWorkspace();
    });

    E.exportCleanBtn.addEventListener("click", exportCleanFile);
    let reviewTimer = null;
    E.trackingSearch.addEventListener("input", () => {
      clearTimeout(reviewTimer);
      reviewTimer = setTimeout(() => { state.reviewPage = 1; applyReviewFilters(); }, 140);
    });
    E.reviewStatusFilter.addEventListener("change", () => { state.reviewPage = 1; applyReviewFilters(); });
    E.reviewPageSizeSelect.addEventListener("change", () => { state.reviewPage = 1; applyReviewFilters(); });
    E.clearReviewFilterBtn.addEventListener("click", () => {
      E.trackingSearch.value = "";
      E.reviewStatusFilter.value = "all";
      state.reviewPage = 1;
      applyReviewFilters();
    });
    E.reviewPrevPageBtn.addEventListener("click", () => { state.reviewPage -= 1; renderReviewTable(); });
    E.reviewNextPageBtn.addEventListener("click", () => { state.reviewPage += 1; renderReviewTable(); });

    E.mainCategoryFilter.addEventListener("change", () => {
      populateSubCategoryFilter(ALL_VALUE);
      state.pricePage = 1;
      state.selectedSkus.clear();
      applyPriceFilters();
    });
    E.subCategoryFilter.addEventListener("change", () => { state.pricePage = 1; state.selectedSkus.clear(); applyPriceFilters(); });
    let priceSearchTimer = null;
    E.skuSearch.addEventListener("input", () => {
      clearTimeout(priceSearchTimer);
      priceSearchTimer = setTimeout(() => { state.pricePage = 1; applyPriceFilters(); }, 140);
    });
    E.skuStatusFilter.addEventListener("change", () => { state.pricePage = 1; applyPriceFilters(); });
    E.pricePageSizeSelect.addEventListener("change", () => { state.pricePage = 1; applyPriceFilters(); });
    E.clearPriceFilterBtn.addEventListener("click", () => {
      E.mainCategoryFilter.value = ALL_VALUE;
      populateSubCategoryFilter(ALL_VALUE);
      E.skuSearch.value = "";
      E.skuStatusFilter.value = "all";
      state.pricePage = 1;
      state.selectedSkus.clear();
      applyPriceFilters();
    });
    E.pricePrevPageBtn.addEventListener("click", () => { state.pricePage -= 1; renderPriceEditor(); });
    E.priceNextPageBtn.addEventListener("click", () => { state.pricePage += 1; renderPriceEditor(); });

    E.priceEditorBody.addEventListener("input", (event) => {
      const input = event.target.closest("[data-price-field]");
      if (!input) return;
      updateSkuField(input.dataset.sku, input.dataset.priceField, input.value);
      updatePriceRowVisual(input.dataset.sku);
    });
    E.priceEditorBody.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-select-sku]");
      if (checkbox) {
        if (checkbox.checked) state.selectedSkus.add(checkbox.dataset.selectSku);
        else state.selectedSkus.delete(checkbox.dataset.selectSku);
        checkbox.closest("tr")?.classList.toggle("is-selected", checkbox.checked);
        renderCategorySummary();
        updateSelectVisibleState();
        updateActionState();
      }
      if (event.target.closest("[data-price-field]") && E.skuStatusFilter.value !== "all") {
        state.pricePage = 1;
        applyPriceFilters();
      }
    });
    E.selectVisibleCheckbox.addEventListener("change", () => {
      currentPricePageRows().filter(isReadyForUpdate).forEach((item) => {
        if (E.selectVisibleCheckbox.checked) state.selectedSkus.add(item.sku_id);
        else state.selectedSkus.delete(item.sku_id);
      });
      renderPriceEditor();
      renderCategorySummary();
      updateActionState();
    });
    E.clearSelectionBtn.addEventListener("click", () => {
      state.selectedSkus.clear();
      renderPriceEditor();
      renderCategorySummary();
      updateActionState();
    });
    E.saveDraftBtn.addEventListener("click", async () => {
      if (!state.dirtySkus.size) {
        const now = new Date().toISOString();
        await saveMeta("draftSavedAt", now);
        E.draftSavedAt.textContent = formatDateTime(now);
        setDraftState("บันทึกร่างแล้ว", "saved");
        setMessage("ร่างราคาปัจจุบันถูกเก็บไว้ในเครื่องแล้ว", "success");
        return;
      }
      await flushDraftSave();
      setMessage("บันทึกร่างราคาแล้ว สามารถปิดหน้าและกลับมาทำต่อได้", "success");
    });
    E.exportCategoryBtn.addEventListener("click", () => exportPriceRows(state.filteredSkuRows, "shopee-category-price"));
    E.exportAllPriceBtn.addEventListener("click", () => exportPriceRows(state.skuRows, "shopee-all-price"));
    E.choosePriceFileBtn.addEventListener("click", () => E.priceFileInput.click());
    E.priceFileInput.addEventListener("change", () => {
      const file = E.priceFileInput.files?.[0];
      if (file) importPriceFile(file);
    });

    E.createMissingToggle.addEventListener("change", async () => {
      E.createDefaults.hidden = !E.createMissingToggle.checked;
      if (E.createMissingToggle.checked) {
        try { await loadOptions(); }
        catch (error) {
          console.error(error);
          E.createMissingToggle.checked = false;
          E.createDefaults.hidden = true;
          setMessage(error?.message || "โหลดตัวเลือกสินค้าไม่สำเร็จ", "error");
        }
      }
      updateActionState();
    });
    E.updateSelectedBtn.addEventListener("click", () => updateSkuPrices(Array.from(state.selectedSkus), "อัปเดตรายการที่เลือก"));
    E.updateCategoryBtn.addEventListener("click", () => updateSkuPrices(currentCategoryReadySkuIds(), "อัปเดตทั้งหมวด"));

    document.querySelectorAll("[data-step-target]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".step").forEach((item) => item.classList.toggle("is-active", item === button));
        document.querySelector(`[data-panel="${button.dataset.stepTarget}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirtySkus.size) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  async function initializePage() {
    try {
      const access = await window.TKNAuthGuard.requireAccess("product.manage", { loadingText: "กำลังตรวจสอบสิทธิ์จัดการราคา Shopee..." });
      if (!access) return;
      state.db = await openDatabase();
      bindEvents();
      await loadWorkspace();
      populateCategoryFilters(false);
      applyPriceFilters();
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session) return;
        window.TKNAuthGuard.clearAccessCache();
        location.replace("./dashboard.html");
      });
      window.TKNAuthGuard.ready();
      if (state.rows.length) setMessage("กู้คืนข้อมูล Shopee และร่างราคาล่าสุดจากเครื่องนี้แล้ว สามารถเลือกหมวดและทำต่อได้", "info");
    } catch (error) {
      console.error(error);
      if (error?.code === "INVENTORY_PERMISSION_DENIED") return;
      window.TKNAuthGuard.fail(error, () => location.reload());
    }
  }

  initializePage();
})();
