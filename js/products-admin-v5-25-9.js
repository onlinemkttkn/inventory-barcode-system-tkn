const E={
  search:document.getElementById('search'),
  searchBtn:document.getElementById('searchBtn'),
  clearSearchBtn:document.getElementById('clearSearchBtn'),
  categoryFilter:document.getElementById('categoryFilter'),
  stockFilter:document.getElementById('stockFilter'),
  activeFilter:document.getElementById('activeFilter'),
  sortFilter:document.getElementById('sortFilter'),
  totalProducts:document.getElementById('totalProducts'),
  activeProducts:document.getElementById('activeProducts'),
  lowStockProducts:document.getElementById('lowStockProducts'),
  outStockProducts:document.getElementById('outStockProducts'),
  resultCount:document.getElementById('resultCount'),
  emptyState:document.getElementById('emptyState'),
  newBtn:document.getElementById('newBtn'),
  body:document.getElementById('body'),
  message:document.getElementById('message'),
  modal:document.getElementById('modal'),
  modalTitle:document.getElementById('modalTitle'),
  closeBtn:document.getElementById('closeBtn'),
  cancelBtn:document.getElementById('cancelBtn'),
  saveBtn:document.getElementById('saveBtn'),
  saveAndNewBtn:document.getElementById('saveAndNewBtn'),
  form:document.getElementById('productForm'),
  productId:document.getElementById('productId'),
  productCode:document.getElementById('productCode'),
  baseSku:document.getElementById('baseSku'),
  costLetter:document.getElementById('costLetter'),
  productName:document.getElementById('productName'),
  barcode:document.getElementById('barcode'),
  generateBaseSkuBtn:document.getElementById('generateBaseSkuBtn'),
  useSkuBarcodeBtn:document.getElementById('useSkuBarcodeBtn'),
  category:document.getElementById('category'),
  unit:document.getElementById('unit'),
  brand:document.getElementById('brand'),
  productType:document.getElementById('productType'),
  productTypeOptions:document.getElementById('productTypeOptions'),
  modelName:document.getElementById('modelName'),
  lotCode:document.getElementById('lotCode'),
  labelName:document.getElementById('labelName'),
  costPrice:document.getElementById('costPrice'),
  sellingPrice:document.getElementById('sellingPrice'),
  markupPercent:document.getElementById('markupPercent'),
  vatMode:document.getElementById('vatMode'),
  priceRounding:document.getElementById('priceRounding'),
  calculatePriceBtn:document.getElementById('calculatePriceBtn'),
  minimumStock:document.getElementById('minimumStock'),
  vatRate:document.getElementById('vatRate'),
  imageUrl:document.getElementById('imageUrl'),
  isActive:document.getElementById('isActive'),
  initialBranch:document.getElementById('initialBranch'),
  initialQuantity:document.getElementById('initialQuantity'),
  description:document.getElementById('description'),
  formMessage:document.getElementById('formMessage'),
  selectAllProductCodes:document.getElementById('selectAllProductCodes'),
  productCodeSelectedCount:document.getElementById('productCodeSelectedCount'),
  downloadSelectedProductCodes:document.getElementById('downloadSelectedProductCodes'),
  clearSelectedProductCodes:document.getElementById('clearSelectedProductCodes')
};

let rows=[];
let access=null;
const PATTERN=window.TKNProductPattern;
let manualLabelName=false;
let createReturnTo="";
let createSourceScan="";
const selectedProductCodes=new Set();
function refreshCodeSelection(){const count=selectedProductCodes.size;E.productCodeSelectedCount.textContent=`เลือกแล้ว ${count.toLocaleString('th-TH')} รายการ`;E.downloadSelectedProductCodes.disabled=count===0;E.clearSelectedProductCodes.disabled=count===0;const visible=filteredRows();E.selectAllProductCodes.checked=visible.length>0&&visible.every(x=>selectedProductCodes.has(String(x.id)));E.selectAllProductCodes.indeterminate=count>0&&!E.selectAllProductCodes.checked;}

