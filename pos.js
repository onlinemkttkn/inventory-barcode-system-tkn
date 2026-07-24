import { supabaseClient } from './js/supabase-client.js';

const ids = [
  'branch','payment','customerName','customerPhone','searchForm','search','searchButton',
  'results','searchMsg','cart','cartCount','subtotal','discount','netTotal','notes',
  'checkout','manualDrawer','actionMsg','cashierStatus','holdBill','restoreBill','openShift','closeShift',
  'logoutBtn','branchStatus','cashierUnlockDialog','cashierUnlockForm','employeeCode','cashierPin',
  'openingFloat','unlockMsg','closeShiftDialog','closeShiftForm','closingCash','closingNotes',
  'cancelCloseShift','closeShiftMsg','paymentDialog','paymentForm','paymentDialogNet',
  'paymentReceivedLabel','paymentDialogReceived','paymentQuickCash','paymentDialogChange',
  'paymentDialogWarning','cancelPayment','confirmPayment','paymentSuccessDialog','successNet',
  'successReceived','successChange','changeGivenButton','drawerApprovalDialog','drawerApprovalForm',
  'drawerApproverCode','drawerApproverPin','cancelDrawerApproval','drawerApprovalMsg'
];
const E = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const cart = new Map();
const QUICK_CASH = [20,50,100,200,300,400,500,1000];
let access=null, cashier=null, shift=null, pendingSale=null;
let branchReady=false;
let cashierProfilesConfigured=false;
let drawerSoftwareLocked = localStorage.getItem('tkn_drawer_locked') === '1';

const number=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const money=value=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2}).format(number(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function msg(el,text,type=''){if(!el)return;el.textContent=text;el.className=`msg ${type}`.trim()}
function validUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''))}
function hasBranch(){return validUuid(E.branch?.value)}
function subtotal(){return [...cart.values()].reduce((s,x)=>s+Math.max(x.qty*x.price,0),0)}
function discount(){return Math.max(number(E.discount.value),0)}
function net(){return Math.max(subtotal()-discount(),0)}
function refreshPosAvailability(status=''){
  const hasOpenShift = Boolean(shift?.shift_id);
  const canWork = branchReady && hasBranch() && hasOpenShift;

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

  E.openShift.hidden = hasOpenShift;
  E.closeShift.hidden = !hasOpenShift;

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
      ? 'ยังไม่ได้เปิดกะ · กดปุ่ม “เปิดกะ” เพื่อเริ่มขาย'
      : 'ยังไม่ได้ตั้งค่ารหัสพนักงาน/PIN · กรุณาตั้งค่าในหน้าผู้ใช้และสิทธิ์';
    refreshPosAvailability();
  }

  if(branchReady && hasBranch())E.openShift.focus();
}

async function openShift(event){
  event.preventDefault(); if(!hasBranch())return msg(E.unlockMsg,'กรุณาเลือกสาขา','error');
  const result=await supabaseClient.rpc('open_cashier_shift',{p_employee_code:E.employeeCode.value.trim(),p_pin:E.cashierPin.value,p_branch_id:E.branch.value,p_opening_float:number(E.openingFloat.value)});
  if(result.error)return msg(E.unlockMsg,result.error.message,'error');
  shift={...result.data,branch_id:E.branch.value}; cashier=shift; E.cashierPin.value=''; E.cashierUnlockDialog.close();
  saveShiftState();
  E.cashierStatus.textContent=`${shift.display_name} · ${shift.employee_code} · เปิดกะ ${new Date(shift.opened_at).toLocaleString('th-TH')}`;
  refreshPosAvailability();
  E.search.focus();
}

