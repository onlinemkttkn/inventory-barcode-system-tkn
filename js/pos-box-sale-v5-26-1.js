(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = "tkn_box_sale_draft_v5261";
  const state = { access:null, branches:[], draftId:null, preview:null, reader:null, controls:null, track:null, torchOn:false, busy:false, lastCode:"", lastAt:0 };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num = (v) => Number(v || 0).toLocaleString("th-TH");
  const money = (v) => new Intl.NumberFormat("th-TH", {style:"currency",currency:"THB",minimumFractionDigits:2}).format(Number(v || 0));
  const normalize = (d) => Array.isArray(d) ? d[0] : d;
  const perms = () => new Set(Array.isArray(state.access?.permissions) ? state.access.permissions : []);
  const role = () => String(state.access?.role || "").toLowerCase();
  const can = (p) => ["owner","admin"].includes(role()) || perms().has(p);
  const branchId = () => $("saleBranch").value || "";
  const pricingMode = () => document.querySelector('input[name="pricingMode"]:checked')?.value || "SKU";

  function message(text="", type="") { $("message").textContent=text; $("message").className=`message ${type}`.trim(); }
  function cameraStatus(text, active=false) { $("cameraStatus").textContent=text; $("cameraStatus").classList.toggle("active",active); }
  function normalizeCode(raw) {
    let v=String(raw||"").trim(); if(!v)return "";
    try { const u=new URL(v); v=u.searchParams.get("id")||u.searchParams.get("code")||decodeURIComponent(u.pathname.split("/").filter(Boolean).at(-1)||v); } catch(_) {}
    return v.trim();
  }
  function feedback(ok=true) { navigator.vibrate?.(ok?70:[80,60,120]); }

  async function loadBranches() {
    const {data,error}=await supabaseClient.from("branches").select("id,code,name,is_active").eq("is_active",true).order("sort_order");
    if(error)throw error; state.branches=data||[];
    $("saleBranch").innerHTML='<option value="">เลือกสาขา</option>'+state.branches.map((b)=>`<option value="${b.id}">${esc(b.code)} · ${esc(b.name)}</option>`).join("");
    const params=new URLSearchParams(location.search); const requested=params.get("branch");
    if(requested&&state.branches.some((b)=>b.id===requested))$("saleBranch").value=requested;
    else { const saved=sessionStorage.getItem("tkn_inventory_branch_id"); if(saved&&state.branches.some((b)=>b.id===saved))$("saleBranch").value=saved; else if(state.branches.length===1)$("saleBranch").value=state.branches[0].id; }
    if(branchId())sessionStorage.setItem("tkn_inventory_branch_id",branchId());
  }

  async function startCamera() {
    if(!window.ZXingBrowser)return message("โหลดระบบกล้องไม่สำเร็จ","error");
    try {
      $("startCameraBtn").disabled=true; cameraStatus("กำลังเปิดกล้อง..."); state.reader||=new ZXingBrowser.BrowserMultiFormatReader();
      const devices=await ZXingBrowser.BrowserCodeReader.listVideoInputDevices(); if(!devices.length)throw new Error("ไม่พบกล้อง");
      const preferred=devices.find((d)=>/back|rear|environment|หลัง/i.test(d.label))||devices.at(-1);
      state.controls=await state.reader.decodeFromConstraints({video:{deviceId:preferred?.deviceId?{exact:preferred.deviceId}:undefined,facingMode:{ideal:"environment"}},audio:false},$("cameraVideo"),async(result)=>{
        if(!result)return; const code=normalizeCode(result.getText()); const now=Date.now();
        if(!code||(code===state.lastCode&&now-state.lastAt<1800))return; state.lastCode=code; state.lastAt=now; await addBox(code);
      });
      const stream=$("cameraVideo").srcObject; state.track=stream?.getVideoTracks?.()[0]||null; const caps=state.track?.getCapabilities?.()||{};
      $("torchBtn").hidden=!caps.torch; $("cameraPlaceholder").hidden=true; $("stopCameraBtn").disabled=false; cameraStatus("กำลังสแกน",true); message("สแกน QR กล่องต่อเนื่องได้เลย","success");
    } catch(e) { $("startCameraBtn").disabled=false; cameraStatus("เปิดกล้องไม่สำเร็จ"); message(e.message||"เปิดกล้องไม่ได้","error"); }
  }
  function stopCamera() {
    try{state.controls?.stop?.()}catch(_){} state.controls=null; const stream=$("cameraVideo").srcObject; stream?.getTracks?.().forEach((t)=>t.stop());
    $("cameraVideo").srcObject=null;state.track=null;state.torchOn=false;$("torchBtn").hidden=true;$("cameraPlaceholder").hidden=false;$("startCameraBtn").disabled=false;$("stopCameraBtn").disabled=true;cameraStatus("หยุดกล้องแล้ว");
  }
  async function toggleTorch(){if(!state.track)return;try{state.torchOn=!state.torchOn;await state.track.applyConstraints({advanced:[{torch:state.torchOn}]});$("torchBtn").textContent=state.torchOn?"ปิดไฟฉาย":"เปิดไฟฉาย"}catch(_){message("อุปกรณ์นี้เปิดไฟฉายจากเบราว์เซอร์ไม่ได้","info")}}

  async function ensureDraft() {
    if(state.draftId)return state.draftId;
    if(!branchId())throw new Error("กรุณาเลือกสาขาที่ขาย");
    const {data,error}=await supabaseClient.rpc("tkn_v5261_box_sale_start",{p_branch_id:branchId()}); if(error)throw error;
    state.draftId=normalize(data); localStorage.setItem(DRAFT_KEY,JSON.stringify({id:state.draftId,branch_id:branchId(),user_id:state.access.user_id}));
    $("saleBranch").disabled=true; return state.draftId;
  }

  async function addBox(raw) {
    const code=normalizeCode(raw); if(state.busy)return; if(!/^TKN-B-/i.test(code))return message("รับเฉพาะ QR กล่อง TKN-B","error");
    state.busy=true; message(`กำลังเพิ่มกล่อง ${code}...`,"info");
    try {
      const draft=await ensureDraft(); const {data,error}=await supabaseClient.rpc("tkn_v5261_box_sale_add_box",{p_draft_id:draft,p_box_code:code}); if(error)throw error;
      state.preview=normalize(data); render(); $("manualCode").value=""; message(`เพิ่มกล่อง ${code} แล้ว · รวม ${state.preview.box_count} กล่อง`,"success"); feedback(true);
    } catch(e) { message(e.message||"เพิ่มกล่องไม่สำเร็จ","error"); feedback(false); }
    finally { state.busy=false; }
  }

  async function removeBox(code) {
    if(!state.draftId||!confirm(`นำกล่อง ${code} ออกจากรายการขาย?`))return;
    const {data,error}=await supabaseClient.rpc("tkn_v5261_box_sale_remove_box",{p_draft_id:state.draftId,p_box_code:code});
    if(error)return message(error.message,"error"); state.preview=normalize(data);render();message(`นำกล่อง ${code} ออกจากรายการแล้ว`,"success");
  }

  function currentSaleTotal() { return pricingMode()==="LUMP" ? Number($("lumpPrice").value||0) : Number(state.preview?.normal_price_total||0); }
  function updateTotals() {
    const cost=Number(state.preview?.cost_total||0), normal=Number(state.preview?.normal_price_total||0), sale=currentSaleTotal(), profit=sale-cost, margin=sale>0?(profit/sale)*100:0;
    $("costTotal").textContent=money(cost);$("normalTotal").textContent=money(normal);$("saleTotal").textContent=money(sale);$("profitTotal").textContent=money(profit);$("marginText").textContent=`อัตรากำไร ${margin.toFixed(2)}%`;
    const warning=$("priceWarning"); warning.hidden=true; warning.className="price-warning";
    if(pricingMode()==="LUMP"&&sale<cost){warning.hidden=false;warning.classList.add("danger");warning.textContent=can("pos.box_sale.below_cost")?"ราคาต่ำกว่าต้นทุน ระบบจะบันทึกขาดทุนตามจริง":"ราคาต่ำกว่าต้นทุน ต้องให้ Owner หรือ Admin เป็นผู้ขาย"}
    else if(pricingMode()==="LUMP"&&sale<normal){warning.hidden=false;warning.textContent=`ส่วนลดจากราคาปกติ ${money(normal-sale)}`}
    $("checkoutBtn").disabled=!state.preview?.box_count||sale<0||(pricingMode()==="LUMP"&&!can("pos.box_sale.lump_price"));
    if($("paymentMethod").value!=="CASH")$("receivedAmount").value=sale.toFixed(2);
  }

  function render() {
    const p=state.preview||{boxes:[],items:[],box_count:0,sku_count:0,total_quantity:0,cost_total:0,normal_price_total:0};
    $("boxCount").textContent=num(p.box_count);$("skuCount").textContent=num(p.sku_count);$("qtyCount").textContent=num(p.total_quantity);
    $("boxList").innerHTML=p.boxes?.length?p.boxes.map((b)=>`<div class="data-row"><span><b>${esc(b.box_code)}</b><small>${num(b.sku_count)} SKU · ${num(b.total_quantity)} ชิ้น</small></span><div class="data-row-actions"><b>กล่องพร้อมขาย</b><button class="remove-box" data-remove-box="${esc(b.box_code)}" type="button">นำออก</button></div></div>`).join(""):'<div class="empty-list">ยังไม่ได้สแกนกล่อง</div>';
    $("skuList").innerHTML=p.items?.length?p.items.map((i)=>`<div class="data-row"><span><b>${esc(i.product_name||i.sku)}</b><small>${esc(i.sku)} · ทุน ${money(i.unit_cost)} · ราคาขาย ${money(i.unit_price)}</small></span><div class="data-row-actions"><b>${num(i.quantity)} ชิ้น</b><small>${money(i.normal_total)}</small></div></div>`).join(""):'<div class="empty-list">ยังไม่มีสินค้า</div>';
    updateTotals();
  }

  async function resetDraft(confirmFirst=true) {
    if(confirmFirst&&state.preview?.box_count&&!confirm("ยกเลิกร่างปัจจุบันและเริ่มรายการใหม่?"))return;
    if(state.draftId){try{await supabaseClient.rpc("tkn_v5261_box_sale_cancel",{p_draft_id:state.draftId})}catch(_){}}
    state.draftId=null;state.preview=null;localStorage.removeItem(DRAFT_KEY);$("saleBranch").disabled=false;$("lumpPrice").value="";render();message("พร้อมเริ่มรายการใหม่","success");
  }

  async function restoreDraft() {
    let saved=null;try{saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||"null")}catch(_){}
    if(!saved?.id||saved.user_id!==state.access.user_id)return;
    if(saved.branch_id&&state.branches.some((b)=>b.id===saved.branch_id))$("saleBranch").value=saved.branch_id;
    const {data,error}=await supabaseClient.rpc("tkn_v5261_box_sale_preview",{p_draft_id:saved.id});
    if(error){localStorage.removeItem(DRAFT_KEY);return}
    const p=normalize(data); if(p?.draft?.status!=="DRAFT"){localStorage.removeItem(DRAFT_KEY);return}
    state.draftId=saved.id;state.preview=p;$("saleBranch").disabled=true;render();message("กู้คืนร่างขายยกกล่องเดิมแล้ว","success");
  }

  async function checkout() {
    if(!state.draftId||!state.preview?.box_count)return;
    const mode=pricingMode(), total=currentSaleTotal(), cost=Number(state.preview.cost_total||0);
    if(mode==="LUMP"&&!can("pos.box_sale.lump_price"))return message("ไม่มีสิทธิ์กำหนดราคาเหมา","error");
    if(total<cost&&!can("pos.box_sale.below_cost"))return message("ราคาต่ำกว่าต้นทุน ต้องใช้บัญชี Owner หรือ Admin","error");
    const received=$("paymentMethod").value==="CASH"?Number($("receivedAmount").value||0):total;
    if($("paymentMethod").value==="CASH"&&received<total)return message("เงินที่รับน้อยกว่ายอดขาย","error");
    if(!confirm(`ยืนยันขาย ${state.preview.box_count} กล่อง รวม ${num(state.preview.total_quantity)} ชิ้น\nยอดขาย ${money(total)}\nต้นทุน ${money(cost)}\nกำไร ${money(total-cost)}?`))return;
    state.busy=true;$("checkoutBtn").disabled=true;message("กำลังบันทึกการขายและตัดสต็อก...","info");
    try {
      const {data,error}=await supabaseClient.rpc("tkn_v5261_complete_box_sale",{
        p_draft_id:state.draftId,p_pricing_mode:mode,p_lump_price:mode==="LUMP"?total:null,p_payment_method:$("paymentMethod").value,p_received_amount:received,
        p_customer_name:$("customerName").value.trim()||null,p_customer_phone:$("customerPhone").value.trim()||null,p_notes:$("notes").value.trim()||null
      });
      if(error)throw error; const r=normalize(data); localStorage.removeItem(DRAFT_KEY);state.draftId=null;state.preview=null;
      $("successSummary").innerHTML=`<p><b>${esc(r.sale_no)}</b></p><p>${num(r.box_count)} กล่อง · ${num(r.sku_count)} SKU · ${num(r.total_quantity)} ชิ้น</p><p>ยอดขาย <b>${money(r.net_total)}</b> · กำไร <b>${money(r.gross_profit)}</b></p>`;
      $("saleHistoryLink").href=`./sales-history.html?search=${encodeURIComponent(r.sale_no)}`;$("successDialog").showModal();message(`ขายสำเร็จ ${r.sale_no}`,"success");feedback(true);
    } catch(e) { message(e.message||"ขายยกกล่องไม่สำเร็จ","error");feedback(false);$("checkoutBtn").disabled=false; }
    finally { state.busy=false; }
  }

  function bindEvents() {
    $("backBtn").onclick=()=>{stopCamera();window.TKNSafeBack?.go?.({fallback:"./pos.html"})||(location.href="./pos.html")};
    $("startCameraBtn").onclick=startCamera;$("stopCameraBtn").onclick=stopCamera;$("torchBtn").onclick=toggleTorch;
    $("manualForm").onsubmit=(e)=>{e.preventDefault();addBox($("manualCode").value)};
    $("boxList").onclick=(e)=>{const b=e.target.closest("[data-remove-box]");if(b)removeBox(b.dataset.removeBox)};
    document.querySelectorAll("[data-view]").forEach((b)=>b.onclick=()=>{document.querySelectorAll("[data-view]").forEach((x)=>x.classList.toggle("active",x===b));$("boxList").hidden=b.dataset.view!=="BOXES";$("skuList").hidden=b.dataset.view!=="SKU"});
    document.querySelectorAll('input[name="pricingMode"]').forEach((r)=>r.onchange=()=>{$("lumpPriceWrap").hidden=pricingMode()!=="LUMP";if(pricingMode()==="LUMP"&&!$("lumpPrice").value)$("lumpPrice").value=Number(state.preview?.normal_price_total||0).toFixed(2);updateTotals()});
    $("lumpPrice").oninput=updateTotals;$("paymentMethod").onchange=()=>{$("receivedWrap").hidden=$("paymentMethod").value!=="CASH";updateTotals()};
    $("resetDraftBtn").onclick=()=>resetDraft(true);$("checkoutBtn").onclick=checkout;$("newSaleBtn").onclick=()=>{$("successDialog").close();resetDraft(false)};
    $("saleBranch").onchange=()=>{if(state.draftId)return message("ต้องเริ่มรายการใหม่ก่อนเปลี่ยนสาขา","error");sessionStorage.setItem("tkn_inventory_branch_id",branchId())};
    document.addEventListener("visibilitychange",()=>{if(document.hidden)stopCamera()});window.addEventListener("pagehide",stopCamera);
  }

  async function initialize() {
    try {
      if(!window.TKNAuthGuard||!window.supabaseClient)throw new Error("ไฟล์ระบบโหลดไม่ครบ");
      const access=await window.TKNAuthGuard.requireAccess("pos.box_sale.create",{loadingText:"กำลังตรวจสอบสิทธิ์ขายยกกล่อง..."});if(!access)return;state.access=access;
      await loadBranches();bindEvents();$("roleChip").textContent=`${access.role_name_th||access.role} · ขายยกกล่อง`;
      if(!can("pos.box_sale.lump_price")){document.querySelector('input[value="LUMP"]').disabled=true;document.querySelector('input[value="LUMP"]').closest("label").title="ไม่มีสิทธิ์กำหนดราคาเหมา"}
      await restoreDraft();window.TKNAuthGuard.ready();render();
      const params=new URLSearchParams(location.search);if(params.get("scan")){if(!branchId())message("กรุณาเลือกสาขาก่อนเพิ่มกล่อง","error");else await addBox(params.get("scan"))}
      else message("เลือกสาขา แล้วสแกน QR กล่องได้หลายใบ","success");
    } catch(e){console.error(e);window.TKNAuthGuard?.fail(e,()=>location.reload())}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});else initialize();
})();
