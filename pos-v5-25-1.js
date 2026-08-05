import { supabaseClient } from './js/supabase-client.js';

const PATTERN = window.TKNProductPattern;

const ids = [
  'branch','payment','customerName','customerPhone','searchForm','search','searchButton',
  'results','searchMsg','cart','cartCount','subtotal','itemDiscountTotal','discount','netTotal','notes',
  'checkout','manualDrawer','actionMsg','cashierStatus','holdBill','restoreBill','openShift','closeShift',
  'logoutBtn','branchStatus','cashierUnlockDialog','cashierUnlockForm','employeeCode','cashierPin',
  'openingFloat','unlockMsg','closeShiftDialog','closeShiftForm','closingCash','closingNotes',
  'cancelCloseShift','closeShiftMsg','paymentDialog','paymentForm','paymentDialogNet',
  'paymentReceivedLabel','paymentDialogReceived','paymentQuickCash','paymentDialogChange',
  'paymentDialogWarning','cancelPayment','confirmPayment','paymentSuccessDialog','successNet',
  'successReceived','successChange','changeGivenButton','drawerApprovalDialog','drawerApprovalForm',
  'drawerApproverCode','drawerApproverPin','drawerReason','drawerReasonNotes','confirmDrawerApproval','cancelDrawerApproval','drawerApprovalMsg',
  'cancelOrder','cancelOrderDialog','cancelOrderForm','cancelOrderSummary','cancelOrderReason','cancelOrderNotes',
  'cancelOrderApproverCode','cancelOrderApproverPin','cancelOrderClose','confirmCancelOrder','cancelOrderMsg',
  'shiftLockScreen','shiftLockForm','shiftLockBranch','shiftLockEmployeeCode','shiftLockPin','shiftLockOpeningFloat','shiftLockSubmit','shiftLockLogout','shiftLockClose','shiftLockMsg','shiftRequiredDialog','shiftRequiredClose','shiftRequiredOpen','logoutGuardDialog','logoutGuardBack',
  'itemDiscountDialog','itemDiscountForm','discountProductSummary','discountCondition','discountReason','discountType','discountValue','discountQuantity','discountNotes','discountApproval','discountApproverCode','discountApproverPin','discountWarning','discountRemove','discountCancel','discountApply'
];
const E = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const cart = new Map();
const QUICK_CASH = [20,50,100,200,300,400,500,1000];
let access=null, cashier=null, shift=null, pendingSale=null;
let checkoutSubmitting=false;
const DEVICE_ID_KEY='tkn_pos_device_id';
function deviceId(){let id=localStorage.getItem(DEVICE_ID_KEY);if(!id){id=(crypto.randomUUID?.()||`dev-${Date.now()}-${Math.random().toString(16).slice(2)}`);localStorage.setItem(DEVICE_ID_KEY,id)}return id}
let orderCancelSubmitting=false;
let drawerApprovalSubmitting=false;
let discountTargetId=null;
let itemDiscountSubmitting=false;
let branchReady=false;
let cashierProfilesConfigured=false;
let drawerSoftwareLocked = localStorage.getItem('tkn_drawer_locked') === '1';

const number=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const money=value=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2}).format(number(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function msg(el,text,type=''){if(!el)return;el.textContent=text;el.className=`msg ${type}`.trim()}
async function writeAudit(actionType,entityType,entityId,label,details={}){
  try{
    const result=await supabaseClient.rpc('write_audit_log',{
      p_action_type:actionType,
      p_entity_type:entityType,
      p_entity_id:entityId?String(entityId):null,
      p_action_label:label||null,
      p_details:details||{},
      p_branch_id:hasBranch()?E.branch.value:null,
      p_user_agent:navigator.userAgent
    });
    if(result.error)console.warn('Audit log skipped:',result.error.message);
  }catch(error){
    console.warn('Audit log unavailable:',error);
  }
}
function setShiftLockVisible(visible,message=''){
  if(!E.shiftLockScreen)return;
  E.shiftLockScreen.hidden=!visible;
  document.body.classList.toggle('shift-locked',visible);
  if(E.openShift)E.openShift.hidden=visible||Boolean(shift?.shift_id);
  if(E.shiftLockBranch){
    E.shiftLockBranch.textContent=hasBranch()
      ? `สาขา: ${E.branch.options[E.branch.selectedIndex]?.text||'-'}`
      : 'ยังไม่พบสาขาที่ใช้งานได้';
  }
  if(message)msg(E.shiftLockMsg,message);
  if(visible)setTimeout(()=>E.shiftLockEmployeeCode?.focus(),0);
}
function clearOrder(){
  cart.clear();
  E.results.innerHTML='';
  E.search.value='';
  E.customerName.value='';
  E.customerPhone.value='';
  E.discount.value='0';
  E.notes.value='';
  renderCart();
}
function validUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''))}
function hasBranch(){return validUuid(E.branch?.value)}
function normalizePosScan(raw){
  let value=String(raw||'').trim();
  if(!value)return '';
  try{
    const url=new URL(value);
    value=url.searchParams.get('id')||url.searchParams.get('code')||url.searchParams.get('scan')||decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1)||value);
  }catch(_){ }
  return String(value||'').trim();
}
function parsePosScan(raw){
  const parsed=PATTERN?.parseScan?.(raw);
  if(parsed?.kind==='BOX')return parsed;
  if(parsed?.kind==='PRODUCT_QR')return parsed;
  const value=normalizePosScan(raw);
  const candidates=PATTERN?.scanCandidates?.(value)||[value];
  return{kind:'SEARCH',raw:value,value:candidates[0]||value,candidates};
}
function subtotal(){return [...cart.values()].reduce((s,x)=>s+Math.max(x.qty*x.price,0),0)}
function lineDiscount(item){return Math.max(Math.min(number(item.discountPerUnit,0)*Math.min(number(item.discountQty,0),number(item.qty,0)),number(item.qty,0)*number(item.price,0)),0)}
function itemDiscountTotal(){return [...cart.values()].reduce((s,x)=>s+lineDiscount(x),0)}
function discount(){return Math.max(number(E.discount.value),0)}
function net(){return Math.max(subtotal()-itemDiscountTotal()-discount(),0)}
function refreshPosAvailability(status=''){
  const hasOpenShift = Boolean(shift?.shift_id);
  const canWork = branchReady && hasBranch() && hasOpenShift;
  document.body.classList.toggle('pos-no-shift',!hasOpenShift);

  E.branch.disabled = !branchReady || hasOpenShift;
  E.search.disabled = !canWork;
  E.searchButton.disabled = !canWork;
  E.checkout.disabled = !canWork || !cart.size || net() <= 0;
  E.discount.disabled = !canWork;
  E.payment.disabled = !canWork;
  E.customerName.disabled = !canWork;
  E.customerPhone.disabled = !canWork;
  E.notes.disabled = !canWork;
  E.holdBill.disabled = !canWork;
  E.restoreBill.disabled = !canWork;
  E.manualDrawer.disabled = !canWork;

  E.openShift.hidden = hasOpenShift || !E.shiftLockScreen?.hidden;
  E.closeShift.hidden = !hasOpenShift;
  E.cancelOrder.disabled = !canWork || !cart.size;

  if(status){
    E.branchStatus.textContent=status;
    E.branchStatus.className=`field-status ${branchReady?'ok':'error'}`;
  }
}