function msg(el,text,cls=''){el.textContent=text;el.className='msg '+cls}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}
function selectedBrandName(){return E.brand.options[E.brand.selectedIndex]?.text?.replace(/^.*?—\s*/,'').replace(/^ไม่ระบุยี่ห้อ$/,'')||''}
function generateBaseSku(){
  const type=String(E.productType.value||'PD').replace(/[^0-9A-Za-zก-๙]/g,'').slice(0,3).toUpperCase()||'PD';
  const model=String(E.modelName.value||'').replace(/[^0-9A-Za-z]/g,'').slice(0,8).toUpperCase();
  const tail=String(Date.now()).slice(-5);
  E.baseSku.value=[type,model||tail].filter(Boolean).join('-');
  refreshSkuPreview(true);
}
function refreshSkuPreview(forceLetter=false){
  if(forceLetter||!E.costLetter.value)E.costLetter.value=PATTERN?.randomLetter?.()||'X';
  const base=E.baseSku.value.trim();
  if(!base){E.productCode.value='';return}
  try{E.productCode.value=PATTERN.buildLotSku(base,Number(E.costPrice.value)||0,E.costLetter.value)}catch(_){E.productCode.value=''}
}
function refreshLabelName(force=false){
  if(manualLabelName&&!force)return;
  E.labelName.value=PATTERN?.conciseLabel?.({name:E.productName.value,product_type_th:E.productType.value,brand_name:selectedBrandName(),model_name:E.modelName.value},{maxChars:52,maxLines:2})||E.productName.value.trim();
}
function calculatePrice(){
  E.sellingPrice.value=PATTERN?.calculateSellingPrice?.(E.costPrice.value,E.markupPercent.value,E.vatRate.value,E.vatMode.value,E.priceRounding.value)??0;
}
function safeReturnUrl(raw){
  if(!raw)return '';
  try{
    const url=new URL(raw,location.href);
    if(url.origin!==location.origin)return '';
    if(!/\/box-qr-stock\.html$/i.test(url.pathname))return '';
    return `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
  }catch(_){return ''}
}
function applyCreateIntent(){
  const params=new URLSearchParams(location.search);
  if(params.get('action')!=='new')return;
  createSourceScan=String(params.get('scan')||'').trim().replace(/^TKN-P-/i,'');
  createReturnTo=safeReturnUrl(params.get('return_to'));
  openNew();
  if(!createSourceScan)return;
  E.barcode.value=createSourceScan;
  const parsed=PATTERN?.parseLotSku?.(createSourceScan);
  if(parsed?.hasEmbeddedCost){
    E.baseSku.value=parsed.baseSku||'';
    E.costLetter.value=parsed.costLetter||E.costLetter.value;
    E.costPrice.value=Number(parsed.embeddedCost||0);
    calculatePrice();
    refreshSkuPreview();
  }else if(!/^\d+$/.test(createSourceScan)){
    E.baseSku.value=String(PATTERN?.normalizeSku?.(createSourceScan)||createSourceScan)
      .replace(/[^0-9A-Za-zก-๙._-]/g,'').slice(0,40);
    refreshSkuPreview();
  }
  msg(E.formMessage,`รหัส ${createSourceScan} ยังไม่พบในระบบ กรุณากรอกชื่อ หมวดหมู่ ต้นทุน และราคาขายให้ครบก่อนบันทึก`,'error');
}

function friendlyProductError(error){
  const text=String(error?.message||'');
  if(text.includes('products_product_code_key')){
    const code=E.productCode.value.trim();
    return code
      ? `รหัสสินค้า "${code}" มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น`
      : 'รหัสสินค้านี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น';
  }
  if(text.includes('products_barcode_key')){
    const barcode=E.barcode.value.trim();
    return barcode
      ? `บาร์โค้ด "${barcode}" มีอยู่ในระบบแล้ว กรุณาใช้บาร์โค้ดอื่น`
      : 'บาร์โค้ดนี้มีอยู่ในระบบแล้ว กรุณาใช้บาร์โค้ดอื่น';
  }
  if(error?.code==='23505'){
    return 'รหัสสินค้าหรือบาร์โค้ดซ้ำกับข้อมูลเดิม กรุณาตรวจสอบอีกครั้ง';
  }
  if(text.includes('create_product_lot_v5250')||text.includes('update_product_admin_v5250'))return 'ยังไม่ได้ติดตั้งฐานข้อมูล v5.25.0 กรุณารันไฟล์ SQL ในแพ็กก่อน';
  return text||'ไม่สามารถบันทึกสินค้าได้ กรุณาลองใหม่อีกครั้ง';
}

async function init(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='./dashboard.html';return}

  const {data:a,error:accessError}=
    await supabaseClient.rpc('current_access_context');

  if(accessError||!a?.user_id||a.is_active!==true){
    location.href='./dashboard.html';
    return;
  }

  access=a;
  const accessPacket=JSON.stringify({savedAt:Date.now(),data:{
    ...a,
    role:String(a.role||'staff').trim().toLowerCase(),
    permissions:Array.isArray(a.permissions)?a.permissions:[]
  }});
  sessionStorage.setItem('tkn_access_context_v3',accessPacket);
  localStorage.setItem('tkn_access_context_shared_v4',accessPacket);
  sessionStorage.setItem('tkn_user_role',String(a.role||'staff').trim().toLowerCase());
  sessionStorage.setItem('tkn_permissions',JSON.stringify(Array.isArray(a.permissions)?a.permissions:[]));
  sessionStorage.setItem('tkn_current_actor',a.full_name||a.email||a.user_id);
  window.dispatchEvent(new CustomEvent('tkn:access-ready',{detail:a}));
  if(!(a.permissions||[]).includes('product.manage')){
    alert('บัญชีนี้ไม่มีสิทธิ์จัดการสินค้า (product.manage)');
    location.href=a.landing_page||'./dashboard.html';
    return;
  }

  await loadOptions();
  await loadProducts();
  applyCreateIntent();
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
  E.categoryFilter.innerHTML='<option value="">ทุกหมวดหมู่</option>'+(cats.data||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  E.unit.innerHTML=(units.data||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  E.brand.innerHTML='<option value="">ไม่ระบุยี่ห้อ</option>'+(brands.data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  E.initialBranch.innerHTML='<option value="">ไม่กำหนดสต๊อกเริ่มต้น</option>'+(branches.data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
}

async function loadProducts(){
  msg(E.message,'กำลังโหลดสินค้า...');
  const q=E.search.value.trim().replace(/[%_,()]/g,'');

  let query=supabaseClient
    .from('product_management_list_v5250')
    .select('*')
    .order('updated_at',{ascending:false})
    .limit(1000);

  if(q)query=query.or(`name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%,source_barcode.ilike.%${q}%,base_sku.ilike.%${q}%`);
  let result=await query;
  if(result.error){
    let fallback=supabaseClient.from('product_management_list').select('*').order('updated_at',{ascending:false}).limit(1000);
    if(q)fallback=fallback.or(`name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%`);
    result=await fallback;
  }
  const {data,error}=result;
  if(error)return msg(E.message,`โหลดสินค้าไม่สำเร็จ: ${error.message} (ตรวจว่ารัน SQL v5.25.0 แล้ว)`, 'error');

  rows=data||[];
  renderSummary();
  render();
}

function stockState(x){
  const quantity=Number(x.total_branch_quantity||0);
  const minimum=Number(x.minimum_stock||0);
  if(quantity<=0)return 'out';
  if(minimum>0&&quantity<=minimum)return 'low';
  return 'ready';
}

function renderSummary(){
  const active=rows.filter(x=>x.is_active).length;
  const low=rows.filter(x=>stockState(x)==='low').length;
  const out=rows.filter(x=>stockState(x)==='out').length;
  E.totalProducts.textContent=rows.length.toLocaleString('th-TH');
  E.activeProducts.textContent=active.toLocaleString('th-TH');
  E.lowStockProducts.textContent=low.toLocaleString('th-TH');
  E.outStockProducts.textContent=out.toLocaleString('th-TH');
}

function filteredRows(){
  let result=rows.filter(x=>{
    if(E.categoryFilter.value&&x.category_id!==E.categoryFilter.value)return false;
    if(E.stockFilter.value&&stockState(x)!==E.stockFilter.value)return false;
    if(E.activeFilter.value&&String(x.is_active)!==E.activeFilter.value)return false;
    return true;
  });

  if(E.sortFilter.value==='name')result.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'th'));
  if(E.sortFilter.value==='stock')result.sort((a,b)=>Number(a.total_branch_quantity||0)-Number(b.total_branch_quantity||0));
  if(E.sortFilter.value==='price')result.sort((a,b)=>Number(b.selling_price||0)-Number(a.selling_price||0));
  return result;
}

function render(){
  E.body.innerHTML='';
  const visible=filteredRows();
  E.resultCount.textContent=`${visible.length.toLocaleString('th-TH')} รายการ`;
  E.emptyState.classList.toggle('hidden',visible.length!==0);

  visible.forEach(x=>{
    const stock=stockState(x);
    const stockText=stock==='out'?'สินค้าหมด':stock==='low'?'ใกล้หมด':'ปกติ';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td data-label="เลือก"><input class="code-select" type="checkbox" data-product-code-select="${esc(x.id)}" aria-label="เลือก ${esc(x.label_name||x.name)}" ${selectedProductCodes.has(String(x.id))?'checked':''}></td>
      <td data-label="สินค้า"><div class="product-cell"><span class="product-avatar">${esc(String(x.name||'?').charAt(0))}</span><div><strong>${esc(x.label_name||x.name)}</strong><small>${esc([x.product_type_th,x.brand_name,x.model_name].filter(Boolean).join(' · ')||'ยังไม่ระบุประเภท/ยี่ห้อ/รุ่น')}</small></div></div></td>
      <td data-label="รหัส / บาร์โค้ด"><strong class="code-text">${esc(x.product_code)}</strong><small class="barcode-text">SKU หลัก ${esc(x.base_sku||'-')} · ${esc(x.lot_code||'ไม่ระบุล็อต')}</small></td>
      <td data-label="หมวดหมู่"><span class="category-chip">${esc(x.category_name||'-')}</span></td>
      <td data-label="ราคาทุน">${money(x.cost_price)}</td>
      <td data-label="ราคาขาย" class="selling-price">${money(x.selling_price)}</td>
      <td data-label="คงเหลือ"><div class="stock-value ${stock}"><strong>${Number(x.total_branch_quantity||0).toLocaleString('th-TH')}</strong><small>${stockText}</small></div></td>
      <td data-label="สถานะ"><span class="badge ${x.is_active?'active':'inactive'}">${x.is_active?'ใช้งาน':'ปิด'}</span></td>`;

    const td=document.createElement('td');
    td.className='actions';
    td.dataset.label='จัดการ';

    const edit=document.createElement('button');
    edit.className='btn table-btn edit-btn';
    edit.textContent='แก้ไข';
    edit.onclick=()=>openEdit(x);

    const barcode=document.createElement('a');
    barcode.className='btn table-btn barcode-btn';
    const barcodeParams=new URLSearchParams({
      product:String(x.id||''),
      name:String(x.name||''),
      code:String(x.product_code||'')
    });
    barcodeParams.set('source','products-admin');
    barcode.href=`./print-labels.html?${barcodeParams.toString()}`;
    barcode.setAttribute('aria-label',`สร้าง Barcode สำหรับ ${x.name||'สินค้า'} รหัส ${x.product_code||'-'}`);
    barcode.textContent='Barcode';

    const viewCode=document.createElement('button');
    viewCode.className='btn table-btn code-download-btn';
    viewCode.type='button';viewCode.textContent='ดู/ดาวน์โหลดรหัส';
    viewCode.onclick=()=>window.TKNCodeDownload?.openProduct(x);

    td.append(edit,barcode,viewCode);
    tr.appendChild(td);
    E.body.appendChild(tr);
  });
  msg(E.message,visible.length?`แสดง ${visible.length.toLocaleString('th-TH')} จาก ${rows.length.toLocaleString('th-TH')} รายการ`:'');
  refreshCodeSelection();
}

