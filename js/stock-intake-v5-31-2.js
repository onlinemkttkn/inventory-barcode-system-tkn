(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { detail:null, branches:[], busy:false, initialized:false, authorized:false };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = v => v ? new Date(v).toLocaleString('th-TH') : '-';
  const num = v => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits:2 });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function timeout(promise, ms, label) {
    let timer;
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${label || 'การเชื่อมต่อ'} ใช้เวลานานเกิน ${Math.ceil(ms/1000)} วินาที`);
        error.code = 'STOCK_INTAKE_TIMEOUT';
        reject(error);
      }, ms);
    });
    return Promise.race([Promise.resolve(promise), expiry]).finally(() => clearTimeout(timer));
  }

  async function client() {
    const started = Date.now();
    while (!window.supabaseClient && Date.now() - started < 3500) await sleep(50);
    if (!window.supabaseClient?.rpc || !window.supabaseClient?.from) {
      const error = new Error('Supabase client ยังไม่พร้อม — ตรวจ supabase-config.js และอินเทอร์เน็ต');
      error.code = 'SUPABASE_CLIENT_MISSING';
      throw error;
    }
    return window.supabaseClient;
  }

  function msg(text, type='') {
    const e=$('message'); if(!e) return;
    e.textContent=text || '';
    e.className=`intake-message ${type}`;
  }

  function setBusy(v) {
    state.busy=!!v;
    if($('lookupBtn')) $('lookupBtn').disabled=state.busy || !state.authorized;
    if($('refreshQueueBtn')) $('refreshQueueBtn').disabled=state.busy || !state.authorized;
    if($('receiveBtn')) $('receiveBtn').disabled=state.busy || !canReceive();
  }

  function canReceive() {
    const d=state.detail;
    return !!(state.authorized && d && d.history?.workflow_status==='WAITING_STOCK' && !d.already_received && !((d.blockers||[]).length)
      && $('checkQr')?.checked && $('checkCondition')?.checked && $('branchSelect')?.value);
  }
  function refreshReceiveEnabled(){ if($('receiveBtn')) $('receiveBtn').disabled=state.busy || !canReceive(); }

  async function loadBranches() {
    const wh=await window.TKNWarehouseContext?.resolve?.();
    if(!wh?.id) throw new Error('ไม่พบโกดังเก็บสินค้า');
    state.branches=[wh];
    const select=$('branchSelect');
    if(select){
      select.innerHTML=`<option value="${esc(wh.id)}">${esc(wh.name||'โกดังเก็บสินค้า')}</option>`;
      select.value=wh.id;
      select.disabled=true;
    }
  }

  async function loadQueue() {
    const sb=await client();
    const q=$('queueSearch')?.value.trim() || null;
    const {data,error}=await timeout(sb.rpc('tkn_v5285_list_stock_intake_queue',{p_search:q,p_limit:250}),8000,'โหลดคิวรอเข้าสต็อก');
    if(error) throw error;
    const rows=Array.isArray(data)?data:[];
    if($('waitingCount')) $('waitingCount').textContent=rows.length;
    if($('queueRows')) $('queueRows').innerHTML=rows.map(r=>`<tr><td>${fmt(r.closed_at)}</td><td><b>${esc(r.box_code)}</b><br><small>${esc(r.category_text||'-')}${String(r.category_text||'').includes(',')?'<span class="intake-mixed-badge">คละประเภท</span>':''}</small></td><td>${esc(r.sku_count)} SKU · ${num(r.total_quantity)} ชิ้น</td><td>${esc(r.category_text||'-')} / ${esc(r.zone_code||'-')}</td><td><button class="intake-btn" type="button" data-intake-box="${esc(r.box_code)}">ตรวจรับ</button></td></tr>`).join('') || '<tr><td colspan="5">ไม่มีกล่องรอเข้าสต็อก</td></tr>';
  }

  function renderDetail(data) {
    state.detail=data||null;
    const h=data?.history||{}, items=data?.items||[], intake=data?.intake||null, blockers=data?.blockers||[], already=!!data?.already_received;
    if($('selectedBox')) $('selectedBox').textContent=h.box_code||'-';
    if($('selectedQty')) $('selectedQty').textContent=num(h.total_quantity);
    if($('selectedStatus')) $('selectedStatus').textContent=h.workflow_status||'-';
    if($('scanState')) { $('scanState').textContent=already?'รับเข้าแล้ว':h.workflow_status==='WAITING_STOCK'?'พร้อมตรวจรับ':'ตรวจสอบ'; $('scanState').className='intake-chip '+(already?'good':blockers.length?'bad':''); }
    if($('duplicateBadge')) $('duplicateBadge').hidden=!already;
    if($('boxInspectNext')) {
      const canInspect=!!(already && h.box_code);
      $('boxInspectNext').hidden=!canInspect;
      $('boxInspectNext').href=canInspect?`./box-inspection.html?scan=${encodeURIComponent(h.box_code)}`:'./box-inspection.html';
    }
    if(!h.id) {
      if($('boxSummary')) { $('boxSummary').className='intake-summary empty'; $('boxSummary').textContent='ไม่พบข้อมูลกล่อง'; }
      if($('itemRows')) $('itemRows').innerHTML='<tr><td colspan="6">-</td></tr>';
      refreshReceiveEnabled(); return;
    }
    if($('boxSummary')) { $('boxSummary').className='intake-summary'; $('boxSummary').innerHTML=`<article><span>รหัสกล่อง</span><b>${esc(h.box_code)}</b></article><article><span>ปิดกล่อง</span><b>${fmt(h.closed_at)}</b></article><article><span>Snapshot</span><b>${esc(h.sku_count)} SKU · ${num(h.total_quantity)} ชิ้น</b></article><article><span>สาขาต้นทาง</span><b>${esc(h.branch_name||'-')}</b></article><article><span>ประเภท / โซน</span><b>${esc(h.category_text||'-')} ${String(h.category_text||'').includes(',')?'<span class="intake-mixed-badge">คละประเภท</span>':''} / ${esc(h.zone_code||'-')}</b></article>${already?`<article><span>เอกสารรับเข้า</span><b>${esc(intake?.stock_document_no||'-')}</b></article><article><span>รับเข้าเมื่อ</span><b>${fmt(intake?.received_at)}</b></article>`:''}`; }
    if($('itemRows')) $('itemRows').innerHTML=items.map(i=>`<tr><td><b>${esc(i.sku)}</b></td><td>${esc(i.barcode||'-')}</td><td>${esc(i.product_name||'-')}</td><td>${num(i.quantity)}</td><td>${num(i.cost_price)}</td><td>${num(i.selling_price)}</td></tr>`).join('')||'<tr><td colspan="6">ไม่พบสินค้าใน Snapshot</td></tr>';
    if($('blockerBox')) { $('blockerBox').hidden=!blockers.length; $('blockerBox').innerHTML=blockers.length?`<b>ยังรับเข้าสต็อกไม่ได้</b><ul>${blockers.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''; }
    if($('branchSelect') && state.branches[0]?.id) $('branchSelect').value=state.branches[0].id;
    if(already) msg(`กล่อง ${h.box_code} รับเข้าสต็อกแล้ว · เอกสาร ${intake?.stock_document_no||'-'}`,'good');
    else if(blockers.length) msg(`พบเงื่อนไขที่ต้องแก้ ${blockers.length} รายการ`,'error');
    else msg(`ตรวจพบกล่อง ${h.box_code} พร้อมตรวจรับ`,'good');
    refreshReceiveEnabled();
  }

  async function lookup(code) {
    let value=String(code||$('boxScan')?.value||'').trim();
    if(!value) return msg('กรุณาสแกน QR กล่อง','error');
    if(!/^TKN-B-/i.test(value) && /^[A-Z]{2,3}-[A-Z]\d{2}$/i.test(value)) value=`TKN-B-${value.toUpperCase()}`;
    setBusy(true);
    try {
      const sb=await client();
      const {data,error}=await timeout(sb.rpc('tkn_v5285_stock_intake_lookup',{p_box_code:value}),8000,'ตรวจข้อมูลกล่อง');
      if(error) throw error;
      renderDetail(data); if($('boxScan')) $('boxScan').value=value;
    } catch(e) {
      state.detail=null; renderDetail(null);
      const raw=e?.message||String(e);
      if(raw.includes('WAITING_BOX_NOT_FOUND')){
        msg('ยังไม่พบกล่องในคิว WAITING_STOCK — กลับไปหน้า “แยกสินค้า / ปิดกล่อง” แล้วกด “ส่งเข้าคิวตรวจรับอีกครั้ง” ก่อน','error');
      }else msg(raw,'error');
      console.error('Stock Intake lookup:',e);
    } finally { setBusy(false); refreshReceiveEnabled(); }
  }

  async function receive() {
    if(!canReceive()) return msg('กรุณาตรวจ QR, สภาพกล่อง และเลือกสาขาก่อนรับเข้า','error');
    if(!confirm(`ยืนยันรับกล่อง ${state.detail.history.box_code} เข้าสต็อกทั้งกล่อง?\nการทำรายการนี้จะเพิ่ม Inventory และทำซ้ำไม่ได้`)) return;
    setBusy(true);
    try {
      const sb=await client();
      const {data,error}=await timeout(sb.rpc('tkn_v5300_receive_stock_intake',{p_history_id:state.detail.history.id,p_scan_code:$('boxScan').value.trim(),p_note:$('intakeNote').value.trim()||null}),12000,'รับกล่องเข้าสต็อก');
      if(error) throw error;
      msg(data?.already_received?`กล่องนี้รับเข้าแล้ว · ${data.stock_document_no||'-'}`:`รับเข้าสต็อกสำเร็จ · ${data?.stock_document_no||'-'} · พร้อมตรวจสอบกล่อง/เบิกขาย`,'good');
      await lookup(state.detail.history.box_code);
      await Promise.allSettled([safeLoad(loadQueue,'คิวรอเข้า'),safeLoad(loadRecent,'ประวัติรับเข้า')]);
    } catch(e) { msg(e.message||String(e),'error'); console.error('Stock Intake receive:',e); }
    finally { setBusy(false); refreshReceiveEnabled(); }
  }

  async function loadRecent() {
    const sb=await client();
    const {data,error}=await timeout(sb.rpc('tkn_v5285_recent_stock_intakes',{p_limit:50}),8000,'โหลดประวัติรับเข้า');
    if(error) throw error;
    const rows=Array.isArray(data)?data:[];
    if($('recentRows')) $('recentRows').innerHTML=rows.map(r=>`<tr><td>${fmt(r.received_at)}</td><td><b>${esc(r.box_code)}</b></td><td>${esc(r.stock_document_no||'-')}</td><td>${num(r.total_quantity)}</td><td>${esc(r.branch_name||'-')}</td><td>${esc(r.received_by||'-')}</td></tr>`).join('')||'<tr><td colspan="6">ยังไม่มีประวัติรับเข้า</td></tr>';
  }

  async function safeLoad(fn,label) {
    try { await fn(); return true; }
    catch(e) {
      console.error(`Stock Intake ${label}:`,e);
      if(label.includes('คิว') && $('queueRows')) $('queueRows').innerHTML=`<tr><td colspan="5">${esc(e.message||String(e))}</td></tr>`;
      if(label.includes('ประวัติ') && $('recentRows')) $('recentRows').innerHTML=`<tr><td colspan="6">${esc(e.message||String(e))}</td></tr>`;
      if(label.includes('สาขา') && $('branchSelect')) $('branchSelect').innerHTML='<option value="">โหลดสาขาไม่สำเร็จ</option>';
      return false;
    }
  }

  function bindEvents() {
    if(state.initialized) return;
    state.initialized=true;
    document.addEventListener('click',ev=>{ const b=ev.target.closest?.('[data-intake-box]'); if(b){ if($('boxScan')) $('boxScan').value=b.dataset.intakeBox; void lookup(b.dataset.intakeBox); } });
    $('lookupBtn')?.addEventListener('click',()=>void lookup());
    $('boxScan')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void lookup();}});
    $('refreshQueueBtn')?.addEventListener('click',()=>void safeLoad(loadQueue,'คิวรอเข้า'));
    $('queueSearchBtn')?.addEventListener('click',()=>void safeLoad(loadQueue,'คิวรอเข้า'));
    $('queueSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void safeLoad(loadQueue,'คิวรอเข้า');}});
    $('refreshRecentBtn')?.addEventListener('click',()=>void safeLoad(loadRecent,'ประวัติรับเข้า'));
    $('receiveBtn')?.addEventListener('click',()=>void receive());
    $('checkQr')?.addEventListener('change',refreshReceiveEnabled);
    $('checkCondition')?.addEventListener('change',refreshReceiveEnabled);
    $('branchSelect')?.addEventListener('change',refreshReceiveEnabled);
  }

  async function init() {
    bindEvents();
    state.authorized=false;
    setBusy(false);
    msg('กำลังยืนยันสิทธิ์การใช้งาน...');
    try {
      if(!window.TKNAuthGuard?.requireAccess) throw new Error('Auth Guard ยังไม่พร้อม');
      const access=await timeout(window.TKNAuthGuard.requireAccess('inventory.receive',{loadingText:'กำลังยืนยันสิทธิ์ตรวจรับเข้าสต็อก...',suppressLoading:true,redirect:false}),6500,'ตรวจสิทธิ์ผู้ใช้งาน');
      if(!access) {
        msg('ไม่พบ Session กรุณาเข้าสู่ระบบใหม่','error');
        setTimeout(()=>location.replace('./dashboard.html?return=stock-intake.html'),700);
        return;
      }
      state.authorized=true;
      window.TKNAuthGuard.ready();
      setBusy(false);
      msg('พร้อมสแกน QR กล่อง','good');
      // โหลดข้อมูลประกอบแบบ background ห้ามบล็อกการสแกน
      void safeLoad(loadBranches,'สาขา').then(()=>refreshReceiveEnabled());
      void safeLoad(loadQueue,'คิวรอเข้า');
      void safeLoad(loadRecent,'ประวัติรับเข้า');
      const initialScan=new URLSearchParams(location.search).get('scan');
      if(initialScan){ if($('boxScan')) $('boxScan').value=initialScan; void lookup(initialScan); }
      setTimeout(()=>$('boxScan')?.focus(),80);
    } catch(e) {
      console.error('Stock Intake startup:',e);
      state.authorized=false;
      setBusy(false);
      window.TKNAuthGuard?.ready?.();
      if(e?.code==='INVENTORY_PERMISSION_DENIED') {
        msg('บัญชีนี้ไม่มีสิทธิ์ inventory.receive','error');
        return;
      }
      msg(e.message||String(e),'error');
      window.TKNAuthGuard?.showConnectionWarning?.(e.message||'การเชื่อมต่อมีปัญหา');
    }
  }

  window.addEventListener('unhandledrejection',e=>console.error('Stock Intake unhandled promise:',e.reason));
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>void init(),{once:true});
  else void init();
  window.TKNStockIntakeV5300={init,loadQueue,loadRecent,lookup};
})();