function lockBranchControls(ready,status){
  branchReady=Boolean(ready);
  refreshPosAvailability(status);
}

function saveShiftState(){
  if(shift?.shift_id){
    sessionStorage.setItem('tkn_cashier_shift',JSON.stringify({
      ...shift,
      branch_id:E.branch.value
    }));
  }else{
    sessionStorage.removeItem('tkn_cashier_shift');
  }
}

function restoreShiftState(){
  try{
    const saved=JSON.parse(sessionStorage.getItem('tkn_cashier_shift')||'null');
    if(!saved?.shift_id||!validUuid(saved.shift_id))return false;
    if(saved.branch_id&&saved.branch_id!==E.branch.value)return false;
    shift=saved;
    cashier=saved;
    E.cashierStatus.textContent=`${saved.display_name||saved.employee_code} · ${saved.employee_code} · เปิดกะ ${new Date(saved.opened_at).toLocaleString('th-TH')}`;
    refreshPosAvailability();
    return true;
  }catch(error){
    sessionStorage.removeItem('tkn_cashier_shift');
    return false;
  }
}
async function logout(){await supabaseClient.auth.signOut();sessionStorage.clear();location.replace('./index.html')}


function hasActiveShift(){
  return Boolean(shift?.shift_id);
}

function showShiftRequiredDialog(){
  if(hasActiveShift())return;
  if(E.shiftRequiredDialog && !E.shiftRequiredDialog.open){
    E.shiftRequiredDialog.showModal();
    setTimeout(()=>E.shiftRequiredOpen?.focus(),0);
  }
}

function installShiftRequiredGuard(){
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('[data-shift-required]');
    if(!target||hasActiveShift())return;
    event.preventDefault();
    event.stopPropagation();
    showShiftRequiredDialog();
  },true);
}

function showLogoutGuard(){
  if(!E.logoutGuardDialog)return;
  if(!E.logoutGuardDialog.open)E.logoutGuardDialog.showModal();
  setTimeout(()=>E.logoutGuardBack?.focus(),0);
}

function installLogoutGuard(){
  // The red sidebar logout is created by navigation.js.
  // Capture phase blocks its signOut handler only while a cashier shift is open.
  document.addEventListener('click',event=>{
    const logoutButton=event.target.closest?.('.tkn-logout-btn');
    if(!logoutButton||!hasActiveShift())return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showLogoutGuard();
  },true);

  E.logoutGuardBack?.addEventListener('click',()=>{
    E.logoutGuardDialog?.close();
    E.closeShift?.focus();
  });
}

async function loadBranches(){
  lockBranchControls(false,'กำลังโหลดสาขา...');
  let rows=[];
  const result=await supabaseClient.from('branches').select('id,code,name').eq('is_active',true);
  if(!result.error) rows=result.data||[];

  // Fallback to the branch attached to access context when RLS hides the branch list.
  if(!rows.length && validUuid(access?.branch_id)){
    const one=await supabaseClient.from('branches').select('id,code,name').eq('id',access.branch_id).maybeSingle();
    if(!one.error && one.data) rows=[one.data];
  }

  if(!rows.length){
    E.branch.innerHTML='<option value="">ไม่พบสาขาที่ใช้งานได้</option>';
    lockBranchControls(false,result.error?`โหลดสาขาไม่สำเร็จ: ${result.error.message}`:'ไม่พบสาขาที่เปิดใช้งาน');
    return false;
  }
  rows.sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''),'th'));
  E.branch.innerHTML=rows.map(b=>`<option value="${b.id}">${esc(b.code)} — ${esc(b.name)}</option>`).join('');
  E.branch.value=rows.some(b=>b.id===access?.branch_id)?access.branch_id:rows[0].id;
  if(!hasBranch()){
    lockBranchControls(false,'ข้อมูลสาขาไม่ถูกต้อง'); return false;
  }
  lockBranchControls(true,`พร้อมใช้งาน: ${E.branch.options[E.branch.selectedIndex]?.text||''}`);
  return true;
}

async function init(){
  const {data:{session},error}=await supabaseClient.auth.getSession();
  if(error||!session){location.replace('./index.html');return}
  const context=await supabaseClient.rpc('current_access_context');
  if(context.error||!context.data?.user_id||context.data.is_active!==true){await logout();return}
  access=context.data;
  if(!(access.permissions||[]).includes('pos.use')){location.replace(access.landing_page||'./index.html');return}
  sessionStorage.setItem('tkn_user_role',access.role||'staff');
  sessionStorage.setItem('tkn_permissions',JSON.stringify(access.permissions||[]));
  if(!await loadBranches()) return;

  const setup=await supabaseClient.rpc('cashier_setup_status');
  cashierProfilesConfigured=!setup.error && setup.data?.is_configured===true;

  renderCart();
  if(!restoreShiftState()){
    E.cashierStatus.textContent=cashierProfilesConfigured
      ? 'ยังไม่ได้เปิดกะ · รอพนักงานเปิดกะใหม่'
      : 'ยังไม่ได้ตั้งค่ารหัสพนักงาน/PIN · กรุณาตั้งค่าในหน้าผู้ใช้และสิทธิ์';
    refreshPosAvailability();
    setShiftLockVisible(true);
  }else{
    setShiftLockVisible(false);
  }
}

