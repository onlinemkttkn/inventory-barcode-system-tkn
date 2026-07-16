const E={
  form:document.getElementById('memberForm'),
  fullName:document.getElementById('fullName'),
  phone:document.getElementById('phone'),
  email:document.getElementById('email'),
  birthday:document.getElementById('birthday'),
  branch:document.getElementById('branch'),
  notes:document.getElementById('notes'),
  formMsg:document.getElementById('formMsg'),
  searchForm:document.getElementById('searchForm'),
  search:document.getElementById('search'),
  results:document.getElementById('results'),
  searchMsg:document.getElementById('searchMsg')
};

function msg(el,text,cls=''){el.textContent=text;el.className='msg '+cls}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}

async function init(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='./dashboard.html';return}

  const {data,error}=await supabaseClient
    .from('branches')
    .select('id,code,name')
    .eq('is_active',true)
    .order('sort_order');

  if(error)return msg(E.formMsg,error.message,'error');

  E.branch.innerHTML='<option value="">ไม่ระบุสาขา</option>'+
    (data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
}

E.form.onsubmit=async event=>{
  event.preventDefault();
  msg(E.formMsg,'กำลังสมัครสมาชิก...');

  const {data,error}=await supabaseClient.rpc('create_member',{
    p_phone:E.phone.value,
    p_full_name:E.fullName.value,
    p_email:E.email.value||null,
    p_birthday:E.birthday.value||null,
    p_address:null,
    p_branch_id:E.branch.value||null,
    p_notes:E.notes.value||null
  });

  if(error)return msg(E.formMsg,error.message,'error');

  msg(E.formMsg,`สมัครสำเร็จ เลขสมาชิก ${data.member_no}`,'ok');
  E.form.reset();
};

E.searchForm.onsubmit=async event=>{
  event.preventDefault();

  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  if(!q)return;

  const {data,error}=await supabaseClient
    .from('member_list')
    .select('*')
    .or(`phone.ilike.%${q}%,full_name.ilike.%${q}%,member_no.ilike.%${q}%`)
    .order('updated_at',{ascending:false})
    .limit(30);

  if(error)return msg(E.searchMsg,error.message,'error');

  E.results.innerHTML='';

  (data||[]).forEach(x=>{
    const row=document.createElement('div');
    row.className='item';
    row.innerHTML=`
      <div>
        <b>${esc(x.member_no)} — ${esc(x.full_name)}</b>
        <small>${esc(x.phone)} • คะแนน ${x.points_balance} • ยอดซื้อ ${money(x.total_spent)} • ${x.total_visits} ครั้ง</small>
      </div>
      <div>${esc(x.branch_name||'-')}</div>`;
    E.results.appendChild(row);
  });

  msg(E.searchMsg,`พบ ${(data||[]).length} สมาชิก`);
};

init();
