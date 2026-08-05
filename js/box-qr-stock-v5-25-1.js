(() => {
  "use strict";

  const VERSION = "5.25.1";
  const PATTERN = window.TKNProductPattern;
  const WORKFLOW_TABS = ["receive", "box", "check", "finalize", "audit"];
  const WORKFLOW_NEXT_LABELS = ["ถัดไป: จัดลงกล่อง", "ถัดไป: ตรวจนับ", "ถัดไป: ปิดกล่อง", "ถัดไป: ประวัติ", "จบงาน"];

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
    audit: [],
    lastScan: null,
    user: "-",
    userId: null,
    cloudStats: null,
    counts: {},
    countConfirmed: false,
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
    S.counts ||= {};
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
        detail: { message: detail || "", source: "box-qr-v5.24.1" },
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


  async function productByScan(raw) {
    const candidates = (PATTERN?.scanCandidates?.(raw) || [cleanScan(raw).replace(/^TKN-P-/i, "")])
      .map((value) => String(value || "").replace(/[%(),]/g, "").trim()).filter(Boolean);
    const value = candidates[0] || "";
    if (!value) return null;
    const filter = [...new Set(candidates.flatMap((codeValue) => [`product_code.eq.${codeValue}`, `barcode.eq.${codeValue}`, `base_sku.eq.${codeValue}`, `source_barcode.eq.${codeValue}`]))].join(",");
    try {
      let result = await supabaseClient.from("products")
        .select("id,product_code,name,barcode,base_sku,source_barcode,cost_price,selling_price,quantity,minimum_stock")
        .or(filter).limit(1).maybeSingle();
      if (result.error && /base_sku|source_barcode/i.test(result.error.message || "")) {
        const legacyFilter = [...new Set(candidates.flatMap((codeValue) => [`product_code.eq.${codeValue}`, `barcode.eq.${codeValue}`]))].join(",");
        result = await supabaseClient.from("products")
          .select("id,product_code,name,barcode,cost_price,selling_price,quantity,minimum_stock")
          .or(legacyFilter).limit(1).maybeSingle();
      }
      const { data, error } = result;
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
      sku: product.product_code, name: product.name, barcode: product.barcode || product.product_code,
      product_id: product.id || null, cost_price: Number(product.cost_price || 0), selling_price: Number(product.selling_price || 0),
      boxes, piecesPerBox, loosePieces,
      expected, actual, condition, good, at: now(),
    };
    S.receipts.unshift(receipt);
    audit("RECEIVE", product.product_code, `${boxes} กล่อง × ${piecesPerBox} ชิ้น + เศษ ${loosePieces} = ${actual} ชิ้น, สภาพ ${condition}`);
    $("receiveSku").value = "";
    $("receiveBoxQty").value = "1";
    $("loosePieces").value = "0";
    updateReceiveTotal();
    save();
    msg("เพิ่มรายการที่จะเก็บแล้ว กำลังซิงก์รอบจัดเก็บ...", "success");
    const synced = await syncReceiptToCloud(receipt, product);
    msg(synced
      ? `เพิ่ม ${product.name} จำนวน ${actual} ชิ้นแล้ว · ยิงรายการต่อได้ หรือกดถัดไปเมื่อครบ`
      : "บันทึกรายการในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ",
      synced ? "success" : "error");
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
      item = { sku: product.product_code, name: product.name, qty, product_id: product.id || null,
        barcode: product.barcode || product.product_code, cost_price: Number(product.cost_price || 0),
        selling_price: Number(product.selling_price || 0) };
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
    S.box.closed_at = now();
    audit("BOX_CLOSE", S.box.id, `รวม ${S.boxItems.reduce((sum, item) => sum + item.qty, 0)} ชิ้น`);
    save();
    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_boxes").update({
        status: "CLOSED", location_text: S.box.location || null, closed_at: S.box.closed_at,
      }).eq("id", boxId);
      if (error) throw error;
      msg("ปิดกล่อง สร้าง QR กล่อง และซิงก์ส่วนกลางแล้ว", "success");
    } catch (error) {
      console.warn(error);
      msg("ปิดกล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", "error");
    }
    await drawFinalBoxQr();
    await loadCloudStats();
  }

  async function openBox() {
    if (!confirm("เปิดกล่องเพื่อแก้ไข? ระบบจะบันทึกประวัติ")) return;
    S.box.status = "DRAFT";
    delete S.box.closed_at;
    S.countConfirmed = false;
    audit("BOX_OPEN", S.box.id, "เปิดกล่องเพื่อแก้ไข");
    save();
    if ($("finalBoxQr")) $("finalBoxQr").innerHTML = "";
    try {
      const boxId = await ensureCloudBox();
      await supabaseClient.from("stock_boxes").update({ status: "DRAFT", closed_at: null }).eq("id", boxId);
      msg("เปิดกล่องและซิงก์ส่วนกลางแล้ว", "success");
    } catch (error) {
      msg("เปิดกล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", "error");
    }
  }



  async function addReceivedToBox() {
    if (S.box.status !== "DRAFT") return msg("กล่องปิดแล้ว ต้องเปิดกล่องก่อนแก้ไข", "error");
    const rows = S.receipts.filter((row) => Number(row.good) > 0);
    if (!rows.length) return msg("ยังไม่มีสินค้าจากหน้าร้านในรอบจัดเก็บ", "error");
    for (const row of rows) {
      let item = S.boxItems.find((entry) => entry.sku === row.sku);
      if (item) item.qty += Number(row.good);
      else {
        item = { sku: row.sku, name: row.name, qty: Number(row.good), product_id: row.product_id || null,
          barcode: row.barcode || row.sku, cost_price: Number(row.cost_price || 0), selling_price: Number(row.selling_price || 0),
        };
        S.boxItems.push(item);
      }
      await syncBoxItemToCloud({ id: item.product_id }, item);
    }
    S.countConfirmed = false;
    S.box.location = $("location").value.trim();
    audit("BOX_BATCH_IN", S.box.id, `เก็บจากหน้าร้าน ${rows.length} SKU`);
    save();
    msg(`เพิ่มสินค้าจากหน้าร้าน ${rows.length} SKU ลงกล่องแล้ว · POS จะไม่นับจำนวนนี้เป็นพร้อมขาย`, "success");
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
    activateTab("finalize");
    msg("ยืนยันผลตรวจนับแล้ว พร้อมปิดกล่องและสร้าง QR กล่อง", "success");
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
    if ($("printBoxQrBtn")) $("printBoxQrBtn").disabled = S.box?.status !== "CLOSED";
  }

  async function drawFinalBoxQr() {
    const host = $("finalBoxQr");
    if (!host || !S.box) return;
    host.innerHTML = `<canvas aria-label="QR กล่อง ${esc(S.box.id)}"></canvas><strong>${esc(S.box.id)}</strong><small>${S.boxItems.length} SKU · ${S.boxItems.reduce((s, i) => s + Number(i.qty || 0), 0)} ชิ้น</small>`;
    try {
      const canvas = host.querySelector("canvas");
      const toCanvas = window.QRCode?.toCanvas || window.TKNQR?.toCanvas;
      if (typeof toCanvas !== "function") throw new Error("QR engine unavailable");
      await toCanvas(canvas, S.box.id, { width: 320, margin: 2, errorCorrectionLevel: "M" });
    } catch (error) {
      host.insertAdjacentHTML("beforeend", `<em>สร้าง QR ไม่สำเร็จ: ${esc(error.message)}</em>`);
    }
  }

  async function printBoxQr() {
    if (S.box?.status !== "CLOSED") return msg("กรุณาปิดกล่องก่อนพิมพ์ QR กล่อง", "error");
    await drawFinalBoxQr();
    document.body.dataset.printTarget = "box-qr";
    const cleanup = () => { delete document.body.dataset.printTarget; };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 10000);
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


  async function loadCloudStats() {
    try {
      const [sessions, drafts, closed] = await Promise.all([
        supabaseClient.from("marketplace_receiving_sessions").select("id", { count: "exact", head: true }),
        supabaseClient.from("stock_boxes").select("id", { count: "exact", head: true }).eq("status", "DRAFT"),
        supabaseClient.from("stock_boxes").select("id", { count: "exact", head: true }).eq("status", "CLOSED"),
      ]);
      S.cloudStats = {
        sessions: sessions.count || 0,
        drafts: drafts.count || 0,
        closed: closed.count || 0,
      };
      renderStats();
    } catch (error) {
      console.warn("Cloud stats fallback:", error);
    }
  }


  function renderStats() {
    $("sessionCount").textContent = S.cloudStats?.sessions ?? (S.session ? 1 : 0);
    $("draftBoxCount").textContent = S.cloudStats?.drafts ?? (S.box?.status === "DRAFT" ? 1 : 0);
    $("closedBoxCount").textContent = S.cloudStats?.closed ?? (S.box?.status === "CLOSED" ? 1 : 0);
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
      return `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.sku)}</td><td>${esc(row.name)}</td><td><b>${row.actual}</b> ชิ้น</td><td>${esc(row.condition)}</td></tr>`;
    }).join("") || '<tr><td colspan="5">ยังไม่มีรายการสินค้าที่จะเก็บ</td></tr>';
    $("boxRows").innerHTML = S.boxItems.map((item, index) => `<tr><td>${esc(item.sku)}</td><td>${esc(item.name)}</td>
      <td><input class="box-qty-input" data-box-qty="${esc(item.sku)}" type="number" min="1" value="${item.qty}" ${S.box.status !== "DRAFT" ? "disabled" : ""}></td>
      <td><span class="count-status ${Number(S.counts[item.sku]) === Number(item.qty) ? "ok" : "bad"}">${Number(S.counts[item.sku]) === Number(item.qty) ? "นับตรง" : "รอตรวจนับ"}</span></td>
      <td><button data-remove="${index}">นำออก</button></td></tr>`).join("") || '<tr><td colspan="5">ยังไม่มีสินค้าในกล่อง</td></tr>';
    $("boxTotal").textContent = S.boxItems.reduce((sum, item) => sum + item.qty, 0);
    $("auditRows").innerHTML = S.audit.map((row) => `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.user)}</td><td>${esc(row.action)}</td><td>${esc(row.ref)}</td><td>${esc(row.detail)}</td></tr>`).join("") || '<tr><td colspan="5">ยังไม่มีประวัติ</td></tr>';
    renderCountRows();
    renderFinalSummary();
    updateWorkflowNav();
  }

  function updateReceiveTotal() {
    const boxes = Math.max(0, Math.floor(Number($("receiveBoxQty")?.value) || 0));
    const piecesPerBox = Math.max(1, Math.floor(Number($("piecesPerBox")?.value) || 1));
    const loosePieces = Math.max(0, Math.floor(Number($("loosePieces")?.value) || 0));
    if ($("receiveTotalPieces")) $("receiveTotalPieces").textContent = `${(boxes * piecesPerBox) + loosePieces} ชิ้น`;
  }


  function activateTab(tab) {
    const button = document.querySelector(`.tabs button[data-tab="${tab}"]`);
    if (!button) return;
    document.querySelectorAll(".tabs button,.panel").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    $(tab)?.classList.add("active");
    updateWorkflowNav();
    if (tab === "finalize" && S.box?.status === "CLOSED") void drawFinalBoxQr();
  }

  function activeWorkflowIndex() {
    const active = document.querySelector(".tabs button.active")?.dataset?.tab;
    return Math.max(0, WORKFLOW_TABS.indexOf(active));
  }

  function updateWorkflowNav() {
    const index = activeWorkflowIndex();
    if ($("workflowStatus")) $("workflowStatus").textContent = `ขั้นตอน ${index + 1} จาก ${WORKFLOW_TABS.length}`;
    if ($("workflowPrevBtn")) $("workflowPrevBtn").disabled = index === 0;
    if ($("workflowNextBtn")) {
      $("workflowNextBtn").disabled = index === WORKFLOW_TABS.length - 1;
      $("workflowNextBtn").textContent = WORKFLOW_NEXT_LABELS[index];
    }
  }

  async function workflowNext() {
    const index = activeWorkflowIndex();
    if (index === 0) {
      if (!S.receipts.some((row) => Number(row.good) > 0)) return msg("กรุณายิงสินค้าอย่างน้อย 1 รายการก่อนกดถัดไป", "error");
      activateTab("box");
      return msg("ตรวจรายการแล้ว กดเพิ่มทั้งหมดลงกล่องหรือสแกนเพิ่มในขั้นตอนที่ 2", "success");
    }
    if (index === 1) {
      if (!S.boxItems.length && S.receipts.some((row) => Number(row.good) > 0)) await addReceivedToBox();
      if (!S.boxItems.length) return msg("ยังไม่มีสินค้าในกล่อง", "error");
      activateTab("check");
      if (!Object.keys(S.counts || {}).length) startRecount();
      return;
    }
    if (index === 2) {
      if (!S.countConfirmed) return msg("กรุณาตรวจนับและกดยืนยันผลตรวจนับก่อน", "error");
      return activateTab("finalize");
    }
    if (index === 3) {
      if (S.box?.status !== "CLOSED") return msg("กรุณาปิดผนึกและสร้าง QR กล่องก่อน", "error");
      activateTab("audit");
    }
  }

  function workflowPrevious() {
    const index = activeWorkflowIndex();
    if (index > 0) activateTab(WORKFLOW_TABS[index - 1]);
  }

  function applyUrlIntent() {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get("tab");
    const tab = requestedTab === "print" ? "finalize" : requestedTab;
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
    bind("printBoxQrBtn", "click", () => { void printBoxQr(); });
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
    bind("recountBtn", "click", startRecount);
    bind("confirmCountBtn", "click", confirmCount);
    bind("moveOutBtn", "click", () => activateTab("box"));
    bind("workflowNextBtn", "click", () => { void workflowNext(); });
    bind("workflowPrevBtn", "click", workflowPrevious);
    bind("finalOpenBoxBtn", "click", () => { void openBox(); });
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
      console.info(`[Box QR] v${VERSION} พร้อมใช้งาน`);
      load();
      bindEvents();
      await syncCurrentBoxSnapshot();
      await loadCloudStats();
      applyUrlIntent();
      window.supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
        if (nextSession) return;
        window.TKNAuthGuard.clearAccessCache();
        location.replace("./dashboard.html");
      });
      window.TKNAuthGuard.ready();
      if (!new URLSearchParams(location.search).get("scan")) msg("เริ่มจากยิงสินค้าที่เหลือหน้าร้าน แล้วดำเนินงานตาม 5 ขั้นตอน", "success");
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