async function openShiftWithCredentials(employeeCode,pin,openingFloat,messageElement){
  if(!hasBranch()){
    msg(messageElement,'กรุณาเลือกสาขา','error');
    return false;
  }
  const result=await supabaseClient.rpc('open_cashier_shift',{
    p_employee_code:String(employeeCode||'').trim(),
    p_pin:String(pin||''),
    p_branch_id:E.branch.value,
    p_opening_float:number(openingFloat)
  });
  if(result.error || result.data?.success === false){
    msg(messageElement,result.error?.message || result.data?.error || 'ไม่สามารถเปิดกะได้','error');
    return false;
  }
  shift={...result.data,branch_id:E.branch.value};
  cashier=shift;
  saveShiftState();
  E.cashierStatus.textContent=`${shift.display_name} · ${shift.employee_code} · เปิดกะ ${new Date(shift.opened_at).toLocaleString('th-TH')}`;
  refreshPosAvailability();
  setShiftLockVisible(false);
  E.search.focus();
  await writeAudit('SHIFT_OPEN','CASHIER_SHIFT',shift.shift_id,'เปิดกะแคชเชียร์',{
    employee_code:shift.employee_code,
    display_name:shift.display_name,
    opening_float:number(openingFloat)
  });
  return true;
}
async function openShift(event){
  event.preventDefault();
  const ok=await openShiftWithCredentials(
    E.employeeCode.value,
    E.cashierPin.value,
    E.openingFloat.value,
    E.unlockMsg
  );
  if(!ok)return;
  E.cashierPin.value='';
  E.cashierUnlockDialog.close();
}
async function openShiftFromLock(event){
  event.preventDefault();
  E.shiftLockSubmit.disabled=true;
  const ok=await openShiftWithCredentials(
    E.shiftLockEmployeeCode.value,
    E.shiftLockPin.value,
    E.shiftLockOpeningFloat.value,
    E.shiftLockMsg
  );
  E.shiftLockSubmit.disabled=false;
  if(!ok)return;
  E.shiftLockPin.value='';
  E.shiftLockOpeningFloat.value='0';
}

async function searchProducts(event){
  event.preventDefault();
  const scan=parsePosScan(E.search.value);
  if(scan.kind==='BOX'){
    const target=`./box-qr-stock.html?tab=check&scan=${encodeURIComponent(scan.raw)}`;
    msg(E.searchMsg,'QR กล่องใช้ตรวจสอบสต็อก ไม่ขายทั้งกล่อง ระบบกำลังเปิดรายละเอียดกล่อง','success');
    const opened=window.open(target,'_blank','noopener');
    if(!opened)location.href=target;
    E.search.value='';
    return;
  }
  if(!hasBranch())return msg(E.searchMsg,'กรุณาเลือกสาขาก่อนค้นสินค้า','error');
  if(!shift?.shift_id)return msg(E.searchMsg,'กรุณาเปิดกะก่อนค้นสินค้า','error');
  const candidates=(scan.candidates?.length?scan.candidates:[scan.value])
    .map(value=>String(value||'').replace(/[%_,()]/g,'').trim()).filter(Boolean);
  const q=candidates[0]||'';
  if(!q)return msg(E.searchMsg,'กรุณาสแกน QR สินค้า หรือกรอกชื่อ SKU / Barcode','error');
  E.searchButton.disabled=true;
  msg(E.searchMsg,scan.kind==='PRODUCT_QR'?'กำลังอ่าน QR สินค้า...':'กำลังค้นหา...');
  try{
    const exactFilter=[...new Set(candidates.flatMap(value=>[`product_code.eq.${value}`,`barcode.eq.${value}`]))].join(',');
    const productFilter=scan.kind==='PRODUCT_QR'
      ? exactFilter
      : `product_name.ilike.%${q}%,${exactFilter}`;
    const inv=await supabaseClient.from('branch_inventory_list').select('*').eq('branch_id',E.branch.value).gt('quantity',0).or(productFilter).limit(20);
    if(inv.error)throw inv.error;
    const rows=inv.data||[];
    if(!rows.length){E.results.innerHTML='';return msg(E.searchMsg,'ไม่พบสินค้า หรือสินค้าหมดสต็อก','error')}
    const ids=[...new Set(rows.map(r=>r.product_id).filter(Boolean))];
    const boxedMap=new Map();
    if(ids.length){
      const boxed=await supabaseClient.from('stock_box_items').select('product_id,quantity,stock_boxes!inner(status)').in('product_id',ids).in('stock_boxes.status',['DRAFT','CLOSED']).gt('quantity',0);
      if(boxed.error)throw new Error(`ตรวจสต็อกหน้าร้านไม่สำเร็จ: ${boxed.error.message}`);
      (boxed.data||[]).forEach(item=>boxedMap.set(item.product_id,number(boxedMap.get(item.product_id))+number(item.quantity)));
    }
    const [pr,promoResult]=await Promise.all([
      supabaseClient.from('products').select('id,selling_price,cost_price,is_active').in('id',ids),
      supabaseClient.from('active_product_promotions_v5250').select('product_id,promo_name,promo_price,normal_price').in('product_id',ids)
    ]);
    if(pr.error)throw pr.error;
    const map=new Map((pr.data||[]).map(p=>[p.id,p]));
    const promoMap=promoResult.error?new Map():new Map((promoResult.data||[]).map(p=>[p.product_id,p]));
    const products=rows.map(r=>{const p=map.get(r.product_id)||{};const promo=promoMap.get(r.product_id);const normalPrice=number(r.selling_price,number(p.selling_price));return{id:r.product_id,code:r.product_code,name:r.product_name,barcode:r.barcode,stock:Math.max(0,number(r.quantity)-number(boxedMap.get(r.product_id))),normalPrice,price:promo?number(promo.promo_price,normalPrice):normalPrice,promoName:promo?.promo_name||'',isPromo:Boolean(promo),cost:number(p.cost_price),active:p.is_active!==false}}).filter(p=>p.active&&p.stock>0);
    if(!products.length){E.results.innerHTML='';return msg(E.searchMsg,'สินค้านี้ถูกเก็บอยู่ในกล่อง ไม่มีจำนวนพร้อมขายหน้าร้าน','error')}
    E.results.innerHTML=products.map(p=>`<article class="product-result" data-id="${p.id}"><div><strong>${esc(p.name)}</strong><small>${esc(p.code)} · คงเหลือ ${p.stock.toLocaleString('th-TH')} · ${p.isPromo?`<s>${money(p.normalPrice)}</s> <b>${money(p.price)}</b> · ${esc(p.promoName)}`:money(p.price)}</small></div><button class="btn primary add-product" type="button">เพิ่ม</button></article>`).join('');
    E.results.querySelectorAll('.product-result').forEach(row=>{const p=products.find(x=>x.id===row.dataset.id);row.querySelector('button').onclick=()=>addProduct(p)});
    if(products.length===1){addProduct(products[0]);E.search.value='';E.search.focus()}
    msg(E.searchMsg,scan.kind==='PRODUCT_QR'?`อ่าน QR สำเร็จ: ${products[0]?.name||q}`:`พบ ${products.length} รายการ`,'success');
  }catch(err){msg(E.searchMsg,err.message||'ค้นสินค้าไม่สำเร็จ','error')}
  finally{E.searchButton.disabled=!hasBranch()}
}

