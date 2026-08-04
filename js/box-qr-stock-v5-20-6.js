(() => {
  "use strict";

  const VERSION = "5.23.3";
  const LABEL_PROFILES = {
    "30x20": { width: 30, height: 20, qr: 8, barcode: 3.5, font: 5.5, lines: 1 },
    "32x25": { width: 32, height: 25, qr: 10, barcode: 4.5, font: 6, lines: 1 },
    "40x30": { width: 40, height: 30, qr: 12, barcode: 5.5, font: 6, lines: 2 },
    "50x40": { width: 50, height: 40, qr: 16, barcode: 7, font: 7, lines: 2 },
  };

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
  const KEY = "tkn_box_qr_v512"; // keep old key so existing work is preserved
  const S = {
    session: null,
    box: null,
    receipts: [],
    boxItems: [],
    queue: [],
    audit: [],
    lastScan: null,
    user: "-",
    userId: null,
    cloudStats: null,
    counts: {},
    countConfirmed: false,
    labelSettings: { printerMode: "AUTO", dpi: 300, preset: "50x40", columns: 2 },
  };

  let cameraScanner = null;

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

  async function openCamera(mode) {
    const scanner = camera();
    if (!scanner) return;

    if (mode === "receive-product") {
      scanner.onScan = async (value) => {
        $("receiveSku").value = cleanScan(value);
        $("receiveBoxQty").focus();
        msg("สแกนสินค้าแล้ว · ตรวจจำนวนและสภาพก่อนยืนยัน", "success");
      };
      await scanner.open({
        title: "สแกน QR สินค้าตรวจรับ",
        instruction: "รองรับ TKN-P, SKU และ Barcode สินค้า",
        successText: "รับรหัสสินค้าแล้ว",
        closeOnScan: true,
      });
      return;
    }

    if (mode === "box-product") {
      scanner.onScan = async (value) => {
        $("boxSku").value = cleanScan(value);
        await addBox();
      };
      await scanner.open({
        title: "สแกนสินค้าเข้ากล่อง",
        instruction: "โหมดต่อเนื่อง · สแกนแล้วเพิ่มเข้ากล่องทันทีตามจำนวนที่ตั้งไว้",
        successText: "เพิ่มเข้ากล่อง",
        closeOnScan: false,
        cooldownMs: 900,
      });
      return;
    }

    scanner.onScan = async (value) => {
      $("scanCode").value = cleanScan(value);
      await scan();
    };
    await scanner.open({
      title: "สแกนตรวจสินค้า / กล่อง",
      instruction: "รองรับ TKN-P, TKN-B, SKU และ Barcode",
      successText: "กำลังตรวจสอบ",
      closeOnScan: true,
    });
  }

  const now = () => new Date().toISOString();
  const code = (prefix) => `${prefix}-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const integer = (value) => Number(value || 0).toLocaleString("th-TH");
  const compactCost = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2, useGrouping: false });
  const costLetter = (sku) => String.fromCharCode(65 + [...String(sku || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 26);
  const hiddenCostSku = (item) => Number(item?.cost_price || 0) > 0
    ? `${item.sku}-${item.costMaskLetter || costLetter(item.sku)}${compactCost(item.cost_price)}`
    : String(item?.sku || "");

  function boxLabelItem(pendingSync = true) {
    const skuCount = S.boxItems.length;
    const pieceCount = S.boxItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const location = S.box?.location ? ` · ${S.box.location}` : "";
    return {
      type: "BOX",
      code: S.box.id,
      sku: S.box.id,
      barcode: S.box.id,
      name: `กล่อง ${S.box.id} · ${skuCount} SKU · ${pieceCount} ชิ้น${location}`,
      qty: 1,
      pendingSync,
    };
  }

  function msg(text, kind = "") {
    $("message").textContent = text;
    $("message").className = `notice ${kind}`;
  }

  function save(renderAfter = true) {
    localStorage.setItem(KEY, JSON.stringify(S));
    if (renderAfter) render();
  }

  function load() {
    try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) {}
    S.counts ||= {};
    S.labelSettings = { printerMode: "AUTO", dpi: 300, preset: "50x40", columns: 2, ...(S.labelSettings || {}) };
    if (!S.session) newSession();
    if (!S.box) newBox();
    render();
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
        detail: { message: detail || "", source: "box-qr-v5.20.6" },
        user_id: S.userId,
      });
    } catch (error) {
      console.warn("Cloud audit skipped:", error);
    }
  }

  function newSession() {
    S.session = { id: code("RCV"), source: "Shopee", created_at: now(), cloudId: null };
    if ($("receiveCode")) $("receiveCode").value = S.session.id;
  }

  function newBox() {
    S.box = { id: code("TKN-B"), status: "DRAFT", location: "", created_at: now(), cloudId: null };
    S.boxItems = [];
    if ($("boxCode")) $("boxCode").value = S.box.id;
  }

  function cleanScan(raw) {
    let value = String(raw || "").trim();
    try {
      const url = new URL(value);
      value = url.searchParams.get("id") || url.searchParams.get("code") || value;
    } catch (_) {}
    return value.trim();
  }

  const MAX_LABEL_PREVIEWS = 500;

  function queueKey(item) {
    return `${String(item?.type || "PRODUCT").toUpperCase()}|${String(item?.code || "").trim()}`;
  }

  function productCodeFromReference(referenceCode) {
    return cleanScan(referenceCode).replace(/^TKN-P-/i, "").trim();
  }

  async function productByScan(raw) {
    const value = cleanScan(raw).replace(/^TKN-P-/i, "").replace(/[%(),]/g, "");
    if (!value) return null;
    try {
      const { data, error } = await supabaseClient.from("products")
        .select("id,product_code,name,barcode,cost_price,selling_price,quantity,minimum_stock")
        .or(`product_code.eq.${value},barcode.eq.${value}`).limit(1).maybeSingle();
      if (error) throw error;
      return data || { id: null, product_code: value, name: "ยังไม่พบในหน้าจัดการสินค้า", barcode: value };
    } catch (error) {
      console.warn("Product lookup:", error);
      return { id: null, product_code: value, name: "ยังไม่พบในหน้าจัดการสินค้า", barcode: value };
    }
  }

  async function ensureCloudSession() {
    if (S.session.cloudId) return S.session.cloudId;
    const payload = {
      session_code: S.session.id,
      source: S.session.source,
      status: "OPEN",
      created_by: S.userId,
    };
    const { data, error } = await supabaseClient.from("marketplace_receiving_sessions")
      .upsert(payload, { onConflict: "session_code" }).select("id").single();
    if (error) throw error;
    S.session.cloudId = data.id;
    save(false);
    return data.id;
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
      const { data, error } = await supabaseClient.from("marketplace_receiving_items").insert({
        session_id: sessionId,
        tracking_number: receipt.tracking || null,
        order_number: receipt.tracking || null,
        product_id: product.id || null,
        sku: receipt.sku,
        expected_qty: receipt.expected,
        actual_qty: receipt.actual,
        good_qty: receipt.good,
        condition_status: receipt.condition,
        created_by: S.userId,
      }).select("id").single();
      if (error) throw error;
      receipt.cloudId = data?.id || null;
      save(false);
      return true;
    } catch (error) {
      console.warn("Receipt kept locally:", error);
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

  async function syncReceiptToBranchStock(receipt, product) {
    if (!receipt.good) return { ok: true, skipped: true };
    const branchId = receipt.branch_id || $("receiveBranch")?.value;
    if (!branchId) return { ok: false, error: "กรุณาเลือกสาขารับสินค้า" };
    if (!product.id) return { ok: false, error: "สินค้านี้ยังไม่มีรหัสในฐานข้อมูล จึงยังเพิ่มสต็อกไม่ได้" };
    try {
      const { data, error } = await supabaseClient.rpc("receive_branch_inventory", {
        p_branch_id: branchId,
        p_items: [{ product_id: product.id, quantity: receipt.good, note: `รับผ่าน Box QR ${receipt.id}` }],
        p_supplier_name: S.session.source || null,
        p_reference_no: receipt.id,
        p_notes: `${receipt.boxes} กล่อง × ${receipt.piecesPerBox} ชิ้น + เศษ ${receipt.loosePieces}`,
        p_idempotency_key: `box-qr-receive:${receipt.id}`,
      });
      if (error) throw error;
      return { ok: true, data };
    } catch (error) {
      console.warn("Branch stock receive failed:", error);
      return { ok: false, error: error.message };
    }
  }

  async function syncBoxItemToCloud(product, item) {
    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_box_items").upsert({
        box_id: boxId,
        product_id: product.id || null,
        sku: item.sku,
        quantity: item.qty,
      }, { onConflict: "box_id,sku" });
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn("Box item kept locally:", error);
      return false;
    }
  }

  async function receive() {
    const product = await productByScan($("receiveSku").value);
    if (!product) return msg("กรุณายิง SKU หรือ Barcode", "error");
    const boxes = Math.max(0, Math.floor(Number($("receiveBoxQty").value) || 0));
    const piecesPerBox = Math.max(1, Math.floor(Number($("piecesPerBox").value) || 1));
    const loosePieces = Math.max(0, Math.floor(Number($("loosePieces").value) || 0));
    const calculatedTotal = (boxes * piecesPerBox) + loosePieces;
    const actual = Math.max(1, Math.floor(Number($("receiveTotalPieces")?.value) || calculatedTotal));
    if (actual <= 0) return msg("กรุณาระบุจำนวนกล่องหรือเศษสินค้าอย่างน้อย 1 ชิ้น", "error");
    const expected = boxes * piecesPerBox;
    const condition = $("condition").value;
    const good = condition === "GOOD" ? actual : 0;
    S.session.source = $("source").value;
    const receipt = {
      id: code("REC"), session_id: S.session.id, tracking: "",
      sku: product.product_code, name: product.name, barcode: product.barcode || product.product_code,
      product_id: product.id || null, cost_price: Number(product.cost_price || 0), selling_price: Number(product.selling_price || 0),
      costMaskLetter: costLetter(product.product_code), boxes, piecesPerBox, loosePieces,
      branch_id: $("receiveBranch")?.value || null,
      expected, actual, condition, good, at: now(),
    };
    S.receipts.unshift(receipt);
    audit("RECEIVE", product.product_code, `${boxes} กล่อง × ${piecesPerBox} ชิ้น + เศษ ${loosePieces} = ${actual} ชิ้น, สภาพ ${condition}`);
    $("receiveSku").value = "";
    $("receiveBoxQty").value = "1";
    $("loosePieces").value = "0";
    updateReceiveTotal();
    save();
    msg("บันทึกในเครื่องแล้ว กำลังส่งเข้าฐานข้อมูลกลาง...", "success");
    const [synced, stockResult] = await Promise.all([
      syncReceiptToCloud(receipt, product),
      syncReceiptToBranchStock(receipt, product),
    ]);
    receipt.cloudSynced = Boolean(synced);
    receipt.stockSynced = Boolean(stockResult.ok && !stockResult.skipped);
    save(false);
    if (synced && stockResult.ok) {
      msg(condition === "GOOD" ? `รับเข้า ${actual} ชิ้นและอัปเดตสต็อกสาขาแล้ว` : `บันทึกสินค้า ${actual} ชิ้นไว้ตรวจสอบ โดยยังไม่เพิ่มสต็อกพร้อมขาย`, "success");
    } else {
      msg(`บันทึกในเครื่องแล้ว แต่ซิงก์ไม่ครบ${stockResult.error ? `: ${stockResult.error}` : ""}`, "error");
    }
    await loadCloudStats();
    $("receiveSku").focus();
  }

  async function reverseReceipt(receipt) {
    if (S.boxItems.some((item) => item.sku === receipt.sku)) {
      throw new Error(`SKU ${receipt.sku} อยู่ในกล่อง กรุณานำออกจากกล่องก่อนลบรายการตรวจรับ`);
    }
    const legacyStockWasLikelySynced = receipt.stockSynced == null && Boolean(receipt.product_id && receipt.branch_id);
    if (Number(receipt.good || 0) > 0 && (receipt.stockSynced === true || legacyStockWasLikelySynced)) {
      const branchId = receipt.branch_id || $("receiveBranch")?.value;
      if (!receipt.product_id || !branchId) {
        throw new Error(`SKU ${receipt.sku} ไม่มีข้อมูลสาขาหรือรหัสสินค้า จึงย้อนสต็อกอัตโนมัติไม่ได้`);
      }
      const { error } = await supabaseClient.rpc("issue_branch_inventory", {
        p_branch_id: branchId,
        p_items: [{ product_id: receipt.product_id, quantity: Number(receipt.good), note: `ยกเลิกรับผ่าน Box QR ${receipt.id}` }],
        p_requester_name: S.user || "Box QR",
        p_department: "คลังสินค้า",
        p_reference_no: receipt.id,
        p_notes: `ย้อนรายการตรวจรับ ${receipt.sku} จำนวน ${receipt.good} ชิ้น`,
        p_idempotency_key: `box-qr-receive-reverse:${receipt.id}`,
      });
      if (error) throw error;
    }
    if (receipt.cloudId) {
      const { error } = await supabaseClient.from("marketplace_receiving_items").delete().eq("id", receipt.cloudId);
      if (error) console.warn("Receipt cloud row was not deleted:", error);
    }
  }

  async function deleteReceiptById(receiptId, ask = true) {
    const receipt = S.receipts.find((row) => row.id === receiptId);
    if (!receipt) return;
    if (ask && !confirm(`ลบรายการ ${receipt.sku} และย้อนสต็อก ${receipt.good || 0} ชิ้นหรือไม่?`)) return;
    try {
      await reverseReceipt(receipt);
      S.receipts = S.receipts.filter((row) => row.id !== receipt.id);
      audit("RECEIVE_DELETE", receipt.sku, `ลบรายการและย้อนสต็อก ${receipt.good || 0} ชิ้น`);
      save();
      await loadCloudStats();
      msg(`ลบ ${receipt.sku} และย้อนสต็อกเรียบร้อย`, "success");
    } catch (error) {
      msg(error.message || "ลบรายการไม่สำเร็จ", "error");
    }
  }

  async function clearReceipts() {
    if (!S.receipts.length) return msg("ไม่มีรายการตรวจรับให้ล้าง", "error");
    if (!confirm(`ล้างรายการตรวจรับ ${S.receipts.length} รายการและย้อนสต็อกทั้งหมดหรือไม่?`)) return;
    const rows = [...S.receipts];
    try {
      for (const receipt of rows) await reverseReceipt(receipt);
      S.receipts = [];
      audit("RECEIVE_CLEAR", S.session.id, `ล้าง ${rows.length} รายการและย้อนสต็อกแล้ว`);
      save();
      await loadCloudStats();
      msg("ล้างรายการตรวจรับและย้อนสต็อกเรียบร้อย", "success");
    } catch (error) {
      msg(`หยุดการล้างรายการ: ${error.message || error}`, "error");
    }
  }

  function clearAuditHistory() {
    if (!S.audit.length) return msg("ไม่มีประวัติในเครื่องให้ล้าง", "error");
    if (!confirm(`ล้างประวัติในเครื่อง ${S.audit.length} รายการหรือไม่?`)) return;
    S.audit = [];
    save();
    msg("ล้างประวัติในเครื่องแล้ว", "success");
  }

  function installUsbScanner() {
    let buffer = "";
    let lastKeyAt = 0;
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      const at = Date.now();
      if (at - lastKeyAt > 120) buffer = "";
      lastKeyAt = at;
      if (event.key === "Enter") {
        const value = buffer.trim();
        buffer = "";
        if (!value) return;
        event.preventDefault();
        const active = document.querySelector(".panel.active")?.id;
        if (active === "receive") { $("receiveSku").value = value; void receive(); }
        else if (active === "box") { $("boxSku").value = value; void addBox(); }
        else if (active === "check") { $("scanCode").value = value; void scan(); }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) buffer += event.key;
    });
  }

  async function addBox() {
    if (S.box.status !== "DRAFT") return msg("กล่องปิดแล้ว ต้องเปิดกล่องก่อนแก้ไข", "error");
    const product = await productByScan($("boxSku").value);
    if (!product) return msg("กรุณายิงสินค้า", "error");
    const qty = Math.max(1, Number($("boxQty").value) || 1);
    let item = S.boxItems.find((row) => row.sku === product.product_code);
    if (item) item.qty += qty;
    else {
      item = { sku: product.product_code, name: product.name, qty, product_id: product.id || null,
        barcode: product.barcode || product.product_code, cost_price: Number(product.cost_price || 0),
        selling_price: Number(product.selling_price || 0), costMaskLetter: costLetter(product.product_code) };
      S.boxItems.push(item);
    }
    S.countConfirmed = false;
    S.box.location = $("location").value.trim();
    audit("BOX_IN", S.box.id, `${product.product_code} +${qty}`);
    $("boxSku").value = "";
    save();
    msg("เพิ่มเข้ากล่องในเครื่องแล้ว กำลังซิงก์...", "success");
    const synced = await syncBoxItemToCloud(product, item);
    msg(synced ? "เพิ่มสินค้าเข้ากล่องและซิงก์ส่วนกลางแล้ว" : "เพิ่มเข้ากล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", synced ? "success" : "error");
    $("boxSku").focus();
  }

  async function closeBox() {
    if (!S.boxItems.length) return msg("กล่องยังไม่มีสินค้า", "error");
    if (!S.countConfirmed || S.boxItems.some((item) => Number(S.counts[item.sku]) !== Number(item.qty))) {
      activateTab("check");
      return msg("กรุณาตรวจนับให้ตรงทุกรายการก่อนปิดกล่อง", "error");
    }
    S.box.status = "CLOSED";
    S.box.location = $("location").value.trim();
    enqueueLabel(boxLabelItem(true));
    audit("BOX_CLOSE", S.box.id, `รวม ${S.boxItems.reduce((sum, item) => sum + item.qty, 0)} ชิ้น`);
    save();
    let queueSynced = false;
    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_boxes").update({
        status: "CLOSED", location_text: S.box.location || null, closed_at: now(),
      }).eq("id", boxId);
      if (error) throw error;
      await supabaseClient.from("label_print_queue").update({ status: "CLEARED" })
        .eq("status", "PENDING").eq("requested_by", S.userId).eq("reference_code", S.box.id);
      const { error: queueError } = await supabaseClient.from("label_print_queue").insert({
        label_type: "BOX", reference_code: S.box.id, copies: 1,
        status: "PENDING", requested_by: S.userId,
      });
      if (queueError) throw queueError;
      queueSynced = true;
      msg("ปิดกล่อง สร้าง QR และซิงก์ส่วนกลางแล้ว", "success");
    } catch (error) {
      console.warn(error);
      msg("ปิดกล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", "error");
    }
    if (queueSynced) await loadCloudPrintQueue();
    else render();
    await drawFinalBoxQr();
    await loadCloudStats();
  }

  async function openBox() {
    if (!confirm("เปิดกล่องเพื่อแก้ไข? ระบบจะบันทึกประวัติ")) return;
    S.box.status = "DRAFT";
    S.countConfirmed = false;
    audit("BOX_OPEN", S.box.id, "เปิดกล่องเพื่อแก้ไข");
    save();
    try {
      const boxId = await ensureCloudBox();
      await supabaseClient.from("stock_boxes").update({ status: "DRAFT", closed_at: null }).eq("id", boxId);
      msg("เปิดกล่องและซิงก์ส่วนกลางแล้ว", "success");
    } catch (error) {
      msg("เปิดกล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", "error");
    }
  }

  async function queueProducts() {
    const receipts = S.receipts.filter((row) => row.good > 0);
    for (const row of receipts) enqueueLabel({ type: "PRODUCT", code: `TKN-P-${row.sku}`, sku: row.sku,
      barcode: row.barcode || row.sku, name: row.name, qty: row.good, cost_price: row.cost_price,
      costMaskLetter: row.costMaskLetter, productId: row.product_id, pendingSync: true });
    audit("PRINT_QUEUE", S.session.id, "เพิ่ม QR สินค้าจากรอบตรวจรับ");
    save();
    let queueSynced = false;
    try {
      const payload = receipts.map((row) => ({
        label_type: "PRODUCT", reference_code: `TKN-P-${row.sku}`,
        copies: Math.max(1, Number(row.good) || 1), status: "PENDING", requested_by: S.userId,
      }));
      if (payload.length) {
        const { error } = await supabaseClient.from("label_print_queue").insert(payload);
        if (error) throw error;
      }
      queueSynced = true;
      msg("เพิ่มคิวพิมพ์ในเครื่องและส่วนกลางแล้ว", "success");
    } catch (error) {
      console.error("Queue product labels cloud error:", error);
      msg("เพิ่มคิวพิมพ์ในเครื่องแล้ว แต่ส่วนกลางยังไม่สำเร็จ", "error");
    }
    if (queueSynced) await loadCloudPrintQueue();
    else render();
    await loadCloudStats();
  }

  function enqueueLabel(incoming) {
    const key = queueKey(incoming);
    const existing = S.queue.find((item) => queueKey(item) === key);
    if (existing) Object.assign(existing, incoming, { qty: Number(incoming.qty || existing.qty || 1) });
    else S.queue.push(incoming);
  }

  async function addReceivedToBox() {
    if (S.box.status !== "DRAFT") return msg("กล่องปิดแล้ว ต้องเปิดกล่องก่อนแก้ไข", "error");
    const rows = S.receipts.filter((row) => Number(row.good) > 0);
    if (!rows.length) return msg("ยังไม่มีสินค้าสภาพดีในรอบตรวจรับ", "error");
    for (const row of rows) {
      let item = S.boxItems.find((entry) => entry.sku === row.sku);
      if (item) item.qty += Number(row.good);
      else {
        item = { sku: row.sku, name: row.name, qty: Number(row.good), product_id: row.product_id || null,
          barcode: row.barcode || row.sku, cost_price: Number(row.cost_price || 0), selling_price: Number(row.selling_price || 0),
          costMaskLetter: row.costMaskLetter || costLetter(row.sku) };
        S.boxItems.push(item);
      }
      await syncBoxItemToCloud({ id: item.product_id }, item);
    }
    S.countConfirmed = false;
    S.box.location = $("location").value.trim();
    audit("BOX_BATCH_IN", S.box.id, `เพิ่มจากรอบตรวจรับ ${rows.length} SKU`);
    save();
    msg(`เพิ่มสินค้าตรวจรับ ${rows.length} SKU ลงกล่องแล้ว`, "success");
  }

  async function queueBoxProducts() {
    if (!S.boxItems.length) return msg("กล่องยังไม่มีสินค้า", "error");
    for (const item of S.boxItems) enqueueLabel({ type: "PRODUCT", code: `TKN-P-${item.sku}`, sku: item.sku,
      barcode: item.barcode || item.sku, name: item.name, qty: item.qty, cost_price: item.cost_price,
      costMaskLetter: item.costMaskLetter || costLetter(item.sku), productId: item.product_id, pendingSync: true });
    audit("BOX_LABEL_UPDATE", S.box.id, `สร้างฉลาก ${S.boxItems.length} SKU`);
    save();
    try {
      const refs = S.boxItems.map((item) => `TKN-P-${item.sku}`);
      if (S.userId && refs.length) {
        await supabaseClient.from("label_print_queue").update({ status: "CLEARED" })
          .eq("status", "PENDING").eq("requested_by", S.userId).in("reference_code", refs);
        const { error } = await supabaseClient.from("label_print_queue").insert(S.boxItems.map((item) => ({
          label_type: "PRODUCT", reference_code: `TKN-P-${item.sku}`, product_id: item.product_id || null,
          copies: Math.max(1, Number(item.qty) || 1), status: "PENDING", requested_by: S.userId,
        })));
        if (error) throw error;
      }
    } catch (error) { console.warn("Box labels kept locally:", error); }
    activateTab("print");
    msg("สร้าง/อัปเดตฉลากสินค้าทั้งกล่องแล้ว", "success");
  }

  async function lookupCloudBox(boxCode) {
    const { data: box, error } = await supabaseClient.from("stock_boxes").select("*").eq("box_code", boxCode).maybeSingle();
    if (error) throw error;
    if (!box) return null;
    const { data: items, error: itemError } = await supabaseClient.from("stock_box_items")
      .select("product_id,sku,quantity").eq("box_id", box.id).order("sku");
    if (itemError) throw itemError;
    const ids = [...new Set((items || []).map((item) => item.product_id).filter(Boolean))];
    let productMap = new Map();
    if (ids.length) {
      const { data: products } = await supabaseClient.from("products").select("id,product_code,name").in("id", ids);
      productMap = new Map((products || []).map((product) => [product.id, product]));
    }
    return {
      type: "BOX", id: box.box_code, status: box.status, location: box.location_text,
      items: (items || []).map((item) => ({
        sku: item.sku, qty: Number(item.quantity || 0),
        name: productMap.get(item.product_id)?.name || item.sku,
      })),
    };
  }

  async function loadProductStock(product) {
    let branches = [];
    let boxes = [];
    try {
      const result = await supabaseClient.from("branch_inventory_list").select("*").eq("product_id", product.id);
      if (!result.error) branches = result.data || [];
    } catch (_) {}
    try {
      const result = await supabaseClient.from("stock_box_items")
        .select("quantity,stock_boxes(box_code,status,location_text)").eq("product_id", product.id).gt("quantity", 0);
      if (!result.error) boxes = result.data || [];
    } catch (_) {}
    const stock = branches.length ? branches.reduce((sum, row) => sum + Number(row.quantity || 0), 0) : Number(product.quantity || 0);
    const inBoxes = boxes.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    return { stock, inBoxes, branches, boxes };
  }

  async function scan() {
    const raw = cleanScan($("scanCode").value);
    if (!raw) return;
    if (/^TKN-B-/i.test(raw)) {
      let found = null;
      try { found = await lookupCloudBox(raw); } catch (error) { console.warn(error); }
      if (!found && raw === S.box.id) found = { type: "BOX", id: S.box.id, status: S.box.status, location: S.box.location, items: S.boxItems };
      if (!found) {
        $("scanResult").textContent = "ไม่พบกล่องนี้ในฐานข้อมูลกลาง";
        return msg("ไม่พบกล่อง", "error");
      }
      S.lastScan = found;
      $("scanResult").innerHTML = `<h3>${esc(found.id)}</h3><p>สถานะ ${esc(found.status)} · ${esc(found.location || "ยังไม่ระบุตำแหน่ง")}</p><ul>${found.items.map((item) => `<li>${esc(item.name)} (${esc(item.sku)}) — ${integer(item.qty)} ชิ้น</li>`).join("")}</ul><b>รวม ${integer(found.items.reduce((sum, item) => sum + Number(item.qty || 0), 0))} ชิ้น</b>`;
    } else {
      const product = await productByScan(raw);
      if ($("check")?.classList.contains("active")) {
        const boxed = S.boxItems.find((item) => item.sku === product.product_code);
        if (boxed) {
          S.counts[boxed.sku] = Math.min(Number(boxed.qty), Number(S.counts[boxed.sku] || 0) + 1);
          S.countConfirmed = false;
          save();
          msg(`นับ ${boxed.name}: ${S.counts[boxed.sku]}/${boxed.qty} ชิ้น`, "success");
          return;
        }
      }
      const info = await loadProductStock(product);
      S.lastScan = { type: "PRODUCT", product, ...info };
      $("scanResult").innerHTML = `<h3>${esc(product.name)}</h3><p>รหัส ${esc(product.product_code)} · ราคา ${Number(product.selling_price || 0).toLocaleString("th-TH")} บาท</p><p><b>สต็อกในระบบ ${integer(info.stock)} ชิ้น</b> · อยู่ในกล่อง ${integer(info.inBoxes)} ชิ้น</p><p>${info.branches.map((row) => `${esc(row.branch_name || "สาขา")}: ${integer(row.quantity)}`).join(" · ") || "ไม่พบข้อมูลแยกสาขา"}</p>`;
    }
    audit("SCAN", raw, "ตรวจสอบ QR เป็นหลัก / Barcode สำรอง");
    save();
    msg("ตรวจสอบข้อมูลแล้ว", "success");
  }

  async function removeItem(index) {
    if (S.box.status !== "DRAFT") return msg("ต้องเปิดกล่องก่อนลบ", "error");
    const removed = S.boxItems[index];
    S.boxItems.splice(index, 1);
    if (removed) delete S.counts[removed.sku];
    S.countConfirmed = false;
    audit("BOX_REMOVE", S.box.id, `${removed?.sku || "-"} removed`);
    save();
    if (S.box.cloudId && removed) {
      try {
        await supabaseClient.from("stock_box_items").delete().eq("box_id", S.box.cloudId).eq("sku", removed.sku);
        msg("ลบสินค้าออกจากกล่องและซิงก์ส่วนกลางแล้ว", "success");
      } catch (error) {
        msg("ลบในเครื่องแล้ว แต่ส่วนกลางยังไม่สำเร็จ", "error");
      }
    }
  }

  function startRecount() {
    S.counts = Object.fromEntries(S.boxItems.map((item) => [item.sku, 0]));
    S.countConfirmed = false;
    save();
    msg("เริ่มรอบตรวจนับใหม่แล้ว สแกนสินค้าหรือกรอกจำนวนตรวจจริง", "success");
  }

  function confirmCount() {
    if (!S.boxItems.length) return msg("กล่องยังไม่มีสินค้า", "error");
    const mismatches = S.boxItems.filter((item) => Number(S.counts[item.sku] || 0) !== Number(item.qty));
    if (mismatches.length) return msg(`จำนวนยังไม่ตรง ${mismatches.length} SKU กรุณาตรวจใหม่`, "error");
    S.countConfirmed = true;
    audit("BOX_COUNT_CONFIRMED", S.box.id, `ตรง ${S.boxItems.length} SKU`);
    save();
    void queueBoxProducts();
  }

  function updateBoxQuantity(sku, value) {
    const item = S.boxItems.find((row) => row.sku === sku);
    if (!item || S.box.status !== "DRAFT") return;
    item.qty = Math.max(1, Math.floor(Number(value) || 1));
    S.countConfirmed = false;
    save();
    void syncBoxItemToCloud({ id: item.product_id }, item);
  }

  function renderCountRows() {
    const host = $("countRows");
    if (!host) return;
    host.innerHTML = S.boxItems.map((item) => {
      const counted = Number(S.counts[item.sku] || 0);
      const diff = counted - Number(item.qty);
      return `<tr><td>${esc(item.sku)}</td><td>${esc(item.name)}</td><td>${item.qty}</td>
        <td><input class="count-input" data-count-sku="${esc(item.sku)}" type="number" min="0" value="${counted}"></td>
        <td class="${diff === 0 ? "count-ok" : "count-bad"}">${diff > 0 ? "+" : ""}${diff}</td>
        <td><span class="count-status ${diff === 0 ? "ok" : "bad"}">${diff === 0 ? "ตรง" : "ไม่ตรง"}</span></td></tr>`;
    }).join("") || '<tr><td colspan="6">ยังไม่มีสินค้าในกล่อง</td></tr>';
  }

  function renderFinalSummary() {
    const host = $("finalBoxSummary");
    if (!host) return;
    const total = S.boxItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const matched = S.boxItems.filter((item) => Number(S.counts[item.sku]) === Number(item.qty)).length;
    host.innerHTML = `<article><span>รหัสกล่อง</span><b>${esc(S.box.id)}</b></article>
      <article><span>จำนวน SKU</span><b>${S.boxItems.length}</b></article><article><span>จำนวนชิ้น</span><b>${total}</b></article>
      <article><span>ตรวจนับ</span><b>${matched}/${S.boxItems.length}</b></article><article><span>สถานะ</span><b>${esc(S.box.status)}</b></article>`;
  }

  async function drawFinalBoxQr() {
    const host = $("finalBoxQr");
    if (!host || !S.box) return;
    host.innerHTML = `<canvas aria-label="QR กล่อง ${esc(S.box.id)}"></canvas><strong>${esc(S.box.id)}</strong><small>${S.boxItems.length} SKU · ${S.boxItems.reduce((s, i) => s + Number(i.qty || 0), 0)} ชิ้น</small>`;
    try {
      const canvas = host.querySelector("canvas");
      const ready = await (window.TKNQRHealth?.wait?.(2500) ?? Promise.resolve(Boolean(window.QRCode?.toCanvas || window.TKNQR?.toCanvas)));
      const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
      if (!ready || typeof toCanvas !== "function") throw new Error(window.TKNQRHealth?.errorText?.() || "QR engine unavailable");
      await toCanvas(canvas, S.box.id, { width: 240, margin: 2, errorCorrectionLevel: "M" });
    } catch (error) { host.insertAdjacentHTML("beforeend", `<em>สร้าง QR ไม่สำเร็จ: ${esc(error.message)}</em>`); }
  }

  async function queueAndShowBoxLabel() {
    if (!S.boxItems.length) return msg("กล่องยังไม่มีสินค้า", "error");
    if (S.box.status !== "CLOSED") return msg("กรุณาตรวจนับและปิดกล่องก่อนสร้างฉลากกล่อง", "error");
    enqueueLabel(boxLabelItem(true));
    save(false);
    try {
      await supabaseClient.from("label_print_queue").update({ status: "CLEARED" })
        .eq("status", "PENDING").eq("requested_by", S.userId).eq("reference_code", S.box.id);
      const { error } = await supabaseClient.from("label_print_queue").insert({
        label_type: "BOX", reference_code: S.box.id, copies: 1,
        status: "PENDING", requested_by: S.userId,
      });
      if (error) throw error;
      await loadCloudPrintQueue();
    } catch (error) {
      console.warn("Box label remains local:", error);
      render();
    }
    activateTab("print");
    msg("สร้างฉลากกล่อง QR + Code 128 พร้อมพิมพ์แล้ว", "success");
  }

  async function syncCurrentBoxSnapshot() {
    if (!S.box || !S.boxItems.length) return;
    try {
      const boxId = await ensureCloudBox();
      const productCodes = [...new Set(S.boxItems.map((item) => item.sku).filter(Boolean))];
      let productMap = new Map();
      if (productCodes.length) {
        const { data } = await supabaseClient.from("products")
          .select("id,product_code").in("product_code", productCodes);
        productMap = new Map((data || []).map((product) => [product.product_code, product.id]));
      }
      const payload = S.boxItems.map((item) => ({
        box_id: boxId,
        product_id: item.product_id || productMap.get(item.sku) || null,
        sku: item.sku,
        quantity: Number(item.qty || 0),
      }));
      if (payload.length) {
        const { error } = await supabaseClient.from("stock_box_items")
          .upsert(payload, { onConflict: "box_id,sku" });
        if (error) throw error;
      }
      const update = { status: S.box.status, location_text: S.box.location || null };
      if (S.box.status === "CLOSED") update.closed_at = S.box.closed_at || S.box.created_at || now();
      await supabaseClient.from("stock_boxes").update(update).eq("id", boxId);
    } catch (error) {
      console.warn("Existing box snapshot remains local:", error);
    }
  }

  async function fetchProductsInBatches(field, values) {
    const uniqueValues = [...new Set((values || []).filter(Boolean))];
    const products = [];
    for (let index = 0; index < uniqueValues.length; index += 100) {
      const batch = uniqueValues.slice(index, index + 100);
      const { data, error } = await supabaseClient.from("products")
        .select("id,product_code,name,barcode,cost_price,selling_price")
        .in(field, batch);
      if (error) throw error;
      products.push(...(data || []));
    }
    return products;
  }

  async function loadCloudPrintQueue(options = {}) {
    const announce = Boolean(options.announce);
    const host = $("printQueue");
    if (host) host.setAttribute("aria-busy", "true");

    try {
      if (!S.userId) {
        renderQueue();
        return;
      }

      const { data: rows, error } = await supabaseClient.from("label_print_queue")
        .select("id,label_type,reference_code,product_id,copies,status,requested_at")
        .eq("status", "PENDING")
        .eq("requested_by", S.userId)
        .order("requested_at", { ascending: true });
      if (error) throw error;

      const pendingRows = rows || [];
      const productIds = [...new Set(pendingRows.map((row) => row.product_id).filter(Boolean))];
      const productCodes = [...new Set(
        pendingRows
          .filter((row) => String(row.label_type || "").toUpperCase() !== "BOX")
          .map((row) => productCodeFromReference(row.reference_code))
          .filter(Boolean)
      )];

      const products = [
        ...(await fetchProductsInBatches("id", productIds)),
        ...(await fetchProductsInBatches("product_code", productCodes)),
      ];

      const byId = new Map(products.map((product) => [product.id, product]));
      const byCode = new Map(products.map((product) => [product.product_code, product]));
      const cloudGroups = new Map();

      pendingRows.forEach((row) => {
        const type = String(row.label_type || "PRODUCT").toUpperCase() === "BOX" ? "BOX" : "PRODUCT";
        const codeValue = String(row.reference_code || "").trim();
        if (!codeValue) return;
        const sku = productCodeFromReference(codeValue);
        const product = byId.get(row.product_id) || byCode.get(sku);
        const item = {
          type,
          code: codeValue,
          sku,
          barcode: product?.barcode || sku || codeValue,
          name: type === "BOX"
            ? (codeValue === S.box?.id ? boxLabelItem(false).name : `กล่อง ${codeValue}`)
            : (product?.name || sku || codeValue),
          cost_price: Number(product?.cost_price || 0),
          costMaskLetter: costLetter(sku),
          qty: Math.max(1, Number(row.copies) || 1),
          productId: row.product_id || product?.id || null,
          cloudIds: [row.id],
          source: "cloud",
        };
        const key = queueKey(item);
        const existing = cloudGroups.get(key);
        if (existing) {
          existing.qty += item.qty;
          existing.cloudIds.push(row.id);
          if ((!existing.name || existing.name === existing.code) && item.name) existing.name = item.name;
        } else {
          cloudGroups.set(key, item);
        }
      });

      const localQueue = Array.isArray(S.queue) ? S.queue : [];
      const localOnly = localQueue.filter((item) => item?.pendingSync === true && !cloudGroups.has(queueKey(item)));
      S.queue = [...cloudGroups.values(), ...localOnly];
      S.cloudStats = {
        ...(S.cloudStats || {}),
        print: pendingRows.reduce((sum, row) => sum + Math.max(1, Number(row.copies) || 1), 0),
      };
      save(false);
      render();
      if (announce) msg(`โหลดคิวพิมพ์ ${S.cloudStats.print || 0} ฉลากแล้ว`, "success");
    } catch (error) {
      console.error("Load print queue error:", error);
      renderQueue();
      if (announce) msg("โหลดคิวพิมพ์ส่วนกลางไม่สำเร็จ กำลังแสดงคิวที่บันทึกในเครื่อง", "error");
    } finally {
      if (host) host.removeAttribute("aria-busy");
    }
  }

  async function loadCloudStats() {
    try {
      let printQueueQuery = supabaseClient.from("label_print_queue")
        .select("copies")
        .eq("status", "PENDING");
      // The visible print queue belongs to the signed-in user. Filtering here
      // prevents another user's pending labels from keeping this counter non-zero.
      if (S.userId) printQueueQuery = printQueueQuery.eq("requested_by", S.userId);

      const queue = await printQueueQuery;
      S.cloudStats = {
        print: (queue.data || []).reduce((sum, row) => sum + Number(row.copies || 1), 0),
      };
      renderStats();
    } catch (error) {
      console.warn("Cloud stats fallback:", error);
    }
  }

  async function clearPrintQueue() {
    if (!confirm("ล้างคิวพิมพ์ทั้งหมดของผู้ใช้งานนี้ ทั้งในเครื่องและส่วนกลาง?")) return;

    const button = $("clearPrintBtn");
    const localCopies = S.queue.reduce((sum, row) => sum + (Number(row.qty) || 1), 0);
    if (button) {
      button.disabled = true;
      button.textContent = "กำลังล้างคิว...";
    }

    // Clear the visible/local queue immediately, and reset the cached counter so
    // the number on the summary card does not keep showing the stale cloud value.
    S.queue = [];
    if (S.cloudStats) S.cloudStats.print = 0;
    audit("PRINT_QUEUE_CLEAR", S.userId || S.user, `ล้างคิวในเครื่อง ${localCopies} ฉลาก`);
    save();

    try {
      if (!S.userId) throw new Error("ไม่พบรหัสผู้ใช้งานสำหรับล้างคิวส่วนกลาง");
      const { error } = await supabaseClient.from("label_print_queue")
        .update({ status: "CLEARED" })
        .eq("status", "PENDING")
        .eq("requested_by", S.userId);
      if (error) throw error;

      await loadCloudPrintQueue();
      await loadCloudStats();
      msg("ล้างคิวพิมพ์ในเครื่องและส่วนกลางแล้ว", "success");
    } catch (error) {
      console.error("Clear print queue cloud error:", error);
      msg("ล้างคิวในเครื่องแล้ว แต่ล้างคิวส่วนกลางไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตหรือสิทธิ์ฐานข้อมูล", "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "ล้างคิวทั้งหมด";
      }
    }
  }

  async function markPrintQueueCompleted() {
    const copies = S.queue.reduce((sum, row) => sum + Math.max(1, Number(row.qty) || 1), 0);
    if (!copies) return;
    S.queue = [];
    if (S.cloudStats) S.cloudStats.print = 0;
    audit("PRINT_COMPLETED", S.userId || S.user, `ยืนยันพิมพ์สำเร็จ ${copies} ฉลาก`);
    save();
    try {
      if (S.userId) {
        const { error } = await supabaseClient.from("label_print_queue")
          .update({ status: "PRINTED" })
          .eq("status", "PENDING")
          .eq("requested_by", S.userId);
        if (error) throw error;
      }
      await loadCloudStats();
      msg(`ตัดคิวที่พิมพ์สำเร็จแล้ว ${copies} ฉลาก`, "success");
    } catch (error) {
      console.warn("Print completion sync failed:", error);
      msg("ตัดคิวในเครื่องแล้ว แต่ปรับสถานะคิวส่วนกลางไม่สำเร็จ", "error");
    }
  }

  function renderStats() {
    $("sessionCount").textContent = new Set(S.receipts.map((row) => row.sku).filter(Boolean)).size;
    $("draftBoxCount").textContent = S.boxItems.length;
    $("closedBoxCount").textContent = S.boxItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const pendingLocalCopies = (Array.isArray(S.queue) ? S.queue : [])
      .filter((row) => row?.pendingSync === true)
      .reduce((sum, row) => sum + Math.max(1, Number(row.qty) || 1), 0);
    const cloudCopies = Number(S.cloudStats?.print || 0);
    $("printCount").textContent = cloudCopies + pendingLocalCopies;
  }

  function render() {
    if (!$("receiveCode")) return;
    $("receiveCode").value = S.session?.id || "";
    $("boxCode").value = S.box?.id || "";
    $("location").value = S.box?.location || $("location").value;
    renderStats();
    $("receiveRows").innerHTML = S.receipts.map((row) => {
      const boxes = Number(row.boxes ?? 0);
      const piecesPerBox = Number(row.piecesPerBox ?? row.actual ?? 1);
      const loosePieces = Number(row.loosePieces ?? 0);
      return `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.sku)}</td><td>${esc(row.name)}</td><td>${boxes}</td><td>${piecesPerBox}</td><td>${loosePieces}</td><td><b>${row.actual}</b></td><td>${esc(row.condition)}</td><td><button type="button" class="row-delete" data-delete-receipt="${esc(row.id)}">ลบ</button></td></tr>`;
    }).join("") || '<tr><td colspan="9">ยังไม่มีรายการ</td></tr>';
    $("boxRows").innerHTML = S.boxItems.map((item, index) => `<tr><td>${esc(item.sku)}</td><td>${esc(item.name)}</td>
      <td><input class="box-qty-input" data-box-qty="${esc(item.sku)}" type="number" min="1" value="${item.qty}" ${S.box.status !== "DRAFT" ? "disabled" : ""}></td>
      <td><span class="count-status ${Number(S.counts[item.sku]) === Number(item.qty) ? "ok" : "bad"}">${Number(S.counts[item.sku]) === Number(item.qty) ? "นับตรง" : "รอตรวจนับ"}</span></td>
      <td><button data-remove="${index}">นำออก</button></td></tr>`).join("") || '<tr><td colspan="5">ยังไม่มีสินค้าในกล่อง</td></tr>';
    $("boxTotal").textContent = S.boxItems.reduce((sum, item) => sum + item.qty, 0);
    $("auditRows").innerHTML = S.audit.map((row) => `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.user)}</td><td>${esc(row.action)}</td><td>${esc(row.ref)}</td><td>${esc(row.detail)}</td></tr>`).join("") || '<tr><td colspan="5">ยังไม่มีประวัติ</td></tr>';
    renderCountRows();
    renderFinalSummary();
    applyLabelSettings(false);
    renderQueue();
  }

  function updateReceiveTotal() {
    const boxes = Math.max(0, Math.floor(Number($("receiveBoxQty")?.value) || 0));
    const piecesPerBox = Math.max(1, Math.floor(Number($("piecesPerBox")?.value) || 1));
    const loosePieces = Math.max(0, Math.floor(Number($("loosePieces")?.value) || 0));
    if ($("receiveTotalPieces")) $("receiveTotalPieces").value = String((boxes * piecesPerBox) + loosePieces);
  }

  function readLabelSettings() {
    return {
      printerMode: $("labelPrinterMode")?.value || S.labelSettings.printerMode || "AUTO",
      dpi: [203, 300, 600].includes(Number($("labelPrinterDpi")?.value)) ? Number($("labelPrinterDpi").value) : 300,
      preset: $("labelSizePreset")?.value || S.labelSettings.preset || "50x40",
      columns: Math.max(1, Math.min(5, Math.floor(Number($("labelColumns")?.value) || 1))),
    };
  }

  function applyLabelSettings(saveAfter = true) {
    if ($("labelSizePreset")) S.labelSettings = readLabelSettings();
    const settings = S.labelSettings;
    const profile = LABEL_PROFILES[settings.preset] || LABEL_PROFILES["50x40"];
    const mode = settings.printerMode === "AUTO" ? (settings.columns === 1 ? "ROLL" : "SHEET") : settings.printerMode;
    const maxColumns = Math.max(1, Math.floor(200 / profile.width));
    const columns = mode === "ROLL" ? 1 : Math.min(settings.columns, maxColumns);
    settings.columns = columns;
    if ($("labelColumns")) $("labelColumns").value = columns;
    const host = $("printQueue");
    if (host) {
      host.style.setProperty("--label-w", `${profile.width}mm`);
      host.style.setProperty("--label-h", `${profile.height}mm`);
      host.style.setProperty("--label-cols", columns);
      host.style.setProperty("--qr-mm", `${profile.qr}mm`);
      host.style.setProperty("--barcode-mm", `${profile.barcode}mm`);
      host.style.setProperty("--label-font", `${profile.font}px`);
      host.style.setProperty("--name-lines", profile.lines);
    }
    document.body.dataset.labelPrintMode = mode;
    let style = $("boxQrDynamicPrintStyle");
    if (!style) { style = document.createElement("style"); style.id = "boxQrDynamicPrintStyle"; document.head.appendChild(style); }
    style.textContent = mode === "ROLL" ? `@page{size:${profile.width}mm ${profile.height}mm;margin:0}` : "@page{size:A4 portrait;margin:5mm}";
    if ($("labelSettingSummary")) $("labelSettingSummary").textContent = `${mode === "ROLL" ? "DT ม้วน" : "A4"} · ${profile.width} × ${profile.height} มม. · ${columns} ดวง/แถว · ${settings.dpi} DPI`;
    if (saveAfter) save(false);
  }

  function fillLabelSettings() {
    if (!$("labelSizePreset")) return;
    $("labelPrinterMode").value = S.labelSettings.printerMode || "AUTO";
    $("labelPrinterDpi").value = String(S.labelSettings.dpi || 300);
    $("labelSizePreset").value = S.labelSettings.preset || "50x40";
    $("labelColumns").value = S.labelSettings.columns || 2;
    applyLabelSettings(false);
  }

  function currentLabelMode() {
    return "BOTH";
  }

  function syncPrintModeUi() {
    const mode = currentLabelMode();
    const labels = {
      QR: "พิมพ์ QR ทั้งหมด",
      BOTH: "พิมพ์ QR + Barcode",
      BARCODE: "พิมพ์ Barcode ทั้งหมด",
    };
    if ($("printAllBtn")) $("printAllBtn").textContent = labels[mode] || labels.QR;
  }

  function updateQrEngineStatus() {
    const status = $("qrEngineStatus");
    if (!status) return;
    const ready = Boolean(window.TKNQRHealth?.isReady?.() || (window.QRCode && typeof window.QRCode.toCanvas === "function"));
    status.textContent = ready ? "QR พร้อมใช้งาน (Local)" : "QR ยังไม่พร้อม";
    status.classList.toggle("ok", ready);
    status.classList.toggle("error", !ready);
  }

  function renderQueue() {
    const host = $("printQueue");
    if (!host) return;
    host.innerHTML = "";
    const mode = currentLabelMode();
    const showQr = mode === "QR" || mode === "BOTH";
    const showBarcode = mode === "BARCODE" || mode === "BOTH";
    syncPrintModeUi();
    updateQrEngineStatus();

    const queue = Array.isArray(S.queue) ? S.queue.filter((item) => item?.code) : [];
    if (!queue.length) {
      host.innerHTML = `
        <div class="print-queue-empty">
          <strong>ยังไม่มีฉลากให้แสดงตัวอย่าง</strong>
          <span>เพิ่ม QR สินค้า ปิดกล่องเพื่อสร้าง QR กล่อง หรือกด “โหลดคิวใหม่”</span>
        </div>`;
      return;
    }

    const requestedCopies = queue.reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);
    const copiesToRender = Math.min(requestedCopies, MAX_LABEL_PREVIEWS);
    let previewIndex = 0;

    queue.forEach((item) => {
      const copies = Math.max(1, Number(item.qty) || 1);
      for (let copyNo = 1; copyNo <= copies && previewIndex < copiesToRender; copyNo += 1) {
        const currentIndex = previewIndex;
        previewIndex += 1;
        const article = document.createElement("article");
        article.className = `label label-mode-${mode.toLowerCase()}`;
        article.innerHTML = `
          ${showQr ? `<div class="label-qr" id="qrPreview${currentIndex}"><span class="qr-loading">กำลังสร้าง QR...</span></div>` : ""}
          ${showBarcode ? `<svg class="label-barcode" id="barPreview${currentIndex}"></svg>` : ""}
          <small>${esc(item.type === "PRODUCT" ? hiddenCostSku({ ...item, sku: item.sku || productCodeFromReference(item.code) }) : item.code)}${copies > 1 ? ` · ${copyNo}/${copies}` : ""}</small>
          <b>${esc(item.name)}</b>`;
        host.appendChild(article);

        requestAnimationFrame(() => {
          if (showQr) {
            const qrHost = article.querySelector('.label-qr');
            const canvas = document.createElement("canvas");
            const profile = LABEL_PROFILES[S.labelSettings.preset] || LABEL_PROFILES["50x40"];
            const size = Math.max(96, Math.round((profile.qr / 25.4) * Number(S.labelSettings.dpi || 300)));
            const renderQr = async () => {
              const ready = await (window.TKNQRHealth?.wait?.(2500) ?? Promise.resolve(Boolean(window.QRCode?.toCanvas || window.TKNQR?.toCanvas)));
              const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
              if (!ready || typeof toCanvas !== "function") {
                throw new Error(window.TKNQRHealth?.errorText?.() || "QR engine unavailable");
              }
              await toCanvas(canvas, item.code, {
                width: size,
                margin: 2,
                errorCorrectionLevel: "M",
              });
              qrHost?.replaceChildren(canvas);
            };
            renderQr().catch((error) => {
              console.error("QR render failed:", error);
              if (qrHost) {
                qrHost.classList.add("qr-error");
                qrHost.innerHTML = `<strong>สร้าง QR ไม่สำเร็จ</strong><small>${esc(error.message || "กรุณารีเฟรช")}</small>`;
              }
              updateQrEngineStatus();
            });
          }
          if (showBarcode && window.JsBarcode) {
            try {
              const barcodeValue = String(item.barcode || item.sku || productCodeFromReference(item.code) || item.code).trim();
              const barWidth = barcodeValue.length > 24 ? 0.65 : barcodeValue.length > 16 ? 0.85 : 1.15;
              window.JsBarcode("#barPreview" + currentIndex, barcodeValue, {
                format: "CODE128", height: 34, width: barWidth,
                displayValue: false, margin: 0,
              });
            } catch (error) {
              console.error("Barcode render failed:", error);
            }
          }
        }, 0);
      }
    });

    if (requestedCopies > MAX_LABEL_PREVIEWS) {
      const warning = document.createElement("div");
      warning.className = "print-queue-limit";
      warning.textContent = `คิวมี ${integer(requestedCopies)} ฉลาก ระบบแสดงตัวอย่างครั้งละ ${integer(MAX_LABEL_PREVIEWS)} ฉลากเพื่อป้องกันหน้าเว็บค้าง`;
      host.appendChild(warning);
    }
  }

  function activateTab(tab) {
    const button = document.querySelector(`.tabs button[data-tab="${tab}"]`);
    if (!button) return;
    document.querySelectorAll(".tabs button,.panel").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    $(tab)?.classList.add("active");
    if (tab === "print") void loadCloudPrintQueue();
    if (tab === "finalize" && S.box?.status === "CLOSED") void drawFinalBoxQr();
  }

  function applyUrlIntent() {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    const scanValue = params.get("scan");
    if (tab) activateTab(tab);
    if (!scanValue) return;
    if (tab === "receive") {
      $("receiveSku").value = scanValue.replace(/^TKN-P-/i, "");
      $("receiveSku").focus();
      msg("รับรหัสจากโหมดมือถือแล้ว ตรวจจำนวนและกดยืนยัน", "success");
    } else if (tab === "box") {
      $("boxSku").value = scanValue.replace(/^TKN-P-/i, "");
      $("boxSku").focus();
      msg("รับรหัสจากโหมดมือถือแล้ว ใส่จำนวนและกดเพิ่มเข้ากล่อง", "success");
    } else {
      activateTab("check");
      $("scanCode").value = scanValue;
      void scan();
    }
  }

  function bindEvents() {
    document.querySelectorAll(".tabs button").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });

    bind("receiveBtn", "click", receive);
    bind("newSessionBtn", "click", () => {
      newSession();
      S.receipts = [];
      audit("SESSION_NEW", S.session.id, S.session.source);
      save();
    });
    bind("clearReceiptsBtn", "click", () => { void clearReceipts(); });
    bind("clearAuditBtn", "click", clearAuditHistory);
    bind("receiveRows", "click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-delete-receipt]") : null;
      if (button) void deleteReceiptById(button.dataset.deleteReceipt);
    });
    bind("newBoxBtn", "click", () => {
      newBox();
      S.counts = {};
      S.countConfirmed = false;
      audit("BOX_NEW", S.box.id, "");
      save();
    });
    bind("addReceivedToBoxBtn", "click", () => { void addReceivedToBox(); });
    bind("addBoxItemBtn", "click", addBox);
    bind("closeBoxBtn", "click", closeBox);
    bind("printBoxLabelBtn", "click", () => { void queueAndShowBoxLabel(); });
    bind("openBoxBtn", "click", openBox);
    bind("scanBtn", "click", scan);
    bind("receiveProductCameraBtn", "click", () => { void openCamera("receive-product"); });
    bind("boxProductCameraBtn", "click", () => { void openCamera("box-product"); });
    bind("checkCameraBtn", "click", () => { void openCamera("check"); });
    bind("scanCode", "keydown", (event) => { if (event.key === "Enter") void scan(); });
    bind("receiveSku", "keydown", (event) => { if (event.key === "Enter") void receive(); });
    ["receiveBoxQty", "piecesPerBox", "loosePieces"].forEach((id) => bind(id, "input", updateReceiveTotal));
    bind("boxSku", "keydown", (event) => { if (event.key === "Enter") void addBox(); });
    installUsbScanner();
    bind("boxRows", "click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-remove]") : null;
      const index = target?.dataset?.remove;
      if (index !== undefined) void removeItem(Number(index));
    });
    bind("boxRows", "change", (event) => {
      const input = event.target instanceof Element ? event.target.closest("[data-box-qty]") : null;
      if (input) updateBoxQuantity(input.dataset.boxQty, input.value);
    });
    bind("countRows", "change", (event) => {
      const input = event.target instanceof Element ? event.target.closest("[data-count-sku]") : null;
      if (!input) return;
      S.counts[input.dataset.countSku] = Math.max(0, Math.floor(Number(input.value) || 0));
      S.countConfirmed = false;
      save();
    });

    // Print controls are optional in compact/mobile deployments. Missing controls must not abort the whole page.
    bind("labelMode", "change", renderQueue);
    bind("refreshPrintBtn", "click", () => { void loadCloudPrintQueue({ announce: true }); });
    bind("printAllBtn", "click", () => {
      if (!Array.isArray(S.queue) || !S.queue.length) return msg("ยังไม่มี QR ในคิวพิมพ์", "error");
      window.print();
      window.setTimeout(() => {
        if (confirm("พิมพ์ฉลากสำเร็จแล้วหรือไม่? กดตกลงเพื่อตัดรายการออกจากคิวพิมพ์")) void markPrintQueueCompleted();
      }, 300);
    });
    bind("retryQrBtn", "click", async () => {
      msg("กำลังตรวจและสร้าง QR ใหม่...");
      const ready = await (window.TKNQRHealth?.wait?.(1500) ?? Promise.resolve(Boolean(window.QRCode?.toCanvas)));
      updateQrEngineStatus();
      if (!ready) return msg(window.TKNQRHealth?.errorText?.() || "ระบบ QR ยังไม่พร้อม", "error");
      renderQueue();
      msg("สร้าง QR ในคิวใหม่เรียบร้อย", "success");
    });
    bind("clearPrintBtn", "click", () => { void clearPrintQueue(); });
    bind("queueBoxProductsBtn", "click", () => { void queueBoxProducts(); });
    bind("recountBtn", "click", startRecount);
    bind("confirmCountBtn", "click", confirmCount);
    bind("moveOutBtn", "click", () => activateTab("box"));
    bind("finalOpenBoxBtn", "click", () => { void openBox(); });
    ["labelPrinterMode", "labelPrinterDpi", "labelSizePreset", "labelColumns"].forEach((id) => bind(id, "change", () => { applyLabelSettings(); renderQueue(); }));
  }

  async function initializePage() {
    try {
      if (!window.TKNAuthGuard) throw new Error("ไม่พบระบบตรวจสอบสิทธิ์ กรุณาตรวจว่า js/auth-guard.js ถูกอัปโหลดครบ");
      if (!window.supabaseClient) throw new Error("ไม่พบการเชื่อมต่อ Supabase กรุณาตรวจว่า js/supabase-config.js ถูกอัปโหลดครบ");
      const access = await window.TKNAuthGuard.requireAccess("product.manage", { loadingText: "กำลังตรวจสอบสิทธิ์ระบบ Box QR..." });
      if (!access) return;
      await loadReceiveBranches(access);
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      S.user = session?.user?.email || access?.email || "-";
      S.userId = session?.user?.id || null;
      if ($("labelMode")) $("labelMode").value = "BOTH";
      load();
      fillLabelSettings();
      bindEvents();
      await syncCurrentBoxSnapshot();
      await loadCloudPrintQueue();
      await loadCloudStats();
      applyUrlIntent();
      window.supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
        if (nextSession) return;
        window.TKNAuthGuard.clearAccessCache();
        location.replace("./dashboard.html");
      });
      window.TKNAuthGuard.ready();
      if (!new URLSearchParams(location.search).get("scan")) msg("ระบบ QR พร้อมใช้งาน · QR สินค้าใช้ตรวจสต็อกและสแกนขายที่ POS ได้", "success");
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
