(() => {
  "use strict";

  const VERSION = "5.31.28-HF14";
  const PATTERN = window.TKNProductPattern;
  const BOX_CODE = window.TKNBoxCode;
  if (!BOX_CODE) throw new Error("ไม่พบ TKN Box Code v5.25.5");
  const WORKFLOW_TABS = ["receive", "finalize", "audit"];
  const WORKFLOW_NEXT_LABELS = ["ถัดไป: ปิดกล่องและ QR", "ถัดไป: ประวัติ", "จบงาน"];
  const KEY = "tkn_box_qr_v512"; // ใช้ key เดิมเพื่อรักษารอบงานที่ค้างไว้
  // HF14: รายการที่ยืนยันจาก Diagnostic ว่าเป็น DRAFT ค้างและจะถูก Cleanup ฝั่งฐานข้อมูล
  // ใช้เฉพาะล้าง Local State ของกล่องเป้าหมายเดียวกันหลังติดตั้ง SQL เพื่อไม่ให้ 1 ชิ้นย้อนกลับมาบนหน้าจอ
  const HF14_STALE_BOX_CODES = new Set([
    "TKN-B-260805-392450",
    "TKN-B-260805-648793",
    "TKN-B-HOM-A04",
  ]);

  const BOX_LABEL_PROFILES = Object.freeze({
    "58x40": { width: 58, height: 40 },
    "70x70": { width: 70, height: 70 },
    "100x70": { width: 100, height: 70 },
  });
  const DEFAULT_BOX_PRINT_SETTINGS=Object.freeze({printerMode:'AUTO',dpi:300,preset:'label58',customWidth:58,customHeight:38,columns:1,copies:1,gap:2,pageMargin:0,codeMode:'both',showDetails:true,showBarcodeText:false});
  const CONDITION_LABELS = Object.freeze({
    GOOD: "งานดี", DAMAGED: "งานเสีย", NOT_AS_DESCRIBED: "ไม่ตรงปก", INCOMPLETE: "ชิ้นส่วนไม่ครบ",
    UNUSABLE: "ใช้ไม่ได้", RECHECK: "รอตรวจซ้ำ", RETURN: "ส่งคืน", PARTS: "แยกขายอะไหล่",
  });

  const $ = (id) => document.getElementById(id);
  const bind = (id, eventName, handler) => {
    const element = $(id);
    if (!element) {
      console.warn(`[Box QR] ไม่พบ #${id} จึงข้ามการผูก ${eventName}`);
      return false;
    }
    element.addEventListener(eventName, handler);
    return true;
  };

  const S = {
    session: null,
    box: null,
    receipts: [],
    boxItems: [],
    audit: [],
    user: "-",
    userId: null,
    cloudStats: null,
    round: { active: false, closedBoxIds: [], started_at: null },
    printSettings: { ...DEFAULT_BOX_PRINT_SETTINGS },
  };

  let cameraScanner = null;
  let cloudHistory = [];
  let activeHistoryDetail = null;
  let batchQrRows = [];

  const now = () => new Date().toISOString();
  const code = (prefix) => `${prefix}-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const integer = (value) => Number(value || 0).toLocaleString("th-TH");
  const numeric = (value, fallback = 0) => {
    const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  function msg(text, kind = "") {
    const host = $("message");
    if (!host) return;
    host.textContent = text;
    host.className = `notice ${kind}`;
  }

  function save(renderAfter = true) {
    localStorage.setItem(KEY, JSON.stringify(S));
    if (renderAfter) render();
  }

  function camera() {
    if (!window.TKNBoxQRCameraScanner) {
      msg("โหลดระบบกล้องไม่สำเร็จ กรุณารีเฟรชหน้า", "error");
      return null;
    }
    if (!cameraScanner) {
      cameraScanner = new window.TKNBoxQRCameraScanner({
        onMessage: (text, type) => msg(text, type === "error" ? "error" : type === "success" ? "success" : ""),
      });
    }
    return cameraScanner;
  }

  async function openProductCamera() {
    const scanner = camera();
    if (!scanner) return;
    scanner.onScan = async (value) => {
      $("receiveSku").value = cleanScan(value);
      await receiveAndBox();
    };
    await scanner.open({
      title: "สแกนรับคืนและเพิ่มเข้ากล่อง",
      instruction: "โหมดต่อเนื่อง · สแกนแล้วเพิ่มลงกล่องทันทีตามจำนวนต่อการสแกน",
      successText: "เพิ่มเข้ากล่อง",
      closeOnScan: false,
      cooldownMs: 900,
    });
  }

  function newSession() {
    S.session = { id: code("RCV"), source: "หน้าร้าน", created_at: now(), cloudId: null };
    if ($("receiveCode")) $("receiveCode").value = S.session.id;
  }

  function newBox(options = {}) {
    const previous = S.box || {};
    const preserveIdentity = Boolean(options.preserveIdentity);
    S.box = {
      id: code("TKN-B"),
      draftId: null,
      shortCode: "",
      category: preserveIdentity ? (previous.category || "") : "",
      categoryCode: preserveIdentity ? (previous.categoryCode || "") : "",
      zoneCode: preserveIdentity ? BOX_CODE.normalizeZone(previous.zoneCode || "A") : "A",
      status: "DRAFT",
      location: preserveIdentity ? (previous.location || "") : "",
      created_at: now(),
      cloudId: null,
      reservedQr: false,
      reservedCategoryCode: "",
    };
    S.boxItems = [];
    if ($("reservedBoxScan")) $("reservedBoxScan").value = "";
    if ($("reservedBoxHint")) $("reservedBoxHint").textContent = "ใช้สำหรับ QR ที่สร้างหลายดวงล่วงหน้า · ต้องเลือกก่อนสแกนสินค้าเข้ากล่อง";
    if ($("boxCode")) $("boxCode").value = S.box.id;
    if ($("boxCategorySelect")) $("boxCategorySelect").value = S.box.category || "";
    if ($("boxZoneCode")) $("boxZoneCode").value = S.box.zoneCode;
    if ($("location")) $("location").value = S.box.location || "";
  }

  function ensureRoundState() {
    S.round = { active: false, closedBoxIds: [], started_at: null, ...(S.round || {}) };
    S.round.closedBoxIds = Array.isArray(S.round.closedBoxIds) ? [...new Set(S.round.closedBoxIds.filter(Boolean))] : [];
    const hasCurrentWork = Boolean(S.receipts?.length || S.boxItems?.length || S.box?.status === "CLOSED");
    if (hasCurrentWork) S.round.active = true;
    if (S.box?.status === "CLOSED" && S.box.id && !S.round.closedBoxIds.includes(S.box.id)) S.round.closedBoxIds.push(S.box.id);
    if (S.round.active && !S.round.started_at) S.round.started_at = S.session?.created_at || now();
  }

  function markRoundActive() {
    ensureRoundState();
    S.round.active = true;
    S.round.started_at ||= now();
  }

  function migrateLegacyState() {
    S.receipts = Array.isArray(S.receipts) ? S.receipts : [];
    S.boxItems = Array.isArray(S.boxItems) ? S.boxItems : [];
    S.audit = Array.isArray(S.audit) ? S.audit : [];
    S.printSettings = { ...DEFAULT_BOX_PRINT_SETTINGS, ...(S.printSettings || {}) };
    ensureRoundState();
    if (S.box) {
      const parsedBox = BOX_CODE.parse(S.box.id);
      S.box.zoneCode = BOX_CODE.normalizeZone(S.box.zoneCode || parsedBox?.zone || "A");
      S.box.category = S.box.category || parsedBox?.categoryLabel || "";
      S.box.categoryCode = S.box.categoryCode || parsedBox?.categoryCode || "";
      S.box.shortCode = S.box.shortCode || parsedBox?.short || "";
      S.box.draftId = S.box.draftId || (parsedBox ? null : S.box.id);
      S.box.reservedQr = Boolean(S.box.reservedQr);
      S.box.reservedCategoryCode = String(S.box.reservedCategoryCode || "").toUpperCase();
    }

    const invalidReceipt = (row) => !row?.product_id && /ยังไม่พบในหน้าจัดการสินค้า|ตรวจสอบสินค้าไม่สำเร็จ/.test(String(row?.name || ""));
    const invalidBoxItem = (row) => !row?.product_id && /ยังไม่พบในหน้าจัดการสินค้า|ตรวจสอบสินค้าไม่สำเร็จ/.test(String(row?.name || ""));
    const removed = S.receipts.filter(invalidReceipt).length + S.boxItems.filter(invalidBoxItem).length;
    S.receipts = S.receipts.filter((row) => !invalidReceipt(row));
    S.boxItems = S.boxItems.filter((row) => !invalidBoxItem(row));

    // HF14: ใช้การผูก item กับรหัสกล่องโดยตรง แทนการเดาจาก timestamp.
    // Receipt เป็นประวัติสะสมของรอบงานเท่านั้นและจะไม่ถูกนำกลับมาสร้าง boxItems อัตโนมัติอีก
    // เพราะพฤติกรรมดังกล่าวเป็นสาเหตุให้สินค้าจากกล่องก่อนหน้ากลับมาค้างในกล่องใหม่.
    let staleBoxItemsRemoved = 0;
    if (S.box?.status === "DRAFT" && HF14_STALE_BOX_CODES.has(String(S.box.id || ""))) {
      staleBoxItemsRemoved = S.boxItems.length;
      S.boxItems = [];
    } else if (S.box?.id && S.boxItems.length) {
      const before = S.boxItems.length;
      S.boxItems = S.boxItems.filter((row) => !row?.box_ref || row.box_ref === S.box.id);
      for (const row of S.boxItems) row.box_ref ||= S.box.id;
      staleBoxItemsRemoved = before - S.boxItems.length;
    }

    delete S.counts;
    delete S.countConfirmed;
    if (removed) setTimeout(() => msg(`นำรหัสสินค้าที่ไม่ถูกต้องออกจากรอบงานแล้ว ${removed} รายการ`, "error"), 80);
    if (staleBoxItemsRemoved) setTimeout(() => msg(`HF14 ล้าง Local State ที่ไม่ใช่ของกล่องปัจจุบันแล้ว ${staleBoxItemsRemoved} รายการ`, "success"), 100);
  }

  function load() {
    try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) {}
    migrateLegacyState();
    if (!S.session) newSession();
    if (!S.box) newBox();
    // HF14: บันทึกผล migration ทันที เพื่อไม่ให้ Local State ที่ล้างแล้วกลับมาอีกเมื่อ Refresh รอบถัดไป
    save(false);
    render();
    fillBoxPrintSettingInputs();
  }

  function audit(action, ref, detail) {
    const row = { at: now(), user: S.user, action, ref, detail };
    S.audit.unshift(row);
    S.audit = S.audit.slice(0, 300);
    void cloudAudit(action, ref, detail);
  }

  async function cloudAudit(action, ref, detail) {
    try {
      await supabaseClient.from("container_audit_log").insert({
        action,
        reference_code: ref || null,
        detail: { message: detail || "", source: `box-qr-v${VERSION}` },
        user_id: S.userId,
      });
    } catch (error) {
      console.warn("Cloud audit skipped:", error);
    }
  }

  function cleanScan(raw) {
    let value = String(raw || "").trim();
    try {
      const url = new URL(value);
      value = url.searchParams.get("id") || url.searchParams.get("code") || value;
    } catch (_) {}
    return value.trim();
  }

  function batchMsg(text, kind = "") {
    const host = $("boxBatchMessage");
    if (!host) return;
    host.textContent = text || "";
    host.className = `box-batch-message ${kind}`.trim();
  }

  function normalizeReservedBoxCode(raw) {
    const value = cleanScan(raw);
    if (!value) return "";
    const canonical = BOX_CODE.canonicalCode(value);
    return BOX_CODE.parse(canonical) ? canonical : "";
  }

  async function claimReservedBoxQr(raw) {
    if (S.box?.status !== "DRAFT") return msg("กล่องปัจจุบันปิดแล้ว กรุณาสร้างกล่องใหม่ก่อนใช้ QR ที่เตรียมไว้", "error");
    if (!(await guardCanLeaveCurrentDraft("เปลี่ยนไปใช้ QR กล่องที่เตรียมไว้"))) return;
    const codeValue = normalizeReservedBoxCode(raw || $("reservedBoxScan")?.value);
    if (!codeValue) return msg("QR กล่องไม่ถูกต้อง ต้องเป็นรูปแบบ TKN-B-ประเภท-โซน-เลข เช่น TKN-B-IT-A01", "error");
    try {
      const { data, error } = await supabaseClient.rpc("tkn_v5310_claim_reserved_box_qr", { p_box_code: codeValue });
      if (error) throw error;
      const parsed = BOX_CODE.parse(data?.box_code || codeValue);
      if (!parsed) throw new Error("รหัส QR ที่จองไว้ไม่อยู่ในรูปแบบมาตรฐาน");
      S.box.id = parsed.canonical;
      S.box.shortCode = parsed.short;
      S.box.category = data?.category_text || parsed.categoryLabel;
      S.box.categoryCode = data?.category_code || parsed.categoryCode;
      S.box.zoneCode = data?.zone_code || parsed.zone;
      S.box.cloudId = data?.box_id || null;
      S.box.reservedQr = true;
      S.box.reservedCategoryCode = parsed.categoryCode;
      if ($("boxCategorySelect") && [...$("boxCategorySelect").options].some(option => option.value === S.box.category)) $("boxCategorySelect").value = S.box.category;
      if ($("boxZoneCode")) $("boxZoneCode").value = S.box.zoneCode;
      if ($("reservedBoxScan")) $("reservedBoxScan").value = parsed.canonical;
      if ($("reservedBoxHint")) $("reservedBoxHint").textContent = `กำลังใช้ ${parsed.short} · ${S.box.category} · โซน ${S.box.zoneCode}`;
      audit("BOX_QR_RESERVED_CLAIM", parsed.canonical, `ใช้ QR ที่เตรียมไว้ ${parsed.short}`);
      save();
      msg(`ใช้ QR กล่อง ${parsed.short} แล้ว · สแกนสินค้าเข้ากล่องได้`, "success");
      $("receiveSku")?.focus();
    } catch (error) {
      console.error("Claim reserved box QR:", error);
      msg(`ใช้ QR ที่เตรียมไว้ไม่สำเร็จ: ${error.message || error}`, "error");
    }
  }

  function buildProductCreateUrl(raw) {
    const value = cleanScan(raw);
    const returnParams = new URLSearchParams({ tab: "receive", scan: value, created: "1" });
    const params = new URLSearchParams({
      action: "new",
      scan: value,
      return_to: `./box-qr-stock.html?${returnParams.toString()}`,
    });
    return `./products-admin.html?${params.toString()}`;
  }

  function unknownProductDialog(raw, options = {}) {
    const value = cleanScan(raw);
    const isLookupError = Boolean(options.lookupError);
    cameraScanner?.close?.();
    return new Promise((resolve) => {
      let overlay = document.getElementById("unknownProductOverlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "unknownProductOverlay";
        overlay.hidden = true;
        overlay.innerHTML = `
          <div class="unknown-product-card" role="dialog" aria-modal="true" aria-labelledby="unknownProductTitle">
            <div class="unknown-product-icon" aria-hidden="true">!</div>
            <h2 id="unknownProductTitle"></h2>
            <p id="unknownProductText"></p>
            <code id="unknownProductCode"></code>
            <p class="unknown-product-warning">ระบบจะไม่รับคืนและไม่เพิ่มลงกล่องจนกว่าจะมี SKU จริงในหน้าจัดการสินค้า</p>
            <div class="unknown-product-actions">
              <button type="button" data-unknown-cancel>ยกเลิกและสแกนใหม่</button>
              <button type="button" class="primary" data-unknown-create>ไปสร้างสินค้าใหม่</button>
            </div>
          </div>`;
        const style = document.createElement("style");
        style.textContent = `
          #unknownProductOverlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:20px;background:rgba(18,10,12,.72);backdrop-filter:blur(4px)}
          #unknownProductOverlay[hidden]{display:none}.unknown-product-card{width:min(520px,100%);background:#fffaf4;border:2px solid #c8101e;border-radius:22px;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center}
          .unknown-product-icon{width:58px;height:58px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;background:#c8101e;color:#fff;font-size:36px;font-weight:900}
          .unknown-product-card h2{margin:0 0 8px;font-size:1.65rem}.unknown-product-card p{margin:8px 0;line-height:1.55}.unknown-product-card code{display:block;margin:14px 0;padding:12px;border-radius:12px;background:#241719;color:#fff;font-size:1.1rem;overflow-wrap:anywhere}
          .unknown-product-warning{color:#9f1823;font-weight:800}.unknown-product-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.unknown-product-actions button{min-height:48px;border:1px solid #d8cbc5;border-radius:12px;background:#fff;font-weight:800;cursor:pointer}.unknown-product-actions .primary{border-color:#c8101e;background:#c8101e;color:#fff}
          @media(max-width:560px){.unknown-product-actions{grid-template-columns:1fr}.unknown-product-card{padding:22px 18px}}`;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
      }
      const title = overlay.querySelector("#unknownProductTitle");
      const text = overlay.querySelector("#unknownProductText");
      const codeNode = overlay.querySelector("#unknownProductCode");
      const createButton = overlay.querySelector("[data-unknown-create]");
      const cancelButton = overlay.querySelector("[data-unknown-cancel]");
      title.textContent = isLookupError ? "ตรวจสอบสินค้าไม่สำเร็จ" : "ไม่พบสินค้าในระบบ";
      text.textContent = isLookupError
        ? `ระบบเชื่อมต่อฐานข้อมูลไม่สำเร็จ จึงยังยืนยันรหัสนี้ไม่ได้: ${options.lookupError}`
        : "รหัสที่สแกนยังไม่อยู่ในหน้าจัดการสินค้า กรุณาสร้างสินค้าและกำหนด SKU จริงก่อนรับคืน";
      codeNode.textContent = value || "ไม่พบรหัส";
      createButton.hidden = isLookupError;
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
      const finish = (action) => {
        overlay.hidden = true;
        document.body.style.overflow = "";
        createButton.onclick = null;
        cancelButton.onclick = null;
        resolve(action);
      };
      cancelButton.onclick = () => finish("cancel");
      createButton.onclick = () => finish("create");
      requestAnimationFrame(() => (isLookupError ? cancelButton : createButton).focus());
    });
  }

  async function requireKnownProduct(product, raw) {
    if (product?.id) return true;
    const action = await unknownProductDialog(raw, { lookupError: product?.lookupError || "" });
    if (action === "create") {
      location.href = buildProductCreateUrl(raw);
      return false;
    }
    $("receiveSku").value = "";
    $("receiveSku").focus();
    msg(product?.lookupError ? "ยังไม่รับรายการ เพราะตรวจสอบฐานข้อมูลไม่สำเร็จ" : "ยกเลิกรายการแล้ว กรุณาสแกน SKU ที่มีอยู่จริง", "error");
    return false;
  }

  async function productByScan(raw) {
    const candidates = (PATTERN?.scanCandidates?.(raw) || [cleanScan(raw).replace(/^TKN-P-/i, "")])
      .map((value) => String(value || "").replace(/[%(),]/g, "").trim()).filter(Boolean);
    const value = candidates[0] || "";
    if (!value) return null;
    const filter = [...new Set(candidates.flatMap((codeValue) => [
      `product_code.eq.${codeValue}`, `barcode.eq.${codeValue}`, `base_sku.eq.${codeValue}`, `source_barcode.eq.${codeValue}`,
    ]))].join(",");
    try {
      let result = await supabaseClient.from("products")
        .select("id,product_code,name,barcode,base_sku,source_barcode,cost_price,selling_price,quantity,minimum_stock,category_name,product_type_th,brand_name,model_name")
        .or(filter).limit(1).maybeSingle();
      if (result.error && /base_sku|source_barcode|category_name|product_type_th|brand_name|model_name/i.test(result.error.message || "")) {
        const legacyFilter = [...new Set(candidates.flatMap((codeValue) => [`product_code.eq.${codeValue}`, `barcode.eq.${codeValue}`]))].join(",");
        result = await supabaseClient.from("products")
          .select("id,product_code,name,barcode,cost_price,selling_price,quantity,minimum_stock")
          .or(legacyFilter).limit(1).maybeSingle();
      }
      const { data, error } = result;
      if (error) throw error;
      return data || { id: null, product_code: value, name: "ยังไม่พบในหน้าจัดการสินค้า", barcode: value, notFound: true };
    } catch (error) {
      console.warn("Product lookup:", error);
      return { id: null, product_code: value, name: "ตรวจสอบสินค้าไม่สำเร็จ", barcode: value, lookupError: error?.message || "เชื่อมต่อฐานข้อมูลไม่สำเร็จ" };
    }
  }

  async function ensureCloudSession() {
    if (S.session.cloudId) return S.session.cloudId;
    const payload = { session_code: S.session.id, source: S.session.source, status: "OPEN", created_by: S.userId };
    const { data, error } = await supabaseClient.from("marketplace_receiving_sessions")
      .upsert(payload, { onConflict: "session_code" }).select("id").single();
    if (error) throw error;
    S.session.cloudId = data.id;
    save(false);
    return data.id;
  }

  function currentBranchId() {
    const selected = $("receiveBranch")?.value || sessionStorage.getItem("tkn_inventory_branch_id") || "";
    return /^[0-9a-f-]{36}$/i.test(selected) ? selected : null;
  }

  async function registerBoxLocation(requestedState) {
    const branchId = currentBranchId();
    if (!branchId || !S.box?.id) return null;
    const { data, error } = await supabaseClient.rpc("tkn_v5261_register_box_location", {
      p_box_code: S.box.id, p_branch_id: branchId, p_requested_state: requestedState || null,
    });
    if (error) throw error;
    return data;
  }

  function currentDraftLocalQuantity() {
    if (S.box?.status !== "DRAFT") return 0;
    return S.boxItems.reduce((sum, row) => sum + Math.max(0, Number(row?.qty || 0)), 0);
  }

  async function currentDraftCloudItems() {
    if (S.box?.status !== "DRAFT" || !S.box?.id) return [];
    let boxId = S.box.cloudId || null;
    if (!boxId) {
      const { data: boxes, error: boxError } = await supabaseClient.from("stock_boxes")
        .select("id,status").eq("box_code", S.box.id).limit(1);
      if (boxError) throw boxError;
      const cloudBox = Array.isArray(boxes) ? boxes[0] : null;
      if (!cloudBox?.id || String(cloudBox.status || "").toUpperCase() !== "DRAFT") return [];
      boxId = cloudBox.id;
      S.box.cloudId = boxId;
      save(false);
    }
    const { data, error } = await supabaseClient.from("stock_box_items")
      .select("sku,quantity").eq("box_id", boxId).gt("quantity", 0);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function guardCanLeaveCurrentDraft(actionLabel = "สร้างกล่องใหม่") {
    if (S.box?.status !== "DRAFT") return true;
    const localQty = currentDraftLocalQuantity();
    if (localQty > 0) {
      msg(`${actionLabel}ไม่ได้: กล่องปัจจุบันยังมีสินค้า ${integer(localQty)} ชิ้น กรุณาปิดกล่องหรือนำสินค้าออกให้หมดก่อน`, "error");
      return false;
    }
    try {
      const cloudItems = await currentDraftCloudItems();
      const cloudQty = cloudItems.reduce((sum, row) => sum + Math.max(0, Number(row?.quantity || 0)), 0);
      if (cloudQty > 0) {
        msg(`${actionLabel}ไม่ได้: ฐานข้อมูลยังมีสินค้า ${integer(cloudQty)} ชิ้นผูกกับกล่องปัจจุบัน กรุณารีเฟรชและตรวจกล่องก่อน`, "error");
        return false;
      }
    } catch (error) {
      console.warn("Draft abandon guard:", error);
      msg(`${actionLabel}ไม่ได้ชั่วคราว: ตรวจสอบสินค้ากล่องปัจจุบันกับฐานข้อมูลไม่สำเร็จ`, "error");
      return false;
    }
    return true;
  }

  async function ensureCloudBox() {
    if (S.box.cloudId) return S.box.cloudId;
    const payload = {
      box_code: S.box.id,
      status: S.box.status,
      location_text: S.box.location || null,
      created_by: S.userId,
    };
    const { data, error } = await supabaseClient.from("stock_boxes")
      .upsert(payload, { onConflict: "box_code" }).select("id").single();
    if (error) throw error;
    S.box.cloudId = data.id;
    save(false);
    return data.id;
  }

  async function syncReceiptToCloud(receipt, product) {
    try {
      const sessionId = await ensureCloudSession();
      const { error } = await supabaseClient.from("marketplace_receiving_items").insert({
        session_id: sessionId,
        tracking_number: receipt.tracking || null,
        order_number: receipt.tracking || null,
        product_id: product.id,
        sku: receipt.sku,
        expected_qty: receipt.expected,
        actual_qty: receipt.actual,
        good_qty: receipt.good,
        condition_status: receipt.condition,
        created_by: S.userId,
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn("Receipt kept locally:", error);
      return false;
    }
  }

  async function syncBoxItemToCloud(product, item) {
    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_box_items").upsert({
        box_id: boxId,
        product_id: product.id || item.product_id || null,
        sku: item.sku,
        quantity: Number(item.qty || 0),
      }, { onConflict: "box_id,sku" });
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn("Box item kept locally:", error);
      return false;
    }
  }

  async function loadReceiveBranches(access) {
    const select = $("receiveBranch");
    if (!select) return;
    const { data, error } = await supabaseClient.from("branches")
      .select("id,code,name,sort_order").eq("is_active", true).order("sort_order").order("code");
    if (error) throw error;
    const branches = data || [];
    select.innerHTML = branches.map((branch) => `<option value="${esc(branch.id)}">${esc(branch.name)}</option>`).join("");
    const valid = new Set(branches.map((branch) => branch.id));
    const preferred = [sessionStorage.getItem("tkn_inventory_branch_id"), access?.branch_id, branches[0]?.id]
      .find((id) => id && valid.has(id));
    if (preferred) select.value = preferred;
    select.addEventListener("change", () => sessionStorage.setItem("tkn_inventory_branch_id", select.value));
  }

  async function receiveAndBox() {
    markRoundActive();
    if (S.box.status !== "DRAFT") return msg("กล่องปิดแล้ว กรุณาเปิดกล่องหรือสร้างกล่องใหม่ก่อนสแกน", "error");
    const raw = $("receiveSku").value;
    const product = await productByScan(raw);
    if (!product) return msg("กรุณายิง QR สินค้า, SKU หรือ Barcode", "error");
    if (!await requireKnownProduct(product, raw)) return;
    if (S.box?.reservedQr && S.box?.reservedCategoryCode) {
      const scannedCategory = BOX_CODE.detectCategoryFromItem(product);
      const reservedCategory = String(S.box.reservedCategoryCode || "").toUpperCase();
      if (scannedCategory?.code && scannedCategory.code !== "GEN" && reservedCategory !== "GEN" && scannedCategory.code !== reservedCategory) {
        return msg(`QR กล่องนี้จองไว้สำหรับ ${S.box.category || reservedCategory} แต่สินค้าที่สแกนเป็น ${scannedCategory.label} · กรุณาใช้กล่องให้ตรงประเภท`, "error");
      }
    }

    const qty = Math.max(1, Math.floor(numeric($("piecesPerBox").value, 1)));
    const condition = $("condition").value;
    const good = condition === "GOOD" ? qty : 0;
    S.session.source = $("source").value;
    S.box.location = $("location").value.trim();

    const receipt = {
      id: code("REC"),
      session_id: S.session.id,
      tracking: "",
      sku: product.product_code,
      name: product.name,
      barcode: product.barcode || product.product_code,
      product_id: product.id,
      cost_price: Number(product.cost_price || 0),
      selling_price: Number(product.selling_price || 0),
      category: product.category_name || product.product_type_th || BOX_CODE.detectCategoryFromItem(product).label,
      product_type_th: product.product_type_th || "",
      brand_name: product.brand_name || "",
      model_name: product.model_name || "",
      boxes: 1,
      piecesPerBox: qty,
      loosePieces: 0,
      expected: qty,
      actual: qty,
      condition,
      good,
      box_ref: S.box?.id || null,
      at: now(),
    };
    S.receipts.unshift(receipt);

    let item = null;
    if (good > 0) {
      item = S.boxItems.find((row) => row.sku === product.product_code);
      if (item) {
        item.qty += qty;
        item.box_ref = S.box.id;
        item.at = receipt.at;
        item.condition = condition;
        item.category = item.category || product.category_name || product.product_type_th || BOX_CODE.detectCategoryFromItem(product).label;
        item.product_type_th = item.product_type_th || product.product_type_th || "";
      } else {
        item = {
          sku: product.product_code,
          name: product.name,
          qty,
          product_id: product.id,
          barcode: product.barcode || product.product_code,
          cost_price: Number(product.cost_price || 0),
          selling_price: Number(product.selling_price || 0),
          category: product.category_name || product.product_type_th || BOX_CODE.detectCategoryFromItem(product).label,
          product_type_th: product.product_type_th || "",
          brand_name: product.brand_name || "",
          model_name: product.model_name || "",
          condition,
          box_ref: S.box.id,
          at: receipt.at,
        };
        S.boxItems.push(item);
      }
      audit("RECEIVE_BOX_IN", S.box.id, `${product.product_code} +${qty} ชิ้น · รอบ ${S.session.id}`);
    } else {
      audit("RECEIVE_EXCEPTION", S.session.id, `${product.product_code} ${qty} ชิ้น · สภาพ ${condition}`);
    }

    $("receiveSku").value = "";
    save();

    const receiptSync = await syncReceiptToCloud(receipt, product);
    let boxSync = true;
    if (item) boxSync = await syncBoxItemToCloud(product, item);

    if (!good) {
      msg(`บันทึก ${product.name} เป็นรายการสภาพ ${condition} แล้ว แต่ไม่เพิ่มลงกล่องงานดี`, "error");
    } else if (receiptSync && boxSync) {
      msg(`รับคืนและเพิ่ม ${product.name} ${qty} ชิ้นลงกล่องแล้ว`, "success");
    } else {
      msg(`เพิ่ม ${product.name} ลงกล่องในเครื่องแล้ว แต่บางส่วนยังซิงก์ส่วนกลางไม่สำเร็จ`, "error");
    }
    await loadCloudStats();
    $("receiveSku").focus();
  }

  async function removeItem(index) {
    if (S.box.status !== "DRAFT") return msg("ต้องเปิดกล่องก่อนนำสินค้าออก", "error");
    const removed = S.boxItems[index];
    if (!removed) return;
    if (!confirm(`นำ ${removed.name} จำนวน ${removed.qty} ชิ้นออกจากกล่องนี้?`)) return;
    S.boxItems.splice(index, 1);
    audit("BOX_REMOVE", S.box.id, `${removed.sku} -${removed.qty} ชิ้น`);
    save();
    if (S.box.cloudId) {
      try {
        const { error } = await supabaseClient.from("stock_box_items").delete().eq("box_id", S.box.cloudId).eq("sku", removed.sku);
        if (error) throw error;
        msg("นำสินค้าออกจากกล่องและซิงก์ส่วนกลางแล้ว", "success");
      } catch (error) {
        console.warn(error);
        msg("นำสินค้าออกในเครื่องแล้ว แต่ส่วนกลางยังไม่สำเร็จ", "error");
      }
    }
  }

  function updateBoxQuantity(sku, value) {
    const item = S.boxItems.find((row) => row.sku === sku);
    if (!item || S.box.status !== "DRAFT") return;
    const oldQty = Number(item.qty || 0);
    item.qty = Math.max(1, Math.floor(numeric(value, 1)));
    item.at = now();
    audit("BOX_QTY_EDIT", S.box.id, `${sku} ${oldQty} → ${item.qty} ชิ้น`);
    save();
    void syncBoxItemToCloud({ id: item.product_id }, item);
  }

  function boxItemCategories() {
    return BOX_CODE.categoriesFromItems(S.boxItems);
  }

  function inferredBoxCategory() {
    const categories = boxItemCategories();
    if (categories.length === 1) return categories[0];
    const selected = $("boxCategorySelect")?.value || S.box?.category || "";
    return BOX_CODE.resolveCategory(selected);
  }

  function updateBoxCodePreview() {
    if (!S.box) return;
    const categories = boxItemCategories();
    const selectedElement = $("boxCategorySelect");
    if (categories.length === 1 && categories[0].code !== "GEN") {
      S.box.category = categories[0].label;
      if (selectedElement) selectedElement.value = categories[0].label;
    } else if (selectedElement?.value) {
      S.box.category = selectedElement.value;
    }
    S.box.zoneCode = BOX_CODE.normalizeZone($("boxZoneCode")?.value || S.box.zoneCode || "A");
    if ($("boxZoneCode")) $("boxZoneCode").value = S.box.zoneCode;
    const resolved = BOX_CODE.resolveCategory(S.box.category || selectedElement?.value || "อื่น ๆ");
    if ($("boxFinalCodePreview")) {
      $("boxFinalCodePreview").textContent = S.box.shortCode || BOX_CODE.preview(resolved.label, S.box.zoneCode);
    }
  }

  async function finalizeBoxIdentity() {
    const categories = boxItemCategories();
    if (categories.length > 1) {
      throw new Error(`กล่องนี้มีหลายประเภท (${categories.map((row) => row.label).join(", ")}) กรุณาแยกสินค้าเป็นคนละกล่องก่อนปิด`);
    }
    const selected = $("boxCategorySelect")?.value || S.box.category || "";
    let category = categories[0] || BOX_CODE.resolveCategory(selected);
    if (category.code === "GEN" && selected) category = BOX_CODE.resolveCategory(selected);
    if (!category?.label) throw new Error("กรุณาเลือกประเภทสินค้าประจำกล่อง");
    const zone = BOX_CODE.normalizeZone($("boxZoneCode")?.value || S.box.zoneCode || "A");
    const oldCode = S.box.id;
    const identity = await BOX_CODE.nextIdentity({
      category: category.label,
      zone,
      currentCode: S.box.id,
      client: window.supabaseClient,
    });
    S.box.draftId = S.box.draftId || (BOX_CODE.parse(oldCode) ? null : oldCode);
    S.box.id = identity.canonical;
    S.box.shortCode = identity.short;
    S.box.category = identity.categoryLabel;
    S.box.categoryCode = identity.categoryCode;
    S.box.zoneCode = identity.zone;
    for (const item of S.boxItems) item.box_ref = S.box.id;
    for (const receipt of S.receipts) {
      if (receipt?.box_ref === oldCode) receipt.box_ref = S.box.id;
    }
    if ($("boxCode")) $("boxCode").value = S.box.shortCode || S.box.id;
    updateBoxCodePreview();
    return identity;
  }

  async function closeBox() {
    if (!S.boxItems.length) return msg("กล่องยังไม่มีสินค้า", "error");
    const invalid = S.boxItems.filter((item) => !item.product_id || !item.sku || Number(item.qty || 0) <= 0);
    if (invalid.length) return msg(`ยังมีรายการไม่สมบูรณ์ ${invalid.length} รายการ กรุณาแก้ไขก่อนปิดกล่อง`, "error");

    let identity;
    try {
      identity = await finalizeBoxIdentity();
    } catch (error) {
      return msg(error.message || "สร้างรหัสกล่องไม่สำเร็จ", "error");
    }

    S.box.status = "CLOSED";
    markRoundActive();
    if (!S.round.closedBoxIds.includes(S.box.id)) S.round.closedBoxIds.push(S.box.id);
    S.box.location = $("location").value.trim();
    S.box.closed_at = now();
    const total = S.boxItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    audit("BOX_CLOSE", S.box.id, `${identity.short} · ${identity.categoryLabel} · โซน ${identity.zone} · ${S.boxItems.length} SKU · ${total} ชิ้น`);
    save();

    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_boxes").update({
        box_code: S.box.id,
        status: "CLOSED",
        location_text: S.box.location || null,
        closed_at: S.box.closed_at,
      }).eq("id", boxId);
      if (error) throw error;
      const { data: waiting, error: waitingError } = await supabaseClient.rpc("tkn_v5300_close_box_to_stock_intake", {
        p_box_code: S.box.id,
        p_category_text: S.box.category || identity.categoryLabel || null,
        p_zone_code: S.box.zoneCode || identity.zone || null,
        p_location_text: S.box.location || null,
      });
      if (waitingError) throw waitingError;
      S.box.historyId = waiting?.history_id || S.box.historyId || null;
      S.box.workflowStatus = "WAITING_STOCK";
      save(false);
      msg("ปิดกล่องแล้ว · ส่งเข้าหน้าตรวจรับสต็อกอัตโนมัติ (ยังไม่เพิ่มยอดสต็อก)", "success");
      void loadBoxHistory();
    } catch (error) {
      console.warn(error);
      msg("ปิดกล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", "error");
    }
    await drawFinalBoxQr();
    await loadCloudStats();
  }

  async function openBox() {
    if (S.box.status === "DRAFT") return msg("กล่องนี้เปิดแก้ไขอยู่แล้ว", "success");
    if (!confirm("เปิดกล่องเพื่อแก้ไข? ระบบจะบันทึกประวัติ")) return;
    try {
      const { error: reopenError } = await supabaseClient.rpc("tkn_v5283_reopen_box", { p_box_code: S.box.id });
      if (reopenError) throw reopenError;
    } catch (error) {
      return msg(`เปิดกล่องไม่ได้: ${error.message || error}`, "error");
    }
    S.box.status = "DRAFT";
    S.box.workflowStatus = "REOPENED";
    ensureRoundState();
    S.round.closedBoxIds = S.round.closedBoxIds.filter((id) => id !== S.box.id);
    delete S.box.closed_at;
    audit("BOX_OPEN", S.box.id, "เปิดกล่องเพื่อแก้ไข");
    save();
    $("finalBoxQr").innerHTML = "";
    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_boxes").update({ status: "DRAFT", closed_at: null }).eq("id", boxId);
      if (error) throw error;
      await registerBoxLocation("WAREHOUSE");
      msg("เปิดกล่องและซิงก์ส่วนกลางแล้ว", "success");
    } catch (error) {
      msg("เปิดกล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", "error");
    }
  }

  function renderStats() {
    ensureRoundState();
    const activeRound = Boolean(S.round.active);
    const hasDraftWork = activeRound && S.box?.status === "DRAFT" && S.boxItems.some((item) => Number(item?.qty || 0) > 0);
    $("sessionCount").textContent = activeRound ? "1" : "0";
    $("draftBoxCount").textContent = hasDraftWork ? "1" : "0";
    $("closedBoxCount").textContent = String(S.round.closedBoxIds.length);
  }

  async function loadCloudStats() {
    // การ์ดด้านบนแสดงเฉพาะรอบงานปัจจุบัน ไม่ใช้ยอดสะสมจากฐานข้อมูล
    renderStats();
  }

  function updateRoundTotal() {
    const validRows = S.boxItems.filter((row) => row?.product_id && Number(row?.qty || 0) > 0);
    const totalItems = validRows.length;
    const totalPieces = validRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    $("receiveTotalPieces").textContent = `${integer(totalItems)} รายการ · ${integer(totalPieces)} ชิ้น`;
    $("boxTotal").textContent = integer(totalPieces);
  }

  function renderBoxRows() {
    $("boxRows").innerHTML = S.boxItems.map((item, index) => `
      <tr>
        <td>${new Date(item.at || S.box.created_at || now()).toLocaleString("th-TH")}</td>
        <td>${esc(item.sku)}</td>
        <td>${esc(item.name)}</td>
        <td><input class="box-qty-input" data-box-qty="${esc(item.sku)}" type="number" min="1" value="${Number(item.qty || 1)}" ${S.box.status !== "DRAFT" ? "disabled" : ""}></td>
        <td>${esc(CONDITION_LABELS[item.condition] || item.condition || "งานดี")}</td>
        <td><span class="count-status ok">ยืนยันจากการสแกน</span></td>
        <td><button type="button" data-remove="${index}" ${S.box.status !== "DRAFT" ? "disabled" : ""}>นำออก</button></td>
      </tr>`).join("") || '<tr><td colspan="7">ยังไม่มีสินค้าในกล่อง กรุณาสแกนสินค้าที่กำลังนำลงกล่องจริง</td></tr>';
  }

  function renderFinalSummary() {
    const total = S.boxItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const parsed = BOX_CODE.parse(S.box.id);
    const category = S.box.category || inferredBoxCategory().label;
    $("finalBoxSummary").innerHTML = `
      <article><span>รหัสกล่อง</span><b>${esc(S.box.shortCode || parsed?.short || S.box.id)}</b></article>
      <article><span>ประเภท</span><b>${esc(category || "ยังไม่ระบุ")}</b></article>
      <article><span>โซน</span><b>${esc(S.box.zoneCode || parsed?.zone || "A")}</b></article>
      <article><span>จำนวน SKU</span><b>${integer(S.boxItems.length)}</b></article>
      <article><span>จำนวนชิ้น</span><b>${integer(total)}</b></article>
      <article><span>แหล่งยืนยัน</span><b>สแกนเข้ากล่องจริง</b></article>
      <article><span>สถานะ</span><b>${esc(S.box.workflowStatus || S.box.status)}</b></article>`;
    $("printBoxQrBtn").disabled = S.box?.status !== "CLOSED";
  }

  function render() {
    if (!$("receiveCode")) return;
    $("receiveCode").value = S.session?.id || "";
    $("boxCode").value = S.box?.shortCode || S.box?.id || "";
    if ($("reservedBoxHint")) $("reservedBoxHint").textContent = S.box?.reservedQr ? `กำลังใช้ ${S.box.shortCode || BOX_CODE.shortCode(S.box.id)} · ${S.box.category || '-'} · โซน ${S.box.zoneCode || '-'}` : "ใช้สำหรับ QR ที่สร้างหลายดวงล่วงหน้า · ต้องเลือกก่อนสแกนสินค้าเข้ากล่อง";
    $("location").value = S.box?.location || $("location").value;
    renderStats();
    renderBoxRows();
    updateRoundTotal();
    renderFinalSummary();
    updateBoxCodePreview();
    $("auditRows").innerHTML = S.audit.map((row) => `
      <tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.user)}</td><td>${esc(row.action)}</td><td>${esc(row.ref)}</td><td>${esc(row.detail)}</td></tr>`)
      .join("") || '<tr><td colspan="5">ยังไม่มีประวัติ</td></tr>';
    updateWorkflowNav();
  }

  function boxLabelProfile(preset, customWidth, customHeight) {
    const unified = window.TKNLabelLayout;
    if (unified?.boxProfile) return unified.boxProfile({
      preset, customWidth, customHeight, showDetails: S.printSettings?.showDetails !== false
    });
    if (preset !== "CUSTOM") return BOX_LABEL_PROFILES[preset] || BOX_LABEL_PROFILES["70x70"];
    return {
      width: Math.max(30, Math.min(150, numeric(customWidth, 70))),
      height: Math.max(30, Math.min(150, numeric(customHeight, 70))),
    };
  }

  function readBoxPrintSettings(){return{printerMode:$('boxPrinterMode').value||'AUTO',dpi:[203,300,600].includes(Number($('boxPrinterDpi').value))?Number($('boxPrinterDpi').value):300,preset:$('boxLabelSizePreset').value||'label58',customWidth:numeric($('boxLabelCustomWidth').value,58),customHeight:numeric($('boxLabelCustomHeight').value,38),columns:Math.max(1,Math.min(8,Math.floor(numeric($('boxLabelColumns').value,1)))),copies:Math.max(1,Math.min(20,Math.floor(numeric($('boxLabelCopies').value,1)))),gap:Math.max(0,Math.min(20,numeric($('boxLabelGap').value,2))),pageMargin:Math.max(0,Math.min(30,numeric($('boxPageMargin').value,0))),codeMode:$('boxCodeMode').value||'both',showDetails:Boolean($('boxLabelShowDetails').checked),showBarcodeText:Boolean($('boxShowBarcodeText').checked)};}

  function applyBoxPrintSettings(persist = true, redraw = true) {
    if ($("boxLabelSizePreset")) S.printSettings = readBoxPrintSettings();
    const settings = S.printSettings || DEFAULT_BOX_PRINT_SETTINGS;
    const profile = boxLabelProfile(settings.preset, settings.customWidth, settings.customHeight);
    const printMode=window.TKNPrintPlatform?.resolvePrintMode?.(settings,profile.width)||(settings.printerMode==="AUTO"?(Number(settings.columns||1)===1?"ROLL":"SHEET"):settings.printerMode);
    const maxSheetColumns = Math.max(1, Math.floor(200 / profile.width));
    const columns = printMode === "ROLL" ? 1 : Math.min(Number(settings.columns || 1), maxSheetColumns, 5);
    settings.columns = columns;
    $("boxLabelColumns").value = String(columns);

    const qrSize = Number(profile.qr) || Math.max(22, Math.min(profile.width - 8, profile.height * (settings.showDetails ? 0.62 : 0.78)));
    const hosts = [$("finalBoxQr"), $("boxBatchQrPreview")].filter(Boolean);
    const productProfile=window.TKNLabelLayout?.productProfile?.({preset:settings.preset,customWidth:settings.customWidth,customHeight:settings.customHeight,dpi:settings.dpi});
    for (const host of hosts) {
      host.style.setProperty("--box-label-w", `${profile.width}mm`);
      host.style.setProperty("--box-label-h", `${profile.height}mm`);
      host.style.setProperty("--box-qr-mm", `${qrSize}mm`);
      host.style.setProperty("--box-print-cols", String(columns));
      if(productProfile) window.TKNLabelLayout?.applyProductVars?.(host,productProfile);
    }
    document.body.dataset.boxPrintMode = printMode;
    document.body.dataset.boxShowDetails = String(Boolean(settings.showDetails));

    let style = document.getElementById("tknDynamicBoxQrPage");
    if (!style) {
      style = document.createElement("style");
      style.id = "tknDynamicBoxQrPage";
      document.head.appendChild(style);
    }
    const rollWidth=window.TKNPrintPlatform?.rowPhysicalWidth?.(settings,profile.width)||(columns*profile.width+Math.max(0,columns-1)*Number(settings.gap||0)+2*Number(settings.pageMargin||0));
    style.textContent=printMode==='ROLL'?`@page{size:${rollWidth}mm ${profile.height}mm;margin:${Number(settings.pageMargin||0)}mm}`:`@page{size:A4 portrait;margin:${Number(settings.pageMargin||0)}mm}`;

    $("boxPrintSettingSummary").textContent = `${printMode === "ROLL" ? "DT ม้วน" : "กระดาษแผ่น"} · ${profile.width} × ${profile.height} มม. · ${columns} ดวง/แถว · ${settings.copies} สำเนา · ${settings.dpi} DPI`;
    if(persist){window.TKNPrintPlatform?.saveBoxSettings?.(settings);save(false);}
    if (redraw && S.box?.status === "CLOSED") void drawFinalBoxQr();
    if (redraw && batchQrRows.length) void drawBatchBoxQr();
  }

  function fillBoxPrintSettingInputs(){const shared=window.TKNPrintPlatform?.getBoxSettings?.()||{},settings={...DEFAULT_BOX_PRINT_SETTINGS,...(S.printSettings||{}),...shared};S.printSettings=settings;$('boxPrinterMode').value=settings.printerMode;$('boxPrinterDpi').value=String(settings.dpi);$('boxLabelSizePreset').value=[...$('boxLabelSizePreset').options].some(o=>o.value===settings.preset)?settings.preset:'label58';$('boxLabelCustomWidth').value=settings.customWidth;$('boxLabelCustomHeight').value=settings.customHeight;$('boxLabelColumns').value=settings.columns;$('boxLabelCopies').value=settings.copies;$('boxLabelGap').value=settings.gap??2;$('boxPageMargin').value=settings.pageMargin??0;$('boxCodeMode').value=settings.codeMode||'both';$('boxLabelShowDetails').checked=settings.showDetails!==false;$('boxShowBarcodeText').checked=Boolean(settings.showBarcodeText);document.querySelectorAll('.box-custom-label-size').forEach(field=>{field.hidden=$('boxLabelSizePreset').value!=='CUSTOM'});applyBoxPrintSettings(false,false);}

  async function drawFinalBoxQr() {
    const host = $("finalBoxQr");
    if (!host || !S.box) return;
    applyBoxPrintSettings(false, false);
    const copies = Math.max(1, Number(S.printSettings?.copies || 1));
    const total = S.boxItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    host.innerHTML = Array.from({ length: copies }, (_, index) => `
      <article class="box-qr-label tkn-label-product" aria-label="QR กล่อง ${esc(S.box.id)} สำเนาที่ ${index+1}">${(S.printSettings?.codeMode==='qr'||S.printSettings?.codeMode==='both')?'<canvas class="tkn-label-qr"></canvas>':''}${(S.printSettings?.codeMode==='barcode'||S.printSettings?.codeMode==='both')?`<div class="tkn-label-barcode-holder"><svg class="box-code-barcode tkn-label-barcode"></svg>${S.printSettings?.showBarcodeText?`<small>${esc(S.box.id)}</small>`:''}</div>`:''}<strong class="box-code tkn-label-sku">${esc(S.box.shortCode||BOX_CODE.shortCode(S.box.id))}</strong>${S.printSettings?.showDetails!==false?`<span class="box-category tkn-label-name">${esc(S.box.category||inferredBoxCategory().label)} · โซน ${esc(S.box.zoneCode||'A')} · ${S.boxItems.length} SKU · ${total} ชิ้น</span>`:''}</article>`).join("");
    try {
      const ready = await (window.TKNQRHealth?.wait?.(2500)
        ?? Promise.resolve(Boolean(window.QRCode?.toCanvas || window.TKNQR?.toCanvas)));
      const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
      if (!ready || typeof toCanvas !== "function") throw new Error("ไม่พบระบบสร้าง QR ในเครื่อง");
      await Promise.all([...host.querySelectorAll('canvas')].map(canvas=>toCanvas(canvas,S.box.id,{width:420,margin:1,errorCorrectionLevel:'M'})));for(const svg of host.querySelectorAll('.box-code-barcode')){if(typeof window.JsBarcode!=='function')throw new Error('ระบบ Barcode ยังไม่พร้อม');window.JsBarcode(svg,S.box.id,{format:'CODE128',displayValue:false,margin:0,width:1,height:34,background:'#fff',lineColor:'#000'});}
    } catch (error) {
      host.insertAdjacentHTML("beforeend", `<em>สร้าง QR ไม่สำเร็จ: ${esc(error.message)}</em>`);
    }
  }

  async function drawBatchBoxQr() {
    const host = $("boxBatchQrPreview");
    if (!host) return false;
    applyBoxPrintSettings(false, false);
    if (!batchQrRows.length) { host.innerHTML = ""; return false; }
    const copies = Math.max(1, Number(S.printSettings?.copies || 1));
    const labels=[];
    for (const row of batchQrRows) {
      for (let copy=1; copy<=copies; copy+=1) labels.push({row,copy});
    }
    host.innerHTML = labels.map(({row,copy}) => {
      const canonical=String(row.box_code||"");
      const short=BOX_CODE.shortCode(canonical)||canonical;
      return `<div class="box-batch-item" data-batch-code="${esc(canonical)}"><article class="box-qr-label tkn-label-product" aria-label="QR กล่อง ${esc(canonical)}">${(S.printSettings?.codeMode==='qr'||S.printSettings?.codeMode==='both')?'<canvas class="tkn-label-qr"></canvas>':''}${(S.printSettings?.codeMode==='barcode'||S.printSettings?.codeMode==='both')?`<div class="tkn-label-barcode-holder"><svg class="box-code-barcode tkn-label-barcode"></svg>${S.printSettings?.showBarcodeText?`<small>${esc(canonical)}</small>`:''}</div>`:''}<strong class="box-code tkn-label-sku">${esc(short)}</strong>${S.printSettings?.showDetails!==false?`<span class="box-category tkn-label-name">${esc(row.category_text||row.category_code||'-')} · โซน ${esc(row.zone_code||'-')} · เตรียมกล่อง</span>`:''}${copies>1?`<small>สำเนา ${copy}/${copies}</small>`:''}</article>${copy===1?`<button type="button" class="box-batch-use no-print" data-use-reserved-code="${esc(canonical)}">ใช้ QR นี้กับกล่องปัจจุบัน</button>`:''}</div>`;
    }).join("");
    try {
      const ready = await (window.TKNQRHealth?.wait?.(2500) ?? Promise.resolve(Boolean(window.QRCode?.toCanvas || window.TKNQR?.toCanvas)));
      const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
      if (!ready || typeof toCanvas !== "function") throw new Error("ไม่พบระบบสร้าง QR ในเครื่อง");
      await Promise.all([...host.querySelectorAll('.box-batch-item')].map(async wrapper => {
        const codeValue=wrapper.dataset.batchCode;
        const canvas=wrapper.querySelector('canvas');
        if(canvas) await toCanvas(canvas,codeValue,{width:420,margin:1,errorCorrectionLevel:'M'});
        const svg=wrapper.querySelector('.box-code-barcode');
        if(svg){if(typeof window.JsBarcode!=='function') throw new Error('ระบบ Barcode ยังไม่พร้อม');window.JsBarcode(svg,codeValue,{format:'CODE128',displayValue:false,margin:0,width:1,height:34,background:'#fff',lineColor:'#000'});}
      }));
      return true;
    } catch(error) {
      console.error("Draw batch box QR:",error);
      batchMsg(`สร้างภาพ QR ไม่สำเร็จ: ${error.message || error}`,"error");
      return false;
    }
  }

  async function generateBatchBoxQr() {
    const selected = $("boxCategorySelect")?.value || S.box?.category || "";
    if (!selected) return batchMsg("กรุณาเลือกประเภทสินค้าประจำกล่องก่อนสร้าง QR หลายดวง", "error");
    const category=BOX_CODE.resolveCategory(selected);
    if (!category?.code || category.code === "MIX") return batchMsg("กรุณาเลือกประเภทเดียวที่ชัดเจน ไม่ใช้คละประเภท", "error");
    const zone=BOX_CODE.normalizeZone($("boxZoneCode")?.value || S.box?.zoneCode || "A");
    const count=Math.max(1,Math.min(50,Math.floor(numeric($("boxBatchCount")?.value,5))));
    if ($("boxBatchCount")) $("boxBatchCount").value=String(count);
    const button=$("generateBoxBatchQrBtn");
    if(button) button.disabled=true;
    batchMsg(`กำลังจองรหัส ${count} กล่อง สำหรับ ${category.label} · โซน ${zone}...`);
    try {
      const {data,error}=await supabaseClient.rpc("tkn_v5310_reserve_box_qr_batch",{
        p_category_code:category.code,p_category_text:category.label,p_zone_code:zone,p_count:count
      });
      if(error) throw error;
      batchQrRows=Array.isArray(data)?data:[];
      if(!batchQrRows.length) throw new Error("ระบบไม่ได้คืนรายการ QR ที่สร้าง");
      await drawBatchBoxQr();
      if($("printBoxBatchQrBtn")) $("printBoxBatchQrBtn").disabled=false;
      if($("clearBoxBatchQrBtn")) $("clearBoxBatchQrBtn").disabled=false;
      const first=BOX_CODE.shortCode(batchQrRows[0]?.box_code);
      const last=BOX_CODE.shortCode(batchQrRows[batchQrRows.length - 1]?.box_code);
      batchMsg(`สร้างแล้ว ${batchQrRows.length} รหัสไม่ซ้ำ · ${first}${last&&last!==first?` ถึง ${last}`:''} · ยังไม่เพิ่มสต็อก`,"success");
      audit("BOX_QR_BATCH_RESERVE", `${category.code}-${zone}`, `สร้าง QR ล่วงหน้า ${batchQrRows.length} กล่อง`);
    } catch(error) {
      console.error("Generate batch box QR:",error);
      batchQrRows=[];
      if($("boxBatchQrPreview")) $("boxBatchQrPreview").innerHTML="";
      if($("printBoxBatchQrBtn")) $("printBoxBatchQrBtn").disabled=true;
      if($("clearBoxBatchQrBtn")) $("clearBoxBatchQrBtn").disabled=true;
      batchMsg(`สร้าง QR หลายดวงไม่สำเร็จ: ${error.message || error}`,"error");
    } finally { if(button) button.disabled=false; }
  }

  function clearBatchBoxQr() {
    batchQrRows=[];
    if($("boxBatchQrPreview")) $("boxBatchQrPreview").innerHTML="";
    if($("printBoxBatchQrBtn")) $("printBoxBatchQrBtn").disabled=true;
    if($("clearBoxBatchQrBtn")) $("clearBoxBatchQrBtn").disabled=true;
    batchMsg("");
  }

  async function printBatchBoxQr() {
    if(!batchQrRows.length) return batchMsg("ยังไม่มีชุด QR สำหรับพิมพ์","error");
    applyBoxPrintSettings(true,false);
    const ready=await drawBatchBoxQr();
    if(!ready) return;
    const batchId=batchQrRows[0]?.batch_id || null;
    try {
      if(batchId){
        const {error}=await supabaseClient.rpc("tkn_v5310_log_box_qr_batch_print",{
          p_batch_id:batchId,p_copies:Math.max(1,Number(S.printSettings?.copies||1)),p_print_settings:S.printSettings||{}
        });
        if(error) throw error;
      }
    } catch(error) {
      console.warn("Batch QR print log skipped:",error);
      batchMsg(`QR พร้อมพิมพ์ แต่บันทึกประวัติการพิมพ์ไม่สำเร็จ: ${error.message || error}`,"error");
    }
    document.body.dataset.printTarget="box-batch-qr";
    let completed=false;
    const cleanup=()=>{if(completed)return;completed=true;delete document.body.dataset.printTarget;};
    window.addEventListener("afterprint",cleanup,{once:true});
    window.print();
    window.setTimeout(cleanup,12000);
  }

  function closePostPrintDialog() {
    const overlay = document.getElementById("boxPostPrintOverlay");
    if (overlay) overlay.hidden = true;
  }

  function ensurePostPrintDialog() {
    let overlay = document.getElementById("boxPostPrintOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "boxPostPrintOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="box-post-print-card" role="dialog" aria-modal="true" aria-labelledby="boxPostPrintTitle">
        <div class="box-post-print-icon" aria-hidden="true">✓</div>
        <h2 id="boxPostPrintTitle">พิมพ์ QR กล่องแล้ว</h2>
        <p id="boxPostPrintSummary"></p>
        <div class="box-post-print-actions">
          <button type="button" data-post-print="reprint">พิมพ์ QR ซ้ำ</button>
          <button type="button" data-post-print="finish">จบงานและปิดรอบ</button>
          <button type="button" class="primary" data-post-print="next">เปิดกล่องใหม่</button>
        </div>
      </div>`;
    const style = document.createElement("style");
    style.textContent = `
      #boxPostPrintOverlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:20px;background:rgba(18,10,12,.72);backdrop-filter:blur(4px)}
      #boxPostPrintOverlay[hidden]{display:none}.box-post-print-card{width:min(560px,100%);background:#fffaf4;border:2px solid #16834a;border-radius:22px;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center}
      .box-post-print-icon{width:60px;height:60px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;background:#16834a;color:#fff;font-size:36px;font-weight:900}
      .box-post-print-card h2{margin:0 0 8px;font-size:1.65rem}.box-post-print-card p{margin:8px 0 20px;line-height:1.65}
      .box-post-print-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.box-post-print-actions button{min-height:46px}
      @media(max-width:640px){.box-post-print-actions{grid-template-columns:1fr}.box-post-print-card{padding:22px}}`;
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-post-print]") : null;
      if (!button) return;
      const action = button.dataset.postPrint;
      if (action === "reprint") {
        closePostPrintDialog();
        void printBoxQr();
      } else if (action === "next") {
        void startNextBoxAfterPrint();
      } else if (action === "finish") {
        void finishCurrentRound();
      }
    });
    return overlay;
  }

  function showPostPrintDialog() {
    if (S.box?.status !== "CLOSED") return;
    const overlay = ensurePostPrintDialog();
    const total = S.boxItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const summary = overlay.querySelector("#boxPostPrintSummary");
    if (summary) summary.innerHTML = `<b>${esc(S.box.shortCode || BOX_CODE.shortCode(S.box.id))}</b><br>${esc(S.box.category || inferredBoxCategory().label)} · โซน ${esc(S.box.zoneCode || "A")}<br>${S.boxItems.length} SKU · ${total} ชิ้น`;
    overlay.hidden = false;
  }

  async function startNextBoxAfterPrint() {
    if (S.box?.status !== "CLOSED") return msg("กรุณาปิดกล่องปัจจุบันก่อนเปิดกล่องใหม่", "error");
    const previousCode = S.box.id;
    closePostPrintDialog();
    newBox({ preserveIdentity: true });
    markRoundActive();
    audit("BOX_NEW", S.box.id, `เปิดกล่องใหม่ต่อจาก ${previousCode}`);
    save();
    activateTab("receive");
    msg("เปิดกล่องใหม่ในรอบเดิมแล้ว สามารถสแกนสินค้าลงกล่องต่อได้ทันที", "success");
    $("receiveSku").focus();
  }

  async function finishCurrentRound() {
    if (S.box?.status !== "CLOSED") return msg("กรุณาปิดกล่องปัจจุบันก่อนจบงาน", "error");
    closePostPrintDialog();
    ensureRoundState();
    const closedCount = S.round.closedBoxIds.length;
    const totalPieces = S.receipts.reduce((sum, row) => sum + Number(row?.good || 0), 0);
    const sessionId = S.session?.id || "-";
    audit("ROUND_CLOSE", sessionId, `จบงาน · ${closedCount} กล่อง · ${totalPieces} ชิ้น`);
    if (S.session?.cloudId) {
      try {
        const { error } = await supabaseClient.from("marketplace_receiving_sessions")
          .update({ status: "CLOSED" }).eq("id", S.session.cloudId);
        if (error) throw error;
      } catch (error) {
        console.warn("Round close sync skipped:", error);
      }
    }
    newSession();
    newBox();
    S.receipts = [];
    S.round = { active: false, closedBoxIds: [], started_at: null };
    S.cloudStats = null;
    save();
    activateTab("receive");
    msg(`จบงานแล้ว บันทึก ${closedCount} กล่อง และรีเซ็ตรอบปัจจุบันเป็นศูนย์`, "success");
    $("receiveSku").focus();
  }

  async function printBoxQr() {
    if (S.box?.status !== "CLOSED") return msg("กรุณาปิดกล่องก่อนพิมพ์ QR กล่อง", "error");
    applyBoxPrintSettings(true, false);
    await drawFinalBoxQr();
    try {
      const { data: printLog, error: printError } = await supabaseClient.rpc("tkn_v5283_log_box_print", {
        p_box_code: S.box.id,
        p_copies: Math.max(1, Number(S.printSettings?.copies || 1)),
        p_print_settings: S.printSettings || {},
      });
      if (printError) throw printError;
      audit(printLog?.print_type === "REPRINT" ? "BOX_QR_REPRINT" : "BOX_QR_PRINT", S.box.id, `พิมพ์ ${Math.max(1, Number(S.printSettings?.copies || 1))} สำเนา`);
      void loadBoxHistory();
    } catch (error) {
      console.warn("QR print history skipped:", error);
      msg(`พิมพ์ได้ แต่บันทึกประวัติการพิมพ์ไม่สำเร็จ: ${error.message || error}`, "error");
    }
    document.body.dataset.printTarget = "box-qr";
    let completed = false;
    const cleanup = () => {
      if (completed) return;
      completed = true;
      delete document.body.dataset.printTarget;
      window.setTimeout(showPostPrintDialog, 120);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 12000);
  }

  async function syncCurrentBoxSnapshot() {
    if (!S.box || !S.boxItems.length) return;
    try {
      const boxId = await ensureCloudBox();
      const payload = S.boxItems.map((item) => ({
        box_id: boxId,
        product_id: item.product_id || null,
        sku: item.sku,
        quantity: Number(item.qty || 0),
      }));
      const { error } = await supabaseClient.from("stock_box_items").upsert(payload, { onConflict: "box_id,sku" });
      if (error) throw error;
      const update = { box_code: S.box.id, status: S.box.status, location_text: S.box.location || null };
      if (S.box.status === "CLOSED") update.closed_at = S.box.closed_at || S.box.created_at || now();
      await supabaseClient.from("stock_boxes").update(update).eq("id", boxId);
      await registerBoxLocation(S.box.status === "CLOSED" ? "WAREHOUSE" : (S.boxItems.length ? "WAREHOUSE" : "EMPTY"));
    } catch (error) {
      console.warn("Existing box snapshot remains local:", error);
    }
  }


  function historyStatusLabel(value) {
    return ({ WAITING_STOCK: "รอเข้าสต็อก", IN_STOCK: "เข้าสต็อกแล้ว", REOPENED: "เปิดแก้ไขแล้ว", CANCELLED: "ยกเลิก" })[value] || value || "-";
  }

  async function loadBoxHistory(searchValue = null) {
    const host = $("cloudBoxHistoryRows");
    if (!host) return;
    const q = searchValue === null ? ($("boxHistorySearch")?.value || "") : searchValue;
    host.innerHTML = '<tr><td colspan="8">กำลังโหลด...</td></tr>';
    try {
      const { data, error } = await supabaseClient.rpc("tkn_v5283_list_box_history", { p_search: q.trim() || null, p_limit: 200 });
      if (error) throw error;
      cloudHistory = Array.isArray(data) ? data : [];
      host.innerHTML = cloudHistory.map((h) => `
        <tr>
          <td>${h.closed_at ? new Date(h.closed_at).toLocaleString("th-TH") : "-"}</td>
          <td><b>${esc(h.box_code)}</b><br><small>Rev ${Number(h.revision || 1)}</small></td>
          <td>${esc(h.branch_name || "-")}</td>
          <td>${esc(h.category_text || "-")} ${h.zone_code ? `· ${esc(h.zone_code)}` : ""}</td>
          <td>${integer(h.sku_count)} SKU · ${integer(h.total_quantity)} ชิ้น</td>
          <td><b>${esc(historyStatusLabel(h.workflow_status))}</b>${h.stock_document_no ? `<br><small>${esc(h.stock_document_no)}</small>` : ""}</td>
          <td>${integer(h.print_count)} ครั้ง</td>
          <td class="history-actions"><button type="button" data-history-view="${h.id}">ดู</button><button type="button" data-history-reprint="${h.id}">พิมพ์ QR ซ้ำ</button>${h.workflow_status === "WAITING_STOCK" ? `<a class="primary" href="./stock-intake.html?scan=${encodeURIComponent(h.box_code)}">ตรวจรับเข้าสต็อก</a>` : ""}</td>
        </tr>`).join("") || '<tr><td colspan="8">ยังไม่มีประวัติกล่อง</td></tr>';
    } catch (error) {
      host.innerHTML = `<tr><td colspan="8">โหลดประวัติไม่สำเร็จ: ${esc(error.message || error)}</td></tr>`;
    }
  }

  async function showHistoryDetail(historyId) {
    try {
      const { data, error } = await supabaseClient.rpc("tkn_v5283_box_history_detail", { p_history_id: historyId });
      if (error) throw error;
      activeHistoryDetail = data;
      const h = data?.history || {};
      const items = Array.isArray(data?.items) ? data.items : [];
      const prints = Array.isArray(data?.prints) ? data.prints : [];
      const host = $("boxHistoryDetail");
      if (!host) return;
      host.hidden = false;
      host.innerHTML = `<div class="history-detail-head"><div><strong>${esc(h.box_code || "-")}</strong><span>${esc(historyStatusLabel(h.workflow_status))} · Rev ${Number(h.revision || 1)}</span></div><button type="button" data-history-detail-close>ปิด</button></div>
      <div class="history-detail-summary"><span>${items.length} SKU</span><span>${integer(h.total_quantity)} ชิ้น</span><span>พิมพ์ ${prints.length} ครั้ง</span><span>${esc(h.location_text || "ไม่ระบุตำแหน่ง")}</span></div>
      <div class="table"><table><thead><tr><th>SKU</th><th>Barcode</th><th>สินค้า</th><th>จำนวน</th><th>ต้นทุน</th><th>ราคาขาย</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.sku)}</td><td>${esc(i.barcode||"-")}</td><td>${esc(i.product_name||"-")}</td><td>${integer(i.quantity)}</td><td>${numeric(i.cost_price).toFixed(2)}</td><td>${numeric(i.selling_price).toFixed(2)}</td></tr>`).join("")}</tbody></table></div>`;
      host.querySelector('[data-history-detail-close]')?.addEventListener('click',()=>{host.hidden=true;});
    } catch (error) { msg(`เปิดประวัติไม่สำเร็จ: ${error.message || error}`, "error"); }
  }

  function openStockIntake(historyOrCode) {
    const code = cleanScan(typeof historyOrCode === "string" ? historyOrCode : (historyOrCode?.box_code || ""));
    const target = code ? `./stock-intake.html?scan=${encodeURIComponent(code)}` : "./stock-intake.html";
    window.location.href = target;
  }

  async function reprintHistoricalBox(history) {
    if (!history) return;
    try {
      const settings = { ...DEFAULT_BOX_PRINT_SETTINGS, ...(S.printSettings || {}) };
      const { error } = await supabaseClient.rpc("tkn_v5283_log_box_print", { p_box_code: history.box_code, p_copies: Math.max(1,Number(settings.copies||1)), p_print_settings: settings });
      if (error) throw error;
      const overlay = document.createElement('div');
      overlay.className='history-print-overlay';
      overlay.innerHTML=`<article class="box-qr-label"><strong class="box-code">${esc(BOX_CODE.shortCode(history.box_code)||history.box_code)}</strong><canvas></canvas><span class="box-category">${esc(history.category_text||"")} ${history.zone_code?`· โซน ${esc(history.zone_code)}`:""}</span><small>${integer(history.sku_count)} SKU · ${integer(history.total_quantity)} ชิ้น</small></article>`;
      document.body.appendChild(overlay);
      const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
      if (typeof toCanvas !== 'function') throw new Error('ไม่พบระบบสร้าง QR');
      await toCanvas(overlay.querySelector('canvas'),history.qr_payload||history.box_code,{width:420,margin:1,errorCorrectionLevel:'M'});
      document.body.dataset.printTarget='box-history-qr';
      const cleanup=()=>{delete document.body.dataset.printTarget;overlay.remove();void loadBoxHistory();};
      window.addEventListener('afterprint',cleanup,{once:true});
      window.print();
      window.setTimeout(cleanup,12000);
    } catch(error){msg(`พิมพ์ QR ซ้ำไม่สำเร็จ: ${error.message||error}`,"error");}
  }

  function bindHistoryEvents() {
    bind("boxHistoryRefresh", "click", () => { void loadBoxHistory(); });
    bind("boxHistorySearch", "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void loadBoxHistory(); } });
    const rows=$("cloudBoxHistoryRows");
    rows?.addEventListener("click", (event) => {
      const target=event.target instanceof Element?event.target:null;if(!target)return;
      const view=target.closest("[data-history-view]");if(view)return void showHistoryDetail(view.dataset.historyView);
      const rp=target.closest("[data-history-reprint]");if(rp)return void reprintHistoricalBox(cloudHistory.find(h=>h.id===rp.dataset.historyReprint));
    });
  }

  function activateTab(tab) {
    const button = document.querySelector(`.tabs button[data-tab="${tab}"]`);
    if (!button) return;
    document.querySelectorAll(".tabs button,.panel").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    $(tab)?.classList.add("active");
    updateWorkflowNav();
    if (tab === "finalize" && S.box?.status === "CLOSED") void drawFinalBoxQr();
    if (tab === "audit") void loadBoxHistory();
  }

  function activeWorkflowIndex() {
    const active = document.querySelector(".tabs button.active")?.dataset?.tab;
    return Math.max(0, WORKFLOW_TABS.indexOf(active));
  }

  function updateWorkflowNav() {
    const index = activeWorkflowIndex();
    $("workflowStatus").textContent = `ขั้นตอน ${index + 1} จาก ${WORKFLOW_TABS.length}`;
    $("workflowPrevBtn").disabled = index === 0;
    $("workflowNextBtn").disabled = index === WORKFLOW_TABS.length - 1;
    $("workflowNextBtn").textContent = WORKFLOW_NEXT_LABELS[index];
  }

  async function workflowNext() {
    const index = activeWorkflowIndex();
    if (index === 0) {
      if (!S.boxItems.length) return msg("กรุณาสแกนสินค้าเข้ากล่องอย่างน้อย 1 รายการก่อน", "error");
      activateTab("finalize");
      msg("จำนวนในกล่องยืนยันจากการสแกนแล้ว สามารถปิดกล่องได้ทันที", "success");
      return;
    }
    if (index === 1) {
      if (S.box?.status !== "CLOSED") return msg("กรุณาปิดกล่องและสร้าง QR ก่อน", "error");
      activateTab("audit");
    }
  }

  function workflowPrevious() {
    const index = activeWorkflowIndex();
    if (index > 0) activateTab(WORKFLOW_TABS[index - 1]);
  }

  function applyUrlIntent() {
    const params = new URLSearchParams(location.search);
    const requested = params.get("tab");
    const mappedTab = requested === "box" ? "receive" : requested === "check" || requested === "print" ? "finalize" : requested;
    const scanValue = params.get("scan");
    const created = params.get("created") === "1";
    if (mappedTab && WORKFLOW_TABS.includes(mappedTab)) activateTab(mappedTab);
    if (!scanValue) return;
    activateTab("receive");
    $("receiveSku").value = scanValue.replace(/^TKN-P-/i, "");
    $("receiveSku").focus();
    msg(created ? "สร้างสินค้าแล้ว ระบบใส่รหัสเดิมกลับมาให้ กรุณาตรวจจำนวนและกดยืนยัน" : "รับรหัสแล้ว ตรวจจำนวนก่อนเพิ่มลงกล่อง", "success");
  }

  function bindEvents() {
    document.querySelectorAll(".tabs button").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
    bind("receiveBtn", "click", () => { void receiveAndBox(); });
    bind("receiveSku", "keydown", (event) => { if (event.key === "Enter") void receiveAndBox(); });
    bind("receiveProductCameraBtn", "click", () => { void openProductCamera(); });

    bind("newRoundBtn", "click", () => { void (async () => {
      if (!(await guardCanLeaveCurrentDraft("เริ่มรอบใหม่"))) return;
      if (S.round?.active && !confirm("เริ่มรอบและกล่องใหม่? ประวัติกล่องที่ปิดแล้วจะยังอยู่ แต่รอบบนหน้าจอจะเริ่มใหม่")) return;
      newSession();
      newBox();
      S.receipts = [];
      S.round = { active: true, closedBoxIds: [], started_at: now() };
      audit("ROUND_NEW", S.session.id, `เริ่มรอบพร้อมกล่อง ${S.box.id}`);
      save();
      activateTab("receive");
      $("receiveSku").focus();
    })(); });

    bind("newBoxBtn", "click", () => { void (async () => {
      if (!(await guardCanLeaveCurrentDraft("สร้างกล่องใหม่"))) return;
      const old = S.box?.id || "-";
      newBox({ preserveIdentity: true });
      markRoundActive();
      audit("BOX_NEW", S.box.id, `สร้างต่อจาก ${old}`);
      save();
      activateTab("receive");
    })(); });

    bind("useReservedBoxBtn", "click", () => { void claimReservedBoxQr(); });
    bind("reservedBoxScan", "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void claimReservedBoxQr(); } });
    bind("generateBoxBatchQrBtn", "click", () => { void generateBatchBoxQr(); });
    bind("printBoxBatchQrBtn", "click", () => { void printBatchBoxQr(); });
    bind("clearBoxBatchQrBtn", "click", clearBatchBoxQr);
    bind("boxBatchQrPreview", "click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-use-reserved-code]") : null;
      if (!button) return;
      if ($("reservedBoxScan")) $("reservedBoxScan").value = button.dataset.useReservedCode || "";
      void claimReservedBoxQr(button.dataset.useReservedCode);
    });

    bind("openBoxBtn", "click", () => { void openBox(); });
    bind("finalOpenBoxBtn", "click", () => { void openBox(); activateTab("receive"); });
    bind("closeBoxBtn", "click", () => { void closeBox(); });
    bind("printBoxQrBtn", "click", () => { void printBoxQr(); });
    bind("boxCategorySelect", "change", () => {
      if (S.box?.reservedQr) {
        const parsed=BOX_CODE.parse(S.box.id);
        const reservedLabel=S.box.category || parsed?.categoryLabel || "";
        if ([...$("boxCategorySelect").options].some(option=>option.value===reservedLabel)) $("boxCategorySelect").value=reservedLabel;
        return msg("กล่องนี้ใช้ QR ที่จองไว้แล้ว จึงเปลี่ยนประเภทไม่ได้ หากต้องการประเภทอื่นให้สร้างกล่องใหม่", "error");
      }
      S.box.category = $("boxCategorySelect").value;
      updateBoxCodePreview();
      save(false);
    });
    bind("boxZoneCode", "change", () => {
      if (S.box?.reservedQr) {
        if ($("boxZoneCode")) $("boxZoneCode").value=S.box.zoneCode || BOX_CODE.parse(S.box.id)?.zone || "A";
        return msg("กล่องนี้ใช้ QR ที่จองไว้แล้ว จึงเปลี่ยนโซนไม่ได้ หากต้องการโซนอื่นให้สร้างกล่องใหม่", "error");
      }
      S.box.zoneCode = BOX_CODE.normalizeZone($("boxZoneCode").value);
      updateBoxCodePreview();
      save(false);
    });

    bind("boxRows", "click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-remove]") : null;
      if (target?.dataset?.remove !== undefined) void removeItem(Number(target.dataset.remove));
    });
    bind("boxRows", "change", (event) => {
      const input = event.target instanceof Element ? event.target.closest("[data-box-qty]") : null;
      if (input) updateBoxQuantity(input.dataset.boxQty, input.value);
    });

    bind("workflowNextBtn", "click", () => { void workflowNext(); });
    bind("workflowPrevBtn", "click", workflowPrevious);

    bind("boxLabelSizePreset", "change", () => {
      document.querySelectorAll(".box-custom-label-size").forEach((field) => { field.hidden = $("boxLabelSizePreset").value !== "CUSTOM"; });
      applyBoxPrintSettings(true, true);
    });
    ["boxPrinterMode","boxPrinterDpi","boxLabelColumns","boxLabelCopies","boxLabelGap","boxPageMargin","boxCodeMode","boxLabelShowDetails","boxShowBarcodeText","boxLabelCustomWidth","boxLabelCustomHeight"].forEach((id) => {
      bind(id, "change", () => applyBoxPrintSettings(true, true));
    });
    bind('applyBoxPrintSettingsBtn','click',()=>applyBoxPrintSettings(true,true));bind('downloadBoxPngBtn','click',async()=>{try{await drawFinalBoxQr();await window.TKNPrintPlatform.downloadPng($('finalBoxQr'),'tkn-box-label.png')}catch(error){msg(error.message||'สร้าง PNG ไม่สำเร็จ','error')}});bind('shareBoxPngBtn','click',async()=>{try{await drawFinalBoxQr();await window.TKNPrintPlatform.sharePng($('finalBoxQr'),'tkn-box-label.png')}catch(error){msg(error.message||'แชร์ PNG ไม่สำเร็จ','error')}});
  }

  async function initializePage() {
    try {
      if (!window.TKNAuthGuard) throw new Error("ไม่พบระบบตรวจสอบสิทธิ์ กรุณาตรวจว่า js/auth-guard.js ถูกอัปโหลดครบ");
      if (!window.supabaseClient) throw new Error("ไม่พบการเชื่อมต่อ Supabase กรุณาตรวจว่า js/supabase-config.js ถูกอัปโหลดครบ");
      const access = await window.TKNAuthGuard.requireAccess("product.manage", { loadingText: "กำลังตรวจสอบสิทธิ์ระบบ Box QR..." });
      if (!access) return;
      await loadReceiveBranches(access);
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      const currentUser = session?.user?.email || access?.email || "-";
      const currentUserId = session?.user?.id || null;
      console.info(`[Box QR] v${VERSION} พร้อมใช้งาน`);
      load();
      S.user = currentUser;
      S.userId = currentUserId;
      save(false);
      bindEvents();
      bindHistoryEvents();
      await syncCurrentBoxSnapshot();
      await loadCloudStats();
      applyUrlIntent();
      void loadBoxHistory();
      window.supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
        if (nextSession) return;
        window.TKNAuthGuard.clearAccessCache();
        location.replace("./dashboard.html");
      });
      window.TKNAuthGuard.ready();
      if (!new URLSearchParams(location.search).get("scan")) msg("สแกนสินค้าที่กำลังนำลงกล่องจริง ระบบจะรับคืนและจัดกล่องในขั้นตอนเดียว", "success");
      $("receiveSku").focus();
    } catch (error) {
      console.error("Box QR initialization error:", error);
      if (error?.code === "INVENTORY_PERMISSION_DENIED") return;
      if (window.TKNAuthGuard) window.TKNAuthGuard.fail(error, () => location.reload());
      else {
        document.body?.classList.remove("tkn-auth-loading");
        alert(error?.message || "เปิดระบบ Box QR ไม่สำเร็จ");
      }
    }
  }

  window.addEventListener("pagehide", () => cameraScanner?.close?.());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializePage, { once: true });
  else initializePage();
})();