function addProduct(p){
  if(p.price<=0)return msg(E.actionMsg,`สินค้า ${p.name} ยังไม่มีราคาขาย`,'error');
  const old=cart.get(p.id); const qty=(old?.qty||0)+1;
  if(qty>p.stock)return msg(E.actionMsg,'จำนวนในตะกร้าเกินสต็อก','error');
  cart.set(p.id,{...p,qty,price:p.price,cost:number(p.cost),discountPerUnit:old?.discountPerUnit||0,discountQty:old?.discountQty||0,discountReason:old?.discountReason||'',condition:old?.condition||'',discountNotes:old?.discountNotes||'',discountApprover:old?.discountApprover||null}); renderCart();
}
function renderCart(){
  E.cart.innerHTML='';
  if(!cart.size)E.cart.innerHTML='<div class="empty-cart">ยังไม่มีสินค้าในตะกร้า</div>';
  for(const item of cart.values()){
    if(number(item.discountQty,0)>number(item.qty,0))item.discountQty=item.qty;
    const row=document.createElement('article'); row.className='cart-item';
    const discountAmount=lineDiscount(item);
    const effectiveUnit=item.price-number(item.discountPerUnit,0);
    row.innerHTML=`<div class="cart-info"><strong>${esc(item.name)}</strong><small>${esc(item.code)} · คงเหลือ ${item.stock.toLocaleString('th-TH')} · ${item.isPromo?`โปร ${esc(item.promoName)}: <s>${money(item.normalPrice)}</s> → ${money(item.price)}`:`ราคาปกติ ${money(item.price)}`}/หน่วย</small>${discountAmount>0?`<div class="item-discount-line"><span>${esc(item.condition||'สินค้ามีตำหนิ')} · ลด ${item.discountQty} ชิ้น</span><strong>- ${money(discountAmount)}</strong></div><small>ราคาหลังลดต่อชิ้น ${money(effectiveUnit)} · ${esc(item.discountReason||'')}</small>`:''}</div><div class="cart-controls"></div>`;
    const controls=row.querySelector('.cart-controls');
    const qty=document.createElement('input'); qty.type='number';qty.min='1';qty.max=String(item.stock);qty.step='1';qty.value=String(item.qty);
    qty.onchange=()=>{const v=Math.floor(number(qty.value,1));if(v<1){cart.delete(item.id)}else if(v<=item.stock){item.qty=v;if(item.discountQty>v)item.discountQty=v}else{qty.value=item.qty;msg(E.actionMsg,'จำนวนเกินสต็อก','error')}renderCart()};
    const priceBlock=document.createElement('div');priceBlock.className='cart-price-block';priceBlock.innerHTML=`<span>${money(item.price)}</span><small>ทุน ${money(item.cost)}</small>`;
    const discountBtn=document.createElement('button');discountBtn.type='button';discountBtn.className=`btn discount-item-btn ${discountAmount>0?'has-discount':''}`;discountBtn.textContent=discountAmount>0?'แก้ส่วนลด/ตำหนิ':'ส่วนลด/ตำหนิ';discountBtn.onclick=()=>openItemDiscount(item.id);
    const remove=document.createElement('button');remove.type='button';remove.className='btn danger';remove.textContent='ลบ';remove.onclick=()=>{cart.delete(item.id);renderCart()};
    controls.append(qty,priceBlock,discountBtn,remove);E.cart.appendChild(row);
  }
  E.cartCount.textContent=`${cart.size} รายการ`;updateTotals();
}
function updateTotals(){E.subtotal.textContent=money(subtotal());if(E.itemDiscountTotal)E.itemDiscountTotal.textContent=money(itemDiscountTotal());E.netTotal.textContent=money(net());refreshPosAvailability()}


