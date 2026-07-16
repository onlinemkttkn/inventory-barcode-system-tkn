const E={categoryCode:document.getElementById('categoryCode'),categoryName:document.getElementById('categoryName'),parentCategory:document.getElementById('parentCategory'),addCategory:document.getElementById('addCategory'),categoryList:document.getElementById('categoryList'),unitName:document.getElementById('unitName'),addUnit:document.getElementById('addUnit'),unitList:document.getElementById('unitList'),brandCode:document.getElementById('brandCode'),brandName:document.getElementById('brandName'),addBrand:document.getElementById('addBrand'),brandList:document.getElementById('brandList'),message:document.getElementById('message')};
function msg(t,c=''){E.message.textContent=t;E.message.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
async function load(){
  const [cats,units,brands]=await Promise.all([
    supabaseClient.from('categories').select('*').order('code'),
    supabaseClient.from('units').select('*').order('name'),
    supabaseClient.from('brands').select('*').order('name')
  ]);
  const error=[cats.error,units.error,brands.error].find(Boolean);
  if(error)return msg(error.message,'error');

  E.parentCategory.innerHTML='<option value="">หมวดหมู่หลัก</option>'+(cats.data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  E.categoryList.innerHTML=(cats.data||[]).map(x=>`<div class="item"><div><b>${esc(x.code)}</b><small>${esc(x.name)}</small></div></div>`).join('');
  E.unitList.innerHTML=(units.data||[]).map(x=>`<div class="item"><b>${esc(x.name)}</b></div>`).join('');
  E.brandList.innerHTML=(brands.data||[]).map(x=>`<div class="item"><div><b>${esc(x.code)}</b><small>${esc(x.name)}</small></div></div>`).join('');
}
E.addCategory.onclick=async()=>{
  const {error}=await supabaseClient.from('categories').insert({
    code:E.categoryCode.value.trim(),
    name:E.categoryName.value.trim(),
    parent_id:E.parentCategory.value||null,
    is_active:true
  });
  if(error)return msg(error.message,'error');
  E.categoryCode.value='';E.categoryName.value='';load();
};
E.addUnit.onclick=async()=>{
  const {error}=await supabaseClient.from('units').insert({name:E.unitName.value.trim()});
  if(error)return msg(error.message,'error');
  E.unitName.value='';load();
};
E.addBrand.onclick=async()=>{
  const {error}=await supabaseClient.from('brands').insert({
    code:E.brandCode.value.trim(),
    name:E.brandName.value.trim(),
    is_active:true
  });
  if(error)return msg(error.message,'error');
  E.brandCode.value='';E.brandName.value='';load();
};
(async()=>{const{data:{session}}=await supabaseClient.auth.getSession();if(!session){location.href='./dashboard.html';return}load()})();
