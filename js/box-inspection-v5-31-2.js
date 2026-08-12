(()=>{'use strict';
const $=id=>document.getElementById(id);let busy=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v||0).toLocaleString('th-TH');const fmt=v=>{if(!v)return '-';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('th-TH')};
async function client(){for(let i=0;i<40&&!window.supabaseClient;i++)await new Promise(r=>setTimeout(r,75));if(!window.supabaseClient?.rpc)throw new Error('Supabase client ยังไม่พร้อม');return window.supabaseClient}
function msg(t,type=''){const e=$('message');e.textContent=t||'';e.className=`message ${type}`}
function render(data){
 const h=data?.history||{},items=data?.items||[],intake=data?.intake||null,already=!!data?.already_received;
 $('selectedBox').textContent=h.box_code||'-';$('selectedQty').textContent=num(h.total_quantity);$('selectedStatus').textContent=h.workflow_status||'-';$('selectedDoc').textContent=intake?.stock_document_no||'-';
 if(!h.id){$('scanState').textContent='ไม่พบกล่อง';$('scanState').className='chip bad';$('summary').className='summary empty';$('summary').textContent='ไม่พบข้อมูลกล่อง';$('itemRows').innerHTML='<tr><td colspan="6">-</td></tr>';return}
 $('scanState').textContent=already?'รับเข้าสต็อกแล้ว':'ยังไม่รับเข้าสต็อก';$('scanState').className='chip '+(already?'good':'bad');
 $('summary').className='summary';
 $('summary').innerHTML=`<article><span>รหัสกล่อง</span><b>${esc(h.box_code)}</b></article><article><span>Snapshot</span><b>${esc(h.sku_count)} SKU · ${num(h.total_quantity)} ชิ้น</b></article><article><span>ประเภท</span><b>${esc(h.category_text||'-')}${String(h.category_text||'').includes(',')?'<span class="mixed">คละประเภท</span>':''}</b></article><article><span>รับเข้า</span><b>${already?`${esc(intake?.stock_document_no||'-')} · ${fmt(intake?.received_at)}`:'ยังไม่รับเข้า'}</b></article>`;
 $('itemRows').innerHTML=items.map(i=>`<tr><td><b>${esc(i.sku)}</b></td><td>${esc(i.barcode||'-')}</td><td>${esc(i.product_name||'-')}</td><td>${num(i.quantity)}</td><td>${num(i.cost_price)}</td><td>${num(i.selling_price)}</td></tr>`).join('')||'<tr><td colspan="6">ไม่พบสินค้าใน Snapshot</td></tr>';
 msg(already?'ตรวจสอบกล่องสำเร็จ · กล่องนี้อยู่ในสต็อกแล้วและพร้อมเบิก/ขาย':'พบกล่อง แต่ยังไม่ได้รับเข้าสต็อก',''+(already?'good':'bad'));
}
async function lookup(code){
 const value=String(code||$('boxScan').value||'').trim();if(!value)return msg('กรุณาสแกน QR/Barcode กล่อง','bad');
 if(busy)return;busy=true;$('lookupBtn').disabled=true;
 try{const sb=await client();const r=await sb.rpc('tkn_v5285_stock_intake_lookup',{p_box_code:value});if(r.error)throw r.error;render(r.data);$('boxScan').value=value}catch(e){render(null);msg(e.message||String(e),'bad')}finally{busy=false;$('lookupBtn').disabled=false}
}
async function recent(){
 try{const sb=await client();const r=await sb.rpc('tkn_v5285_recent_stock_intakes',{p_limit:100});if(r.error)throw r.error;const rows=Array.isArray(r.data)?r.data:[];$('recentRows').innerHTML=rows.map(x=>`<tr><td>${fmt(x.received_at)}</td><td><b>${esc(x.box_code)}</b></td><td>${esc(x.stock_document_no||'-')}</td><td>${num(x.total_quantity)}</td><td>${esc(x.branch_name||'-')}</td><td><button data-box="${esc(x.box_code)}">ตรวจ</button></td></tr>`).join('')||'<tr><td colspan="6">ยังไม่มีประวัติรับเข้า</td></tr>'}catch(e){$('recentRows').innerHTML=`<tr><td colspan="6">${esc(e.message||String(e))}</td></tr>`}
}
async function init(){
 try{
  if(!window.TKNAuthGuard?.requireAccess)throw new Error('Auth Guard ยังไม่พร้อม');
  const access=await window.TKNAuthGuard.requireAccess('inventory.receive',{suppressLoading:true,redirect:false});
  if(!access){msg('ไม่พบ Session กรุณาเข้าสู่ระบบใหม่','bad');setTimeout(()=>location.replace('./dashboard.html?return=box-inspection.html'),700);return}
  window.TKNAuthGuard.ready?.();
 }catch(e){window.TKNAuthGuard?.ready?.();msg(e?.code==='INVENTORY_PERMISSION_DENIED'?'บัญชีนี้ไม่มีสิทธิ์ inventory.receive':(e.message||'ไม่มีสิทธิ์ใช้งาน'),'bad');return}
 $('lookupBtn').onclick=()=>lookup();$('boxScan').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();lookup()}};$('refreshBtn').onclick=recent;
 $('recentRows').onclick=e=>{const b=e.target.closest('[data-box]');if(b){$('boxScan').value=b.dataset.box;lookup(b.dataset.box)}};
 const q=new URLSearchParams(location.search).get('scan');if(q){$('boxScan').value=q;lookup(q)};recent();
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();