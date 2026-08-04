(() => {
  "use strict";

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
    const value = cleanScan(raw).replace(/^TKN-P-/i, "").replace(/[%_,()]/g, "");
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
      const { error } = await supabaseClient.from("marketplace_receiving_items").insert({
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
      });
      if (error) throw error;
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
    const branchId = $("receiveBranch")?.value;
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
    const actual = (boxes * piecesPerBox) + loosePieces;
    if (actual <= 0) return msg("กรุณาระบุจำนวนกล่องหรือเศษสินค้าอย่างน้อย 1 ชิ้น", "error");
    const expected = boxes * piecesPerBox;
    const condition = $("condition").value;
    const good = condition === "GOOD" ? actual : 0;
    S.session.source = $("source").value;
    const receipt = {
      id: code("REC"), session_id: S.session.id, tracking: "",
      sku: product.product_code, name: product.name, boxes, piecesPerBox, loosePieces,
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
    if (synced && stockResult.ok) {
      msg(condition === "GOOD" ? `รับเข้า ${actual} ชิ้นและอัปเดตสต็อกสาขาแล้ว` : `บันทึกสินค้า ${actual} ชิ้นไว้ตรวจสอบ โดยยังไม่เพิ่มสต็อกพร้อมขาย`, "success");
    } else {
      msg(`บันทึกในเครื่องแล้ว แต่ซิงก์ไม่ครบ${stockResult.error ? `: ${stockResult.error}` : ""}`, "error");
    }
    await loadCloudStats();
    $("receiveSku").focus();
  }

  async function addBox() {
    if (S.box.status !== "DRAFT") return msg("กล่องปิดแล้ว ต้องเปิดกล่องก่อนแก้ไข", "error");
    const product = await productByScan($("boxSku").value);
    if (!product) return msg("กรุณายิงสินค้า", "error");
    const qty = Math.max(1, Number($("boxQty").value) || 1);
    let item = S.boxItems.find((row) => row.sku === product.product_code);
    if (item) item.qty += qty;
    else {
      item = { sku: product.product_code, name: product.name, qty, product_id: product.id || null };
      S.boxItems.push(item);
    }
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
    S.box.status = "CLOSED";
    S.box.location = $("location").value.trim();
    S.queue.push({ type: "BOX", code: S.box.id, name: `กล่อง ${S.box.id}`, qty: 1, pendingSync: true });
    audit("BOX_CLOSE", S.box.id, `รวม ${S.boxItems.reduce((sum, item) => sum + item.qty, 0)} ชิ้น`);
    save();
    let queueSynced = false;
    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_boxes").update({
        status: "CLOSED", location_text: S.box.location || null, closed_at: now(),
      }).eq("id", boxId);
      if (error) throw error;
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
    await loadCloudStats();
  }

  async function openBox() {
    if (!confirm("เปิดกล่องเพื่อแก้ไข? ระบบจะบันทึกประวัติ")) return;
    S.box.status = "DRAFT";
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
    for (const row of receipts) S.queue.push({ type: "PRODUCT", code: `TKN-P-${row.sku}`, name: row.name, qty: row.good, price: "", pendingSync: true });
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
        .select("id,product_code,name,barcode")
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
          name: type === "BOX" ? `กล่อง ${codeValue}` : (product?.name || sku || codeValue),
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

      const [sessions, drafts, closed, queue] = await Promise.all([
        supabaseClient.from("marketplace_receiving_sessions").select("id", { count: "exact", head: true }),
        supabaseClient.from("stock_boxes").select("id", { count: "exact", head: true }).eq("status", "DRAFT"),
        supabaseClient.from("stock_boxes").select("id", { count: "exact", head: true }).eq("status", "CLOSED"),
        printQueueQuery,
      ]);
      S.cloudStats = {
        sessions: sessions.count || 0,
        drafts: drafts.count || 0,
        closed: closed.count || 0,
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

  function renderStats() {
    $("sessionCount").textContent = S.cloudStats?.sessions ?? (S.session ? 1 : 0);
    $("draftBoxCount").textContent = S.cloudStats?.drafts ?? (S.box?.status === "DRAFT" ? 1 : 0);
    $("closedBoxCount").textContent = S.cloudStats?.closed ?? (S.box?.status === "CLOSED" ? 1 : 0);
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
      return `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.sku)}</td><td>${esc(row.name)}</td><td>${boxes}</td><td>${piecesPerBox}</td><td>${loosePieces}</td><td><b>${row.actual}</b></td><td>${esc(row.condition)}</td></tr>`;
    }).join("") || '<tr><td colspan="8">ยังไม่มีรายการ</td></tr>';
    $("boxRows").innerHTML = S.boxItems.map((item, index) => `<tr><td>${esc(item.sku)}</td><td>${esc(item.name)}</td><td>${item.qty}</td><td><button data-remove="${index}">ลบ</button></td></tr>`).join("") || '<tr><td colspan="4">ยังไม่มีสินค้าในกล่อง</td></tr>';
    $("boxTotal").textContent = S.boxItems.reduce((sum, item) => sum + item.qty, 0);
    $("auditRows").innerHTML = S.audit.map((row) => `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.user)}</td><td>${esc(row.action)}</td><td>${esc(row.ref)}</td><td>${esc(row.detail)}</td></tr>`).join("") || '<tr><td colspan="5">ยังไม่มีประวัติ</td></tr>';
    renderQueue();
  }

  function updateReceiveTotal() {
    const boxes = Math.max(0, Math.floor(Number($("receiveBoxQty")?.value) || 0));
    const piecesPerBox = Math.max(1, Math.floor(Number($("piecesPerBox")?.value) || 1));
    const loosePieces = Math.max(0, Math.floor(Number($("loosePieces")?.value) || 0));
    if ($("receiveTotalPieces")) $("receiveTotalPieces").textContent = `${(boxes * piecesPerBox) + loosePieces} ชิ้น`;
  }

  function currentLabelMode() {
    return $("labelMode")?.value || "QR";
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
        const kind = item.type === "BOX" ? "QR กล่อง" : "QR สินค้า";
        article.innerHTML = `
          <span class="label-kind">${kind}</span>
          <b>${esc(item.name)}</b>
          ${showQr ? `<div class="label-qr" id="qrPreview${currentIndex}"><span class="qr-loading">กำลังสร้าง QR...</span></div>` : ""}
          ${showBarcode ? `<svg class="label-barcode" id="barPreview${currentIndex}"></svg>` : ""}
          <small>${esc(item.code)} · ฉลาก ${copyNo}/${copies}</small>`;
        host.appendChild(article);

        requestAnimationFrame(() => {
          if (showQr) {
            const qrHost = article.querySelector('.label-qr');
            const canvas = document.createElement("canvas");
            const size = mode === "QR" ? 170 : 112;
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
              window.JsBarcode("#barPreview" + currentIndex, item.code, {
                format: "CODE128", height: mode === "BOTH" ? 28 : 42,
                displayValue: false, margin: 2,
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
    bind("queueProductQrBtn", "click", queueProducts);
    bind("newBoxBtn", "click", () => {
      newBox();
      audit("BOX_NEW", S.box.id, "");
      save();
    });
    bind("addBoxItemBtn", "click", addBox);
    bind("closeBoxBtn", "click", closeBox);
    bind("openBoxBtn", "click", openBox);
    bind("scanBtn", "click", scan);
    bind("receiveProductCameraBtn", "click", () => { void openCamera("receive-product"); });
    bind("boxProductCameraBtn", "click", () => { void openCamera("box-product"); });
    bind("checkCameraBtn", "click", () => { void openCamera("check"); });
    bind("scanCode", "keydown", (event) => { if (event.key === "Enter") void scan(); });
    bind("receiveSku", "keydown", (event) => { if (event.key === "Enter") void receive(); });
    ["receiveBoxQty", "piecesPerBox", "loosePieces"].forEach((id) => bind(id, "input", updateReceiveTotal));
    bind("boxSku", "keydown", (event) => { if (event.key === "Enter") void addBox(); });
    bind("boxRows", "click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-remove]") : null;
      const index = target?.dataset?.remove;
      if (index !== undefined) void removeItem(Number(index));
    });

    // Print controls are optional in compact/mobile deployments. Missing controls must not abort the whole page.
    bind("labelMode", "change", renderQueue);
    bind("refreshPrintBtn", "click", () => { void loadCloudPrintQueue({ announce: true }); });
    bind("printAllBtn", "click", () => {
      if (!Array.isArray(S.queue) || !S.queue.length) return msg("ยังไม่มี QR ในคิวพิมพ์", "error");
      window.print();
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
    bind("recountBtn", "click", () => msg("แนะนำเปิดโหมดมือถือเพื่อสแกนและบันทึกร่างการตรวจนับ", "success"));
    bind("moveOutBtn", "click", () => msg("เปิดกล่องก่อน แล้วลด/ลบรายการ พร้อมระบุเหตุผลใน Audit Log", "success"));
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
      if ($("labelMode")) $("labelMode").value = "QR";
      load();
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
