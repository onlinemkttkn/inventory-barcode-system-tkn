(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
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
        detail: { message: detail || "", source: "box-qr-v5.14.0" },
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
    const expected = Number($("expectedQty").value) || 0;
    const actual = Number($("actualQty").value) || 0;
    const condition = $("condition").value;
    const good = condition === "GOOD" ? actual : 0;
    S.session.source = $("source").value;
    const receipt = {
      id: code("REC"), session_id: S.session.id, tracking: $("tracking").value,
      sku: product.product_code, name: product.name, expected, actual, condition, good, at: now(),
    };
    S.receipts.unshift(receipt);
    audit("RECEIVE", product.product_code, `ตรวจจริง ${actual}, สภาพ ${condition}`);
    $("receiveSku").value = "";
    save();
    msg("บันทึกในเครื่องแล้ว กำลังส่งเข้าฐานข้อมูลกลาง...", "success");
    const synced = await syncReceiptToCloud(receipt, product);
    msg(synced ? "บันทึกตรวจรับและซิงก์ส่วนกลางแล้ว" : "บันทึกในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", synced ? "success" : "error");
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
    S.queue.push({ type: "BOX", code: S.box.id, name: `กล่อง ${S.box.id}`, qty: 1 });
    audit("BOX_CLOSE", S.box.id, `รวม ${S.boxItems.reduce((sum, item) => sum + item.qty, 0)} ชิ้น`);
    save();
    try {
      const boxId = await ensureCloudBox();
      const { error } = await supabaseClient.from("stock_boxes").update({
        status: "CLOSED", location_text: S.box.location || null, closed_at: now(),
      }).eq("id", boxId);
      if (error) throw error;
      await supabaseClient.from("label_print_queue").insert({
        label_type: "BOX", reference_code: S.box.id, copies: 1,
        status: "PENDING", requested_by: S.userId,
      });
      msg("ปิดกล่อง สร้าง QR และซิงก์ส่วนกลางแล้ว", "success");
    } catch (error) {
      console.warn(error);
      msg("ปิดกล่องในเครื่องแล้ว แต่ยังซิงก์ส่วนกลางไม่สำเร็จ", "error");
    }
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
    for (const row of receipts) S.queue.push({ type: "PRODUCT", code: `TKN-P-${row.sku}`, name: row.name, qty: row.good, price: "" });
    audit("PRINT_QUEUE", S.session.id, "เพิ่ม QR สินค้าจากรอบตรวจรับ");
    save();
    try {
      const payload = receipts.map((row) => ({
        label_type: "PRODUCT", reference_code: `TKN-P-${row.sku}`,
        copies: Math.max(1, Number(row.good) || 1), status: "PENDING", requested_by: S.userId,
      }));
      if (payload.length) await supabaseClient.from("label_print_queue").insert(payload);
      msg("เพิ่มคิวพิมพ์ในเครื่องและส่วนกลางแล้ว", "success");
    } catch (error) {
      msg("เพิ่มคิวพิมพ์ในเครื่องแล้ว แต่ส่วนกลางยังไม่สำเร็จ", "error");
    }
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
    audit("SCAN", raw, "ตรวจสอบ QR/Barcode");
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

  async function loadCloudStats() {
    try {
      const [sessions, drafts, closed, queue] = await Promise.all([
        supabaseClient.from("marketplace_receiving_sessions").select("id", { count: "exact", head: true }),
        supabaseClient.from("stock_boxes").select("id", { count: "exact", head: true }).eq("status", "DRAFT"),
        supabaseClient.from("stock_boxes").select("id", { count: "exact", head: true }).eq("status", "CLOSED"),
        supabaseClient.from("label_print_queue").select("copies", { count: "exact" }).eq("status", "PENDING"),
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

  function renderStats() {
    $("sessionCount").textContent = S.cloudStats?.sessions ?? (S.session ? 1 : 0);
    $("draftBoxCount").textContent = S.cloudStats?.drafts ?? (S.box?.status === "DRAFT" ? 1 : 0);
    $("closedBoxCount").textContent = S.cloudStats?.closed ?? (S.box?.status === "CLOSED" ? 1 : 0);
    $("printCount").textContent = S.cloudStats?.print ?? S.queue.reduce((sum, row) => sum + (Number(row.qty) || 1), 0);
  }

  function render() {
    if (!$("receiveCode")) return;
    $("receiveCode").value = S.session?.id || "";
    $("boxCode").value = S.box?.id || "";
    $("location").value = S.box?.location || $("location").value;
    renderStats();
    $("receiveRows").innerHTML = S.receipts.map((row) => `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.sku)}</td><td>${esc(row.name)}</td><td>${row.expected}</td><td>${row.actual}</td><td>${esc(row.condition)}</td><td>${row.good}</td></tr>`).join("") || '<tr><td colspan="7">ยังไม่มีรายการ</td></tr>';
    $("boxRows").innerHTML = S.boxItems.map((item, index) => `<tr><td>${esc(item.sku)}</td><td>${esc(item.name)}</td><td>${item.qty}</td><td><button data-remove="${index}">ลบ</button></td></tr>`).join("") || '<tr><td colspan="4">ยังไม่มีสินค้าในกล่อง</td></tr>';
    $("boxTotal").textContent = S.boxItems.reduce((sum, item) => sum + item.qty, 0);
    $("auditRows").innerHTML = S.audit.map((row) => `<tr><td>${new Date(row.at).toLocaleString("th-TH")}</td><td>${esc(row.user)}</td><td>${esc(row.action)}</td><td>${esc(row.ref)}</td><td>${esc(row.detail)}</td></tr>`).join("") || '<tr><td colspan="5">ยังไม่มีประวัติ</td></tr>';
    renderQueue();
  }

  function renderQueue() {
    const host = $("printQueue");
    host.innerHTML = "";
    S.queue.forEach((item, index) => {
      const article = document.createElement("article");
      article.className = "label";
      article.innerHTML = `<b>${esc(item.name)}</b><div id="qr${index}"></div><svg id="bar${index}"></svg><small>${esc(item.code)} · ${item.qty} ฉลาก</small>`;
      host.appendChild(article);
      setTimeout(() => {
        if (window.QRCode) QRCode.toCanvas(document.createElement("canvas"), item.code, { width: 110 }, (error, canvas) => { if (!error) $("qr" + index).appendChild(canvas); });
        if (window.JsBarcode) JsBarcode("#bar" + index, item.code, { height: 35, displayValue: false, margin: 2 });
      }, 0);
    });
  }

  function activateTab(tab) {
    const button = document.querySelector(`.tabs button[data-tab="${tab}"]`);
    if (!button) return;
    document.querySelectorAll(".tabs button,.panel").forEach((element) => element.classList.remove("active"));
    button.classList.add("active");
    $(tab)?.classList.add("active");
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
      button.onclick = () => activateTab(button.dataset.tab);
    });
    $("receiveBtn").onclick = receive;
    $("newSessionBtn").onclick = () => { newSession(); S.receipts = []; audit("SESSION_NEW", S.session.id, S.session.source); save(); };
    $("queueProductQrBtn").onclick = queueProducts;
    $("newBoxBtn").onclick = () => { newBox(); audit("BOX_NEW", S.box.id, ""); save(); };
    $("addBoxItemBtn").onclick = addBox;
    $("closeBoxBtn").onclick = closeBox;
    $("openBoxBtn").onclick = openBox;
    $("scanBtn").onclick = scan;
    $("scanCode").onkeydown = (event) => { if (event.key === "Enter") void scan(); };
    $("receiveSku").onkeydown = (event) => { if (event.key === "Enter") void receive(); };
    $("boxSku").onkeydown = (event) => { if (event.key === "Enter") void addBox(); };
    $("boxRows").onclick = (event) => { const index = event.target.dataset.remove; if (index !== undefined) void removeItem(Number(index)); };
    $("printAllBtn").onclick = () => window.print();
    $("clearPrintBtn").onclick = () => { if (confirm("ล้างคิวพิมพ์ในเครื่อง?")) { S.queue = []; save(); } };
    $("recountBtn").onclick = () => msg("แนะนำเปิดโหมดมือถือเพื่อสแกนและบันทึกร่างการตรวจนับ", "success");
    $("moveOutBtn").onclick = () => msg("เปิดกล่องก่อน แล้วลด/ลบรายการ พร้อมระบุเหตุผลใน Audit Log", "success");
  }

  async function initializePage() {
    try {
      if (!window.TKNAuthGuard) throw new Error("ไม่พบระบบตรวจสอบสิทธิ์ กรุณาตรวจว่า js/auth-guard.js ถูกอัปโหลดครบ");
      if (!window.supabaseClient) throw new Error("ไม่พบการเชื่อมต่อ Supabase กรุณาตรวจว่า js/supabase-config.js ถูกอัปโหลดครบ");
      const access = await window.TKNAuthGuard.requireAccess("product.manage", { loadingText: "กำลังตรวจสอบสิทธิ์ระบบ Box QR..." });
      if (!access) return;
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      S.user = session?.user?.email || access?.email || "-";
      S.userId = session?.user?.id || null;
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
      if (!new URLSearchParams(location.search).get("scan")) msg("ระบบ Box QR พร้อมใช้งาน · ข้อมูลใหม่จะซิงก์ส่วนกลางสำหรับตรวจผ่านมือถือ", "success");
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializePage, { once: true });
  else initializePage();
})();