function discountConditionLabel(value){return({OPENED:'แกะซีล',DENTED_BOX:'กล่องบุบ',DEFECT:'มีตำหนิ',DAMAGED:'ชำรุด',INCOMPLETE:'อุปกรณ์ไม่ครบ',CLEARANCE:'เคลียร์สต็อก',OTHER:'อื่น ๆ'})[value]||value||'สินค้ามีตำหนิ'}
function computedDiscountPerUnit(item){
  const value=Math.max(number(E.discountValue.value),0);
  return E.discountType.value==='PERCENT'?Math.min(item.price*(value/100),item.price):Math.min(value,item.price);
}
function updateItemDiscountPreview(){
  const item=cart.get(discountTargetId);if(!item)return;
  const perUnit=computedDiscountPerUnit(item),qty=Math.max(1,Math.min(Math.floor(number(E.discountQuantity.value,1)),item.qty));
  const effective=Math.max(item.price-perUnit,0),total=perUnit*qty,belowCost=effective+0.0001<item.cost;
  E.discountApproval.hidden=!belowCost;
  E.discountApproverCode.required=belowCost;E.discountApproverPin.required=belowCost;
  E.discountWarning.className=`discount-warning ${belowCost?'warn':'safe'}`;
  E.discountWarning.textContent=belowCost
    ? `หลังลด ${money(effective)}/ชิ้น ต่ำกว่าทุน ${money(item.cost)} · ต้องใช้รหัสผู้จัดการอนุมัติ`
    : `หลังลด ${money(effective)}/ชิ้น · ส่วนลดรวม ${money(total)} · ยังไม่เปลี่ยนราคามาตรฐานของสินค้า`;
}
function openItemDiscount(productId){
  const item=cart.get(productId);if(!item)return;
  discountTargetId=productId;
  E.discountProductSummary.innerHTML=`<strong>${esc(item.name)}</strong><small>${esc(item.code)} · ราคาปกติ ${money(item.price)} · ทุน ${money(item.cost)} · ในตะกร้า ${item.qty} ชิ้น</small>`;
  E.discountCondition.value=item.conditionCode||'DEFECT';E.discountReason.value=item.discountReason||'';E.discountType.value=item.discountType||'AMOUNT';E.discountValue.value=String(item.discountInputValue??item.discountPerUnit??0);E.discountQuantity.max=String(item.qty);E.discountQuantity.value=String(item.discountQty||1);E.discountNotes.value=item.discountNotes||'';E.discountApproverCode.value='';E.discountApproverPin.value='';
  updateItemDiscountPreview();E.itemDiscountDialog.showModal();setTimeout(()=>E.discountReason.focus(),0);
}
async function applyItemDiscount(event){
  event.preventDefault();if(itemDiscountSubmitting)return;
  const item=cart.get(discountTargetId);if(!item)return E.itemDiscountDialog.close();
  const reason=E.discountReason.value,condition=E.discountCondition.value,qty=Math.max(1,Math.min(Math.floor(number(E.discountQuantity.value,1)),item.qty));
  const inputValue=Math.max(number(E.discountValue.value),0),perUnit=computedDiscountPerUnit(item),effective=Math.max(item.price-perUnit,0),belowCost=effective+0.0001<item.cost;
  if(perUnit<=0)return msg(E.discountWarning,'กรุณาระบุส่วนลดมากกว่า 0','warn');
  if(!reason)return msg(E.discountWarning,'กรุณาเลือกเหตุผลส่วนลด','warn');
  itemDiscountSubmitting=true;E.discountApply.disabled=true;
  try{
    let approver=null;
    if(belowCost){
      if(!E.discountApproverCode.value.trim()||!E.discountApproverPin.value)return msg(E.discountWarning,'กรุณากรอกรหัสผู้อนุมัติและ PIN','warn');
      const verify=await supabaseClient.rpc('verify_cashier_pin',{p_employee_code:E.discountApproverCode.value.trim(),p_pin:E.discountApproverPin.value});
      if(verify.error||verify.data?.success===false||verify.data?.can_open_drawer!==true){
        const text=verify.error?.message||verify.data?.error||'ผู้อนุมัติไม่มีสิทธิ์อนุมัติราคาต่ำกว่าทุน';
        await writeAudit('POS_ITEM_DISCOUNT_DENIED','PRODUCT',item.id,'ปฏิเสธส่วนลดสินค้าต่ำกว่าทุน',{product_code:item.code,reason,condition,requested_price:effective,cost_price:item.cost,requested_approver:E.discountApproverCode.value.trim(),error:text});
        return msg(E.discountWarning,text,'warn');
      }
      approver={employee_code:verify.data.employee_code,display_name:verify.data.display_name||verify.data.employee_code};
    }
    item.discountType=E.discountType.value;item.discountInputValue=inputValue;item.discountPerUnit=perUnit;item.discountQty=qty;item.discountReason=reason;item.condition=discountConditionLabel(condition);item.conditionCode=condition;item.discountNotes=E.discountNotes.value.trim();item.discountApprover=approver;
    await writeAudit('POS_ITEM_DISCOUNT_DRAFT','PRODUCT',item.id,'กำหนดส่วนลดสินค้ามีตำหนิในตะกร้า',{product_code:item.code,condition,reason,discount_quantity:qty,discount_per_unit:perUnit,total_discount:perUnit*qty,effective_unit_price:effective,cost_price:item.cost,below_cost:belowCost,approver});
    E.itemDiscountDialog.close();renderCart();msg(E.actionMsg,`กำหนดส่วนลด ${item.name} รวม ${money(perUnit*qty)} แล้ว`,'ok');
  }finally{itemDiscountSubmitting=false;E.discountApply.disabled=false;}
}
function removeItemDiscount(){
  const item=cart.get(discountTargetId);if(!item)return E.itemDiscountDialog.close();
  item.discountPerUnit=0;item.discountQty=0;item.discountReason='';item.condition='';item.conditionCode='';item.discountNotes='';item.discountApprover=null;item.discountInputValue=0;
  E.itemDiscountDialog.close();renderCart();msg(E.actionMsg,`ยกเลิกส่วนลด ${item.name} แล้ว`,'ok');
}

function configurePaymentFields(){
  const cash=E.payment.value==='CASH';
  E.paymentReceivedLabel.hidden=!cash;
  E.paymentQuickCash.hidden=!cash;
  E.paymentDialogReceived.required=cash;
  E.paymentDialogReceived.value=cash?'0':String(net());
  E.paymentQuickCash.innerHTML=cash?[
    ...QUICK_CASH.map(v=>`<button class="quick-cash-btn" type="button" data-value="${v}">${money(v)}</button>`),
    `<button class="quick-cash-btn exact-cash-btn" type="button" data-value="${net()}">เงินพอดี</button>`
  ].join(''):'';
  E.paymentQuickCash.querySelectorAll('button').forEach(button=>{
    button.onclick=()=>{
      E.paymentDialogReceived.value=button.dataset.value;
      updatePayment();
    };
  });
  updatePayment();
  if(cash)setTimeout(()=>{E.paymentDialogReceived.focus();E.paymentDialogReceived.select()},0);
}

function preparePayment(){
  if(!hasBranch())return msg(E.actionMsg,'กรุณาเลือกสาขา','error');
  if(!shift?.shift_id)return msg(E.actionMsg,'กรุณาเปิดกะก่อนรับชำระ','error');
  if(!cart.size||net()<=0)return msg(E.actionMsg,'กรุณาเพิ่มสินค้า','error');
  E.payment.value='CASH';
  E.paymentDialogNet.textContent=money(net());
  configurePaymentFields();
  E.paymentDialog.showModal();
}
function updatePayment(){
  const cash=E.payment.value==='CASH', total=net(), received=cash?Math.max(number(E.paymentDialogReceived.value),0):total;
  const shortage=Math.max(total-received,0), change=cash?Math.max(received-total,0):0;
  E.paymentDialogChange.textContent=money(change);
  E.paymentDialogWarning.textContent=!cash?'พร้อมรับชำระ':received<=0?'กรุณากรอกจำนวนเงินที่รับจากลูกค้า':shortage>0?`เงินรับขาดอีก ${money(shortage)}`:'พร้อมรับชำระ';
  E.confirmPayment.disabled=total<=0||(cash&&(received<=0||received<total));
}

