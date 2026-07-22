const E={
  search:document.getElementById('search'),
  searchBtn:document.getElementById('searchBtn'),
  newBtn:document.getElementById('newBtn'),
  body:document.getElementById('body'),
  message:document.getElementById('message'),
  modal:document.getElementById('modal'),
  modalTitle:document.getElementById('modalTitle'),
  closeBtn:document.getElementById('closeBtn'),
  form:document.getElementById('productForm'),
  productId:document.getElementById('productId'),
  productCode:document.getElementById('productCode'),
  productName:document.getElementById('productName'),
  barcode:document.getElementById('barcode'),
  generateBarcodeBtn:document.getElementById('generateBarcodeBtn'),
  category:document.getElementById('category'),
  unit:document.getElementById('unit'),
  brand:document.getElementById('brand'),
  costPrice:document.getElementById('costPrice'),
  sellingPrice:document.getElementById('sellingPrice'),
  minimumStock:document.getElementById('minimumStock'),
  vatRate:document.getElementById('vatRate'),
  imageUrl:document.getElementById('imageUrl'),
  isActive:document.getElementById('isActive'),
  initialBranch:document.getElementById('initialBranch'),
  initialQuantity:document.getElementById('initialQuantity'),
  description:document.getElementById('description'),
  formMessage:document.getElementById('formMessage')
};

let rows=[];
let profile=null;

function msg(el,text,cls=''){el.textContent=text;el.className='msg '+cls}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}

async function init(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='./dashboard.html';return}

  const {data:p}=await supabaseClient.from('profiles').select('role,is_active').eq('id',session.user.id).maybeSingle();
  if(!p||p.is_active!==true){location.href='./dashboard.html';return}
  profile=p;

  await loadOptions();
  await loadProducts();
}

