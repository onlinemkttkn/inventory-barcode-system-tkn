'use strict';

const E={
  createSection:document.getElementById('createSection'),
  scopeText:document.getElementById('scopeText'),
  historyLink:document.getElementById('historyLink'),
  form:document.getElementById('memberForm'),
  fullName:document.getElementById('fullName'),
  phone:document.getElementById('phone'),
  email:document.getElementById('email'),
  birthday:document.getElementById('birthday'),
  branch:document.getElementById('branch'),
  notes:document.getElementById('notes'),
  formMsg:document.getElementById('formMsg'),
  searchForm:document.getElementById('searchForm'),
  branchFilter:document.getElementById('branchFilter'),
  search:document.getElementById('search'),
  results:document.getElementById('results'),
  searchMsg:document.getElementById('searchMsg')
};

const state={access:null,permissions:new Set(),branches:[]};

function msg(el,text,cls=''){
  if(!el)return;
  el.textContent=text;
  el.className=`msg ${cls}`.trim();
}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]));}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0));}
function has(permission){return state.permissions.has(permission);}
function branchById(id){return state.branches.find(x=>x.id===id)||null;}

function renderBranchControls(){
  const allBranches=has('member.all_branches');
  const ownBranch=branchById(state.access.branch_id);
  const options=state.branches.map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');

  if(allBranches){
    E.branchFilter.innerHTML=`<option value="">ทุกสาขา</option>${options}`;
    E.branch.innerHTML=`<option value="">กรุณาเลือกสาขา</option>${options}`;
    E.scopeText.textContent='ขอบเขตข้อมูล: ทุกสาขา';
    E.branchFilter.disabled=false;
    E.branch.disabled=false;
    return;
  }

  if(!state.access.branch_id||!ownBranch){
    throw new Error('บัญชีนี้ยังไม่ได้กำหนดสาขา จึงไม่สามารถใช้งานระบบสมาชิกได้');
  }

  const fixed=`<option value="${ownBranch.id}">${esc(ownBranch.code)} — ${esc(ownBranch.name)}</option>`;
  E.branchFilter.innerHTML=fixed;
  E.branch.innerHTML=fixed;
  E.branchFilter.value=ownBranch.id;
  E.branch.value=ownBranch.id;
  E.branchFilter.disabled=true;
  E.branch.disabled=true;
  E.scopeText.textContent=`ขอบเขตข้อมูล: ${ownBranch.code} — ${ownBranch.name}`;
}

async function loadBranches(){
  const {data,error}=await supabaseClient
    .from('branches')
    .select('id,code,name')
    .eq('is_active',true)
    .order('sort_order');
  if(error)throw error;
  state.branches=data||[];
}

async function init(){
  try{
    const access=await window.TKNAuthGuard.requireAccess('member.view',{
      loadingText:'กำลังตรวจสอบสิทธิ์ระบบสมาชิก...'
    });
    if(!access)return;

    state.access=access;
    state.permissions=new Set(Array.isArray(access.permissions)?access.permissions:[]);
    await loadBranches();
    renderBranchControls();

    E.createSection.hidden=!has('member.create');
    E.historyLink.hidden=!has('member.history');
    window.TKNAuthGuard.ready();
  }catch(error){
    if(error?.code==='INVENTORY_PERMISSION_DENIED')return;
    window.TKNAuthGuard.fail(error,init);
  }
}

E.form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!has('member.create'))return msg(E.formMsg,'บัญชีนี้ไม่มีสิทธิ์สมัครสมาชิก','error');

  const branchId=E.branch.value||null;
  if(!branchId)return msg(E.formMsg,'กรุณาเลือกสาขาที่สมัครสมาชิก','error');

  msg(E.formMsg,'กำลังสมัครสมาชิก...');
  const submit=E.form.querySelector('button[type="submit"]');
  submit.disabled=true;

  try{
    const {data,error}=await supabaseClient.rpc('create_member',{
      p_phone:E.phone.value,
      p_full_name:E.fullName.value,
      p_email:E.email.value||null,
      p_birthday:E.birthday.value||null,
      p_address:null,
      p_branch_id:branchId,
      p_notes:E.notes.value||null
    });
    if(error)throw error;

    msg(E.formMsg,`สมัครสำเร็จ เลขสมาชิก ${data.member_no}`,'ok');
    E.form.reset();
    renderBranchControls();
  }catch(error){
    msg(E.formMsg,error?.message||'สมัครสมาชิกไม่สำเร็จ','error');
  }finally{
    submit.disabled=false;
  }
});

E.searchForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  msg(E.searchMsg,'กำลังค้นหา...');

  let query=supabaseClient
    .from('member_list')
    .select('*')
    .order('updated_at',{ascending:false})
    .limit(100);

  if(E.branchFilter.value)query=query.eq('branch_id',E.branchFilter.value);
  if(q)query=query.or(`phone.ilike.%${q}%,full_name.ilike.%${q}%,member_no.ilike.%${q}%`);

  const {data,error}=await query;
  if(error)return msg(E.searchMsg,error.message,'error');

  E.results.replaceChildren();
  (data||[]).forEach(x=>{
    const row=document.createElement('div');
    row.className='item';
    row.innerHTML=`
      <div>
        <b>${esc(x.member_no)} — ${esc(x.full_name)}</b>
        <small>${esc(x.phone)} • คะแนน ${Number(x.points_balance||0)} • ยอดซื้อ ${money(x.total_spent)} • ${Number(x.total_visits||0)} ครั้ง</small>
      </div>
      <div class="branch-badge">${esc(x.branch_name||'-')}</div>`;
    E.results.appendChild(row);
  });

  msg(E.searchMsg,`พบ ${(data||[]).length} สมาชิก`);
});

init();