function resetForm(){
  E.form.reset();
  E.productId.value='';
  E.baseSku.value='';
  E.productCode.value='';
  E.costLetter.value=PATTERN?.randomLetter?.()||'X';
  E.productType.value='';E.modelName.value='';E.lotCode.value='';E.labelName.value='';
  E.costPrice.value='0';
  E.sellingPrice.value='0';
  E.markupPercent.value='0';E.vatRate.value='7';E.vatMode.value='EXCLUDED';E.priceRounding.value='BAHT';
  E.minimumStock.value='0';
  E.initialQuantity.value='0';
  E.initialBranch.disabled=false;
  E.initialQuantity.disabled=false;
  manualLabelName=false;
  E.productCode.readOnly=true;
  E.baseSku.readOnly=false;
  msg(E.formMessage,'');
}

function openNew(){
  resetForm();
  E.modalTitle.textContent='เพิ่มสินค้าใหม่';
  E.saveAndNewBtn.classList.remove('hidden');
  E.form.scrollTop=0;
  E.modal.classList.remove('hidden');
  requestAnimationFrame(()=>{
    E.form.scrollTop=0;
    E.productName.focus({preventScroll:true});
  });
}

function openEdit(x){
  resetForm();
  E.modalTitle.textContent='แก้ไขสินค้า';
  E.saveAndNewBtn.classList.add('hidden');
  E.productId.value=x.id;
  E.productCode.value=x.product_code||'';
  E.baseSku.value=x.base_sku||PATTERN?.stripLotSuffix?.(x.product_code)||x.product_code||'';
  E.costLetter.value=x.lot_cost_letter||PATTERN?.parseLotSku?.(x.product_code)?.costLetter||'X';
  E.productName.value=x.name||'';
  E.barcode.value=x.source_barcode||'';
  E.category.value=x.category_id||'';
  E.unit.value=x.unit_id||'';
  E.brand.value=x.brand_id||'';
  E.productType.value=x.product_type_th||'';E.modelName.value=x.model_name||'';E.lotCode.value=x.lot_code||'';E.labelName.value=x.label_name||x.name||'';
  E.costPrice.value=x.cost_price||0;
  E.markupPercent.value=x.markup_percent||0;E.vatMode.value=x.vat_mode||'EXCLUDED';E.priceRounding.value=x.price_rounding||'BAHT';
  E.sellingPrice.value=x.selling_price||0;
  E.minimumStock.value=x.minimum_stock||0;
  E.vatRate.value=x.vat_rate||0;
  E.imageUrl.value=x.image_url||'';
  E.isActive.value=String(x.is_active);
  E.description.value=x.description||'';
  manualLabelName=true;
  E.baseSku.readOnly=true;
  E.initialBranch.disabled=true;
  E.initialQuantity.disabled=true;
  E.form.scrollTop=0;
  E.modal.classList.remove('hidden');
  requestAnimationFrame(()=>{
    E.form.scrollTop=0;
    E.productName.focus({preventScroll:true});
  });
}

