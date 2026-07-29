'use strict';

const E={
  form:document.getElementById('searchForm'),
  search:document.getElementById('search'),
  branchFilter:document.getElementById('branchFilter'),
  scopeText:document.getElementById('scopeText'),
  body:document.getElementById('body'),
  message:document.getElementById('message')
};
const state={access:null,permissions:new Set(),branches:[]};

function msg(text,cls=''){E.message.textContent=text;E.message.className=`msg ${cls}`.trim();}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]));}
function has(permission){return state.permissions.has(permission);}
function branchById(id){return state.branches.find(x=>x.id===id)||null;}

async function loadBranches(){
  const {data,error}=await supabaseClient
    .from('branches')
    .select('id,code,name')
    .eq('is_active',true)
    .order('sort_order');
  if(error)throw error;
  state.branches=data||[];
}

function renderBranchFilter(){
  const options=state.branches.map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  if(has('member.all_branches')){
    E.branchFilter.innerHTML=`<option value="">ทุกสาขา</option>${options}`;
    E.branchFilter.disabled=false;
    E.scopeText.textContent='ขอบเขตข้อมูล: ทุกสาขา';
    return;
  }

  const own=branchById(state.access.branch_id);
  if(!own)throw new Error('บัญชีนี้ยังไม่ได้กำหนดสาขา จึงไม่สามารถดูประวัติคะแนนได้');
  E.branchFilter.innerHTML=`<option value="${own.id}">${esc(own.code)} — ${esc(own.name)}</option>`;
  E.branchFilter.value=own.id;
  E.branchFilter.disabled=true;
  E.scopeText.textContent=`ขอบเขตข้อมูล: ${own.code} — ${own.name}`;
}

async function load(){
  msg('กำลังโหลดข้อมูล...');
  let query=supabaseClient
    .from('member_point_history')
    .select('*')
    .order('created_at',{ascending:false})
    .limit(1000);

  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  if(E.branchFilter.value)query=query.eq('branch_id',E.branchFilter.value);
  if(q)query=query.or(`phone.ilike.%${q}%,full_name.ilike.%${q}%,member_no.ilike.%${q}%`);

  const {data,error}=await query;
  if(error)return msg(error.message,'error');

  E.body.replaceChildren();
  (data||[]).forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${new Date(x.created_at).toLocaleString('th-TH')}</td>
      <td>${esc(x.branch_name||'-')}</td>
      <td>${esc(x.member_no)} — ${esc(x.full_name)}</td>
      <td>${esc(x.transaction_type)}</td>
      <td>${Number(x.points_change||0)}</td>
      <td>${Number(x.points_before||0)}</td>
      <td>${Number(x.points_after||0)}</td>
      <td>${esc(x.sale_no||'-')}</td>
      <td>${esc(x.description||'-')}</td>`;
    E.body.appendChild(tr);
  });
  msg(`พบ ${(data||[]).length} รายการ`);
}

E.form?.addEventListener('submit',event=>{event.preventDefault();load();});
E.branchFilter?.addEventListener('change',load);

async function init(){
  try{
    const access=await window.TKNAuthGuard.requireAccess('member.history',{
      loadingText:'กำลังตรวจสอบสิทธิ์ประวัติคะแนน...'
    });
    if(!access)return;
    state.access=access;
    state.permissions=new Set(Array.isArray(access.permissions)?access.permissions:[]);
    await loadBranches();
    renderBranchFilter();
    window.TKNAuthGuard.ready();
    await load();
  }catch(error){
    if(error?.code==='INVENTORY_PERMISSION_DENIED')return;
    window.TKNAuthGuard.fail(error,init);
  }
}

init();
