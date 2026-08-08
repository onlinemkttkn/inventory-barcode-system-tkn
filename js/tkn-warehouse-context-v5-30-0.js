(() => {
  'use strict';
  const VERSION='5.30.0';
  const ID_KEY='tkn_inventory_branch_id';
  const LABEL_KEY='tkn_inventory_branch_label';
  const CODE_KEY='tkn_inventory_branch_code';
  const TARGET='โกดังเก็บสินค้า';
  let resolved=null, request=null;
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const norm=(v)=>String(v||'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const score=(b)=>{
    const n=norm(b?.name), c=norm(b?.code), target=norm(TARGET);
    if(n===target) return 1000;
    if(n.includes(target)) return 950;
    if(n.includes('โกดังเก็บสินค้า')) return 900;
    if(n.includes('โกดังเก็บ')) return 850;
    if(n.includes('โกดัง')) return 700;
    if(['warehouse','warehousemain','whmain','wh'].includes(c)) return 650;
    if(c.includes('warehouse')||c.startsWith('wh')) return 600;
    return 0;
  };
  async function client(){
    const started=Date.now();
    while(!window.supabaseClient?.from && Date.now()-started<5000) await sleep(50);
    if(!window.supabaseClient?.from) throw new Error('Supabase client ยังไม่พร้อม');
    return window.supabaseClient;
  }
  function remember(b){
    if(!b?.id) return;
    sessionStorage.setItem(ID_KEY,String(b.id));
    sessionStorage.setItem(LABEL_KEY,String(b.name||TARGET));
    sessionStorage.setItem(CODE_KEY,String(b.code||''));
    document.documentElement.dataset.tknWarehouseBranch=String(b.id);
    document.documentElement.dataset.tknWarehouseName=String(b.name||TARGET);
  }
  async function resolve({refresh=false}={}){
    if(resolved&&!refresh) return resolved;
    if(request&&!refresh) return request;
    request=(async()=>{
      const sb=await client();
      const {data,error}=await sb.from('branches').select('id,code,name,is_active').eq('is_active',true).order('name');
      if(error) throw error;
      const rows=(data||[]).map(b=>({...b,_score:score(b)})).filter(b=>b._score>0).sort((a,b)=>b._score-a._score);
      if(!rows.length){
        const e=new Error('ไม่พบสาขา “โกดังเก็บสินค้า” ที่เปิดใช้งาน'); e.code='WAREHOUSE_BRANCH_NOT_FOUND'; throw e;
      }
      resolved=rows[0]; remember(resolved);
      window.dispatchEvent(new CustomEvent('tkn:warehouse-ready',{detail:{...resolved,version:VERSION}}));
      return resolved;
    })().finally(()=>{request=null});
    return request;
  }
  function applySelect(select, b=resolved){
    if(!select||!b) return false;
    const mode=select.dataset.warehouseValue||((select.id==='branchSelect' && location.pathname.endsWith('universal-import.html'))?'code':'id');
    const wanted=mode==='code'?String(b.code||''):String(b.id||'');
    if(!wanted) return false;
    const opt=[...select.options].find(o=>String(o.value)===wanted);
    if(!opt) return false;
    if(select.value!==wanted){ select.value=wanted; select.dispatchEvent(new Event('change',{bubbles:true})); }
    if(select.dataset.warehouseLock!=='false'){
      select.dataset.tknWarehouseLocked='true';
      select.title=`กำหนดคลังทำงาน: ${b.name||TARGET}`;
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
    e.textContent=`โกดังเก็บสินค้า: ${err?.message||err}`;
  }
  function init(){
    resolve().then(()=>scanPageSelects()).catch(showWarning);
    scanPageSelects();
    new MutationObserver(scanPageSelects).observe(document.documentElement,{childList:true,subtree:true});
  }
  window.TKNWarehouseContext=Object.freeze({VERSION,TARGET,resolve,applySelect,get:()=>resolved});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();