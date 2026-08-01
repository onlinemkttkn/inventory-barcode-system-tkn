(() => {
  "use strict";

  const VERSION = "5.9.0";
  const SOURCE = "SHOPEE";
  const DB_NAME = "tkn_marketplace_import_v1";
  const DB_VERSION = 1;
  const RECORD_STORE = "records";
  const META_STORE = "meta";
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
    clearWorkspaceBtn: document.getElementById("clearWorkspaceBtn"),
    parseProgressWrap: document.getElementById("parseProgressWrap"),
    parseProgressText: document.getElementById("parseProgressText"),
    parseProgressPercent: document.getElementById("parseProgressPercent"),
    parseProgressBar: document.getElementById("parseProgressBar"),
    rawCount: document.getElementById("rawCount"),
    cleanCount: document.getElementById("cleanCount"),
    trackingCount: document.getElementById("trackingCount"),
    skuCount: document.getElementById("skuCount"),
    removedCount: document.getElementById("removedCount"),
    readyPriceCount: document.getElementById("readyPriceCount"),
    exportCleanBtn: document.getElementById("exportCleanBtn"),
    exportPriceBtn: document.getElementById("exportPriceBtn"),
    trackingSearch: document.getElementById("trackingSearch"),
    priceStatusFilter: document.getElementById("priceStatusFilter"),
    pageSizeSelect: document.getElementById("pageSizeSelect"),
    clearFilterBtn: document.getElementById("clearFilterBtn"),
    trackingResult: document.getElementById("trackingResult"),
    trackingResultNumber: document.getElementById("trackingResultNumber"),
    trackingResultSkuCount: document.getElementById("trackingResultSkuCount"),
    trackingResultQty: document.getElementById("trackingResultQty"),
    trackingResultItems: document.getElementById("trackingResultItems"),
    previewBody: document.getElementById("previewBody"),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    pageInfo: document.getElementById("pageInfo"),
    choosePriceFileBtn: document.getElementById("choosePriceFileBtn"),
    priceFileInput: document.getElementById("priceFileInput"),
    priceImportSummary: document.getElementById("priceImportSummary"),
    createMissingToggle: document.getElementById("createMissingToggle"),
    createDefaults: document.getElementById("createDefaults"),
    defaultCategory: document.getElementById("defaultCategory"),
    defaultUnit: document.getElementById("defaultUnit"),
    defaultBrand: document.getElementById("defaultBrand"),
    syncReadySku: document.getElementById("syncReadySku"),
    matchedProductCount: document.getElementById("matchedProductCount"),
    unmatchedProductCount: document.getElementById("unmatchedProductCount"),
    syncSuccessCount: document.getElementById("syncSuccessCount"),
    matchProductsBtn: document.getElementById("matchProductsBtn"),
    syncProductsBtn: document.getElementById("syncProductsBtn"),
    syncProgressWrap: document.getElementById("syncProgressWrap"),
    syncProgressText: document.getElementById("syncProgressText"),
    syncProgressPercent: document.getElementById("syncProgressPercent"),
    syncProgressBar: document.getElementById("syncProgressBar"),
    message: document.getElementById("message"),
  };

  const state = {
    db: null,
    rows: [],
    filteredRows: [],
    page: 1,
    pageSize: Number(E.pageSizeSelect?.value || 50),
    rawCount: 0,
    removedCount: 0,
    sourceFileName: "",
    accessGranted: false,
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
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function normalizeHeader(value) {
    return String(value ?? "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase();
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
    return {
      empty: false,
      valid: Number.isFinite(number) && number >= 0,
      value: number,
    };
  }

  function money(value) {
    if (value === null || value === undefined || value === "") return "-";
    return new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  }

  function integer(value) {
    return new Intl.NumberFormat("th-TH", {
      maximumFractionDigits: 3,
    }).format(Number(value || 0));
  }

  function setMessage(text, type = "info") {
    E.message.textContent = text || "";
    E.message.className = `message ${text ? `is-${type}` : ""}`.trim();
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

  function csvEscape(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function downloadCsv(filename, headers, rows) {
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
    ];
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
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
        if (inQuotes && next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(field);
        field = "";
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

  function rowPriceStatus(row) {
    const cost = parseOptionalMoney(row.cost_price);
    const selling = parseOptionalMoney(row.selling_price);
    if (!cost.valid || !selling.valid) return "invalid";
    if (cost.empty || selling.empty) return "missing";
    if (selling.value < cost.value) return "invalid";
    return "ready";
  }

  function priceBadge(status) {
    if (status === "ready") return '<span class="badge badge-ready">พร้อมอัปเดต</span>';
    if (status === "invalid") return '<span class="badge badge-invalid">ราคาผิดเงื่อนไข</span>';
    return '<span class="badge badge-missing">รอกรอกราคา</span>';
  }

  function recordKey(trackingNumber, skuId) {
    return `${normalizeText(trackingNumber)}\u001F${normalizeText(skuId)}`;
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
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
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
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("บันทึกข้อมูลชั่วคราวไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error || new Error("ยกเลิกการบันทึกข้อมูลชั่วคราว"));
    });
  }

  async function saveRowsOnly(rows) {
    const transaction = state.db.transaction(RECORD_STORE, "readwrite");
    const store = transaction.objectStore(RECORD_STORE);
    rows.forEach((row) => store.put(row));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("บันทึกราคาไม่สำเร็จ"));
      transaction.onabort = () => reject(transaction.error || new Error("ยกเลิกการบันทึกราคา"));
    });
  }

  async function loadWorkspace() {
    const transaction = state.db.transaction([RECORD_STORE, META_STORE], "readonly");
    const rowsRequest = transaction.objectStore(RECORD_STORE).getAll();
    const metaRequest = transaction.objectStore(META_STORE).getAll();
    const [rows, metaRows] = await Promise.all([
      idbRequest(rowsRequest),
      idbRequest(metaRequest),
    ]);
    const meta = Object.fromEntries(metaRows.map((item) => [item.key, item.value]));
    state.rows = Array.isArray(rows) ? rows : [];
    state.rawCount = Number(meta.rawCount || 0);
    state.removedCount = Number(meta.removedCount || 0);
    state.sourceFileName = String(meta.sourceFileName || "");
    if (state.rows.length) {
      E.sourceFileName.textContent = state.sourceFileName || "ข้อมูลที่บันทึกไว้ในเครื่อง";
      E.workspaceStatus.textContent = "กู้คืนข้อมูลล่าสุดแล้ว";
    }
    applyFilters();
  }

  async function clearWorkspace() {
    const transaction = state.db.transaction([RECORD_STORE, META_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(META_STORE).clear();
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    state.rows = [];
    state.filteredRows = [];
    state.rawCount = 0;
    state.removedCount = 0;
    state.sourceFileName = "";
    state.productsLoaded = false;
    state.products = [];
    state.productByCode.clear();
    state.productByBarcode.clear();
    state.matches.clear();
    E.sourceFileInput.value = "";
    E.priceFileInput.value = "";
    E.sourceFileName.textContent = "ยังไม่ได้เลือกไฟล์";
    E.workspaceStatus.textContent = "พร้อมเริ่มงาน";
    E.trackingSearch.value = "";
    E.priceStatusFilter.value = "all";
    E.priceImportSummary.hidden = true;
    E.trackingResult.hidden = true;
    E.syncSuccessCount.textContent = "0";
    applyFilters();
    setMessage("ล้างข้อมูลชุดนำเข้าแล้ว", "success");
  }

  async function processSourceFile(file) {
    if (!file || state.busy) return;
    state.busy = true;
    disablePrimaryActions(true);
    setMessage("");
    E.sourceFileName.textContent = file.name;
    E.workspaceStatus.textContent = "กำลังอ่านไฟล์";
    setParseProgress(5, "กำลังเปิดไฟล์...");

    try {
      const text = await file.text();
      setParseProgress(24, "กำลังแยกคอลัมน์ CSV...");
      await nextFrame();
      const matrix = parseCsv(text);
      if (matrix.length < 2) throw new Error("ไฟล์ไม่มีรายการข้อมูล");

      const headers = matrix[0].map(normalizeHeader);
      const missing = REQUIRED_SOURCE_HEADERS.filter((header) => !headers.includes(header));
      if (missing.length) {
        throw new Error(`ไฟล์ขาดคอลัมน์: ${missing.join(", ")}`);
      }

      const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
      const aggregated = new Map();
      let removed = 0;
      setParseProgress(38, "กำลังตัดแถวที่ไม่มี Tracking หรือ SKU...");

      for (let index = 1; index < matrix.length; index += 1) {
        const values = matrix[index];
        const trackingNumber = normalizeText(values[positions.tracking_number]);
        const skuId = normalizeText(values[positions.sku_id]);
        if (!trackingNumber || !skuId) {
          removed += 1;
          continue;
        }

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
          source_item_price: positions.item_price_pp !== undefined
            ? normalizeText(values[positions.item_price_pp])
            : "",
          cost_price: "",
          selling_price: "",
          product_code: "",
          merged_rows: 1,
          imported_at: new Date().toISOString(),
        });
      }

      setParseProgress(72, "กำลังรวมรายการ Tracking + SKU ที่ซ้ำกัน...");
      await nextFrame();
      const rows = Array.from(aggregated.values()).sort((a, b) =>
        a.tracking_number.localeCompare(b.tracking_number, "th") ||
        a.sku_id.localeCompare(b.sku_id, "th")
      );

      if (!rows.length) throw new Error("ไม่พบรายการที่มี Tracking และ SKU ครบถ้วน");

      setParseProgress(86, "กำลังบันทึกพื้นที่ทำงานในเครื่อง...");
      await saveWorkspace(rows, {
        sourceFileName: file.name,
        rawCount: matrix.length - 1,
        removedCount: removed,
        savedAt: new Date().toISOString(),
        version: VERSION,
      });

      state.rows = rows;
      state.rawCount = matrix.length - 1;
      state.removedCount = removed;
      state.sourceFileName = file.name;
      state.page = 1;
      state.matches.clear();
      E.workspaceStatus.textContent = "ตรวจสอบไฟล์เสร็จแล้ว";
      setParseProgress(100, "อ่านและรวมข้อมูลเรียบร้อย");
      applyFilters();
      setMessage(
        `นำเข้าไฟล์สำเร็จ ${integer(rows.length)} รายการ ตัดแถวที่ไม่มี Tracking หรือ SKU ${integer(removed)} แถว`,
        "success"
      );
      document.getElementById("reviewPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      E.workspaceStatus.textContent = "อ่านไฟล์ไม่สำเร็จ";
      setMessage(error?.message || "อ่านไฟล์ Shopee ไม่สำเร็จ", "error");
      setParseProgress(0, "เกิดข้อผิดพลาด");
    } finally {
      state.busy = false;
      disablePrimaryActions(false);
      setTimeout(() => {
        if (E.parseProgressBar.style.width === "100%") E.parseProgressWrap.hidden = true;
      }, 1200);
    }
  }

  function uniqueSkuPriceRows() {
    const bySku = new Map();
    for (const row of state.rows) {
      const sku = normalizeText(row.sku_id);
      if (!sku) continue;
      const current = bySku.get(sku);
      const candidate = {
        sku_id: sku,
        item_name: row.item_name,
        main_category: row.main_category,
        sub_category: row.sub_category,
        cost_price: row.cost_price,
        selling_price: row.selling_price,
        product_code: row.product_code,
        status: rowPriceStatus(row),
      };
      if (!current) {
        bySku.set(sku, candidate);
        continue;
      }
      if (!current.item_name && candidate.item_name) current.item_name = candidate.item_name;
      if (!current.product_code && candidate.product_code) current.product_code = candidate.product_code;
      if (normalizeText(current.cost_price) === "" && normalizeText(candidate.cost_price) !== "") current.cost_price = candidate.cost_price;
      if (normalizeText(current.selling_price) === "" && normalizeText(candidate.selling_price) !== "") current.selling_price = candidate.selling_price;
      current.status = rowPriceStatus(current);
    }
    return Array.from(bySku.values());
  }

  function applyFilters() {
    const query = normalizeText(E.trackingSearch.value).toLowerCase();
    const priceStatus = E.priceStatusFilter.value;
    state.pageSize = Number(E.pageSizeSelect.value || 50);

    state.filteredRows = state.rows.filter((row) => {
      const matchesQuery = !query || [
        row.tracking_number,
        row.sku_id,
        row.item_name,
        row.product_code,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const status = rowPriceStatus(row);
      const matchesStatus = priceStatus === "all" || status === priceStatus;
      return matchesQuery && matchesStatus;
    });

    const pages = Math.max(1, Math.ceil(state.filteredRows.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    renderSummary();
    renderTable();
    renderTrackingResult(query);
    updateActionState();
  }

  function renderSummary() {
    const trackingSet = new Set(state.rows.map((row) => row.tracking_number));
    const skuSet = new Set(state.rows.map((row) => row.sku_id));
    const readySku = uniqueSkuPriceRows().filter((row) => rowPriceStatus(row) === "ready").length;
    E.rawCount.textContent = integer(state.rawCount);
    E.cleanCount.textContent = integer(state.rows.length);
    E.trackingCount.textContent = integer(trackingSet.size);
    E.skuCount.textContent = integer(skuSet.size);
    E.removedCount.textContent = integer(state.removedCount);
    E.readyPriceCount.textContent = integer(readySku);
    E.syncReadySku.textContent = integer(readySku);
  }

  function renderTable() {
    if (!state.rows.length) {
      E.previewBody.innerHTML = '<tr><td colspan="10" class="empty-cell">เลือกไฟล์ Shopee เพื่อเริ่มตรวจสอบ</td></tr>';
      E.pageInfo.textContent = "หน้า 0 / 0";
      E.prevPageBtn.disabled = true;
      E.nextPageBtn.disabled = true;
      return;
    }

    if (!state.filteredRows.length) {
      E.previewBody.innerHTML = '<tr><td colspan="10" class="empty-cell">ไม่พบรายการตามตัวกรอง</td></tr>';
      E.pageInfo.textContent = "หน้า 0 / 0";
      E.prevPageBtn.disabled = true;
      E.nextPageBtn.disabled = true;
      return;
    }

    const totalPages = Math.ceil(state.filteredRows.length / state.pageSize);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = state.filteredRows.slice(start, start + state.pageSize);

    E.previewBody.innerHTML = pageRows.map((row, offset) => {
      const status = rowPriceStatus(row);
      const match = state.matches.get(row.sku_id);
      const matchBadge = match
        ? match.type === "existing"
          ? '<span class="badge badge-match">พบสินค้าเดิม</span>'
          : '<span class="badge badge-created">พร้อมสร้างใหม่</span>'
        : priceBadge(status);
      return `
        <tr>
          <td>${start + offset + 1}</td>
          <td class="code">${esc(row.tracking_number)}</td>
          <td class="code">${esc(row.sku_id)}</td>
          <td class="main-cell"><strong>${esc(row.item_name || "-")}</strong><small>รวมจาก ${integer(row.merged_rows || 1)} แถว</small></td>
          <td><strong>${esc(row.main_category || "-")}</strong><br><small>${esc(row.sub_category || "-")}</small></td>
          <td class="num"><strong>${integer(row.item_quantity)}</strong></td>
          <td class="num money">${money(row.cost_price)}</td>
          <td class="num money">${money(row.selling_price)}</td>
          <td class="code">${esc(row.product_code || match?.product?.product_code || "-")}</td>
          <td>${matchBadge}</td>
        </tr>`;
    }).join("");

    E.pageInfo.textContent = `หน้า ${integer(state.page)} / ${integer(totalPages)} · ${integer(state.filteredRows.length)} รายการ`;
    E.prevPageBtn.disabled = state.page <= 1;
    E.nextPageBtn.disabled = state.page >= totalPages;
  }

  function renderTrackingResult(query) {
    if (!query || !state.rows.length) {
      E.trackingResult.hidden = true;
      return;
    }
    const exact = state.rows.filter((row) => row.tracking_number.toLowerCase() === query);
    const candidateTracking = exact[0]?.tracking_number || state.rows.find((row) => row.tracking_number.toLowerCase().includes(query))?.tracking_number;
    if (!candidateTracking) {
      E.trackingResult.hidden = true;
      return;
    }
    const items = state.rows.filter((row) => row.tracking_number === candidateTracking);
    const qty = items.reduce((sum, row) => sum + Number(row.item_quantity || 0), 0);
    E.trackingResultNumber.textContent = candidateTracking;
    E.trackingResultSkuCount.textContent = integer(items.length);
    E.trackingResultQty.textContent = integer(qty);
    E.trackingResultItems.innerHTML = items.map((row) => `
      <article class="tracking-item">
        <div><strong>${esc(row.item_name || row.sku_id)}</strong><small>${esc(row.sku_id)} · ${esc(row.sub_category || row.main_category || "ไม่ระบุหมวดหมู่")}</small></div>
        <span class="qty">${integer(row.item_quantity)} ชิ้น</span>
      </article>`).join("");
    E.trackingResult.hidden = false;
  }

  function exportCleanFile(includePriceColumns) {
    if (!state.rows.length) return;
    const headers = [
      "source",
      "tracking_number",
      "sku_id",
      "item_quantity",
      "item_name",
      "main_category",
      "sub_category",
      "merged_rows",
    ];
    if (includePriceColumns) headers.push("product_code", "cost_price", "selling_price");
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(
      includePriceColumns ? `shopee-price-entry-${date}.csv` : `shopee-clean-${date}.csv`,
      headers,
      state.rows
    );
    setMessage(includePriceColumns
      ? "ดาวน์โหลดไฟล์กรอกราคาแล้ว ให้กรอก product_code, cost_price และ selling_price จากนั้นอัปโหลดกลับ"
      : "ดาวน์โหลดไฟล์ Shopee ที่รวมรายการซ้ำแล้ว",
    "success");
  }

  async function importPriceFile(file) {
    if (!file || !state.rows.length || state.busy) return;
    state.busy = true;
    disablePrimaryActions(true);
    E.priceImportSummary.hidden = true;
    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      if (matrix.length < 2) throw new Error("ไฟล์ราคายังไม่มีข้อมูล");
      const headers = matrix[0].map(normalizeHeader);
      const required = ["sku_id", "cost_price", "selling_price"];
      const missing = required.filter((header) => !headers.includes(header));
      if (missing.length) throw new Error(`ไฟล์ราคาขาดคอลัมน์: ${missing.join(", ")}`);
      const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
      const priceBySku = new Map();
      const conflicts = new Set();
      let ignored = 0;

      for (let index = 1; index < matrix.length; index += 1) {
        const values = matrix[index];
        const skuId = normalizeText(values[positions.sku_id]);
        if (!skuId) {
          ignored += 1;
          continue;
        }
        const item = {
          sku_id: skuId,
          product_code: positions.product_code !== undefined ? normalizeText(values[positions.product_code]) : "",
          cost_price: normalizeText(values[positions.cost_price]),
          selling_price: normalizeText(values[positions.selling_price]),
        };
        const previous = priceBySku.get(skuId);
        if (previous && (
          previous.cost_price !== item.cost_price ||
          previous.selling_price !== item.selling_price ||
          (previous.product_code && item.product_code && previous.product_code !== item.product_code)
        )) {
          conflicts.add(skuId);
        } else if (!previous) {
          priceBySku.set(skuId, item);
        } else if (!previous.product_code && item.product_code) {
          previous.product_code = item.product_code;
        }
      }

      if (conflicts.size) {
        throw new Error(`พบราคาไม่ตรงกันใน SKU เดียวกัน ${conflicts.size.toLocaleString("th-TH")} SKU กรุณาแก้ไฟล์ก่อน`);
      }

      let updatedRows = 0;
      let matchedSku = 0;
      const foundSku = new Set();
      for (const row of state.rows) {
        const price = priceBySku.get(row.sku_id);
        if (!price) continue;
        row.cost_price = price.cost_price;
        row.selling_price = price.selling_price;
        if (price.product_code) row.product_code = price.product_code;
        updatedRows += 1;
        foundSku.add(row.sku_id);
      }
      matchedSku = foundSku.size;
      await saveRowsOnly(state.rows);
      state.matches.clear();
      applyFilters();

      const ready = uniqueSkuPriceRows().filter((row) => rowPriceStatus(row) === "ready").length;
      const invalid = uniqueSkuPriceRows().filter((row) => rowPriceStatus(row) === "invalid").length;
      E.priceImportSummary.innerHTML = `อ่านไฟล์ <strong>${esc(file.name)}</strong> แล้ว · จับคู่ ${integer(matchedSku)} SKU · อัปเดต ${integer(updatedRows)} รายการ Tracking · พร้อมบันทึก ${integer(ready)} SKU · ผิดเงื่อนไข ${integer(invalid)} SKU${ignored ? ` · ข้าม ${integer(ignored)} แถว` : ""}`;
      E.priceImportSummary.hidden = false;
      setMessage(
        invalid
          ? `รับไฟล์ราคาแล้ว แต่มี ${integer(invalid)} SKU ที่ราคาขายต่ำกว่าต้นทุนหรือรูปแบบราคาไม่ถูกต้อง`
          : `รับไฟล์ราคาแล้ว พร้อมตรวจจับคู่สินค้า ${integer(ready)} SKU`,
        invalid ? "error" : "success"
      );
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "อ่านไฟล์ราคาไม่สำเร็จ", "error");
    } finally {
      state.busy = false;
      disablePrimaryActions(false);
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
    E.defaultCategory.innerHTML = (categories.data || []).map((item) =>
      `<option value="${esc(item.code)}">${esc(item.code)} — ${esc(item.name)}</option>`
    ).join("");
    E.defaultUnit.innerHTML = (units.data || []).map((item) =>
      `<option value="${esc(item.name)}">${esc(item.name)}</option>`
    ).join("");
    E.defaultBrand.innerHTML = '<option value="">ไม่ระบุยี่ห้อ</option>' + (brands.data || []).map((item) =>
      `<option value="${esc(item.code)}">${esc(item.code)} — ${esc(item.name)}</option>`
    ).join("");
    state.optionsLoaded = true;
  }

  async function loadAllProducts() {
    if (state.productsLoaded) return;
    state.products = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await supabaseClient
        .from("products")
        .select("id,product_code,name,barcode,category_id,unit_id,brand_id,cost_price,selling_price,minimum_stock,vat_rate,description,image_url,is_active")
        .range(from, to);
      if (error) throw error;
      const batch = data || [];
      state.products.push(...batch);
      if (batch.length < pageSize) break;
    }
    state.productByCode = new Map(
      state.products.filter((item) => item.product_code).map((item) => [normalizeCode(item.product_code), item])
    );
    state.productByBarcode = new Map(
      state.products.filter((item) => item.barcode).map((item) => [normalizeText(item.barcode), item])
    );
    state.productsLoaded = true;
  }

  async function matchProducts() {
    if (!state.rows.length || state.busy) return;
    const priceRows = uniqueSkuPriceRows().filter((row) => rowPriceStatus(row) === "ready");
    if (!priceRows.length) {
      setMessage("ยังไม่มี SKU ที่กรอกราคาครบและผ่านเงื่อนไข", "error");
      return;
    }
    state.busy = true;
    disablePrimaryActions(true);
    setMessage("กำลังโหลดสินค้าเดิมและตรวจจับคู่...", "info");
    try {
      await Promise.all([loadAllProducts(), loadOptions()]);
      state.matches.clear();
      let matched = 0;
      let unmatched = 0;
      for (const row of priceRows) {
        const requestedCode = normalizeCode(row.product_code || row.sku_id);
        const product = state.productByCode.get(requestedCode)
          || state.productByBarcode.get(normalizeText(row.sku_id));
        if (product) {
          state.matches.set(row.sku_id, { type: "existing", product, price: row });
          matched += 1;
        } else {
          state.matches.set(row.sku_id, { type: "missing", product: null, price: row });
          unmatched += 1;
        }
      }
      E.matchedProductCount.textContent = integer(matched);
      E.unmatchedProductCount.textContent = integer(unmatched);
      renderTable();
      updateActionState();
      setMessage(
        `ตรวจจับคู่เสร็จ: พบสินค้าเดิม ${integer(matched)} SKU, ยังไม่พบ ${integer(unmatched)} SKU`,
        unmatched ? "info" : "success"
      );
    } catch (error) {
      console.error(error);
      setMessage(error?.message || "ตรวจจับคู่สินค้าไม่สำเร็จ", "error");
    } finally {
      state.busy = false;
      disablePrimaryActions(false);
    }
  }

  async function syncProducts() {
    if (!state.matches.size || state.busy) return;
    const createMissing = E.createMissingToggle.checked;
    const jobs = Array.from(state.matches.entries()).filter(([, match]) =>
      match.type === "existing" || (match.type === "missing" && createMissing)
    );
    const skipped = Array.from(state.matches.values()).filter((match) => match.type === "missing").length;

    if (!jobs.length) {
      setMessage("ไม่พบสินค้าเดิมที่จะอัปเดต หรือยังไม่ได้เปิดการสร้างสินค้าใหม่", "error");
      return;
    }
    if (createMissing && (!E.defaultCategory.value || !E.defaultUnit.value)) {
      setMessage("กรุณาเลือกหมวดหมู่และหน่วยนับเริ่มต้นสำหรับสินค้าที่สร้างใหม่", "error");
      return;
    }

    const confirmation = [
      `ยืนยันอัปเดตราคา ${jobs.length.toLocaleString("th-TH")} SKU?`,
      "",
      "ระบบจะไม่ปรับยอดสต็อกเดิม",
      createMissing ? "สินค้าที่สร้างใหม่จะมีสต็อกเริ่มต้น 0" : `SKU ที่ไม่พบ ${skipped.toLocaleString("th-TH")} รายการจะถูกข้าม`,
    ].join("\n");
    if (!window.confirm(confirmation)) return;

    state.busy = true;
    disablePrimaryActions(true);
    E.syncSuccessCount.textContent = "0";
    setSyncProgress(0, "กำลังเตรียมอัปเดต...");
    let success = 0;
    let failed = 0;
    const failures = [];

    for (let index = 0; index < jobs.length; index += 1) {
      const [skuId, match] = jobs[index];
      const price = match.price;
      const cost = parseOptionalMoney(price.cost_price).value;
      const selling = parseOptionalMoney(price.selling_price).value;
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
            p_product_code: normalizeText(price.product_code || skuId),
            p_name: price.item_name || `Shopee SKU ${skuId}`,
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
        success += 1;
      } catch (error) {
        failed += 1;
        failures.push(`${skuId}: ${error?.message || "ไม่สำเร็จ"}`);
      }

      const percent = ((index + 1) / jobs.length) * 100;
      setSyncProgress(percent, `กำลังอัปเดต ${index + 1}/${jobs.length}`);
      E.syncSuccessCount.textContent = integer(success);
      if ((index + 1) % 10 === 0) await nextFrame();
    }

    state.productsLoaded = false;
    state.matches.clear();
    E.matchedProductCount.textContent = "0";
    E.unmatchedProductCount.textContent = "0";
    renderTable();
    updateActionState();
    state.busy = false;
    disablePrimaryActions(false);

    if (failed) {
      console.warn("Shopee sync failures", failures);
      setMessage(`อัปเดตเสร็จ: สำเร็จ ${integer(success)} SKU, ล้มเหลว ${integer(failed)} SKU — เปิด Console เพื่อดูรายละเอียด`, "error");
    } else {
      setMessage(`อัปเดตราคาสำเร็จ ${integer(success)} SKU โดยไม่ปรับยอดสต็อกเดิม`, "success");
    }
  }

  function updateActionState() {
    const hasRows = state.rows.length > 0;
    const readySku = uniqueSkuPriceRows().filter((row) => rowPriceStatus(row) === "ready").length;
    E.exportCleanBtn.disabled = !hasRows || state.busy;
    E.exportPriceBtn.disabled = !hasRows || state.busy;
    E.choosePriceFileBtn.disabled = !hasRows || state.busy;
    E.matchProductsBtn.disabled = !hasRows || !readySku || state.busy;
    const allowedJobs = Array.from(state.matches.values()).filter((match) =>
      match.type === "existing" || (match.type === "missing" && E.createMissingToggle.checked)
    ).length;
    E.syncProductsBtn.disabled = !allowedJobs || state.busy;
  }

  function disablePrimaryActions(disabled) {
    [
      E.exportCleanBtn,
      E.exportPriceBtn,
      E.choosePriceFileBtn,
      E.matchProductsBtn,
      E.syncProductsBtn,
      E.clearWorkspaceBtn,
    ].forEach((button) => {
      if (button) button.disabled = disabled;
    });
    if (!disabled) updateActionState();
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function bindEvents() {
    E.dropZone.addEventListener("click", () => E.sourceFileInput.click());
    E.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        E.sourceFileInput.click();
      }
    });
    ["dragenter", "dragover"].forEach((name) => E.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      E.dropZone.classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach((name) => E.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      E.dropZone.classList.remove("is-dragging");
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
      if (!state.rows.length || window.confirm("ยืนยันล้างข้อมูล Shopee และราคาที่บันทึกไว้ในเครื่อง?")) {
        await clearWorkspace();
      }
    });
    E.exportCleanBtn.addEventListener("click", () => exportCleanFile(false));
    E.exportPriceBtn.addEventListener("click", () => exportCleanFile(true));
    E.choosePriceFileBtn.addEventListener("click", () => E.priceFileInput.click());
    E.priceFileInput.addEventListener("change", () => {
      const file = E.priceFileInput.files?.[0];
      if (file) importPriceFile(file);
    });

    let searchTimer = null;
    E.trackingSearch.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.page = 1;
        applyFilters();
      }, 140);
    });
    E.trackingSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        state.page = 1;
        applyFilters();
      }
    });
    E.priceStatusFilter.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });
    E.pageSizeSelect.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });
    E.clearFilterBtn.addEventListener("click", () => {
      E.trackingSearch.value = "";
      E.priceStatusFilter.value = "all";
      state.page = 1;
      applyFilters();
      E.trackingSearch.focus();
    });
    E.prevPageBtn.addEventListener("click", () => {
      state.page -= 1;
      renderTable();
    });
    E.nextPageBtn.addEventListener("click", () => {
      state.page += 1;
      renderTable();
    });
    E.createMissingToggle.addEventListener("change", async () => {
      E.createDefaults.hidden = !E.createMissingToggle.checked;
      if (E.createMissingToggle.checked) {
        try {
          await loadOptions();
        } catch (error) {
          setMessage(error?.message || "โหลดตัวเลือกสินค้าไม่สำเร็จ", "error");
          E.createMissingToggle.checked = false;
          E.createDefaults.hidden = true;
        }
      }
      updateActionState();
    });
    E.matchProductsBtn.addEventListener("click", matchProducts);
    E.syncProductsBtn.addEventListener("click", syncProducts);

    document.querySelectorAll("[data-step-target]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".step").forEach((item) => item.classList.toggle("is-active", item === button));
        const target = document.querySelector(`[data-panel="${button.dataset.stepTarget}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  async function initializePage() {
    try {
      const access = await window.TKNAuthGuard.requireAccess("product.manage", {
        loadingText: "กำลังตรวจสอบสิทธิ์นำเข้า Shopee...",
      });
      if (!access) return;
      state.accessGranted = true;
      state.db = await openDatabase();
      bindEvents();
      await loadWorkspace();
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session) return;
        state.accessGranted = false;
        window.TKNAuthGuard.clearAccessCache();
        location.replace("./dashboard.html");
      });
      window.TKNAuthGuard.ready();
      if (state.rows.length) setMessage("กู้คืนพื้นที่ทำงาน Shopee ล่าสุดจากเครื่องนี้แล้ว", "info");
    } catch (error) {
      console.error(error);
      if (error?.code === "INVENTORY_PERMISSION_DENIED") return;
      window.TKNAuthGuard.fail(error, () => location.reload());
    }
  }

  initializePage();
})();