async function checkout(event){
  event.preventDefault();
  if(checkoutSubmitting)return;
  checkoutSubmitting=true;if(E.confirmPayment.disabled)return;
  if(!shift?.shift_id)return msg(E.actionMsg,'ไม่พบกะที่เปิดอยู่ กรุณาเปิดกะใหม่','error');
  const total=net(),cash=E.payment.value==='CASH',received=cash?number(E.paymentDialogReceived.value):total;
  const items=[...cart.values()].map(x=>({product_id:x.id,quantity:x.qty,unit_price:x.price,discount_amount:lineDiscount(x)}));
  const itemDiscountNotes=[...cart.values()].filter(x=>lineDiscount(x)>0).map(x=>`${x.code}: ${x.condition||'-'} / ${x.discountReason||'-'} / ลด ${money(lineDiscount(x))}${x.discountNotes?` / ${x.discountNotes}`:''}`).join(' | ');
  const saleNotes=[E.notes.value.trim(),itemDiscountNotes?`ส่วนลดสินค้า: ${itemDiscountNotes}`:''].filter(Boolean).join('\n')||null;
  E.confirmPayment.disabled=true;msg(E.actionMsg,'กำลังบันทึกการขาย...');
  let result=await supabaseClient.rpc('create_pos_sale_safety_v3_5',{p_branch_id:E.branch.value,p_items:items,p_discount_amount:discount(),p_payment_method:E.payment.value,p_received_amount:received,p_customer_name:E.customerName.value.trim()||null,p_customer_phone:E.customerPhone.value.trim()||null,p_notes:saleNotes,p_cashier_shift_id:shift.shift_id,p_vat_rate:7});
  if(result.error&&/create_pos_sale_safety_v3_5|schema cache|function/i.test(result.error.message||'')){
    console.warn('POS Safety RPC unavailable; using temporary legacy fallback.',result.error);
    result=await supabaseClient.rpc('create_pos_sale',{p_branch_id:E.branch.value,p_items:items,p_discount_amount:discount(),p_payment_method:E.payment.value,p_received_amount:received,p_customer_name:E.customerName.value.trim()||null,p_customer_phone:E.customerPhone.value.trim()||null,p_notes:saleNotes});
  }
  if(result.error){checkoutSubmitting=false;E.confirmPayment.disabled=false;return msg(E.actionMsg,result.error.message,'error')}
  const change=number(result.data?.change_amount,received-total);
  const discountedItems=[...cart.values()].filter(x=>lineDiscount(x)>0).map(x=>({product_id:x.id,product_code:x.code,condition:x.condition,condition_code:x.conditionCode||null,reason:x.discountReason,discount_type:x.discountType||null,discount_input_value:number(x.discountInputValue,0),discount_quantity:x.discountQty,discount_per_unit:x.discountPerUnit,total_discount:lineDiscount(x),cost_price:x.cost,unit_price:x.price,effective_unit_price:Math.max(number(x.price,0)-number(x.discountPerUnit,0),0),below_cost:Math.max(number(x.price,0)-number(x.discountPerUnit,0),0)+0.0001<number(x.cost,0),approver:x.discountApprover||null,notes:x.discountNotes||null}));
  if(discountedItems.length)await writeAudit('POS_DAMAGED_ITEM_DISCOUNT','SALE',result.data.sale_no,'ขายสินค้ามีตำหนิ/ชำรุดพร้อมส่วนลด',{sale_no:result.data.sale_no,items:discountedItems,total_item_discount:itemDiscountTotal()});
  pendingSale={saleNo:result.data.sale_no,total,received,change};
  if(cash)await requestCashDrawer('SALE');
  checkoutSubmitting=false;E.confirmPayment.disabled=false;E.paymentDialog.close();E.successNet.textContent=money(total);E.successReceived.textContent=money(received);E.successChange.textContent=money(change);E.changeGivenButton.textContent=change>0?'จ่ายเงินทอนแล้ว / ไปพิมพ์ใบเสร็จ':'ไปพิมพ์ใบเสร็จ';E.paymentSuccessDialog.showModal();
}
async function requestCashDrawer(reason='SALE',approval=null,context={}){
  if(reason==='MANUAL'&&!approval){
    E.drawerApprovalDialog.showModal();
    setTimeout(()=>E.drawerReason?.focus(),0);
    return false;
  }

  const auditBase={
    reason,
    shift_id:shift?.shift_id||null,
    sale_no:pendingSale?.saleNo||null,
    cashier_employee_code:shift?.employee_code||null,
    approver_employee_code:approval?.employee_code||null,
    manual_reason:context.manual_reason||null,
    notes:context.notes||null
  };

  if(!window.TKNHardware){
    msg(E.actionMsg,'ไม่พบ Hardware Client — บิลยังทำงานต่อได้','error');
    await writeAudit('CASH_DRAWER_OPEN_FAILED','CASH_DRAWER',pendingSale?.saleNo||shift?.shift_id,'เปิดลิ้นชักไม่สำเร็จ',{
      ...auditBase,result:'HARDWARE_CLIENT_MISSING'
    });
    return false;
  }

  try{
    const result=await window.TKNHardware.openDrawer({
      reason,
      shift_id:shift?.shift_id||null,
      sale_no:pendingSale?.saleNo||null,
      approval,
      manual_reason:context.manual_reason||null,
      notes:context.notes||null
    });
    drawerSoftwareLocked=true;
    localStorage.setItem('tkn_drawer_locked','1');
    msg(E.actionMsg,`เปิดลิ้นชักผ่าน ${result.transport||result.service||'Hardware'}`,'ok');
    await writeAudit('CASH_DRAWER_OPEN_SUCCESS','CASH_DRAWER',pendingSale?.saleNo||shift?.shift_id,'เปิดลิ้นชักสำเร็จ',{
      ...auditBase,
      result:'SUCCESS',
      transport:result.transport||result.service||null
    });
    return true;
  }catch(error){
    msg(E.actionMsg,`เปิดลิ้นชักไม่สำเร็จ: ${error.message} — บิลถูกบันทึกแล้ว`,'error');
    await writeAudit('CASH_DRAWER_OPEN_FAILED','CASH_DRAWER',pendingSale?.saleNo||shift?.shift_id,'เปิดลิ้นชักไม่สำเร็จ',{
      ...auditBase,result:'FAILED',error_message:error.message
    });
    return false;
  }
}
async function approveDrawer(event){
  event.preventDefault();
  if(drawerApprovalSubmitting)return;
  const reason=E.drawerReason.value;
  if(!reason)return msg(E.drawerApprovalMsg,'กรุณาเลือกเหตุผล','error');
  drawerApprovalSubmitting=true;
  E.confirmDrawerApproval.disabled=true;
  try{
    const r=await supabaseClient.rpc('authorize_cash_drawer_reopen_v3_4',{
      p_employee_code:E.drawerApproverCode.value.trim(),
      p_pin:E.drawerApproverPin.value
    });
    if(r.error || r.data?.success === false){
      const hardwareAuthError = r.error?.message || r.data?.error || 'ไม่สามารถยืนยันผู้อนุมัติได้';
      await writeAudit('CASH_DRAWER_OPEN_DENIED','CASH_DRAWER',shift?.shift_id,'ปฏิเสธการเปิดลิ้นชัก',{
        requested_employee_code:E.drawerApproverCode.value.trim(),
        manual_reason:reason,
        error_message:hardwareAuthError
      });
      return msg(E.drawerApprovalMsg,hardwareAuthError,'error');
    }
    const opened=await requestCashDrawer('MANUAL',r.data,{
      manual_reason:reason,
      notes:E.drawerReasonNotes.value.trim()||null
    });
    if(opened){
      E.drawerApprovalForm.reset();
      E.drawerApprovalDialog.close();
    }
  }finally{
    drawerApprovalSubmitting=false;
    E.confirmDrawerApproval.disabled=false;
  }
}

