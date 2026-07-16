const E={form:document.getElementById('searchForm'),search:document.getElementById('search'),body:document.getElementById('body'),message:document.getElementById('message')};
function msg(t,c=''){E.message.textContent=t;E.message.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
async function load(){
  let query=supabaseClient.from('member_point_history').select('*').order('created_at',{ascending:false}).limit(1000);
  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  if(q)query=query.or(`phone.ilike.%${q}%,full_name.ilike.%${q}%,member_no.ilike.%${q}%`);
  const {data,error}=await query;
  if(error)return msg(error.message,'error');
  E.body.innerHTML='';
  (data||[]).forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${new Date(x.created_at).toLocaleString('th-TH')}</td><td>${esc(x.member_no)} — ${esc(x.full_name)}</td><td>${esc(x.transaction_type)}</td><td>${x.points_change}</td><td>${x.points_before}</td><td>${x.points_after}</td><td>${esc(x.sale_no||'-')}</td><td>${esc(x.description||'-')}</td>`;
    E.body.appendChild(tr);
  });
  msg(`พบ ${(data||[]).length} รายการ`);
}
E.form.onsubmit=e=>{e.preventDefault();load()};
(async()=>{const{data:{session}}=await supabaseClient.auth.getSession();if(!session){location.href='./dashboard.html';return}load()})();
