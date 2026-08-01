(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
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
      setMessage("เล็ง QR สินค้า TKN-P หรือ QR กล่อง TKN-B ให้อยู่กลางกรอบ · Barcode ยังใช้ได้", "success");
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
      if (state.mode === "RECEIVE") {
        feedback(true);
        location.href = `./box-qr-stock.html?tab=receive&scan=${encodeURIComponent(code)}`;
        return;
      }
      if (state.mode === "BOX") {
        feedback(true);
        location.href = `./box-qr-stock.html?tab=box&scan=${encodeURIComponent(code)}`;
        return;
      }
      if (/^TKN-B-/i.test(code)) await lookupBox(code);
      else await lookupProduct(code);
      feedback(true);
      if (fromCamera) setMessage("พบข้อมูลแล้ว พร้อมสแกนรายการถัดไป", "success");
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
    const cleanCode = safeFilterValue(String(rawCode).replace(/^TKN-P-/i, ""));
    if (!cleanCode) throw new Error("รหัสสินค้าไม่ถูกต้อง");
    let product = null;
    const fields = "id,product_code,barcode,name,category_name,unit_name,cost_price,selling_price,quantity,minimum_stock,stock_status,is_active";
    const exact = await supabaseClient.from("product_list").select(fields)
      .or(`barcode.eq.${cleanCode},product_code.eq.${cleanCode}`).limit(1).maybeSingle();
    if (!exact.error) product = exact.data;
    if (!product) {
      const fallback = await supabaseClient.from("products")
        .select("id,product_code,barcode,name,cost_price,selling_price,quantity,minimum_stock,is_active")
        .or(`barcode.eq.${cleanCode},product_code.eq.${cleanCode}`).limit(1).maybeSingle();
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
        .select("box_id,sku,quantity,stock_boxes(box_code,status,location_text)")
        .eq("product_id", productId).gt("quantity", 0);
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
          .select("id,box_code,status,location_text").in("id", ids);
        const boxMap = new Map((boxes || []).map((box) => [box.id, box]));
        return items.map((item) => ({ ...item, ...(boxMap.get(item.box_id) || {}) }));
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

  function renderBox(data) {
    const { box, items, systemTotal } = data;
    $("resultPanel").className = "result-panel";
    $("resultPanel").innerHTML = `
      <div class="result-head">
        <div><span class="result-kind">QR กล่อง</span><h2>${esc(box.box_code || data.code)}</h2><div class="result-code">${esc(box.location_text || "ยังไม่ระบุตำแหน่ง")}</div></div>
        <div class="price">${num(systemTotal)} ชิ้น</div>
      </div>
      <div class="stock-summary">
        <div class="stock-card primary"><span>รวมในกล่อง</span><b>${num(systemTotal)}</b></div>
        <div class="stock-card box"><span>จำนวน SKU</span><b>${num(items.length)}</b></div>
        <div class="stock-card"><span>สถานะ</span><b style="font-size:15px">${esc(box.status || "-")}</b></div>
        <div class="stock-card"><span>แหล่งข้อมูล</span><b style="font-size:15px">${box.local_only ? "เครื่องนี้" : "ส่วนกลาง"}</b></div>
      </div>
      <div class="box-item-list">
        <b>สินค้าภายในกล่อง</b>
        ${items.length ? items.map((item) => `<div class="box-item"><span><b>${esc(item.product?.name || item.sku)}</b><small>${esc(item.product?.product_code || item.sku)}</small></span><b>${num(item.quantity)}</b></div>`).join("") : '<div class="box-item"><span>กล่องนี้ยังไม่มีสินค้า</span><b>0</b></div>'}
      </div>
      <div class="result-actions">
        <button class="btn primary" type="button" data-action="COUNT">ตรวจนับกล่อง</button>
        <a class="btn ghost" href="./box-qr-stock.html?tab=check&scan=${encodeURIComponent(data.code)}">เปิดรายละเอียดกล่อง</a>
      </div>`;
  }

  function renderError(code, text) {
    $("resultPanel").className = "result-panel";
    $("resultPanel").innerHTML = `<div class="empty-result"><span>!</span><h2>ไม่พบข้อมูล</h2><p>${esc(text)}</p><div class="result-code">${esc(code)}</div></div>`;
  }

  async function searchByText(text) {
    const keyword = safeFilterValue(text);
    if (!keyword) return;
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
    state.mode = mode;
    document.querySelectorAll(".mode-btn").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
    const help = {
      LOOKUP: "สแกนแล้วแสดงสินค้า กล่อง และสต็อกทันที",
      RECEIVE: "สแกนแล้วเปิดหน้าตรวจรับพร้อมใส่รหัสให้",
      BOX: "สแกนแล้วเปิดหน้าจัดกล่องพร้อมใส่รหัสให้",
    };
    $("cameraHelp").textContent = help[mode];
    setMessage(mode === "LOOKUP" ? "โหมดดูข้อมูล ไม่เปลี่ยนยอดสต็อก" : "เมื่อสแกน ระบบจะเปิดหน้าทำรายการเพื่อให้ยืนยัน", "info");
  }

  function goBack() {
    stopCamera();
    if (window.TKNSafeBack?.go) {
      window.TKNSafeBack.go({ fallback: "./box-qr-stock.html" });
      return;
    }
    location.href = "./box-qr-stock.html";
  }

  function bindEvents() {
    $("backBtn").addEventListener("click", goBack);
    $("startCameraBtn").addEventListener("click", startCamera);
    $("bottomScanBtn").addEventListener("click", () => { window.scrollTo({ top: 0, behavior: "smooth" }); if (!state.controls) startCamera(); });
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
    $("resultPanel").addEventListener("click", (event) => {
      if (event.target.closest('[data-action="COUNT"]')) openCountPanel();
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
      const access = await window.TKNAuthGuard.requireAccess("inventory.view", { loadingText: "กำลังตรวจสอบสิทธิ์สแกนสต็อก..." });
      if (!access) return;
      bindEvents();
      loadRecent();
      window.TKNAuthGuard.ready();
      setMessage("พร้อมใช้งาน QR Code เป็นรหัสหลักสำหรับตรวจสินค้าและสต็อก", "success");
      const initial = new URLSearchParams(location.search).get("scan");
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
