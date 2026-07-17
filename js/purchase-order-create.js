const E={supplier:document.getElementById('supplier'),branch:document.getElementById('branch'),orderDate:document.getElementById('orderDate'),expectedDate:document.getElementById('expectedDate'),referenceNo:document.getElementById('referenceNo'),discount:document.getElementById('discount'),notes:document.getElementById('notes'),searchForm:document.getElementById('searchForm'),search:document.getElementById('search'),results:document.getElementById('results'),searchMessage:document.getElementById('searchMessage'),cart:document.getElementById('cart'),subtotal:document.getElementById('subtotal'),vat:document.getElementById('vat'),discountTotal:document.getElementById('discountTotal'),grandTotal:document.getElementById('grandTotal'),saveBtn:document.getElementById('saveBtn'),actionMessage:document.getElementById('actionMessage')};
const cart=new Map();
function msg(el,t,c=''){el.textContent=t;el.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}
async function init(){
  const{data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='./dashboard.html';return}
  const[sup,br]=await Promise.all([
    supabaseClient.from('suppliers').select('id,supplier_code,supplier_name').eq('is_active',true).order('supplier_name'),
    supabaseClient.from('branches').select('id,code,name').eq('is_active',true).order('sort_order')
  ]);
  const error=sup.error||br.error;if(error)return msg(E.actionMessage,error.message,'error');
  E.supplier.innerHTML=(sup.data||[]).map(x=>`<option value="${x.id}">${esc(x.supplier_code)} — ${esc(x.supplier_name)}</option>`).join('');
  E.branch.innerHTML=(br.data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  E.orderDate.value=new Date().toISOString().slice(0,10);render();
}
E.searchForm.onsubmit=async e=>{
  e.preventDefault();
  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  if(!q)return;
  const{data,error}=await supabaseClient.from('product_management_list').select('*').eq('is_active',true).or(`name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%`).limit(20);
  if(error)return msg(E.searchMessage,error.message,'error');
  E.results.innerHTML='';
  (data||[]).forEach(x=>{
    const row=document.createElement('div');row.className='item';
    row.innerHTML=`<div><b>${esc(x.name)}</b><small>${esc(x.product_code)} • ต้นทุนล่าสุด ${money(x.cost_price)}</small></div>`;
    const b=document.createElement('button');b.className='btn primary';b.textContent='เพิ่ม';b.onclick=()=>add(x);
    row.appendChild(b);E.results.appendChild(row);
  });
  msg(E.searchMessage,`พบ ${(data||[]).length} รายการ`);
};
function add(x){
  const current=cart.get(x.id);
  if(current)current.quantity+=1;
  else cart.set(x.id,{id:x.id,code:x.product_code,name:x.name,quantity:1,unitCost:Number(x.cost_price||0),discount:0,vatRate:Number(x.vat_rate||0)});
  render();
}
function totals(){
  let subtotal=0,vat=0;
  for(const x of cart.values()){
    const line=Math.max((x.quantity*x.unitCost)-x.discount,0);
    subtotal+=line;vat+=line*(x.vatRate/100);
  }
  const discount=Number(E.discount.value)||0;
  return{subtotal,vat,discount,grand:Math.max(subtotal+vat-discount,0)};
}
function render(){
  E.cart.innerHTML='';
  for(const x of cart.values()){
    const row=document.createElement('div');row.className='item';
    row.innerHTML=`<div><b>${esc(x.name)}</b><small>${esc(x.code)}</small></div>`;
    const controls=document.createElement('div');controls.className='row';
    const qty=document.createElement('input');qty.type='number';qty.min='.001';qty.step='.001';qty.value=x.quantity;qty.oninput=()=>{x.quantity=Math.max(Number(qty.value)||0,0);if(x.quantity<=0)cart.delete(x.id);render()};
    const cost=document.createElement('input');cost.type='number';cost.min='0';cost.step='.01';cost.value=x.unitCost;cost.oninput=()=>{x.unitCost=Math.max(Number(cost.value)||0,0);update()};
    const vat=document.createElement('input');vat.type='number';vat.min='0';vat.max='100';vat.step='.01';vat.value=x.vatRate;vat.oninput=()=>{x.vatRate=Math.max(Number(vat.value)||0,0);update()};
    const del=document.createElement('button');del.className='btn danger';del.textContent='ลบ';del.onclick=()=>{cart.delete(x.id);render()};
    controls.append(qty,cost,vat,del);row.appendChild(controls);E.cart.appendChild(row);
  }
  update();
}
function update(){
  const t=totals();E.subtotal.textContent=money(t.subtotal);E.vat.textContent=money(t.vat);E.discountTotal.textContent=money(t.discount);E.grandTotal.textContent=money(t.grand);
}
E.discount.oninput=update;
E.saveBtn.onclick=async()=>{
  const items=[...cart.values()].map(x=>({product_id:x.id,quantity:x.quantity,unit_cost:x.unitCost,discount_amount:x.discount,vat_rate:x.vatRate}));
  if(!items.length)return msg(E.actionMessage,'กรุณาเพิ่มสินค้า','error');
  const{data,error}=await supabaseClient.rpc('create_purchase_order',{
    p_supplier_id:E.supplier.value,p_branch_id:E.branch.value,p_items:items,
    p_order_date:E.orderDate.value||null,p_expected_date:E.expectedDate.value||null,
    p_discount_amount:Number(E.discount.value)||0,p_reference_no:E.referenceNo.value||null,p_notes:E.notes.value||null
  });
  if(error)return msg(E.actionMessage,error.message,'error');
  msg(E.actionMessage,`สร้าง PO สำเร็จ ${data.po_no}`,'ok');
  location.href=`./purchase-order-history.html?po_no=${encodeURIComponent(data.po_no)}`;
};
init();