E.generateBaseSkuBtn.onclick=generateBaseSku;
E.useSkuBarcodeBtn.onclick=()=>{E.barcode.value='';msg(E.formMessage,'Barcode ภายในจะใช้ SKU ของล็อตอัตโนมัติ','ok')};
E.calculatePriceBtn.onclick=()=>{calculatePrice();refreshSkuPreview();msg(E.formMessage,'คำนวณราคาขายและอัปเดต SKU ของล็อตแล้ว','ok')};
E.labelName.addEventListener('input',()=>{manualLabelName=Boolean(E.labelName.value.trim())});
[E.productName,E.productType,E.modelName,E.brand].forEach(node=>node.addEventListener('input',()=>refreshLabelName()));
E.brand.addEventListener('change',()=>refreshLabelName());
[E.baseSku,E.costPrice].forEach(node=>node.addEventListener('input',()=>refreshSkuPreview()));
[E.costPrice,E.markupPercent,E.vatRate,E.vatMode,E.priceRounding].forEach(node=>node.addEventListener('change',()=>{calculatePrice();refreshSkuPreview()}));
E.productTypeOptions.innerHTML=(PATTERN?.THAI_AUDIO_TYPES||[]).map(x=>`<option value="${esc(x)}"></option>`).join('');

E.form.onsubmit=async event=>{
  event.preventDefault();
  const submitMode=event.submitter?.value||'save';

  if(!(access?.permissions||[]).includes('product.manage')){
    return msg(E.formMessage,'เฉพาะ Owner หรือ Admin เท่านั้น','error');
  }

  E.saveBtn.disabled=true;
  E.saveAndNewBtn.disabled=true;
  msg(E.formMessage,'กำลังบันทึกสินค้า...');

  refreshLabelName();
  if(!E.productId.value)refreshSkuPreview();
  const common={
    p_name:E.productName.value,
    p_source_barcode:E.barcode.value||null,
    p_category_id:E.category.value,
    p_unit_id:E.unit.value,
    p_brand_id:E.brand.value||null,
    p_cost_price:Number(E.costPrice.value)||0,
    p_markup_percent:Number(E.markupPercent.value)||0,
    p_vat_rate:Number(E.vatRate.value)||0,
    p_vat_mode:E.vatMode.value,
    p_price_rounding:E.priceRounding.value,
    p_selling_price:Number(E.sellingPrice.value)||0,
    p_product_type_th:E.productType.value||null,
    p_model_name:E.modelName.value||null,
    p_label_name:E.labelName.value||null,
    p_lot_code:E.lotCode.value||null,
    p_description:E.description.value||null,
    p_image_url:E.imageUrl.value||null,
    p_minimum_stock:Number(E.minimumStock.value)||0,
    p_is_active:E.isActive.value==='true'
  };

  let result;
  if(E.productId.value){
    result=await supabaseClient.rpc('update_product_admin_v5250',{p_product_id:E.productId.value,...common});
  }else{
    result=await supabaseClient.rpc('create_product_lot_v5250',{
      p_base_sku:E.baseSku.value,
      p_cost_letter:E.costLetter.value||null,
      ...common,
      p_initial_branch_id:E.initialBranch.value||null,
      p_initial_quantity:Number(E.initialQuantity.value)||0
    });
  }

  if(result.error){
    E.saveBtn.disabled=false;
    E.saveAndNewBtn.disabled=false;
    return msg(E.formMessage,friendlyProductError(result.error),'error');
  }

  msg(E.formMessage,'บันทึกสินค้าเรียบร้อย','ok');
  await loadProducts();
  E.saveBtn.disabled=false;
  E.saveAndNewBtn.disabled=false;

  if(submitMode==='save-new'&&!E.productId.value){
    resetForm();
    createReturnTo='';
    createSourceScan='';
    msg(E.formMessage,'บันทึกแล้ว พร้อมเพิ่มสินค้ารายการถัดไป','ok');
    E.productName.focus();
  }else if(createReturnTo&&!E.productId.value){
    msg(E.formMessage,'บันทึกสินค้าแล้ว กำลังกลับไปหน้ารับสินค้า...','ok');
    setTimeout(()=>location.href=createReturnTo,650);
  }else{
    setTimeout(closeModal,450);
  }
};

