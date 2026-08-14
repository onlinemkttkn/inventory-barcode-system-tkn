(() => {
  "use strict";

  const VERSION = "5.31.25";
  const $ = (id) => document.getElementById(id);
  const PATTERN = window.TKNProductPattern;
  const RECENT_KEY = "tkn_mobile_stock_recent_v5315";
  const COUNT_KEY = "tkn_mobile_stock_count_drafts_v514";
  const BRANCH_KEY = "tkn_working_branch_v5315";
  const state = {
    mode: "LOOKUP", access: null, branches: [], current: null, recent: [], busy: false,
    reader: null, controls: null, track: null, torchOn: false, lastCode: "", lastAt: 0,
    catalog: [], catalogCategories: [],
  };

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = (v) => Number(v || 0).toLocaleString("th-TH");
  const money = (v) => new Intl.NumberFormat("th-TH", { style:"currency", currency:"THB", minimumFractionDigits:2 }).format(Number(v || 0));
  const normalizeRpc = (data) => Array.isArray(data) ? data[0] : data;
  const permissions = () => new Set(Array.isArray(state.access?.permissions) ? state.access.permissions : []);
  const role = () => String(state.access?.role || "").toLowerCase();
  const can = (p) => ["owner","admin"].includes(role()) || permissions().has(p);
  const selectedBranchId = () => $("workingBranch").value || "";
  const selectedBranch = () => state.branches.find((b) => b.id === selectedBranchId()) || null;

  function setMessage(text = "", type = "") {
    $("mobileMessage").textContent = text;
    $("mobileMessage").className = `message ${type}`.trim();
  }
  function setCameraStatus(text, active = false) {
    $("cameraStatus").textContent = text;
    $("cameraStatus").classList.toggle("active", active);
  }
  function normalizeCode(raw) {
    let value = String(raw || "").trim();
    if (!value) return "";
    try {
      const u = new URL(value);
      value = u.searchParams.get("id") || u.searchParams.get("code") || decodeURIComponent(u.pathname.split("/").filter(Boolean).at(-1) || value);
    } catch (_) {}
    return value.trim();
  }
  function safeFilter(v) { return String(v || "").replace(/[%_,()]/g, "").trim(); }
  function feedback(ok = true) {
    navigator.vibrate?.(ok ? 70 : [80,60,120]);
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220; gain.gain.setValueAtTime(.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .12);
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .13);
    } catch (_) {}
  }

  function loadRecent() {
    try { state.recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (_) { state.recent = []; }
    renderRecent();
  }
  function addRecent(item) {
    const entry = { ...item, at:new Date().toISOString() };
    state.recent = [entry, ...state.recent.filter((x) => x.code !== entry.code)].slice(0, 20);
    localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent)); renderRecent();
  }
  function renderRecent() {
    $("recentList").innerHTML = state.recent.length ? state.recent.map((x) => `
      <button class="recent-item" type="button" data-code="${esc(x.code)}">
        <span><b>${esc(x.name || x.code)}</b><small>${esc(x.type)} · ${new Date(x.at).toLocaleString("th-TH")}</small></span><b>›</b>
      </button>`).join("") : '<p class="muted">ยังไม่มีรายการ</p>';
  }

  async function loadBranches() {
    const { data, error } = await supabaseClient.from("branches").select("id,code,name,branch_type,is_active").eq("is_active", true).order("sort_order");
    if (error) throw error;
    state.branches = data || [];
    const saved = localStorage.getItem(BRANCH_KEY);
    $("workingBranch").innerHTML = '<option value="">เลือกสาขา</option>' + state.branches.map((b) => `<option value="${b.id}">${esc(b.code)} · ${esc(b.name)}</option>`).join("");
    if (saved && state.branches.some((b) => b.id === saved)) {
      $("workingBranch").value = saved;
    } else {
      const main = state.branches.find((b) => String(b.code || "").toUpperCase() === "BR001");
      if (main) {
        $("workingBranch").value = main.id;
        localStorage.setItem(BRANCH_KEY, main.id);
      } else if (state.branches.length === 1) {
        $("workingBranch").value = state.branches[0].id;
      }
    }
  }

  async function startCamera() {
    if (!window.ZXingBrowser) return setMessage("โหลดระบบกล้องไม่สำเร็จ", "error");
    try {
      $("startCameraBtn").disabled = true; setCameraStatus("กำลังเปิดกล้อง...");
      state.reader ||= new ZXingBrowser.BrowserMultiFormatReader();
      const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
      if (!devices.length) throw new Error("ไม่พบกล้องในโทรศัพท์");
      const preferred = devices.find((d) => /back|rear|environment|หลัง/i.test(d.label)) || devices.at(-1);
      state.controls = await state.reader.decodeFromConstraints({ video:{ deviceId:preferred?.deviceId ? { exact:preferred.deviceId } : undefined, facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false }, $("cameraVideo"), async (result) => {
        if (!result) return;
        const code = normalizeCode(result.getText()); const now = Date.now();
        if (!code) return;
        if (code === state.lastCode && now - state.lastAt < 1800) return;
        state.lastCode = code; state.lastAt = now;
        await handleCode(code, true);
      });
      const stream = $("cameraVideo").srcObject; state.track = stream?.getVideoTracks?.()[0] || null;
      const caps = state.track?.getCapabilities?.() || {}; $("torchBtn").hidden = !caps.torch;
      $("cameraPlaceholder").hidden = true; $("stopCameraBtn").disabled = false; setCameraStatus("กำลังสแกน", true); setMessage("เปิดกล้องแล้ว", "success");
    } catch (e) { $("startCameraBtn").disabled = false; setCameraStatus("เปิดกล้องไม่สำเร็จ"); setMessage(e.message || "เปิดกล้องไม่ได้", "error"); }
  }
  function stopCamera() {
    try { state.controls?.stop?.(); } catch (_) {}
    state.controls = null; const stream = $("cameraVideo").srcObject; stream?.getTracks?.().forEach((t) => t.stop());
    $("cameraVideo").srcObject = null; state.track = null; state.torchOn = false;
    $("torchBtn").hidden = true; $("torchBtn").textContent = "เปิดไฟฉาย"; $("cameraPlaceholder").hidden = false;
    $("startCameraBtn").disabled = false; $("stopCameraBtn").disabled = true; setCameraStatus("หยุดกล้องแล้ว");
  }
  async function toggleTorch() {
    if (!state.track) return;
    try { state.torchOn = !state.torchOn; await state.track.applyConstraints({ advanced:[{ torch:state.torchOn }] }); $("torchBtn").textContent = state.torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"; }
    catch (_) { state.torchOn = false; setMessage("โทรศัพท์รุ่นนี้ไม่อนุญาตให้เปิดไฟฉาย", "info"); }
  }

  async function handleCode(raw, fromCamera = false) {
    const code = normalizeCode(raw); if (!code) return;
    if (state.busy) return;
    state.busy = true; setMessage(`กำลังตรวจสอบ ${code}...`, "info");
    try {
      if (state.mode === "ISSUE_BOX" && !/^TKN-B-/i.test(code)) throw new Error("โหมดเบิกกล่องรับเฉพาะ QR กล่อง TKN-B");
      if (/^TKN-B-/i.test(code)) await lookupBox(code); else await lookupProduct(code);
      feedback(true);
      if (fromCamera && state.mode === "LOOKUP") setMessage("พบข้อมูลแล้ว พร้อมสแกนรายการถัดไป", "success");
      if (state.mode === "ISSUE_BOX" && state.current?.type === "BOX") openBoxActionDialog();
    } catch (e) { console.error(e); feedback(false); setMessage(e.message || "ตรวจสอบไม่สำเร็จ", "error"); renderError(code, e.message || "ไม่พบข้อมูล"); }
    finally { state.busy = false; }
  }

  async function lookupProduct(rawCode) {
    const candidates = (PATTERN?.scanCandidates?.(rawCode) || [String(rawCode).replace(/^TKN-P-/i, "")]).map(safeFilter).filter(Boolean);
    const filter = [...new Set(candidates.flatMap((v) => [`barcode.eq.${v}`,`product_code.eq.${v}`]))].join(",");
    let result = await supabaseClient.from("product_list").select("id,product_code,barcode,name,category_name,unit_name,cost_price,selling_price,quantity,minimum_stock,is_active").or(filter).limit(1).maybeSingle();
    let product = result.data;
    if (!product) { result = await supabaseClient.from("products").select("id,product_code,barcode,name,cost_price,selling_price,quantity,minimum_stock,is_active").or(filter).limit(1).maybeSingle(); if (result.error) throw result.error; product = result.data; }
    if (!product) throw new Error(`ไม่พบสินค้า ${candidates[0] || rawCode}`);

    let positions = [];
    const positionResult = await supabaseClient.from("tkn_v5261_product_stock_position").select("*").eq("product_id", product.id).order("branch_name");
    if (!positionResult.error) positions = positionResult.data || [];
    if (!positions.length) {
      const fallback = await supabaseClient.from("branch_inventory_list").select("*").eq("product_id", product.id).order("branch_name");
      positions = (fallback.data || []).map((r) => ({ ...r, stock_remaining:r.quantity, in_box:0, outside_box_available:r.quantity, in_transit_to_branch:0, sold_quantity:0 }));
    }
    const boxResult = await supabaseClient.from("tkn_v5261_box_item_locations").select("box_id,quantity,box_code,status,location_text,location_state,branch_id,branch_name").eq("product_id", product.id);
    const boxes = boxResult.error ? [] : (boxResult.data || []);
    const total = positions.reduce((s,r) => s + Number(r.stock_remaining || 0), 0);
    state.current = { type:"PRODUCT", code:product.product_code, product, positions, boxes, systemTotal:total };
    renderProduct(state.current); addRecent({ type:"สินค้า", code:product.product_code, name:product.name });
  }

  async function lookupBox(boxCode) {
    const { data, error } = await supabaseClient.rpc("tkn_v5315_get_box_context", { p_box_code:boxCode });
    if (error) {
      if (/function .* does not exist|schema cache/i.test(error.message || "")) throw new Error("กรุณารัน SQL v5.31.5 ก่อนใช้งานประเภทกล่องและเบิกเข้า POS");
      throw error;
    }
    const ctx = normalizeRpc(data); if (!ctx?.box) throw new Error(`ไม่พบกล่อง ${boxCode}`);
    state.current = { type:"BOX", code:boxCode, ...ctx, systemTotal:Number(ctx.total_quantity || 0) };
    renderBox(state.current); addRecent({ type:"กล่อง", code:boxCode, name:`กล่อง ${boxCode}` });
  }

  function renderProduct(d) {
    const p = d.product;
    $("resultPanel").className = "result-panel";
    $("resultPanel").innerHTML = `
      <div class="result-head"><div><span class="result-kind">สินค้า</span><h2>${esc(p.name)}</h2><div class="result-code">SKU ${esc(p.product_code)} · Barcode ${esc(p.barcode || "-")}</div></div><div class="price">${money(p.selling_price)}</div></div>
      <div class="stock-summary">
        <div class="stock-card primary"><span>คงเหลือทุกสาขา</span><b>${num(d.systemTotal)}</b></div>
        <div class="stock-card box"><span>อยู่ในกล่อง</span><b>${num(d.positions.reduce((s,r)=>s+Number(r.in_box||0),0))}</b></div>
        <div class="stock-card"><span>นอกกล่องพร้อมขาย</span><b>${num(d.positions.reduce((s,r)=>s+Number(r.outside_box_available||0),0))}</b></div>
        <div class="stock-card"><span>ขายแล้วสะสม</span><b>${num(d.positions.reduce((s,r)=>s+Number(r.sold_quantity||0),0))}</b></div>
      </div>
      <div class="location-list"><b>สถานะตามสาขา</b>${d.positions.length ? d.positions.map((r)=>`<div class="location-item"><span><b>${esc(r.branch_name || r.branch_code)}</b><small>ในกล่อง ${num(r.in_box)} · นอกกล่องพร้อมขาย ${num(r.outside_box_available)} · ระหว่างทางเข้า ${num(r.in_transit_to_branch)}</small></span><b>เหลือ ${num(r.stock_remaining)}</b></div>`).join("") : '<div class="location-item"><span>ไม่พบข้อมูลสาขา</span><b>-</b></div>'}</div>
      <div class="location-list"><b>อยู่ในกล่องใด</b>${d.boxes.length ? d.boxes.map((r)=>`<div class="location-item"><span><b>${esc(r.box_code)}</b><small>${esc(r.location_text || "ไม่ระบุตำแหน่ง")} · ${esc(locationLabel(r.location_state))}</small></span><b>${num(r.quantity)}</b></div>`).join("") : '<div class="location-item"><span>ไม่พบสินค้าในกล่อง</span><b>0</b></div>'}</div>
      <div class="result-actions"><button class="btn primary" type="button" data-action="COUNT">ตรวจนับจริง</button></div>`;
  }

  function locationLabel(v) { return ({WAREHOUSE:"อยู่ในคลัง",STOREFRONT:"อยู่หน้าร้าน",IN_TRANSIT:"ระหว่างส่ง",EMPTY:"กล่องว่าง"})[v] || v || "ไม่ระบุ"; }
  function locationClass(v) { return v === "IN_TRANSIT" ? "transit" : v === "STOREFRONT" ? "storefront" : v === "EMPTY" ? "empty" : ""; }
  function workflowCode(d) { return String(d?.classification?.workflow_status || "").trim().toUpperCase(); }
  function workflowLabel(v) {
    const code = String(v || "").trim().toUpperCase();
    return ({WAITING_STOCK:"รอตรวจรับเข้าสต็อก",IN_STOCK:"พร้อมเบิกขาย",REOPENED:"เบิกออกจากกล่องแล้ว",CANCELLED:"ยกเลิก"})[code] || code || "ไม่พบสถานะรับเข้า";
  }
  function boxIssueErrorText(error) {
    const raw = String(error?.message || error || "").trim();
    if (raw.includes("BOX_NOT_IN_STOCK")) return "กล่องยังไม่ได้ตรวจรับเข้าสต็อก กรุณาเข้าหน้า ‘ตรวจรับเข้าสต็อก’ และยืนยันกล่องนี้ก่อนเบิกขาย";
    if (raw.includes("BOX_BRANCH_MISMATCH")) return "กล่องอยู่คนละสาขากับสาขาที่เลือก กรุณาเลือกสาขาให้ตรงกับกล่อง";
    if (raw.includes("BOX_NOT_IN_WAREHOUSE")) return "กล่องไม่ได้อยู่ในคลัง จึงยังเบิกเข้า POS ไม่ได้";
    if (raw.includes("BOX_IN_TRANSIT")) return "กล่องอยู่ระหว่างโอนไปสาขาอื่น จึงยังเบิกเข้า POS ไม่ได้";
    if (raw.includes("BOX_SNAPSHOT_CHANGED")) return "ข้อมูลสินค้าปัจจุบันในกล่องไม่ตรงกับ Snapshot ตอนรับเข้าสต็อก ระบบยกเลิกรายการเพื่อป้องกันยอดผิด";
    if (raw.includes("POS_READY_CHECK_FAILED")) return "ตรวจพบว่ายอดพร้อมขายของ POS ไม่สอดคล้องกับสินค้าที่อยู่ในกล่อง ระบบ Rollback การเบิกแล้วและยังไม่เปลี่ยนสต็อก";
    if (raw.includes("PERMISSION_DENIED") || raw.includes("ไม่มีสิทธิ์เบิก")) return "บัญชีนี้ไม่มีสิทธิ์เบิกสินค้าเข้า POS";
    if (raw.includes("BOX_NOT_CLOSED") || raw.includes("ต้องปิดกล่องก่อนเบิก")) return "กล่องต้องปิดก่อนจึงจะเบิกเข้า POS ได้";
    if (raw.includes("BOX_EMPTY")) return "กล่องไม่มีสินค้าที่สามารถเบิกเข้า POS ได้";
    return raw || "เบิกทั้งกล่องเข้า POS ไม่สำเร็จ";
  }
  function showBoxActionError(text) {
    const host = $("boxActionButtons");
    if (!host) return setMessage(text, "error");
    host.querySelector("[data-box-issue-error]")?.remove();
    host.insertAdjacentHTML("afterbegin", `<div class="branch-warning" data-box-issue-error><b>ยังเบิกเข้า POS ไม่ได้</b><br>${esc(text)}</div>`);
    if (!$("boxActionDialog").open) $("boxActionDialog").showModal();
  }

  function renderBox(d) {
    const b = d.box; const items = d.items || []; const transfer = d.transfer;
    const cls = d.classification || {};
    const category = cls.box_type || cls.category_text || "ไม่ระบุประเภท";
    const zone = cls.zone_code || "-";
    $("resultPanel").className = "result-panel";
    $("resultPanel").innerHTML = `
      <div class="result-head"><div><span class="result-kind">QR กล่อง</span><h2>${esc(b.box_code)}</h2><div class="result-code">${esc(b.branch_name || "ยังไม่ระบุสาขา")} · ${esc(b.location_text || "ยังไม่ระบุตำแหน่ง")}</div></div><div class="price">${num(d.total_quantity)} ชิ้น</div></div>
      <div class="box-classification"><div><span>ประเภทกล่อง</span><b>${esc(category)}</b></div><div><span>โซน</span><b>${esc(zone)}</b></div><div><span>สถานะคลัง</span><b>${esc(cls.workflow_status || "-")}</b></div></div>
      <div class="stock-summary">
        <div class="stock-card primary"><span>รวมในกล่อง</span><b>${num(d.total_quantity)}</b></div>
        <div class="stock-card box"><span>จำนวน SKU</span><b>${num(d.total_sku)}</b></div>
        <div class="stock-card"><span>สถานะกล่อง</span><b class="stock-status-text">${esc(b.status)}</b></div>
        <div class="stock-card"><span>ตำแหน่ง</span><b class="stock-status-text"><span class="location-state ${locationClass(b.location_state)}">${esc(locationLabel(b.location_state))}</span></b></div>
      </div>
      ${transfer ? `<div class="transfer-banner"><b>${esc(transfer.transfer_no)} · ${esc(transfer.source_branch_name)} → ${esc(transfer.destination_branch_name)}</b><small>กล่องกำลังรอสาขาปลายทางสแกนรับทั้งใบ</small></div>` : ""}
      <div class="cost-strip"><div><span>ต้นทุนสินค้าในกล่อง</span><b>${money(d.cost_total)}</b></div><div><span>ราคาขายปกติรวม</span><b>${money(d.normal_price_total)}</b></div></div>
      <div class="box-item-list"><b>สินค้าภายในกล่อง</b>${items.length ? items.map((i)=>`<div class="box-item"><span><b>${esc(i.product_name || i.sku)}</b><small>${esc(i.sku)} · Barcode ${esc(i.barcode || "-")} · ทุน ${money(i.unit_cost)} · ขาย ${money(i.unit_price)}</small></span><b>${num(i.quantity)}</b></div>`).join("") : '<div class="box-item"><span>กล่องว่าง</span><b>0</b></div>'}</div>
      <div class="box-flow-actions">
        ${state.mode === "ISSUE_BOX" ? '<button class="btn primary" data-action="BOX_ACTION" type="button">เบิกทั้งกล่อง / รับกล่อง</button>' : ""}
        <button class="btn ghost" type="button" data-action="COUNT">ตรวจนับกล่อง</button>
      </div>`;
    if (state.mode === "ISSUE_BOX") {
      const wf = workflowCode(d);
      if (wf === "IN_STOCK") setMessage("ตรวจข้อมูลกล่องแล้ว กล่องผ่านตรวจรับและพร้อมเบิกทั้งกล่องเข้า POS", "success");
      else if (wf === "WAITING_STOCK") setMessage("กล่องนี้ยังรอตรวจรับเข้าสต็อก ต้องตรวจรับก่อนจึงจะเบิกเข้า POS ได้", "info");
      else setMessage(`กล่องนี้ยังไม่พร้อมเบิกเข้า POS · สถานะ ${workflowLabel(wf)}`, "info");
    }
  }

  function renderError(code, text) { $("resultPanel").className = "result-panel"; $("resultPanel").innerHTML = `<div class="empty-result"><span>!</span><h2>ไม่พบข้อมูล</h2><p>${esc(text)}</p><div class="result-code">${esc(code)}</div></div>`; }

  function boxSummaryHtml(d) {
    const b = d.box; const wf = workflowCode(d);
    return `<div class="dialog-summary-row"><span>กล่อง</span><b>${esc(b.box_code)}</b></div>
      <div class="dialog-summary-row"><span>สาขาปัจจุบัน</span><b>${esc(b.branch_name || "ยังไม่ระบุ")}</b></div>
      <div class="dialog-summary-row"><span>สินค้า</span><b>${num(d.total_sku)} SKU / ${num(d.total_quantity)} ชิ้น</b></div>
      <div class="dialog-summary-row"><span>ประเภทกล่อง</span><b>${esc(d.classification?.box_type || d.classification?.category_text || "ไม่ระบุประเภท")}</b></div>
      <div class="dialog-summary-row"><span>สถานะรับเข้า</span><b>${esc(workflowLabel(wf))}</b></div>
      <div class="dialog-summary-row"><span>ตำแหน่ง</span><b>${esc(locationLabel(b.location_state))}</b></div>`;
  }

  function requireBranch() {
    if (!selectedBranchId()) { setMessage("กรุณาเลือกสาขาที่กำลังทำรายการ", "error"); $("workingBranch").focus(); return false; }
    return true;
  }

  function openBoxActionDialog() {
    const d = state.current; if (!d || d.type !== "BOX" || !requireBranch()) return;
    const b = d.box; const selected = selectedBranch(); const buttons = [];
    $("boxActionTitle").textContent = b.location_state === "IN_TRANSIT" ? "รับกล่องจากสาขา" : "ต้องการเบิกกล่องไปที่ใด?";
    $("boxActionSummary").innerHTML = boxSummaryHtml(d);

    if (b.location_state === "IN_TRANSIT") {
      const isDestination = d.transfer?.destination_branch_id === selectedBranchId();
      if (isDestination && (can("inventory.box_transfer") || can("inventory.receive") || can("inventory.transfer"))) {
        buttons.push(`<button class="flow-action primary-action" type="button" data-box-action="RECEIVE"><b>ยืนยันรับกล่องทั้งใบ</b><small>รับ ${esc(d.transfer.transfer_no)} เข้าสาขา ${esc(selected?.name || "")}</small></button>`);
      } else {
        buttons.push(`<div class="branch-warning">กล่องนี้ต้องรับที่สาขา ${esc(d.transfer?.destination_branch_name || "ปลายทาง")} เท่านั้น</div>`);
      }
    } else if (String(b.status).toUpperCase() !== "CLOSED" || !d.items?.length) {
      buttons.push('<div class="branch-warning">กล่องต้องปิดและมีสินค้าก่อนจึงจะเบิกได้</div>');
    } else {
      const wf = workflowCode(d);
      if ((can("inventory.issue") || can("product.manage")) && wf === "IN_STOCK") {
        buttons.push('<button class="flow-action primary-action" type="button" data-box-action="ISSUE_WHOLE"><b>เบิกทั้งกล่องเข้า POS</b><small>ยืนยัน QR กล่องครั้งเดียว ระบบจะนำสินค้าทั้งหมดในกล่องออกเป็นสินค้าพร้อมขายหน้าร้าน</small></button>');
      } else if ((can("inventory.issue") || can("product.manage")) && wf === "WAITING_STOCK") {
        buttons.push(`<div class="branch-warning"><b>ยังเบิกขายไม่ได้</b><br>กล่องนี้ยังอยู่สถานะรอตรวจรับเข้าสต็อก</div><a class="flow-action primary-action" href="./stock-intake.html?scan=${encodeURIComponent(b.box_code)}"><b>ไปตรวจรับเข้าสต็อกก่อน</b><small>เปิดกล่อง ${esc(b.box_code)} ในหน้าตรวจรับ แล้วกลับมาเบิกเข้า POS</small></a>`);
      } else if ((can("inventory.issue") || can("product.manage")) && wf !== "IN_STOCK") {
        buttons.push(`<div class="branch-warning"><b>ยังเบิกขายไม่ได้</b><br>สถานะรับเข้า: ${esc(workflowLabel(wf))}</div>`);
      }
      if (can("inventory.box_transfer") || can("inventory.transfer")) buttons.push('<button class="flow-action" type="button" data-box-action="TRANSFER"><b>เบิกไปสาขา</b><small>สร้างใบโอนและส่งสินค้าไปพร้อมกล่องเดิมทั้งใบ</small></button>');
    }
    $("boxActionButtons").innerHTML = buttons.join("") || '<div class="branch-warning">บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับกล่อง</div>';
    $("boxActionDialog").showModal();
  }

  async function issueWholeBoxToStorefront() {
    const d = state.current; if (!d?.box || !requireBranch() || state.busy) return;
    const b = d.box;
    if (b.branch_id && b.branch_id !== selectedBranchId()) return showBoxActionError("กล่องอยู่คนละสาขากับสาขาที่เลือก");
    if (String(b.status || "").toUpperCase() !== "CLOSED" || !(d.items || []).length) return showBoxActionError("กล่องต้องปิดและมีสินค้าก่อนเบิก");
    if (workflowCode(d) !== "IN_STOCK") return showBoxActionError("กล่องนี้ยังไม่ได้ตรวจรับเข้าสต็อก กรุณาตรวจรับกล่องก่อนเบิกขาย");
    const totalQty = Number(d.total_quantity || 0);
    const totalSku = Number(d.total_sku || (d.items || []).length);
    if (!confirm(`ยืนยันเบิก ${b.box_code} ทั้งกล่องเข้า POS หน้าร้าน ${selectedBranch()?.name || ""}?\n${num(totalSku)} SKU / ${num(totalQty)} ชิ้น`)) return;
    $("boxActionDialog").open && $("boxActionDialog").close();
    $("receiveNextDialog").open && $("receiveNextDialog").close();
    state.busy = true;
    setMessage("กำลังเบิกสินค้าทั้งกล่องและตรวจสถานะพร้อมขายใน POS...", "info");
    try {
      const { data, error } = await supabaseClient.rpc("tkn_v5315_issue_whole_box_to_storefront", {
        p_box_code: b.box_code,
        p_branch_id: selectedBranchId()
      });
      if (error) throw error;
      const r = normalizeRpc(data);
      if (!r?.issued || !r?.pos_ready || !r?.whole_box) throw new Error("ระบบยังยืนยันสถานะพร้อมขาย POS ไม่สำเร็จ");
      const code = b.box_code;
      addRecent({ type:"เบิกทั้งกล่องเข้า POS", code, name:`${code} · ${num(r.total_sku || totalSku)} SKU / ${num(r.total_quantity || totalQty)} ชิ้น` });
      await lookupBox(code);
      $("resultPanel").insertAdjacentHTML("afterbegin",`<div class="pos-ready-banner"><div><b>พร้อมขาย POS แล้ว</b><small>${esc(code)} · ${num(r.total_sku || totalSku)} SKU / ${num(r.total_quantity || totalQty)} ชิ้น · ${esc(selectedBranch()?.name || "")}</small></div><a class="btn primary" href="./pos.html?branch=${encodeURIComponent(selectedBranchId())}">เปิด POS หน้าร้าน</a></div>`);
      setMessage(`เบิก ${code} ทั้งกล่องสำเร็จ สินค้าพร้อมขายใน POS แล้ว`, "success");
      feedback(true);
      await loadBoxCatalog(true);
    } catch (e) {
      console.error(e); feedback(false);
      const friendly = boxIssueErrorText(e);
      setMessage(friendly, "error");
      showBoxActionError(friendly);
    } finally {
      state.busy = false;
    }
  }

  function renderBoxCatalog() {
    const list = state.catalog || [];
    $("boxCatalogSummary").textContent = `พบ ${num(list.length)} กล่อง · เลือกประเภทหรือค้นหาเพื่อเปิดกล่อง`;
    $("boxCatalogList").innerHTML = list.length ? list.map((x)=>`<button class="box-catalog-item" type="button" data-box-code="${esc(x.box_code)}"><span><b>${esc(x.box_code)}</b><small>${esc(x.box_type || x.category_text || "ไม่ระบุประเภท")} · ${esc(x.zone_code || "ไม่ระบุโซน")} · ${num(x.total_quantity)} ชิ้น / ${num(x.sku_count)} SKU</small></span><strong>ตรวจ / เบิก ›</strong></button>`).join("") : '<p class="muted">ไม่พบกล่องที่พร้อมเบิกในเงื่อนไขนี้</p>';
  }
  async function loadBoxCatalog(silent=false) {
    if (state.mode !== "ISSUE_BOX" || !selectedBranchId()) { state.catalog=[]; renderBoxCatalog(); return; }
    if (!silent) $("boxCatalogSummary").textContent="กำลังโหลดกล่อง...";
    const {data,error}=await supabaseClient.rpc("tkn_v5315_box_catalog",{p_branch_id:selectedBranchId(),p_category:$("boxCategoryFilter").value||null,p_search:$("boxCatalogSearch").value.trim()||null,p_limit:200});
    if(error){ if(/function .* does not exist|schema cache/i.test(error.message||"")) throw new Error("กรุณารัน SQL v5.31.5 ก่อนใช้ค้นหากล่องตามประเภท"); throw error; }
    const r=normalizeRpc(data)||{}; state.catalog=Array.isArray(r.boxes)?r.boxes:[]; state.catalogCategories=Array.isArray(r.categories)?r.categories:[];
    const selected=$("boxCategoryFilter").value;
    $("boxCategoryFilter").innerHTML='<option value="">ทุกประเภท</option>'+state.catalogCategories.map((c)=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if(selected && state.catalogCategories.includes(selected)) $("boxCategoryFilter").value=selected;
    renderBoxCatalog();
  }

  function openTransferDialog() {
    const d = state.current; if (!d?.box || !requireBranch()) return;
    $("boxActionDialog").close(); $("transferSourceName").value = selectedBranch()?.name || "";
    $("transferDestination").innerHTML = '<option value="">เลือกสาขาปลายทาง</option>' + state.branches.filter((b)=>b.id !== selectedBranchId()).map((b)=>`<option value="${b.id}">${esc(b.code)} · ${esc(b.name)}</option>`).join("");
    $("transferNotes").value = ""; $("transferDialog").showModal();
  }

  async function transferCurrentBox(event) {
    event.preventDefault(); const d = state.current; const dest = $("transferDestination").value;
    if (!d?.box || !requireBranch() || !dest) return setMessage("กรุณาเลือกสาขาปลายทาง", "error");
    if (!confirm(`ยืนยันส่งกล่อง ${d.box.box_code} ไป ${state.branches.find((b)=>b.id===dest)?.name || "สาขาปลายทาง"} ทั้งใบ?`)) return;
    state.busy = true; setMessage("กำลังสร้างใบโอนทั้งกล่อง...", "info");
    try {
      const { data, error } = await supabaseClient.rpc("tkn_v5261_transfer_whole_box", { p_box_code:d.box.box_code, p_source_branch_id:selectedBranchId(), p_destination_branch_id:dest, p_notes:$("transferNotes").value.trim() || null });
      if (error) throw error; const r = normalizeRpc(data); $("transferDialog").close();
      setMessage(`ส่งกล่อง ${r.box_code} สำเร็จ · ใบโอน ${r.transfer_no}`, "success"); addRecent({ type:"ส่งสาขา", code:r.box_code, name:r.transfer_no }); await lookupBox(r.box_code); feedback(true);
    } catch (e) { feedback(false); setMessage(e.message || "ส่งกล่องไม่สำเร็จ", "error"); }
    finally { state.busy = false; }
  }

  async function receiveCurrentBox() {
    const d = state.current; if (!d?.box || !requireBranch()) return;
    if (!confirm(`ยืนยันรับกล่อง ${d.box.box_code} ทั้งใบเข้าสาขา ${selectedBranch()?.name || ""}?`)) return;
    $("boxActionDialog").close(); state.busy = true; setMessage("กำลังรับกล่องทั้งใบ...", "info");
    try {
      const { data, error } = await supabaseClient.rpc("tkn_v5261_receive_whole_box", { p_box_code:d.box.box_code, p_receiving_branch_id:selectedBranchId() });
      if (error) throw error; const r = normalizeRpc(data);
      setMessage(`รับกล่อง ${r.box_code} สำเร็จ · ${r.transfer_no}`, "success"); addRecent({ type:"รับกล่อง", code:r.box_code, name:r.transfer_no }); await lookupBox(r.box_code); $("receiveNextDialog").showModal(); feedback(true);
    } catch (e) { feedback(false); setMessage(e.message || "รับกล่องไม่สำเร็จ", "error"); }
    finally { state.busy = false; }
  }

  async function searchByText(text) {
    const q = safeFilter(text); if (!q) return;
    if (state.mode === "ISSUE_BOX") { if (!/^TKN-B-/i.test(q)) throw new Error("โหมดเบิกกล่องรับเฉพาะ QR TKN-B"); $("searchSuggestions").hidden = true; return handleCode(q); }
    if (/^TKN-[PB]-/i.test(q) || /^\d{6,}$/.test(q)) { $("searchSuggestions").hidden = true; return handleCode(q); }
    const { data, error } = await supabaseClient.from("product_list").select("product_code,barcode,name,selling_price,quantity").or(`name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.eq.${q}`).limit(12);
    if (error) throw error; if (!data?.length) throw new Error(`ไม่พบสินค้า ${q}`);
    $("searchSuggestions").innerHTML = data.map((x)=>`<button class="suggestion" type="button" data-code="${esc(x.product_code)}"><b>${esc(x.name)}</b><small>${esc(x.product_code)} · ${money(x.selling_price)} · คงเหลือ ${num(x.quantity)}</small></button>`).join(""); $("searchSuggestions").hidden = false;
  }

  function openCountPanel() {
    if (!state.current) return; $("systemQty").value = Number(state.current.systemTotal || 0); $("countedQty").value = Number(state.current.systemTotal || 0); $("countNote").value = ""; $("countPanel").hidden = false; $("countedQty").focus();
  }
  function saveCountDraft() {
    if (!state.current) return; const counted = Number($("countedQty").value); if (!Number.isFinite(counted) || counted < 0) return setMessage("จำนวนตรวจจริงไม่ถูกต้อง", "error");
    let drafts=[]; try { drafts=JSON.parse(localStorage.getItem(COUNT_KEY)||"[]"); } catch (_) {}
    drafts.unshift({ code:state.current.code,type:state.current.type,system_qty:Number(state.current.systemTotal||0),counted_qty:counted,variance:counted-Number(state.current.systemTotal||0),note:$("countNote").value.trim(),created_at:new Date().toISOString() });
    localStorage.setItem(COUNT_KEY,JSON.stringify(drafts.slice(0,300))); $("countPanel").hidden=true; setMessage("บันทึกร่างตรวจนับแล้ว", "success");
  }

  function setMode(mode) {
    if (mode === "ISSUE_BOX" && !(can("inventory.issue") || can("inventory.box_transfer") || can("inventory.transfer") || can("inventory.receive") || can("product.manage"))) return setMessage("บัญชีนี้ไม่มีสิทธิ์เบิกหรือรับกล่อง", "error");
    state.mode = mode; document.querySelectorAll(".mode-btn").forEach((b)=>b.classList.toggle("active",b.dataset.mode===mode));
    $("boxFinderPanel").hidden = mode !== "ISSUE_BOX";
    $("cameraHelp").textContent = mode === "LOOKUP" ? "สแกนสินค้า Barcode หรือ QR กล่อง เพื่อดูจำนวนและตำแหน่ง" : "สแกน QR กล่อง หรือค้นหาตามประเภท แล้วเบิกทั้งกล่องเข้า POS";
    $("manualCode").placeholder = mode === "ISSUE_BOX" ? "สแกนหรือกรอก QR กล่อง TKN-B-..." : "SKU, Barcode, TKN-P-... หรือ TKN-B-...";
    $("searchSuggestions").hidden = true; $("countPanel").hidden = true;
    if (state.current?.type === "BOX") renderBox(state.current);
    setMessage(mode === "LOOKUP" ? "โหมดดูสต็อก ไม่เปลี่ยนข้อมูล" : "โหมดเบิกกล่อง: ค้นหาตามประเภท แล้วเบิกสินค้าทั้งกล่องเข้า POS ได้ทันที", "info");
    if (mode === "ISSUE_BOX" && selectedBranchId()) loadBoxCatalog().catch((e)=>setMessage(e.message,"error"));
  }

  function bindEvents() {
    $("backBtn").onclick = () => { stopCamera(); window.TKNSafeBack?.go?.({ fallback:"./dashboard.html" }) || (location.href="./dashboard.html"); };
    $("workingBranch").onchange = () => {
      localStorage.setItem(BRANCH_KEY, selectedBranchId()); sessionStorage.setItem("tkn_inventory_branch_id", selectedBranchId());
      setMessage(selectedBranchId() ? `เลือกสาขา ${selectedBranch()?.name}` : "กรุณาเลือกสาขา", selectedBranchId()?"success":"info");
      if(state.mode==="ISSUE_BOX"&&selectedBranchId())loadBoxCatalog().catch((e)=>setMessage(e.message,"error"));
    };
    $("startCameraBtn").onclick=startCamera; $("stopCameraBtn").onclick=stopCamera; $("torchBtn").onclick=toggleTorch;
    document.querySelectorAll(".mode-btn").forEach((b)=>b.onclick=()=>setMode(b.dataset.mode));
    $("manualSearchForm").onsubmit=async(e)=>{e.preventDefault();try{await searchByText($("manualCode").value)}catch(err){setMessage(err.message,"error")}};
    $("searchSuggestions").onclick=async(e)=>{const b=e.target.closest("[data-code]");if(!b)return;$("manualCode").value=b.dataset.code;$("searchSuggestions").hidden=true;await handleCode(b.dataset.code)};
    $("resultPanel").onclick=(e)=>{if(e.target.closest('[data-action="COUNT"]'))openCountPanel();if(e.target.closest('[data-action="BOX_ACTION"]'))openBoxActionDialog()};
    $("boxActionButtons").onclick=(e)=>{const a=e.target.closest("[data-box-action]")?.dataset.boxAction;if(a==="ISSUE_WHOLE")issueWholeBoxToStorefront();if(a==="TRANSFER")openTransferDialog();if(a==="RECEIVE")receiveCurrentBox()};
    $("transferForm").onsubmit=transferCurrentBox; $("transferClose").onclick=$("transferCancel").onclick=()=>$("transferDialog").close();
    $("receiveNextDialog").onclick=(e)=>{const n=e.target.closest("[data-next]")?.dataset.next;if(n==="ISSUE"){e.preventDefault();$("receiveNextDialog").close();issueWholeBoxToStorefront()}if(n==="FORWARD"){e.preventDefault();$("receiveNextDialog").close();openTransferDialog()}};
    $("refreshBoxCatalogBtn").onclick=()=>loadBoxCatalog().catch((e)=>setMessage(e.message,"error"));
    $("searchBoxCatalogBtn").onclick=()=>loadBoxCatalog().catch((e)=>setMessage(e.message,"error"));
    $("boxCategoryFilter").onchange=()=>loadBoxCatalog(true).catch((e)=>setMessage(e.message,"error"));
    $("boxCatalogSearch").addEventListener("keydown",(e)=>{if(e.key==="Enter"){e.preventDefault();loadBoxCatalog().catch((err)=>setMessage(err.message,"error"))}});
    $("boxCatalogList").onclick=async(e)=>{const b=e.target.closest("[data-box-code]");if(!b)return;$("manualCode").value=b.dataset.boxCode;await handleCode(b.dataset.boxCode)};
    $("saveCountDraftBtn").onclick=saveCountDraft; $("cancelCountBtn").onclick=()=>$("countPanel").hidden=true;
    $("clearRecentBtn").onclick=()=>{if(confirm("ล้างรายการสแกนล่าสุด?")){state.recent=[];localStorage.removeItem(RECENT_KEY);renderRecent()}};
    $("recentList").onclick=async(e)=>{const b=e.target.closest("[data-code]");if(b)await handleCode(b.dataset.code)};
    document.addEventListener("visibilitychange",()=>{if(document.hidden)stopCamera()}); window.addEventListener("pagehide",stopCamera);
  }

  async function initialize() {
    try {
      if (!window.TKNAuthGuard || !window.supabaseClient) throw new Error("ไฟล์ระบบโหลดไม่ครบ");
      const access = await window.TKNAuthGuard.requireAccess(null,{loadingText:"กำลังตรวจสอบสิทธิ์..."}); if(!access)return;
      state.access=access;
      if (!["owner","admin"].includes(role()) && !["inventory.view","inventory.issue","inventory.transfer","inventory.receive","inventory.box_transfer","product.manage"].some((p)=>permissions().has(p))) { location.replace(access.landing_page||"./dashboard.html"); return; }
      await loadBranches(); bindEvents(); loadRecent(); window.TKNAuthGuard.ready();
      const params=new URLSearchParams(location.search); if(/^(issue|issue_box)$/i.test(params.get("mode")||""))setMode("ISSUE_BOX");
      if(params.get("branch")&&state.branches.some((b)=>b.id===params.get("branch"))){$("workingBranch").value=params.get("branch");localStorage.setItem(BRANCH_KEY,params.get("branch"))}
      if(selectedBranchId())sessionStorage.setItem("tkn_inventory_branch_id",selectedBranchId());
      if(state.mode==="ISSUE_BOX"&&selectedBranchId()) await loadBoxCatalog(true);
      if(params.get("scan")){ $("manualCode").value=params.get("scan"); await handleCode(params.get("scan")); }
      else setMessage(selectedBranchId()?"พร้อมใช้งาน":"กรุณาเลือกสาขาก่อนทำรายการ",selectedBranchId()?"success":"info");
    } catch(e) { console.error(e); window.TKNAuthGuard?.fail(e,()=>location.reload()); }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();
})();