async function searchProducts(event){
  event.preventDefault();
  if(!hasBranch())return msg(E.searchMsg,'กรุณาเลือกสาขาก่อนค้นสินค้า','error');
  if(!shift?.shift_id)return msg(E.searchMsg,'กรุณาเปิดกะก่อนค้นสินค้า','error');
  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  if(!q)return msg(E.searchMsg,'กรุณากรอกชื่อ รหัส หรือบาร์โค้ด','error');
  E.searchButton.disabled=true; msg(E.searchMsg,'กำลังค้นหา...');
  try{
    const inv=await supabaseClient.from('branch_inventory_list').select('*').eq('branch_id',E.branch.value).gt('quantity',0).or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.eq.${q}`).limit(20);
    if(inv.error)throw inv.error;
    const rows=inv.data||[];
    if(!rows.length){E.results.innerHTML='';return msg(E.searchMsg,'ไม่พบสินค้า หรือสินค้าหมดสต็อก','error')}
    const ids=[...new Set(rows.map(r=>r.product_id).filter(Boolean))];
    const pr=await supabaseClient.from('products').select('id,selling_price,cost_price,is_active').in('id',ids);
    if(pr.error)throw pr.error;
    const map=new Map((pr.data||[]).map(p=>[p.id,p]));
    const products=rows.map(r=>{const p=map.get(r.product_id)||{};return{id:r.product_id,code:r.product_code,name:r.product_name,barcode:r.barcode,stock:number(r.quantity),price:number(r.selling_price,number(p.selling_price)),active:p.is_active!==false}}).filter(p=>p.active);
    E.results.innerHTML=products.map(p=>`<article class="product-result" data-id="${p.id}"><div><strong>${esc(p.name)}</strong><small>${esc(p.code)} · คงเหลือ ${p.stock.toLocaleString('th-TH')} · ${money(p.price)}</small></div><button class="btn primary add-product" type="button">เพิ่ม</button></article>`).join('');
    E.results.querySelectorAll('.product-result').forEach(row=>{const p=products.find(x=>x.id===row.dataset.id);row.querySelector('button').onclick=()=>addProduct(p)});
    if(products.length===1){addProduct(products[0]);E.search.value='';E.search.focus()}
    msg(E.searchMsg,`พบ ${products.length} รายการ`);
  }catch(err){msg(E.searchMsg,err.message||'ค้นสินค้าไม่สำเร็จ','error')}
  finally{E.searchButton.disabled=!hasBranch()}
}

function addProduct(p){
  if(p.price<=0)return msg(E.actionMsg,`สินค้า ${p.name} ยังไม่มีราคาขาย`,'error');
  const old=cart.get(p.id); const qty=(old?.qty||0)+1;
  if(qty>p.stock)return msg(E.actionMsg,'จำนวนในตะกร้าเกินสต็อก','error');
  cart.set(p.id,{...p,qty,price:p.price}); renderCart();
}
function renderCart(){
  E.cart.innerHTML='';
  if(!cart.size)E.cart.innerHTML='<div class="empty-cart">ยังไม่มีสินค้าในตะกร้า</div>';
  for(const item of cart.values()){
    const row=document.createElement('article'); row.className='cart-item';
    row.innerHTML=`<div class="cart-info"><strong>${esc(item.name)}</strong><small>${esc(item.code)} · คงเหลือ ${item.stock.toLocaleString('th-TH')} · ${money(item.price)}/หน่วย</small></div><div class="cart-controls"></div>`;
    const controls=row.querySelector('.cart-controls');
    const qty=document.createElement('input'); qty.type='number';qty.min='1';qty.max=String(item.stock);qty.step='1';qty.value=String(item.qty);
    qty.onchange=()=>{const v=Math.floor(number(qty.value,1));if(v<1){cart.delete(item.id)}else if(v<=item.stock){item.qty=v}else{qty.value=item.qty;msg(E.actionMsg,'จำนวนเกินสต็อก','error')}renderCart()};
    const price=document.createElement('input');price.type='number';price.min='0';price.step='.01';price.value=String(item.price);price.onchange=()=>{item.price=Math.max(number(price.value),0);updateTotals()};
    const remove=document.createElement('button');remove.type='button';remove.className='btn danger';remove.textContent='ลบ';remove.onclick=()=>{cart.delete(item.id);renderCart()};
    controls.append(qty,price,remove);E.cart.appendChild(row);
  }
  E.cartCount.textContent=`${cart.size} รายการ`;updateTotals();
}
function updateTotals(){E.subtotal.textContent=money(subtotal());E.netTotal.textContent=money(net());refreshPosAvailability()}

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
  event.preventDefault();if(E.confirmPayment.disabled)return;
  if(!shift?.shift_id)return msg(E.actionMsg,'ไม่พบกะที่เปิดอยู่ กรุณาเปิดกะใหม่','error');
  const total=net(),cash=E.payment.value==='CASH',received=cash?number(E.paymentDialogReceived.value):total;
  const items=[...cart.values()].map(x=>({product_id:x.id,quantity:x.qty,unit_price:x.price,discount_amount:0}));
  E.confirmPayment.disabled=true;msg(E.actionMsg,'กำลังบันทึกการขาย...');
  const result=await supabaseClient.rpc('create_pos_sale',{p_branch_id:E.branch.value,p_items:items,p_discount_amount:discount(),p_payment_method:E.payment.value,p_received_amount:received,p_customer_name:E.customerName.value.trim()||null,p_customer_phone:E.customerPhone.value.trim()||null,p_notes:E.notes.value.trim()||null});
  if(result.error){E.confirmPayment.disabled=false;return msg(E.actionMsg,result.error.message,'error')}
  const change=number(result.data?.change_amount,received-total);pendingSale={saleNo:result.data.sale_no,total,received,change};
  if(cash)await requestCashDrawer('SALE');
  E.paymentDialog.close();E.successNet.textContent=money(total);E.successReceived.textContent=money(received);E.successChange.textContent=money(change);E.changeGivenButton.textContent=change>0?'จ่ายเงินทอนแล้ว / ไปพิมพ์ใบเสร็จ':'ไปพิมพ์ใบเสร็จ';E.paymentSuccessDialog.showModal();
}
async function requestCashDrawer(reason='SALE',approval=null){
  if(reason==='MANUAL'&&(!cashier?.can_open_drawer||drawerSoftwareLocked)&&!approval){
    E.drawerApprovalDialog.showModal();
    return false;
  }

  if(!window.TKNHardware){
    msg(E.actionMsg,'ไม่พบ Hardware Client — บิลยังทำงานต่อได้','error');
    return false;
  }

  try{
    const result=await window.TKNHardware.openDrawer({
      reason,
      shift_id:shift?.shift_id||null,
      sale_no:pendingSale?.saleNo||null,
      approval
    });
    drawerSoftwareLocked=true;
    localStorage.setItem('tkn_drawer_locked','1');
    msg(
      E.actionMsg,
      `เปิดลิ้นชักผ่าน ${result.transport||result.service||'Hardware'}`,
      'ok'
    );
    return true;
  }catch(error){
    msg(
      E.actionMsg,
      `เปิดลิ้นชักไม่สำเร็จ: ${error.message} — บิลถูกบันทึกแล้ว`,
      'error'
    );
    return false;
  }
}
async function approveDrawer(event){event.preventDefault();const r=await supabaseClient.rpc('authorize_cash_drawer_reopen_v3_4',{p_employee_code:E.drawerApproverCode.value.trim(),p_pin:E.drawerApproverPin.value});if(r.error)return msg(E.drawerApprovalMsg,r.error.message,'error');await requestCashDrawer('MANUAL',r.data);E.drawerApprovalDialog.close()}
function finish(){if(!pendingSale)return;const saleNo=pendingSale.saleNo;E.paymentSuccessDialog.close();cart.clear();E.discount.value='0';E.customerName.value='';E.customerPhone.value='';E.notes.value='';E.results.innerHTML='';pendingSale=null;renderCart();location.href=`./receipt.html?sale_no=${encodeURIComponent(saleNo)}&from=pos`}
function hold(){if(!cart.size)return msg(E.actionMsg,'ไม่มีสินค้าให้พักบิล','error');localStorage.setItem('tkn_pos_held_bill',JSON.stringify({branch:E.branch.value,payment:E.payment.value,customerName:E.customerName.value,customerPhone:E.customerPhone.value,discount:E.discount.value,notes:E.notes.value,items:[...cart.values()]}));cart.clear();renderCart();msg(E.actionMsg,'พักบิลแล้ว','ok')}
function restore(){try{const p=JSON.parse(localStorage.getItem('tkn_pos_held_bill')||'null');if(!p)return msg(E.actionMsg,'ไม่พบบิลพัก','error');if(validUuid(p.branch))E.branch.value=p.branch;E.payment.value=p.payment||'CASH';E.customerName.value=p.customerName||'';E.customerPhone.value=p.customerPhone||'';E.discount.value=p.discount||0;E.notes.value=p.notes||'';cart.clear();for(const x of p.items||[])cart.set(x.id,x);localStorage.removeItem('tkn_pos_held_bill');renderCart()}catch(e){msg(E.actionMsg,e.message,'error')}}
async function closeShift(event){
  event.preventDefault();
  if(!shift?.shift_id){
    E.closeShiftDialog.close();
    return msg(E.actionMsg,'ไม่พบกะที่เปิดอยู่','error');
  }
  const r=await supabaseClient.rpc('close_cashier_shift',{
    p_shift_id:shift.shift_id,
    p_closing_cash_count:number(E.closingCash.value),
    p_notes:E.closingNotes.value.trim()||null
  });
  if(r.error)return msg(E.closeShiftMsg,r.error.message,'error');
  shift=null;cashier=null;saveShiftState();
  E.closeShiftDialog.close();
  cart.clear();
  E.results.innerHTML='';
  E.search.value='';
  E.customerName.value='';
  E.customerPhone.value='';
  E.discount.value='0';
  E.notes.value='';
  E.closingCash.value='';
  E.closingNotes.value='';
  renderCart();
  E.cashierStatus.textContent='ปิดกะแล้ว · รอพนักงานเปิดกะใหม่';
  refreshPosAvailability();
  alert(`ปิดกะเรียบร้อย\nเงินสดที่ควรมี ${money(r.data.expected_cash)}\nผลต่าง ${money(r.data.difference)}`);
  E.openShift.focus();
}

E.openShift.onclick=()=>{if(!branchReady||!hasBranch())return msg(E.actionMsg,'กรุณารอโหลดสาขาให้เสร็จ','error');E.cashierUnlockDialog.showModal()};E.cashierUnlockForm.onsubmit=openShift;E.searchForm.onsubmit=searchProducts;E.discount.oninput=updateTotals;E.checkout.onclick=preparePayment;E.paymentForm.onsubmit=checkout;E.paymentDialogReceived.oninput=updatePayment;E.payment.onchange=configurePaymentFields;E.cancelPayment.onclick=()=>E.paymentDialog.close();E.changeGivenButton.onclick=finish;E.manualDrawer.onclick=()=>requestCashDrawer('MANUAL');E.drawerApprovalForm.onsubmit=approveDrawer;E.cancelDrawerApproval.onclick=()=>E.drawerApprovalDialog.close();E.holdBill.onclick=hold;E.restoreBill.onclick=restore;if(E.logoutBtn)E.logoutBtn.onclick=logout;E.closeShift.onclick=()=>{if(!shift?.shift_id)return msg(E.actionMsg,'ยังไม่ได้เปิดกะ','error');E.closeShiftDialog.showModal()};E.cancelCloseShift.onclick=()=>E.closeShiftDialog.close();E.closeShiftForm.onsubmit=closeShift;
E.branch.onchange=()=>{if(shift?.shift_id)return;cart.clear();E.results.innerHTML='';renderCart();if(hasBranch()){branchReady=true;refreshPosAvailability(`พร้อมใช้งาน: ${E.branch.options[E.branch.selectedIndex]?.text||''}`);E.openShift.focus()}};
init().catch(err=>{console.error(err);msg(E.actionMsg,err.message||'เริ่มระบบไม่สำเร็จ','error');lockBranchControls(false,'เริ่มระบบไม่สำเร็จ')});