function showCancelOrderDialog(){
  if(!cart.size)return msg(E.actionMsg,'ไม่มีสินค้าในออเดอร์','error');
  E.cancelOrderSummary.innerHTML=`<strong>${cart.size} รายการ · ${money(net())}</strong><small>การยกเลิกทั้งออเดอร์ต้องได้รับอนุมัติ</small>`;
  E.cancelOrderDialog.showModal();
  setTimeout(()=>E.cancelOrderReason?.focus(),0);
}
async function approveCancelOrder(event){
  event.preventDefault();
  if(orderCancelSubmitting)return;
  if(!cart.size){
    E.cancelOrderDialog.close();
    return msg(E.actionMsg,'ออเดอร์ถูกล้างแล้ว','error');
  }
  const reason=E.cancelOrderReason.value;
  if(!reason)return msg(E.cancelOrderMsg,'กรุณาเลือกเหตุผล','error');
  orderCancelSubmitting=true;
  E.confirmCancelOrder.disabled=true;
  try{
    const verify=await supabaseClient.rpc('verify_cashier_pin',{
      p_employee_code:E.cancelOrderApproverCode.value.trim(),
      p_pin:E.cancelOrderApproverPin.value
    });
    if(verify.error || verify.data?.success === false || verify.data?.can_open_drawer !== true){
      const text=verify.error?.message || verify.data?.error || 'ผู้อนุมัติไม่มีสิทธิ์อนุมัติรายการสำคัญ';
      await writeAudit('ORDER_CANCEL_DENIED','POS_ORDER',shift?.shift_id,'ปฏิเสธการยกเลิกออเดอร์',{
        requested_employee_code:E.cancelOrderApproverCode.value.trim(),
        reason,
        total:net(),
        item_count:cart.size,
        error_message:text
      });
      return msg(E.cancelOrderMsg,text,'error');
    }
    const snapshot=[...cart.values()].map(item=>({
      product_id:item.id,
      code:item.code,
      name:item.name,
      quantity:item.qty,
      unit_price:item.price
    }));
    const total=net();
    await writeAudit('ORDER_CANCEL_APPROVED','POS_ORDER',shift?.shift_id,'อนุมัติยกเลิกออเดอร์',{
      cashier_employee_code:shift?.employee_code||null,
      approver_employee_code:verify.data.employee_code,
      reason,
      notes:E.cancelOrderNotes.value.trim()||null,
      total,
      items:snapshot
    });
    clearOrder();
    E.cancelOrderForm.reset();
    E.cancelOrderDialog.close();
    msg(E.actionMsg,`ยกเลิกออเดอร์แล้ว โดย ${verify.data.display_name||verify.data.employee_code}`,'ok');
  }finally{
    orderCancelSubmitting=false;
    E.confirmCancelOrder.disabled=false;
  }
}
function finish(){if(!pendingSale)return;const saleNo=pendingSale.saleNo;E.paymentSuccessDialog.close();cart.clear();E.discount.value='0';E.customerName.value='';E.customerPhone.value='';E.notes.value='';E.results.innerHTML='';pendingSale=null;renderCart();location.href=`./receipt.html?sale_no=${encodeURIComponent(saleNo)}&from=pos`}
function heldPayload(){return {branch:E.branch.value,payment:E.payment.value,customerName:E.customerName.value,customerPhone:E.customerPhone.value,discount:E.discount.value,notes:E.notes.value,items:[...cart.values()]}}
function applyHeldPayload(p){if(validUuid(p.branch))E.branch.value=p.branch;E.payment.value=p.payment||'CASH';E.customerName.value=p.customerName||'';E.customerPhone.value=p.customerPhone||'';E.discount.value=p.discount||0;E.notes.value=p.notes||'';cart.clear();for(const x of p.items||[])cart.set(x.id,x);renderCart()}
async function hold(){
  if(!cart.size)return msg(E.actionMsg,'ไม่มีสินค้าให้พักบิล','error');
  const payload=heldPayload();
  const title=E.customerName.value.trim()||`บิล ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`;
  const r=await supabaseClient.rpc('hold_pos_bill_v3_5',{p_branch_id:E.branch.value,p_cashier_shift_id:shift?.shift_id||null,p_device_id:deviceId(),p_title:title,p_payload:payload});
  if(r.error){
    localStorage.setItem('tkn_pos_held_bill',JSON.stringify(payload));
    console.warn('Database held bill unavailable; saved legacy fallback.',r.error);
    cart.clear();renderCart();return msg(E.actionMsg,'พักบิลในเครื่องแล้ว (โหมดสำรอง)','ok');
  }
  cart.clear();renderCart();msg(E.actionMsg,`พักบิลแล้ว ${r.data?.hold_no||''}`,'ok');
}
async function restore(){
  const list=await supabaseClient.rpc('list_pos_held_bills_v3_5',{p_branch_id:E.branch.value});
  if(!list.error&&Array.isArray(list.data)&&list.data.length){
    const choices=list.data.map((x,i)=>`${i+1}. ${x.title||x.hold_no} · ${x.employee_code||'-'} · ${new Date(x.created_at).toLocaleString('th-TH')}`).join('\n');
    const selected=Number(prompt(`เลือกบิลพักที่ต้องการเรียกคืน\n${choices}`));
    if(!Number.isInteger(selected)||selected<1||selected>list.data.length)return;
    const target=list.data[selected-1];
    const r=await supabaseClient.rpc('restore_pos_held_bill_v3_5',{p_held_bill_id:target.id});
    if(r.error)return msg(E.actionMsg,r.error.message,'error');
    applyHeldPayload(r.data.payload||target.payload||{});return msg(E.actionMsg,`เรียกคืน ${target.hold_no} แล้ว`,'ok');
  }
  try{const p=JSON.parse(localStorage.getItem('tkn_pos_held_bill')||'null');if(!p)return msg(E.actionMsg,'ไม่พบบิลพัก','error');applyHeldPayload(p);localStorage.removeItem('tkn_pos_held_bill');msg(E.actionMsg,'เรียกคืนบิลจากโหมดสำรองแล้ว','ok')}catch(e){msg(E.actionMsg,e.message,'error')}
}
async function closeShift(event){
  event.preventDefault();
  if(!shift?.shift_id){
    E.closeShiftDialog.close();
    return msg(E.actionMsg,'ไม่พบกะที่เปิดอยู่','error');
  }
  let r=await supabaseClient.rpc('close_cashier_shift_stable_v3_6',{
    p_shift_id:shift.shift_id,
    p_closing_cash_count:number(E.closingCash.value),
    p_notes:E.closingNotes.value.trim()||null
  });
  if(r.error&&/close_cashier_shift_stable_v3_6|schema cache|function/i.test(r.error.message||'')){
    console.warn('Stable close-shift RPC unavailable; using legacy fallback.',r.error);
    r=await supabaseClient.rpc('close_cashier_shift',{
      p_shift_id:shift.shift_id,
      p_closing_cash_count:number(E.closingCash.value),
      p_notes:E.closingNotes.value.trim()||null
    });
  }
  if(r.error)return msg(E.closeShiftMsg,r.error.message,'error');
  const closedShift={...shift};
  shift=null;cashier=null;saveShiftState();
  E.closeShiftDialog.close();
  clearOrder();
  E.closingCash.value='';
  E.closingNotes.value='';
  E.cashierStatus.textContent='ปิดกะแล้ว · รอพนักงานเปิดกะใหม่';
  refreshPosAvailability();
  setShiftLockVisible(true,'ปิดกะเรียบร้อย กรุณาระบุพนักงานกะถัดไป');
  await writeAudit('SHIFT_CLOSE','CASHIER_SHIFT',closedShift.shift_id,'ปิดกะแคชเชียร์',{
    employee_code:closedShift.employee_code,
    expected_cash:r.data.expected_cash,
    difference:r.data.difference
  });
  alert(`ปิดกะเรียบร้อย\nเงินสดที่ควรมี ${money(r.data.expected_cash)}\nผลต่าง ${money(r.data.difference)}`);
}

