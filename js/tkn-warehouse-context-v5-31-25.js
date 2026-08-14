(() => {
  'use strict';
  const VERSION='5.31.25';
  const ID_KEY='tkn_inventory_branch_id';
  const LABEL_KEY='tkn_inventory_branch_label';
  const CODE_KEY='tkn_inventory_branch_code';
  const TARGET_CODE='BR001';
  const TARGET='สำนักงานใหญ่ / คลังหลัก';
  let resolved=null, request=null;
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const norm=(v)=>String(v||'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const score=(b)=>{
    const code=String(b?.code||'').trim().toUpperCase();
    const name=norm(b?.name);
    if(code===TARGET_CODE) return 1000;
    if(String(b?.branch_type||'').toUpperCase()==='HEAD_OFFICE') return 850;
    if(name.includes('สำนักงานใหญ่')) return 800;
    return 0;
  };
  async function client(){
    const started=Date.now();
    while(!window.supabaseClient?.from && Date.now()-started<5000) await sleep(50);
    if(!window.supabaseClient?.from) throw new Error('Supabase client ยังไม่พร้อม');
    return window.supabaseClient;
  }
  function labelOf(b){
    if(!b) return TARGET;
    const base=String(b.name||TARGET).trim();
    return base.includes('คลังหลัก') ? base : `${base} / คลังหลัก`;
  }
  function remember(b){
    if(!b?.id) return;
    const label=labelOf(b);
    sessionStorage.setItem(ID_KEY,String(b.id));
    sessionStorage.setItem(LABEL_KEY,label);
    sessionStorage.setItem(CODE_KEY,String(b.code||TARGET_CODE));
    document.documentElement.dataset.tknWarehouseBranch=String(b.id);
    document.documentElement.dataset.tknWarehouseName=label;
  }
  async function resolve({refresh=false}={}){
    if(resolved&&!refresh) return resolved;
    if(request&&!refresh) return request;
    request=(async()=>{
      const sb=await client();
      const {data,error}=await sb.from('branches').select('id,code,name,branch_type,is_active').eq('is_active',true).order('sort_order').order('code');
      if(error) throw error;
      const rows=(data||[]).map(b=>({...b,_score:score(b)})).filter(b=>b._score>0).sort((a,b)=>b._score-a._score);
      const exact=rows.find(b=>String(b.code||'').trim().toUpperCase()===TARGET_CODE);
      if(!exact){
        const e=new Error('ไม่พบสาขา BR001 “สำนักงานใหญ่ / คลังหลัก” ที่เปิดใช้งาน');
        e.code='MAIN_BRANCH_NOT_FOUND';
        throw e;
      }
      resolved={...exact,name:labelOf(exact)};
      remember(resolved);
      window.dispatchEvent(new CustomEvent('tkn:warehouse-ready',{detail:{...resolved,version:VERSION,canonical_code:TARGET_CODE}}));
      return resolved;
    })().finally(()=>{request=null});
    return request;
  }
  function applySelect(select,b=resolved){
    if(!select||!b) return false;
    const mode=select.dataset.warehouseValue||((select.id==='branchSelect' && location.pathname.endsWith('universal-import.html'))?'code':'id');
    const wanted=mode==='code'?String(b.code||TARGET_CODE):String(b.id||'');
    if(!wanted) return false;
    const opt=[...select.options].find(o=>String(o.value)===wanted);
    if(!opt) return false;
    if(select.value!==wanted){ select.value=wanted; select.dispatchEvent(new Event('change',{bubbles:true})); }
    if(select.dataset.warehouseLock!=='false'){
      select.dataset.tknWarehouseLocked='true';
      select.title=`คลังหลักใช้สต็อกเดียวกับ ${TARGET_CODE}: ${labelOf(b)}`;
    }
    return true;
  }
  function attachSelect(select){
    if(!select||select.dataset.tknWarehouseObserved) return;
    select.dataset.tknWarehouseObserved='true';
    let timer=null;
    const enforce=()=>{ clearTimeout(timer); timer=setTimeout(()=>resolve().then(b=>applySelect(select,b)).catch(showWarning),20); };
    new MutationObserver(enforce).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    select.addEventListener('change',()=>{ if(resolved) setTimeout(()=>applySelect(select,resolved),0); });
    enforce();
  }
  function scanPageSelects(){
    ['#branch','#branchSelect','#receiveBranch','#source','#branchFilter','#defaultBranch','#initialBranch','#tknInventoryBranchSelect'].forEach(sel=>document.querySelectorAll(sel).forEach(attachSelect));
  }
  function showWarning(err){
    console.error('[Warehouse Context]',err);
    let e=document.getElementById('tknWarehouseWarning');
    if(!e){ e=document.createElement('div'); e.id='tknWarehouseWarning'; e.className='tkn-warehouse-warning'; document.body.appendChild(e); }
    e.textContent=`สำนักงานใหญ่ / คลังหลัก: ${err?.message||err}`;
  }
  function init(){
    resolve().then(()=>scanPageSelects()).catch(showWarning);
    scanPageSelects();
    new MutationObserver(scanPageSelects).observe(document.documentElement,{childList:true,subtree:true});
  }
  window.TKNWarehouseContext=Object.freeze({VERSION,TARGET,TARGET_CODE,resolve,applySelect,get:()=>resolved});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
