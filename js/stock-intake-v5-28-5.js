(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const state={detail:null,branches:[],busy:false};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v?new Date(v).toLocaleString('th-TH'):'-';
  const num=v=>Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:2});
  async function client(){
    if(typeof supabaseClient!=='undefined')return supabaseClient;
    if(window.supabaseClient)return window.supabaseClient;
    await new Promise(r=>setTimeout(r,200));
    return typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
  }
  function msg(text,type=''){const e=$('message');if(!e)return;e.textContent=text||'';e.className='intake-message '+type;}
  function setBusy(v){state.busy=v;$('lookupBtn').disabled=v;$('refreshQueueBtn').disabled=v;$('receiveBtn').disabled=v||!canReceive();}
  function canReceive(){const d=state.detail;return !!(d&&d.history?.workflow_status==='WAITING_STOCK'&&!d.already_received&&!((d.blockers||[]).length)&&$('checkQr')?.checked&&$('checkCondition')?.checked&&$('branchSelect')?.value);}
  function refreshReceiveEnabled(){if($('receiveBtn'))$('receiveBtn').disabled=state.busy||!canReceive();}
  async function loadBranches(){const sb=await client();if(!sb)return;const {data,error}=await sb.from('branches').select('id,code,name,is_active').eq('is_active',true).order('name');if(error)throw error;state.branches=data||[];$('branchSelect').innerHTML=state.branches.map(b=>`<option value="${esc(b.id)}">${esc(b.code)} — ${esc(b.name||b.code)}</option>`).join('');}
  async function loadQueue(){const sb=await client();if(!sb)return;const q=$('queueSearch').value.trim()||null;const {data,error}=await sb.rpc('tkn_v5285_list_stock_intake_queue',{p_search:q,p_limit:250});if(error){$('queueRows').innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`;return;}const rows=Array.isArray(data)?data:[];$('waitingCount').textContent=rows.length;$('queueRows').innerHTML=rows.map(r=>`<tr><td>${fmt(r.closed_at)}</td><td><b>${esc(r.box_code)}</b><br><small>${esc(r.category_text||'-')}</small></td><td>${esc(r.sku_count)} SKU · ${num(r.total_quantity)} ชิ้น</td><td>${esc(r.location_text||'-')}</td><td><button class="intake-btn" type="button" data-intake-box="${esc(r.box_code)}">ตรวจรับ</button></td></tr>`).join('')||'<tr><td colspan="5">ไม่มีกล่องรอเข้าสต็อก</td></tr>';}
  function renderDetail(data){state.detail=data||null;const h=data?.history||{};const items=data?.items||[];const intake=data?.intake||null;const blockers=data?.blockers||[];const already=!!data?.already_received;
    $('selectedBox').textContent=h.box_code||'-';$('selectedQty').textContent=num(h.total_quantity);$('selectedStatus').textContent=h.workflow_status||'-';$('scanState').textContent=already?'รับเข้าแล้ว':h.workflow_status==='WAITING_STOCK'?'พร้อมตรวจรับ':'ตรวจสอบ';$('scanState').className='intake-chip '+(already?'good':blockers.length?'bad':'');$('duplicateBadge').hidden=!already;
    if(!h.id){$('boxSummary').className='intake-summary empty';$('boxSummary').textContent='ไม่พบข้อมูลกล่อง';$('itemRows').innerHTML='<tr><td colspan="6">-</td></tr>';return;}
    $('boxSummary').className='intake-summary';$('boxSummary').innerHTML=`<article><span>รหัสกล่อง</span><b>${esc(h.box_code)}</b></article><article><span>ปิดกล่อง</span><b>${fmt(h.closed_at)}</b></article><article><span>Snapshot</span><b>${esc(h.sku_count)} SKU · ${num(h.total_quantity)} ชิ้น</b></article><article><span>สาขาต้นทาง</span><b>${esc(h.branch_name||'-')}</b></article><article><span>ประเภท / โซน</span><b>${esc(h.category_text||'-')} / ${esc(h.zone_code||'-')}</b></article><article><span>ตำแหน่ง</span><b>${esc(h.location_text||'-')}</b></article>${already?`<article><span>เอกสารรับเข้า</span><b>${esc(intake?.stock_document_no||'-')}</b></article><article><span>รับเข้าเมื่อ</span><b>${fmt(intake?.received_at)}</b></article>`:''}`;
    $('itemRows').innerHTML=items.map(i=>`<tr><td><b>${esc(i.sku)}</b></td><td>${esc(i.barcode||'-')}</td><td>${esc(i.product_name||'-')}</td><td>${num(i.quantity)}</td><td>${num(i.cost_price)}</td><td>${num(i.selling_price)}</td></tr>`).join('')||'<tr><td colspan="6">ไม่พบสินค้าใน Snapshot</td></tr>';
    $('blockerBox').hidden=!blockers.length;$('blockerBox').innerHTML=blockers.length?`<b>ยังรับเข้าสต็อกไม่ได้</b><ul>${blockers.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';
    if(h.branch_id&&state.branches.some(b=>b.id===h.branch_id))$('branchSelect').value=h.branch_id;
    $('checkQr').checked=false;$('checkCondition').checked=false;refreshReceiveEnabled();
    if(already)msg(`กล่อง ${h.box_code} รับเข้าสต็อกแล้ว · เอกสาร ${intake?.stock_document_no||'-'}`,'good');else if(blockers.length)msg(`พบเงื่อนไขที่ต้องแก้ ${blockers.length} รายการ`,'error');else msg(`ตรวจพบกล่อง ${h.box_code} พร้อมตรวจรับ`,'good');
  }
  async function lookup(code){const value=String(code||$('boxScan').value||'').trim();if(!value)return msg('กรุณาสแกน QR กล่อง','error');setBusy(true);try{const sb=await client();const {data,error}=await sb.rpc('tkn_v5285_stock_intake_lookup',{p_box_code:value});if(error)throw error;renderDetail(data);$('boxScan').value=value;}catch(e){state.detail=null;renderDetail(null);msg(e.message||String(e),'error');}finally{setBusy(false);refreshReceiveEnabled();}}
  async function receive(){if(!canReceive())return msg('กรุณาตรวจ QR, สภาพกล่อง และเลือกสาขาก่อนรับเข้า','error');if(!confirm(`ยืนยันรับกล่อง ${state.detail.history.box_code} เข้าสต็อกทั้งกล่อง?\nการทำรายการนี้จะเพิ่ม Inventory และทำซ้ำไม่ได้`))return;setBusy(true);try{const sb=await client();const {data,error}=await sb.rpc('tkn_v5285_receive_stock_intake',{p_history_id:state.detail.history.id,p_branch_id:$('branchSelect').value,p_scan_code:$('boxScan').value.trim(),p_note:$('intakeNote').value.trim()||null});if(error)throw error;msg(data?.already_received?`กล่องนี้รับเข้าแล้ว · ${data.stock_document_no||'-'}`:`รับเข้าสต็อกสำเร็จ · เอกสาร ${data?.stock_document_no||'-'}`,'good');await lookup(state.detail.history.box_code);await Promise.all([loadQueue(),loadRecent()]);}catch(e){msg(e.message||String(e),'error');}finally{setBusy(false);refreshReceiveEnabled();}}
  async function loadRecent(){const sb=await client();if(!sb)return;const {data,error}=await sb.rpc('tkn_v5285_recent_stock_intakes',{p_limit:50});if(error){$('recentRows').innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;return;}const rows=Array.isArray(data)?data:[];$('recentRows').innerHTML=rows.map(r=>`<tr><td>${fmt(r.received_at)}</td><td><b>${esc(r.box_code)}</b></td><td>${esc(r.stock_document_no||'-')}</td><td>${num(r.total_quantity)}</td><td>${esc(r.branch_name||'-')}</td><td>${esc(r.received_by||'-')}</td></tr>`).join('')||'<tr><td colspan="6">ยังไม่มีประวัติรับเข้า</td></tr>';}
  document.addEventListener('click',ev=>{const b=ev.target.closest('[data-intake-box]');if(b){$('boxScan').value=b.dataset.intakeBox;void lookup(b.dataset.intakeBox);}});
  document.addEventListener('DOMContentLoaded',async()=>{
    try{
      if(!window.TKNAuthGuard?.requireAccess) throw new Error('Auth Guard ยังไม่พร้อม');
      await window.TKNAuthGuard.requireAccess('inventory.receive',{loadingText:'กำลังเปิดระบบตรวจรับเข้าสต็อก...'});
      await loadBranches();
      await Promise.all([loadQueue(),loadRecent()]);
      const initialScan=new URLSearchParams(location.search).get('scan');
      if(initialScan){$('boxScan').value=initialScan;await lookup(initialScan);}
      $('lookupBtn').addEventListener('click',()=>void lookup());
      $('boxScan').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void lookup();}});
      $('refreshQueueBtn').addEventListener('click',()=>void loadQueue());
      $('queueSearchBtn').addEventListener('click',()=>void loadQueue());
      $('queueSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void loadQueue();}});
      $('refreshRecentBtn').addEventListener('click',()=>void loadRecent());
      $('receiveBtn').addEventListener('click',()=>void receive());
      $('checkQr').addEventListener('change',refreshReceiveEnabled);
      $('checkCondition').addEventListener('change',refreshReceiveEnabled);
      $('branchSelect').addEventListener('change',refreshReceiveEnabled);
      window.TKNAuthGuard.ready();
      setTimeout(()=>$('boxScan')?.focus(),300);
    }catch(e){
      if(e?.code==='INVENTORY_PERMISSION_DENIED') return;
      if(window.TKNAuthGuard?.fail) window.TKNAuthGuard.fail(e,()=>location.reload());
      else { document.body?.classList.remove('tkn-auth-loading'); msg(e.message||String(e),'error'); }
    }
  });
})();