async function loadOptions(){
  const [cats,units,brands,branches]=await Promise.all([
    supabaseClient.from('categories').select('id,code,name').order('name'),
    supabaseClient.from('units').select('id,name').order('name'),
    supabaseClient.from('brands').select('id,code,name').eq('is_active',true).order('name'),
    supabaseClient.from('branches').select('id,code,name').eq('is_active',true).order('sort_order')
  ]);

  const error=[cats.error,units.error,brands.error,branches.error].find(Boolean);
  if(error)return msg(E.message,error.message,'error');

  E.category.innerHTML=(cats.data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  E.unit.innerHTML=(units.data||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  E.brand.innerHTML='<option value="">ไม่ระบุยี่ห้อ</option>'+(brands.data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  E.initialBranch.innerHTML='<option value="">ไม่กำหนดสต๊อกเริ่มต้น</option>'+(branches.data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
}

async function loadProducts(){
  msg(E.message,'กำลังโหลดสินค้า...');
  const q=E.search.value.trim().replace(/[%_,()]/g,'');

  let query=supabaseClient
    .from('product_management_list')
    .select('*')
    .order('updated_at',{ascending:false})
    .limit(1000);

  if(q){
    query=query.or(`name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%`);
  }

  const {data,error}=await query;
  if(error)return msg(E.message,error.message,'error');

  rows=data||[];
  render();
  msg(E.message,`พบ ${rows.length} รายการ`);
}

function render(){
  E.body.innerHTML='';

  rows.forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${esc(x.product_code)}</td>
      <td>${esc(x.name)}</td>
      <td>${esc(x.barcode||'-')}</td>
      <td>${esc(x.category_name||'-')}</td>
      <td>${esc(x.brand_name||'-')}</td>
      <td>${money(x.cost_price)}</td>
      <td>${money(x.selling_price)}</td>
      <td>${Number(x.total_branch_quantity||0).toLocaleString('th-TH')}</td>
      <td><span class="badge ${x.is_active?'active':'inactive'}">${x.is_active?'ใช้งาน':'ปิด'}</span></td>`;

    const td=document.createElement('td');
    td.className='actions';

    const edit=document.createElement('button');
    edit.className='btn secondary';
    edit.textContent='แก้ไข';
    edit.onclick=()=>openEdit(x);

    const barcode=document.createElement('a');
    barcode.className='btn secondary';
    barcode.href=`./generator.html?product=${x.id}`;
    barcode.textContent='Barcode';

    td.append(edit,barcode);
    tr.appendChild(td);
    E.body.appendChild(tr);
  });
}

function resetForm(){
  E.form.reset();
  E.productId.value='';
  E.costPrice.value='0';
  E.sellingPrice.value='0';
  E.minimumStock.value='0';
  E.vatRate.value='0';
  E.initialQuantity.value='0';
  E.initialBranch.disabled=false;
  E.initialQuantity.disabled=false;
  msg(E.formMessage,'');
}

function openNew(){
  resetForm();
  E.modalTitle.textContent='เพิ่มสินค้าใหม่';
  E.modal.classList.remove('hidden');
}

function openEdit(x){
  resetForm();
  E.modalTitle.textContent='แก้ไขสินค้า';
  E.productId.value=x.id;
  E.productCode.value=x.product_code||'';
  E.productName.value=x.name||'';
  E.barcode.value=x.barcode||'';
  E.category.value=x.category_id||'';
  E.unit.value=x.unit_id||'';
  E.brand.value=x.brand_id||'';
  E.costPrice.value=x.cost_price||0;
  E.sellingPrice.value=x.selling_price||0;
  E.minimumStock.value=x.minimum_stock||0;
  E.vatRate.value=x.vat_rate||0;
  E.imageUrl.value=x.image_url||'';
  E.isActive.value=String(x.is_active);
  E.description.value=x.description||'';
  E.initialBranch.disabled=true;
  E.initialQuantity.disabled=true;
  E.modal.classList.remove('hidden');
}

E.generateBarcodeBtn.onclick=async()=>{
  const {data,error}=await supabaseClient.rpc('generate_product_barcode');
  if(error)return msg(E.formMessage,error.message,'error');
  E.barcode.value=data;
};

E.form.onsubmit=async event=>{
  event.preventDefault();

  if(!['owner','admin'].includes(String(profile.role||'').toLowerCase())){
    return msg(E.formMessage,'เฉพาะ Owner หรือ Admin เท่านั้น','error');
  }

  const common={
    p_product_code:E.productCode.value,
    p_name:E.productName.value,
    p_barcode:E.barcode.value||null,
    p_category_id:E.category.value,
    p_unit_id:E.unit.value,
    p_brand_id:E.brand.value||null,
    p_cost_price:Number(E.costPrice.value)||0,
    p_selling_price:Number(E.sellingPrice.value)||0,
    p_minimum_stock:Number(E.minimumStock.value)||0,
    p_vat_rate:Number(E.vatRate.value)||0,
    p_description:E.description.value||null,
    p_image_url:E.imageUrl.value||null,
    p_is_active:E.isActive.value==='true'
  };

  let result;

  if(E.productId.value){
    result=await supabaseClient.rpc('update_product_admin',{
      p_product_id:E.productId.value,
      ...common
    });
  }else{
    result=await supabaseClient.rpc('create_product_admin',{
      ...common,
      p_initial_branch_id:E.initialBranch.value||null,
      p_initial_quantity:Number(E.initialQuantity.value)||0
    });
  }

  if(result.error)return msg(E.formMessage,result.error.message,'error');

  msg(E.formMessage,'บันทึกสินค้าเรียบร้อย','ok');
  await loadProducts();
  setTimeout(()=>E.modal.classList.add('hidden'),500);
};

E.searchBtn.onclick=loadProducts;
E.search.onkeydown=e=>{if(e.key==='Enter')loadProducts()};
E.newBtn.onclick=openNew;
E.closeBtn.onclick=()=>E.modal.classList.add('hidden');
E.modal.onclick=e=>{if(e.target===E.modal)E.modal.classList.add('hidden')};

init();