E.searchBtn.onclick=loadProducts;
E.search.oninput=()=>E.clearSearchBtn.classList.toggle('hidden',!E.search.value);
E.search.onkeydown=e=>{if(e.key==='Enter')loadProducts()};
E.clearSearchBtn.onclick=()=>{
  E.search.value='';
  E.clearSearchBtn.classList.add('hidden');
  loadProducts();
  E.search.focus();
};
[E.categoryFilter,E.stockFilter,E.activeFilter,E.sortFilter].forEach(el=>el.onchange=render);
E.body.addEventListener('change',event=>{const input=event.target.closest?.('[data-product-code-select]');if(!input)return;const id=String(input.dataset.productCodeSelect);if(input.checked)selectedProductCodes.add(id);else selectedProductCodes.delete(id);refreshCodeSelection()});
E.selectAllProductCodes.onchange=()=>{filteredRows().forEach(x=>{const id=String(x.id);if(E.selectAllProductCodes.checked)selectedProductCodes.add(id);else selectedProductCodes.delete(id)});render()};
E.clearSelectedProductCodes.onclick=()=>{selectedProductCodes.clear();render()};
E.downloadSelectedProductCodes.onclick=async()=>{const chosen=rows.filter(x=>selectedProductCodes.has(String(x.id)));E.downloadSelectedProductCodes.disabled=true;E.downloadSelectedProductCodes.textContent='กำลังสร้าง ZIP...';try{await window.TKNCodeDownload.downloadProductZip(chosen);msg(E.message,`ดาวน์โหลด QR + Barcode ${chosen.length} รายการแล้ว`)}catch(error){msg(E.message,error.message||String(error),'error')}finally{E.downloadSelectedProductCodes.textContent='ดาวน์โหลด QR + Barcode ที่เลือก (.zip)';refreshCodeSelection()}};
E.newBtn.onclick=openNew;
function closeModal(){E.modal.classList.add('hidden')}
E.closeBtn.onclick=closeModal;
E.cancelBtn.onclick=closeModal;
E.modal.onclick=e=>{if(e.target===E.modal)closeModal()};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!E.modal.classList.contains('hidden'))closeModal();
});

init();