E.itemDiscountForm.onsubmit=applyItemDiscount;E.discountCancel.onclick=()=>E.itemDiscountDialog.close();E.discountRemove.onclick=removeItemDiscount;[E.discountType,E.discountValue,E.discountQuantity].forEach(el=>el?.addEventListener('input',updateItemDiscountPreview));
E.openShift.onclick=()=>{if(!branchReady||!hasBranch())return msg(E.actionMsg,'กรุณารอโหลดสาขาให้เสร็จ','error');E.cashierUnlockDialog.showModal()};E.cashierUnlockForm.onsubmit=openShift;E.shiftLockForm.onsubmit=openShiftFromLock;E.shiftLockLogout.onclick=logout;E.shiftLockClose.onclick=()=>{setShiftLockVisible(false);refreshPosAvailability()};E.shiftRequiredClose.onclick=()=>E.shiftRequiredDialog.close();E.shiftRequiredOpen.onclick=()=>{E.shiftRequiredDialog.close();setShiftLockVisible(true,'กรุณาระบุพนักงานเพื่อเปิดกะก่อนทำรายการ')};E.searchForm.onsubmit=searchProducts;E.discount.oninput=updateTotals;E.checkout.onclick=preparePayment;E.paymentForm.onsubmit=checkout;E.paymentDialogReceived.oninput=updatePayment;E.payment.onchange=configurePaymentFields;E.cancelPayment.onclick=()=>E.paymentDialog.close();E.changeGivenButton.onclick=finish;E.manualDrawer.onclick=()=>requestCashDrawer('MANUAL');E.drawerApprovalForm.onsubmit=approveDrawer;E.cancelDrawerApproval.onclick=()=>{E.drawerApprovalForm.reset();E.drawerApprovalDialog.close()};E.cancelOrder.onclick=showCancelOrderDialog;E.cancelOrderForm.onsubmit=approveCancelOrder;E.cancelOrderClose.onclick=()=>{E.cancelOrderForm.reset();E.cancelOrderDialog.close()};E.holdBill.onclick=hold;E.restoreBill.onclick=restore;if(E.logoutBtn)E.logoutBtn.onclick=logout;E.closeShift.onclick=()=>{if(!shift?.shift_id)return msg(E.actionMsg,'ยังไม่ได้เปิดกะ','error');if(cart.size)return msg(E.actionMsg,'กรุณาชำระหรือยกเลิกออเดอร์ก่อนปิดกะ','error');E.closeShiftDialog.showModal()};E.cancelCloseShift.onclick=()=>E.closeShiftDialog.close();E.closeShiftForm.onsubmit=closeShift;
E.branch.onchange=()=>{if(shift?.shift_id)return;cart.clear();E.results.innerHTML='';renderCart();if(hasBranch()){branchReady=true;refreshPosAvailability(`พร้อมใช้งาน: ${E.branch.options[E.branch.selectedIndex]?.text||''}`);setShiftLockVisible(!shift?.shift_id)}};
installLogoutGuard();
installShiftRequiredGuard();
init().catch(err=>{console.error(err);msg(E.actionMsg,err.message||'เริ่มระบบไม่สำเร็จ','error');lockBranchControls(false,'เริ่มระบบไม่สำเร็จ')});
