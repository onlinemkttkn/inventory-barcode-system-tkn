(() => {
  "use strict";

  const VERSION = "5.25.12";
  const $ = (id) => document.getElementById(id);
  const PATTERN = window.TKNProductPattern;
  const RECENT_KEY = "tkn_mobile_stock_recent_v514";
  const COUNT_KEY = "tkn_mobile_stock_count_drafts_v514";
  const BOX_LOCAL_KEY = "tkn_box_qr_v512";
  const state = {
    mode: "LOOKUP",
    reader: null,
    controls: null,
    track: null,
    torchOn: false,
    lastCode: "",
    lastAt: 0,
    current: null,
    recent: [],
    busy: false,
    access: null,
    userId: null,
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const num = (value) => Number(value || 0).toLocaleString("th-TH");
  const money = (value) => new Intl.NumberFormat("th-TH", {
    style: "currency", currency: "THB", minimumFractionDigits: 2,
  }).format(Number(value || 0));

  function setMessage(text = "", type = "") {
    $("mobileMessage").textContent = text;
    $("mobileMessage").className = `message ${type}`.trim();
  }

  function setCameraStatus(text, active = false) {
    $("cameraStatus").textContent = text;
    $("cameraStatus").classList.toggle("active", active);
  }

  function normalizeScannedValue(raw) {
    let value = String(raw || "").trim();
    if (!value) return "";
    try {
      const url = new URL(value);
      value = url.searchParams.get("id") || url.searchParams.get("code") ||
        decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || value);
    } catch (_) {}
    return value.trim();
  }

  function safeFilterValue(value) {
    return String(value || "").replace(/[%_,()]/g, "").trim();
  }

  function feedback(ok = true) {
    if (navigator.vibrate) navigator.vibrate(ok ? 70 : [80, 60, 120]);
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch (_) {}
  }

  function loadRecent() {
    try { state.recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
    catch (_) { state.recent = []; }
    renderRecent();
  }

  function addRecent(item) {
    const entry = { ...item, at: new Date().toISOString() };
    state.recent = [entry, ...state.recent.filter((x) => x.code !== entry.code)].slice(0, 15);
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent));
    renderRecent();
  }

  function renderRecent() {
    const host = $("recentList");
    if (!state.recent.length) {
      host.innerHTML = '<p class="muted">ยังไม่มีรายการ</p>';
      return;
    }
    host.innerHTML = state.recent.map((item) => `
      <button class="recent-item" type="button" data-code="${esc(item.code)}">
        <span><b>${esc(item.name || item.code)}</b><small>${esc(item.type)} · ${new Date(item.at).toLocaleString("th-TH")}</small></span>
        <b>›</b>
      </button>
    `).join("");
  }

  async function startCamera() {
    if (!window.ZXingBrowser) {
      setMessage("โหลดระบบกล้องไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต", "error");
      return;
    }
    try {
      $("startCameraBtn").disabled = true;
      setCameraStatus("กำลังเปิดกล้อง...");
      state.reader = state.reader || new ZXingBrowser.BrowserMultiFormatReader();
      const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
      if (!devices.length) throw new Error("ไม่พบกล้องในโทรศัพท์");
      const preferred = devices.find((device) => /back|rear|environment|หลัง/i.test(device.label)) || devices.at(-1);
      state.controls = await state.reader.decodeFromConstraints({
        video: {
          deviceId: preferred?.deviceId ? { exact: preferred.deviceId } : undefined,
          facingMode: preferred?.deviceId ? undefined : { ideal: "environment" },
          width: { ideal: 1920 }, height: { ideal: 1080 },
          focusMode: { ideal: "continuous" },
        },
        audio: false,
      }, $("cameraVideo"), async (result, error, controls) => {
        if (controls && !state.controls) state.controls = controls;
        if (!result) return;
        const value = normalizeScannedValue(result.getText());
        const currentAt = Date.now();
        if (!value || (value === state.lastCode && currentAt - state.lastAt < 1600)) return;
        state.lastCode = value;
        state.lastAt = currentAt;
        $("manualCode").value = value;
        await handleCode(value, true);
      });
      const stream = $("cameraVideo").srcObject;
      state.track = stream?.getVideoTracks?.()[0] || null;
      const capabilities = state.track?.getCapabilities?.() || {};
      $("torchBtn").hidden = !capabilities.torch;
      $("cameraPlaceholder").hidden = true;
      $("stopCameraBtn").disabled = false;
      setCameraStatus("กำลังสแกน", true);
      setMessage(state.mode === "ISSUE_BOX"
        ? "เล็ง QR กล่อง TKN-B ให้อยู่กลางกรอบ"
        : "เล็ง QR สินค้า TKN-P หรือ QR กล่อง TKN-B ให้อยู่กลางกรอบ · Barcode ยังใช้ได้", "success");
    } catch (error) {
      console.error("Mobile scanner:", error);
      stopCamera();
      setMessage(`${error.message || "เปิดกล้องไม่สำเร็จ"} กรุณาอนุญาตกล้องและเปิดผ่าน HTTPS`, "error");
      $("cameraFrame").classList.add("shake");
      setTimeout(() => $("cameraFrame").classList.remove("shake"), 600);
    }
  }

  function stopCamera() {
    try { state.controls?.stop?.(); } catch (_) {}
    state.controls = null;
    const stream = $("cameraVideo").srcObject;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    $("cameraVideo").srcObject = null;
    state.track = null;
    state.torchOn = false;
    $("torchBtn").hidden = true;
    $("torchBtn").textContent = "เปิดไฟฉาย";
    $("cameraPlaceholder").hidden = false;
    $("startCameraBtn").disabled = false;
    $("stopCameraBtn").disabled = true;
    setCameraStatus("หยุดกล้องแล้ว");
  }

  async function toggleTorch() {
    if (!state.track) return;
    try {
      state.torchOn = !state.torchOn;
      await state.track.applyConstraints({ advanced: [{ torch: state.torchOn }] });
      $("torchBtn").textContent = state.torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย";
    } catch (error) {
      state.torchOn = false;
      setMessage("โทรศัพท์รุ่นนี้ไม่อนุญาตให้เปิดไฟฉายจากเบราว์เซอร์", "info");
    }
  }

  async function handleCode(raw, fromCamera = false) {
    const code = normalizeScannedValue(raw);
    if (!code || state.busy) return;
    state.busy = true;
    setMessage(`กำลังตรวจสอบ ${code}...`, "info");
    try {
      if (state.mode === "ISSUE_BOX" && !/^TKN-B-/i.test(code)) {
        throw new Error("โหมดเบิกกล่องรับเฉพาะ QR กล่องรหัส TKN-B เท่านั้น");
      }
      if (/^TKN-B-/i.test(code)) await lookupBox(code);
      else await lookupProduct(code);
      feedback(true);
      if (fromCamera && state.mode === "LOOKUP") {
        setMessage("พบข้อมูลแล้ว พร้อมสแกนรายการถัดไป", "success");
      }
    } catch (error) {
      console.error(error);
      feedback(false);
      setMessage(error.message || "ตรวจสอบข้อมูลไม่สำเร็จ", "error");
      renderError(code, error.message || "ไม่พบข้อมูล");
    } finally {
      state.busy = false;
    }
  }

  async function lookupProduct(rawCode) {
    const candidates = (PATTERN?.scanCandidates?.(rawCode) || [String(rawCode).replace(/^TKN-P-/i, "")])
      .map(safeFilterValue).filter(Boolean);
    const cleanCode = candidates[0] || "";
    if (!cleanCode) throw new Error("รหัสสินค้าไม่ถูกต้อง");
    const filter = [...new Set(candidates.flatMap((value) => [`barcode.eq.${value}`, `product_code.eq.${value}`]))].join(",");
    let product = null;
    const fields = "id,product_code,barcode,name,category_name,unit_name,cost_price,selling_price,quantity,minimum_stock,stock_status,is_active";
    const exact = await supabaseClient.from("product_list").select(fields)
      .or(filter).limit(1).maybeSingle();
    if (!exact.error) product = exact.data;
    if (!product) {
      const fallback = await supabaseClient.from("products")
        .select("id,product_code,barcode,name,cost_price,selling_price,quantity,minimum_stock,is_active")
        .or(filter).limit(1).maybeSingle();
      if (fallback.error) throw fallback.error;
      product = fallback.data;
    }
    if (!product) throw new Error(`ไม่พบสินค้า ${cleanCode} ในระบบ`);

    const [branchRows, boxRows] = await Promise.all([
      loadBranchInventory(product.id),
      loadProductBoxes(product.id, product.product_code),
    ]);
    const branchTotal = branchRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const systemTotal = branchRows.length ? branchTotal : Number(product.quantity || 0);
    const boxTotal = boxRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const looseTotal = Math.max(0, systemTotal - boxTotal);
    state.current = { type: "PRODUCT", code: product.product_code, product, systemTotal, boxTotal, looseTotal, branchRows, boxRows };
    renderProduct(state.current);
    addRecent({ type: "สินค้า", code: product.product_code, name: product.name });
  }

  async function loadBranchInventory(productId) {
    try {
      const { data, error } = await supabaseClient.from("branch_inventory_list").select("*")
        .eq("product_id", productId).order("branch_name");
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn("Branch inventory unavailable:", error);
      return [];
    }
  }

  async function loadProductBoxes(productId, sku) {
    try {
      const { data, error } = await supabaseClient.from("stock_box_items")
        .select("box_id,sku,quantity,stock_boxes!inner(box_code,status,location_text)")
        .eq("product_id", productId)
        .in("stock_boxes.status", ["DRAFT", "OPEN", "CLOSED"])
        .gt("quantity", 0);
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        box_code: row.stock_boxes?.box_code || "-",
        status: row.stock_boxes?.status || "-",
        location_text: row.stock_boxes?.location_text || "ยังไม่ระบุตำแหน่ง",
      }));
    } catch (error) {
      console.warn("Box relation unavailable:", error);
      try {
        const { data: items } = await supabaseClient.from("stock_box_items")
          .select("box_id,sku,quantity").eq("sku", sku).gt("quantity", 0);
        if (!items?.length) return [];
        const ids = [...new Set(items.map((item) => item.box_id))];
        const { data: boxes } = await supabaseClient.from("stock_boxes")
          .select("id,box_code,status,location_text").in("id", ids)
          .in("status", ["DRAFT", "OPEN", "CLOSED"]);
        const boxMap = new Map((boxes || []).map((box) => [box.id, box]));
        return items.filter((item) => boxMap.has(item.box_id)).map((item) => ({ ...item, ...boxMap.get(item.box_id) }));
      } catch (_) { return []; }
    }
  }

  async function lookupBox(boxCode) {
    let box = null;
    let items = [];
    try {
      const boxResult = await supabaseClient.from("stock_boxes").select("*").eq("box_code", boxCode).maybeSingle();
      if (boxResult.error) throw boxResult.error;
      box = boxResult.data;
      if (box) {
        const itemResult = await supabaseClient.from("stock_box_items")
          .select("product_id,sku,quantity").eq("box_id", box.id).order("sku");
        if (itemResult.error) throw itemResult.error;
        items = itemResult.data || [];
        const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
        if (productIds.length) {
          const productResult = await supabaseClient.from("products").select("id,product_code,name,barcode,selling_price").in("id", productIds);
          const productMap = new Map((productResult.data || []).map((product) => [product.id, product]));
          items = items.map((item) => ({ ...item, product: productMap.get(item.product_id) || null }));
        }
      }
    } catch (error) {
      console.warn("Cloud box lookup:", error);
    }
    if (!box) {
      try {
        const local = JSON.parse(localStorage.getItem(BOX_LOCAL_KEY) || "{}");
        if (local.box?.id === boxCode) {
          box = { box_code: local.box.id, status: local.box.status, location_text: local.box.location, local_only: true };
          items = (local.boxItems || []).map((item) => ({ sku: item.sku, quantity: item.qty, product: { name: item.name, product_code: item.sku } }));
        }
      } catch (_) {}
    }
    if (!box) throw new Error(`ไม่พบกล่อง ${boxCode} ในฐานข้อมูลกลาง`);
    const total = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    state.current = { type: "BOX", code: boxCode, box, items, systemTotal: total };
    renderBox(state.current);
    addRecent({ type: "กล่อง", code: boxCode, name: `กล่อง ${boxCode}` });
  }

  function renderProduct(data) {
    const { product, systemTotal, boxTotal, looseTotal, branchRows, boxRows } = data;
    $("resultPanel").className = "result-panel";
    $("resultPanel").innerHTML = `
      <div class="result-head">
        <div><span class="result-kind">สินค้า</span><h2>${esc(product.name || "-")}</h2><div class="result-code">SKU ${esc(product.product_code)} · Barcode ${esc(product.barcode || "-")}</div></div>
        <div class="price">${money(product.selling_price)}</div>
      </div>
      <div class="stock-summary">
        <div class="stock-card primary"><span>สต็อกในระบบ</span><b>${num(systemTotal)}</b></div>
        <div class="stock-card box"><span>อยู่ในกล่อง</span><b>${num(boxTotal)}</b></div>
        <div class="stock-card"><span>นอกกล่องโดยประมาณ</span><b>${num(looseTotal)}</b></div>
        <div class="stock-card"><span>สต็อกขั้นต่ำ</span><b>${num(product.minimum_stock)}</b></div>
      </div>
      <div class="detail-list">
        <div class="detail-row"><span>หมวดหมู่</span><b>${esc(product.category_name || "-")}</b></div>
        <div class="detail-row"><span>หน่วยนับ</span><b>${esc(product.unit_name || "-")}</b></div>
        <div class="detail-row"><span>สถานะ</span><b>${product.is_active === false ? "ปิดใช้งาน" : "พร้อมใช้งาน"}</b></div>
      </div>
      <div class="location-list">
        <b>สต็อกแยกตามสาขา</b>
        ${branchRows.length ? branchRows.map((row) => `<div class="location-item"><span><b>${esc(row.branch_name || row.branch_code || "สาขา")}</b><small>${esc(row.unit_name || "")}</small></span><b>${num(row.quantity)}</b></div>`).join("") : '<div class="location-item"><span>ไม่พบข้อมูลแยกสาขา</span><b>-</b></div>'}
      </div>
      <div class="location-list">
        <b>ตำแหน่งในกล่อง</b>
        ${boxRows.length ? boxRows.map((row) => `<div class="location-item"><span><b>${esc(row.box_code || "-")}</b><small>${esc(row.location_text || "ยังไม่ระบุตำแหน่ง")} · ${esc(row.status || "-")}</small></span><b>${num(row.quantity)}</b></div>`).join("") : '<div class="location-item"><span>ไม่พบสินค้าในกล่อง</span><b>0</b></div>'}
      </div>
      <div class="result-actions">
        <button class="btn primary" type="button" data-action="COUNT">ตรวจนับจริง</button>
        <a class="btn ghost" href="./products-admin.html?search=${encodeURIComponent(product.product_code)}">จัดการสินค้า</a>
        <a class="btn ghost wide" href="./box-qr-stock.html?tab=box&scan=${encodeURIComponent(product.product_code)}">นำสินค้าไปจัดกล่อง</a>
      </div>`;
  }

  function permissionSet() {
    return new Set(Array.isArray(state.access?.permissions) ? state.access.permissions : []);
  }

  function canIssueBox() {
    const permissions = permissionSet();
    return permissions.has("inventory.issue") || permissions.has("product.manage");
  }

  function statusCode(value) {
    return String(value || "").trim().toUpperCase();
  }

  function statusLabel(value) {
    const labels = {
      DRAFT: "เปิดกล่อง / กำลังจัด",
      OPEN: "เปิดกล่อง / กำลังจัด",
      CLOSED: "ปิดกล่อง / พร้อมเบิก",
    };
    return labels[statusCode(value)] || String(value || "-");
  }

  function issueBlockReason(data) {
    if (!canIssueBox()) return "บัญชีนี้ไม่มีสิทธิ์เบิกสินค้า";
    if (data.box?.local_only || !data.box?.id) return "กล่องนี้ยังไม่ซิงก์ฐานข้อมูลส่วนกลาง";
    if (!data.items?.length || Number(data.systemTotal || 0) <= 0) return "กล่องนี้ไม่มีสินค้าให้เบิก";
    const status = statusCode(data.box?.status);
    if (status !== "CLOSED") return "ต้องปิดกล่องให้เรียบร้อยก่อนจึงจะเบิกได้";
    return "";
  }

  function renderBox(data) {
    const { box, items, systemTotal } = data;
    const issueMode = state.mode === "ISSUE_BOX";
    const lastIssued = data.lastIssued || null;
    const blockReason = issueMode && !lastIssued ? issueBlockReason(data) : "";
    const visibleItems = lastIssued?.items || items;
    const visibleTotal = lastIssued ? Number(lastIssued.total_quantity || 0) : Number(systemTotal || 0);
    const visibleSku = lastIssued ? Number(lastIssued.total_sku || visibleItems.length) : items.length;
    $("resultPanel").className = "result-panel";
    $("resultPanel").innerHTML = `
      <div class="result-head">
        <div><span class="result-kind">${issueMode ? "เบิกกล่อง" : "QR กล่อง"}</span><h2>${esc(box.box_code || data.code)}</h2><div class="result-code">${esc(box.location_text || "ยังไม่ระบุตำแหน่ง")}</div></div>
        <div class="price">${num(lastIssued ? visibleTotal : systemTotal)} ชิ้น</div>
      </div>
      <div class="stock-summary">
        <div class="stock-card primary"><span>${lastIssued ? "เบิกออกครั้งล่าสุด" : "รวมในกล่อง"}</span><b>${num(lastIssued ? visibleTotal : systemTotal)}</b></div>
        <div class="stock-card box"><span>${lastIssued ? "SKU ที่เบิก" : "จำนวน SKU"}</span><b>${num(lastIssued ? visibleSku : items.length)}</b></div>
        <div class="stock-card"><span>สถานะกล่องปัจจุบัน</span><b class="stock-status-text">${esc(statusLabel(box.status))}</b></div>
        <div class="stock-card"><span>แหล่งข้อมูล</span><b class="stock-status-text">${box.local_only ? "เครื่องนี้" : "ส่วนกลาง"}</b></div>
      </div>
      ${issueMode ? `<div class="issue-box-note ${lastIssued || !blockReason ? "ready" : "blocked"}">
        <b>${lastIssued ? "เบิกสินค้าทั้งกล่องสำเร็จ" : (blockReason ? "ยังเบิกไม่ได้" : "พร้อมเบิกสินค้าทั้งกล่อง")}</b>
        <span>${esc(lastIssued
          ? "สินค้าออกจากกล่องและพร้อมขายหน้า POS แล้ว กล่องถูกเปิดเป็นกล่องว่างเพื่อใช้สแกนสินค้าเข้ากล่องรอบใหม่"
          : (blockReason || "เมื่อยืนยัน ระบบจะนำรายการออกจากกล่องโดยไม่ลดสต็อกรวมของสาขา"))}</span>
      </div>` : ""}
      <div class="box-item-list">
        <b>${lastIssued ? "รายการที่เบิกครั้งล่าสุด" : "สินค้าภายในกล่องปัจจุบัน"}</b>
        ${visibleItems.length ? visibleItems.map((item) => `<div class="box-item"><span><b>${esc(item.product?.name || item.product_name || item.sku)}</b><small>${esc(item.product?.product_code || item.product_code || item.sku)}</small></span><b>${num(item.quantity)}</b></div>`).join("") : '<div class="box-item"><span>กล่องนี้ยังไม่มีสินค้า</span><b>0</b></div>'}
      </div>
      <div class="result-actions">
        ${issueMode
          ? (lastIssued ? "" : `<button class="btn primary wide" type="button" data-action="ISSUE_BOX" ${blockReason ? "disabled" : ""}>ยืนยันเบิกสินค้าทั้งกล่อง</button>`)
          : `<button class="btn primary wide" type="button" data-action="COUNT">ตรวจนับกล่อง</button>`}
      </div>`;
    if (issueMode) {
      setMessage(lastIssued
        ? `เบิกกล่อง ${box.box_code || data.code} สำเร็จ · ${visibleSku} SKU รวม ${num(visibleTotal)} ชิ้น พร้อมขายหน้า POS`
        : (blockReason || `ตรวจพบกล่อง ${box.box_code || data.code} กรุณาตรวจรายการแล้วกดยืนยันเบิกทั้งกล่อง`),
      lastIssued || !blockReason ? "success" : "error");
    }
  }

  function normalizeRpcPayload(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data || null;
  }

  async function issueCurrentBox() {
    const current = state.current;
    if (!current || current.type !== "BOX") return setMessage("กรุณาสแกน QR กล่องก่อนเบิก", "error");
    const reason = issueBlockReason(current);
    if (reason) return setMessage(reason, "error");

    const boxCode = current.box.box_code || current.code;
    const confirmed = confirm(`ยืนยันเบิกสินค้าทั้งหมดในกล่อง ${boxCode}\n${current.items.length} SKU รวม ${num(current.systemTotal)} ชิ้น\n\nสินค้าออกจากกล่องและพร้อมขายหน้า POS ส่วนกล่องจะเปิดเป็นกล่องว่างสำหรับจัดสินค้ารอบใหม่`);
    if (!confirmed) return;

    state.busy = true;
    setMessage(`กำลังเบิกกล่อง ${boxCode}...`, "info");
    try {
      const { data, error } = await supabaseClient.rpc("issue_box_to_storefront", { p_box_code: boxCode });
      if (error) throw error;
      const result = normalizeRpcPayload(data);
      if (!result?.box) throw new Error("ฐานข้อมูลไม่ส่งผลการเบิกกล่องกลับมา");

      const issuedItems = Array.isArray(result.items) && result.items.length ? result.items : current.items;
      const issuedTotal = Number(result.total_quantity ?? current.systemTotal ?? 0);
      const issuedSku = Number(result.total_sku ?? issuedItems.length);
      current.box = { ...current.box, ...result.box, status: result.box.status || "DRAFT" };
      current.items = [];
      current.systemTotal = 0;
      current.lastIssued = {
        items: issuedItems,
        total_quantity: issuedTotal,
        total_sku: issuedSku,
        issued_at: result.issued_at || new Date().toISOString(),
      };
      state.current = current;
      addRecent({ type: "เบิกกล่อง", code: boxCode, name: `เบิกกล่อง ${boxCode}` });
      renderBox(current);
      feedback(true);
    } catch (error) {
      console.error("Issue box:", error);
      feedback(false);
      const message = String(error?.message || "เบิกกล่องไม่สำเร็จ");
      if (/issue_box_to_storefront|function .* does not exist|schema cache/i.test(message)) {
        setMessage("ยังไม่ได้ติดตั้ง SQL สำหรับเบิกกล่อง กรุณารัน PATCH-v5.25.12-BOX-ISSUE-RPC.sql ใน Supabase ก่อน", "error");
      } else {
        setMessage(message, "error");
      }
    } finally {
      state.busy = false;
    }
  }

  function renderError(code, text) {
    $("resultPanel").className = "result-panel";
    $("resultPanel").innerHTML = `<div class="empty-result"><span>!</span><h2>ไม่พบข้อมูล</h2><p>${esc(text)}</p><div class="result-code">${esc(code)}</div></div>`;
  }

  async function searchByText(text) {
    const keyword = safeFilterValue(text);
    if (!keyword) return;
    if (state.mode === "ISSUE_BOX") {
      $("searchSuggestions").hidden = true;
      if (!/^TKN-B-/i.test(keyword)) throw new Error("โหมดเบิกกล่องรับเฉพาะ QR กล่องรหัส TKN-B เท่านั้น");
      await handleCode(keyword);
      return;
    }
    if (/^TKN-[PB]-/i.test(keyword) || /^\d{6,}$/.test(keyword)) {
      $("searchSuggestions").hidden = true;
      await handleCode(keyword);
      return;
    }
    setMessage("กำลังค้นหาชื่อสินค้า...", "info");
    const { data, error } = await supabaseClient.from("product_list")
      .select("product_code,barcode,name,selling_price,quantity")
      .or(`name.ilike.%${keyword}%,product_code.ilike.%${keyword}%,barcode.eq.${keyword}`)
      .limit(12);
    if (error) throw error;
    const host = $("searchSuggestions");
    if (!data?.length) {
      host.hidden = true;
      throw new Error(`ไม่พบสินค้าที่ค้นหาด้วย ${keyword}`);
    }
    host.innerHTML = data.map((item) => `<button class="suggestion" type="button" data-code="${esc(item.product_code)}"><b>${esc(item.name)}</b><small>${esc(item.product_code)} · ${money(item.selling_price)} · คงเหลือ ${num(item.quantity)}</small></button>`).join("");
    host.hidden = false;
    setMessage(`พบ ${data.length} รายการ เลือกสินค้าที่ต้องการ`, "success");
  }

  function openCountPanel() {
    if (!state.current) return;
    $("systemQty").value = Number(state.current.systemTotal || 0);
    $("countedQty").value = Number(state.current.systemTotal || 0);
    $("countNote").value = "";
    $("countPanel").hidden = false;
    $("countedQty").focus();
    $("countPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function saveCountDraft() {
    if (!state.current) return;
    const counted = Number($("countedQty").value);
    if (!Number.isFinite(counted) || counted < 0) return setMessage("จำนวนตรวจจริงไม่ถูกต้อง", "error");
    let drafts = [];
    try { drafts = JSON.parse(localStorage.getItem(COUNT_KEY) || "[]"); } catch (_) {}
    drafts.unshift({
      code: state.current.code,
      type: state.current.type,
      system_qty: Number(state.current.systemTotal || 0),
      counted_qty: counted,
      variance: counted - Number(state.current.systemTotal || 0),
      note: $("countNote").value.trim(),
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(COUNT_KEY, JSON.stringify(drafts.slice(0, 300)));
    $("countPanel").hidden = true;
    setMessage(`บันทึกร่างแล้ว ผลต่าง ${num(counted - Number(state.current.systemTotal || 0))} ชิ้น โดยยังไม่ปรับสต็อก`, "success");
    feedback(true);
  }

  function setMode(mode) {
    if (mode === "ISSUE_BOX" && !canIssueBox()) {
      setMessage("บัญชีนี้ไม่มีสิทธิ์เบิกสินค้า กรุณาติดต่อผู้ดูแลระบบ", "error");
      return;
    }
    state.mode = mode;
    document.querySelectorAll(".mode-btn").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
    const help = {
      LOOKUP: "สแกน QR สินค้า, Barcode หรือ QR กล่อง เพื่อดูจำนวนและตำแหน่ง",
      ISSUE_BOX: "รับเฉพาะ QR กล่อง TKN-B นำสินค้าทั้งหมดออกจากกล่องและเปิดกล่องสำหรับจัดรอบใหม่",
    };
    $("cameraHelp").textContent = help[mode];
    $("manualCode").placeholder = mode === "ISSUE_BOX" ? "สแกนหรือกรอก QR กล่อง TKN-B-..." : "SKU, Barcode, TKN-P-... หรือ TKN-B-...";
    $("searchSuggestions").hidden = true;
    $("countPanel").hidden = true;
    if (state.current?.type === "BOX") renderBox(state.current);
    else if (mode === "ISSUE_BOX") {
      state.current = null;
      $("resultPanel").className = "result-panel empty";
      $("resultPanel").innerHTML = '<div class="empty-result"><span>📦</span><h2>รอสแกน QR กล่อง</h2><p>ระบบจะเบิกสินค้าทั้งหมดในกล่อง ไม่มีการเลือกบางรายการ</p></div>';
    }
    setMessage(mode === "LOOKUP"
      ? "โหมดดูสต็อก ไม่เปลี่ยนยอดหรือสถานะสินค้า"
      : "โหมดเบิกกล่อง: สแกน QR กล่อง ตรวจรายการ แล้วเบิกออกทั้งหมดในครั้งเดียว", "info");
  }

  function goBack() {
    stopCamera();
    if (window.TKNSafeBack?.go) {
      window.TKNSafeBack.go({ fallback: "./dashboard.html" });
      return;
    }
    location.href = "./dashboard.html";
  }

  function bindEvents() {
    $("backBtn").addEventListener("click", goBack);
    $("startCameraBtn").addEventListener("click", startCamera);
    $("stopCameraBtn").addEventListener("click", stopCamera);
    $("torchBtn").addEventListener("click", toggleTorch);
    document.querySelectorAll(".mode-btn").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
    $("manualSearchForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try { await searchByText($("manualCode").value); } catch (error) { setMessage(error.message, "error"); }
    });
    $("searchSuggestions").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-code]");
      if (!button) return;
      $("manualCode").value = button.dataset.code;
      $("searchSuggestions").hidden = true;
      await handleCode(button.dataset.code);
    });
    $("resultPanel").addEventListener("click", async (event) => {
      if (event.target.closest('[data-action="COUNT"]')) openCountPanel();
      if (event.target.closest('[data-action="ISSUE_BOX"]')) await issueCurrentBox();
    });
    $("saveCountDraftBtn").addEventListener("click", saveCountDraft);
    $("cancelCountBtn").addEventListener("click", () => { $("countPanel").hidden = true; });
    $("clearRecentBtn").addEventListener("click", () => {
      if (!confirm("ล้างรายการสแกนล่าสุดในโทรศัพท์เครื่องนี้?")) return;
      state.recent = [];
      localStorage.removeItem(RECENT_KEY);
      renderRecent();
    });
    $("recentList").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-code]");
      if (button) await handleCode(button.dataset.code);
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); });
    window.addEventListener("pagehide", stopCamera);
  }

  async function initialize() {
    try {
      if (!window.TKNAuthGuard || !window.supabaseClient) throw new Error("ไฟล์ระบบสิทธิ์หรือ Supabase โหลดไม่ครบ");
      const access = await window.TKNAuthGuard.requireAccess(null, { loadingText: "กำลังตรวจสอบสิทธิ์ตรวจสต็อกและเบิกกล่อง..." });
      if (!access) return;
      const granted = new Set(Array.isArray(access.permissions) ? access.permissions : []);
      const pageAllowed = ["inventory.view", "inventory.count", "inventory.issue", "product.manage", "pos.use"]
        .some((permission) => granted.has(permission));
      if (!pageAllowed) {
        location.replace(access.landing_page || "./dashboard.html");
        return;
      }
      state.access = access;
      state.userId = access.user_id || null;
      bindEvents();
      loadRecent();
      const issueModeButton = document.querySelector('[data-mode="ISSUE_BOX"]');
      if (issueModeButton && !canIssueBox()) {
        issueModeButton.disabled = true;
        issueModeButton.title = "ต้องมีสิทธิ์ inventory.issue หรือ product.manage";
        issueModeButton.querySelector("small").textContent = "ไม่มีสิทธิ์เบิกสินค้า";
      }
      window.TKNAuthGuard.ready();
      setMessage("พร้อมดูสต็อก หรือสแกน QR กล่องเพื่อเบิกสินค้าทั้งกล่อง", "success");
      const params = new URLSearchParams(location.search);
      if (/^(issue|issue_box)$/i.test(params.get("mode") || "") && canIssueBox()) setMode("ISSUE_BOX");
      const initial = params.get("scan");
      if (initial) { $("manualCode").value = initial; await handleCode(initial); }
    } catch (error) {
      console.error("Mobile stock init:", error);
      if (error?.code === "INVENTORY_PERMISSION_DENIED") return;
      window.TKNAuthGuard?.fail(error, () => location.reload());
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
