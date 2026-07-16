const E={form:document.getElementById('supplierForm'),supplierCode:document.getElementById('supplierCode'),supplierName:document.getElementById('supplierName'),contactName:document.getElementById('contactName'),phone:document.getElementById('phone'),email:document.getElementById('email'),taxId:document.getElementById('taxId'),paymentTerms:document.getElementById('paymentTerms'),address:document.getElementById('address'),notes:document.getElementById('notes'),formMessage:document.getElementById('formMessage'),search:document.getElementById('search'),searchBtn:document.getElementById('searchBtn'),body:document.getElementById('body'),message:document.getElementById('message')};
function msg(el,t,c=''){el.textContent=t;el.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}
async function load(){
  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  let query=supabaseClient.from('supplier_list').select('*').order('supplier_name').limit(1000);
  if(q)query=query.or(`supplier_code.ilike.%${q}%,supplier_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const{data,error}=await query;
  if(error)return msg(E.message,error.message,'error');
  E.body.innerHTML='';
  (data||[]).forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(x.supplier_code)}</td><td>${esc(x.supplier_name)}</td><td>${esc(x.contact_name||'-')}</td><td>${esc(x.phone||'-')}</td><td>${x.payment_terms_days} วัน</td><td>${x.total_purchase_orders}</td><td>${money(x.total_purchase_value)}</td><td>${x.is_active?'ใช้งาน':'ปิด'}</td>`;
    E.body.appendChild(tr);
  });
  msg(E.message,`พบ ${(data||[]).length} รายการ`);
}
E.form.onsubmit=async e=>{
  e.preventDefault();
  const{error}=await supabaseClient.from('suppliers').insert({
    supplier_code:E.supplierCode.value.trim(),
    supplier_name:E.supplierName.value.trim(),
    contact_name:E.contactName.value.trim()||null,
    phone:E.phone.value.trim()||null,
    email:E.email.value.trim()||null,
    tax_id:E.taxId.value.trim()||null,
    payment_terms_days:Number(E.paymentTerms.value)||0,
    address:E.address.value.trim()||null,
    notes:E.notes.value.trim()||null
  });
  if(error)return msg(E.formMessage,error.message,'error');
  msg(E.formMessage,'บันทึกผู้จำหน่ายเรียบร้อย','ok');
  E.form.reset();load();
};
E.searchBtn.onclick=load;E.search.onkeydown=e=>{if(e.key==='Enter')load()};
(async()=>{const{data:{session}}=await supabaseClient.auth.getSession();if(!session){location.href='./dashboard.html';return}load()})();
