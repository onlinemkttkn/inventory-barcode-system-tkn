import { supabaseClient } from './js/supabase-client.js';

const E = Object.fromEntries([
  'branch','payment','customerName','customerPhone','searchForm','search',
  'results','searchMsg','cart','cartCount','subtotal','discount','netTotal',
  'receivedField','received','quickCash','change','paymentWarning','notes',
  'checkout','manualDrawer','actionMsg','cashierStatus','holdBill','restoreBill',
  'closeShift','logoutBtn','cashierUnlockDialog','cashierUnlockForm',
  'employeeCode','cashierPin','openingFloat','unlockMsg','closeShiftDialog',
  'closeShiftForm','closingCash','closingNotes','cancelCloseShift','closeShiftMsg',
  'paymentDialog','paymentForm','paymentDialogNet','paymentReceivedLabel',
  'paymentDialogReceived','paymentQuickCash','paymentDialogChange',
  'paymentDialogWarning','cancelPayment','confirmPayment','paymentSuccessDialog',
  'successNet','successReceived','successChange','changeGivenButton',
  'drawerApprovalDialog','drawerApprovalForm','drawerApproverCode',
  'drawerApproverPin','cancelDrawerApproval','drawerApprovalMsg'
].map(id => [id, document.getElementById(id)]));

const cart = new Map();
let access = null;
let cashier = null;
let shift = null;
let receivedManuallyEdited = false;
let lastAutoReceivedValue = 0;
let pendingSale = null;
let drawerSoftwareLocked = localStorage.getItem('tkn_drawer_locked') === '1';

const money = value => new Intl.NumberFormat('th-TH', {
  style:'currency',currency:'THB',minimumFractionDigits:2
}).format(Number(value || 0));

const number = (value, fallback=0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
})[char]);

function msg(element, text, type='') {
  if (!element) return;
  element.textContent = text;
  element.className = `msg ${type}`.trim();
}

async function logout() {
  await supabaseClient.auth.signOut();
  sessionStorage.clear();
  localStorage.removeItem('tkn_cashier_unlock');
  location.replace('./index.html');
}

async function init() {
  const { data: { session }, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError || !session) {
    location.replace('./index.html');
    return;
  }

  const context = await supabaseClient.rpc('current_access_context');
  if (context.error || !context.data?.user_id || context.data.is_active !== true) {
    await logout();
    return;
  }

  access = context.data;
  const permissions = new Set(access.permissions || []);
  if (!permissions.has('pos.use')) {
    location.replace(access.landing_page || './index.html');
    return;
  }

  sessionStorage.setItem('tkn_user_role', access.role || 'staff');
  sessionStorage.setItem('tkn_permissions', JSON.stringify(access.permissions || []));

  const branches = await supabaseClient.from('branches')
    .select('id,code,name').eq('is_active',true).order('sort_order');

  if (branches.error) {
    msg(E.actionMsg, branches.error.message, 'error');
    return;
  }

  E.branch.innerHTML = (branches.data || []).map(branch =>
    `<option value="${branch.id}">${esc(branch.code)} — ${esc(branch.name)}</option>`
  ).join('');

  const setup = await supabaseClient.rpc('cashier_setup_status');
  if (setup.error) {
    msg(E.actionMsg, `ยังไม่ได้ติดตั้ง Cashier SQL: ${setup.error.message}`, 'error');
  } else if (setup.data?.is_configured) {
    E.cashierUnlockDialog.showModal();
  } else {
    cashier = {
      user_id: access.user_id,
      employee_code: 'SESSION',
      display_name: access.full_name || access.email,
      can_open_drawer: false
    };
    E.cashierStatus.textContent =
      `${cashier.display_name} · โหมดบัญชีล็อกอิน (ยังไม่ได้ตั้งรหัสพนักงาน)`;
    E.closeShift.hidden = true;
  }

  renderCart();
  updateTotals();
  E.search.focus();
}

async function openShift(event) {
  event.preventDefault();
  msg(E.unlockMsg, 'กำลังตรวจสอบ...');

  const result = await supabaseClient.rpc('open_cashier_shift', {
    p_employee_code: E.employeeCode.value.trim(),
    p_pin: E.cashierPin.value,
    p_branch_id: E.branch.value,
    p_opening_float: number(E.openingFloat.value)
  });

  if (result.error) {
    msg(E.unlockMsg, result.error.message, 'error');
    return;
  }

  shift = result.data;
  cashier = result.data;
  localStorage.setItem('tkn_cashier_unlock', JSON.stringify({
    shift_id: shift.shift_id,
    employee_code: shift.employee_code,
    display_name: shift.display_name,
    opened_at: shift.opened_at
  }));

  E.cashierStatus.textContent =
    `${shift.display_name} · ${shift.employee_code} · เปิดกะ ${new Date(shift.opened_at).toLocaleString('th-TH')}`;
  E.cashierPin.value = '';
  E.cashierUnlockDialog.close();
  E.search.focus();
}

async function searchProducts(event) {
  event?.preventDefault();
  const keyword = E.search.value.trim().replace(/[%_,()]/g,'');
  if (!keyword) return msg(E.searchMsg,'กรุณากรอกชื่อ รหัส หรือบาร์โค้ด','error');

  msg(E.searchMsg,'กำลังค้นหา...');
  const inventory = await supabaseClient.from('branch_inventory_list')
    .select('*').eq('branch_id',E.branch.value).gt('quantity',0)
    .or(`product_name.ilike.%${keyword}%,product_code.ilike.%${keyword}%,barcode.eq.${keyword}`)
    .limit(20);

  if (inventory.error) return msg(E.searchMsg,inventory.error.message,'error');

  const rows = inventory.data || [];
  if (!rows.length) {
    E.results.innerHTML = '';
    return msg(E.searchMsg,'ไม่พบสินค้า หรือสินค้าหมดสต็อก','error');
  }

  const ids = [...new Set(rows.map(row => row.product_id))];
  const productsResult = await supabaseClient.from('products')
    .select('id,selling_price,cost_price,is_active').in('id',ids);

  if (productsResult.error) {
    return msg(E.searchMsg,productsResult.error.message,'error');
  }

  const prices = new Map((productsResult.data || []).map(product => [
    product.id, product
  ]));

  const products = rows.map(row => {
    const product = prices.get(row.product_id) || {};
    return {
      productId:row.product_id,
      productCode:row.product_code,
      productName:row.product_name,
      barcode:row.barcode,
      stockQuantity:number(row.quantity),
      unitName:row.unit_name || '',
      sellingPrice:number(row.selling_price,number(product.selling_price)),
      costPrice:number(row.cost_price,number(product.cost_price)),
      isActive:product.is_active !== false
    };
  }).filter(product => product.isActive);

  E.results.innerHTML = products.map(product => `
    <article class="product-result" data-id="${product.productId}">
      <div>
        <strong>${esc(product.productName)}</strong>
        <small>${esc(product.productCode)} · คงเหลือ ${product.stockQuantity.toLocaleString('th-TH')} · ${money(product.sellingPrice)}</small>
      </div>
      <button class="btn primary add-product" type="button">เพิ่ม</button>
    </article>
  `).join('');

  E.results.querySelectorAll('.product-result').forEach(row => {
    const product = products.find(item => item.productId === row.dataset.id);
    row.querySelector('.add-product').onclick = () => addProduct(product);
  });

  if (products.length === 1) {
    addProduct(products[0]);
    E.search.value = '';
    E.search.focus();
  }
  msg(E.searchMsg,`พบ ${products.length} รายการ`);
}

function addProduct(product) {
  if (product.sellingPrice <= 0) {
    return msg(E.actionMsg,`สินค้า ${product.productName} ยังไม่มีราคาขาย`,'error');
  }
  const existing = cart.get(product.productId);
  const next = existing ? existing.cartQuantity + 1 : 1;
  if (next > product.stockQuantity) {
    return msg(E.actionMsg,'จำนวนในตะกร้าเกินสต็อก','error');
  }
  if (existing) existing.cartQuantity = next;
  else cart.set(product.productId,{
    ...product,cartQuantity:1,unitPrice:product.sellingPrice,lineDiscount:0
  });
  resetReceivedAmount();
  renderCart();
}

function renderCart() {
  E.cart.innerHTML = '';
  if (!cart.size) {
    E.cart.innerHTML = '<div class="empty-cart">ยังไม่มีสินค้าในตะกร้า</div>';
  }

  for (const item of cart.values()) {
    const row = document.createElement('article');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-info">
        <strong>${esc(item.productName)}</strong>
        <small>${esc(item.productCode)} · คงเหลือ ${item.stockQuantity.toLocaleString('th-TH')} · ${money(item.unitPrice)}/หน่วย</small>
      </div>
      <div class="cart-controls"></div>
    `;
    const controls = row.querySelector('.cart-controls');

    const qty = document.createElement('input');
    qty.type='number';qty.min='.001';qty.max=String(item.stockQuantity);
    qty.step='.001';qty.value=String(item.cartQuantity);qty.title='จำนวน';
    qty.oninput = () => {
      const value = Math.max(0,Math.min(number(qty.value),item.stockQuantity));
      item.cartQuantity = value;
      qty.value = String(value);
      resetReceivedAmount();
      if (value <= 0) cart.delete(item.productId);
      renderCart();
    };

    const price = document.createElement('input');
    price.type='number';price.min='0';price.step='.01';
    price.value=String(item.unitPrice);price.title='ราคาขาย';
    price.oninput = () => {
      item.unitPrice=Math.max(number(price.value),0);
      resetReceivedAmount();
      updateTotals();
    };

    const remove = document.createElement('button');
    remove.type='button';remove.className='btn danger';remove.textContent='ลบ';
    remove.onclick=()=>{cart.delete(item.productId);resetReceivedAmount();renderCart()};

    controls.append(qty,price,remove);
    E.cart.appendChild(row);
  }
  E.cartCount.textContent = `${cart.size} รายการ`;
  updateTotals();
}

function resetReceivedAmount() {
  receivedManuallyEdited = false;
  lastAutoReceivedValue = 0;
  E.received.value = '0';
  if (E.paymentDialogReceived) E.paymentDialogReceived.value = '0';
}

const subtotalValue = () => [...cart.values()].reduce(
  (sum,item)=>sum+Math.max(item.cartQuantity*item.unitPrice-number(item.lineDiscount),0),0
);
const discountValue = () => Math.max(number(E.discount.value),0);
const netValue = () => Math.max(subtotalValue()-discountValue(),0);

function quickCashValues(net) {
  const fixed = [20, 50, 100, 200, 300, 400, 500, 1000];
  return [
    ...fixed.map(value => ({ value, label: money(value) })),
    { value: net, label: 'เงินพอดี' }
  ];
}

function updateTotals() {
  const subtotal=subtotalValue();
  const net=netValue();
  const isCash=E.payment.value==='CASH';

  E.subtotal.textContent=money(subtotal);
  E.netTotal.textContent=money(net);
  E.receivedField.hidden=!isCash;


  const received=isCash?Math.max(number(E.received.value),0):net;
  const shortage=Math.max(net-received,0);
  const change=isCash?Math.max(received-net,0):0;

  E.change.textContent=money(change);
  E.paymentWarning.textContent=shortage>0
    ? `ขาดอีก ${money(shortage)}`
    : (isCash && net>0 ? 'รับเงินครบแล้ว' : '');

  E.checkout.disabled=!cart.size || (isCash && received<net);
  E.quickCash.innerHTML=isCash
    ? quickCashValues(net).map(option =>
        `<button class="quick-cash-btn" type="button"
          data-value="${option.value}">${option.label}</button>`
      ).join('')
    : '';

  E.quickCash.querySelectorAll('button').forEach(button => {
    button.onclick=()=>{
      receivedManuallyEdited=true;
      E.received.value=button.dataset.value;
      updateTotals();
    };
  });
}

async function requestCashDrawer(reason='SALE', approval=null) {
  if (reason === 'MANUAL' && drawerSoftwareLocked && !approval) {
    E.drawerApprovalDialog.showModal();
    return false;
  }

  if (reason === 'MANUAL' && !cashier?.can_open_drawer && !approval) {
    E.drawerApprovalDialog.showModal();
    return false;
  }

  const bridge = window.TKN_CASH_DRAWER_BRIDGE_URL;
  if (!bridge) {
    msg(E.actionMsg,'บันทึกการขายแล้ว แต่ยังไม่ได้ตั้งค่า Hardware Bridge สำหรับลิ้นชัก','error');
    drawerSoftwareLocked = true;
    localStorage.setItem('tkn_drawer_locked','1');
    return false;
  }

  try {
    await fetch(bridge,{
      method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reason,shift_id:shift?.shift_id || null,approval})
    });
    drawerSoftwareLocked = true;
    localStorage.setItem('tkn_drawer_locked','1');
    return true;
  } catch (error) {
    msg(E.actionMsg,`เปิดลิ้นชักไม่สำเร็จ: ${error.message}`,'error');
    return false;
  }
}

function preparePaymentDialog() {
  if (!cart.size) return msg(E.actionMsg,'กรุณาเพิ่มสินค้า','error');
  const net=netValue();
  const cash=E.payment.value==='CASH';
  E.paymentDialogNet.textContent=money(net);
  E.paymentReceivedLabel.hidden=!cash;
  E.paymentQuickCash.hidden=!cash;
  E.paymentDialogReceived.required=cash;
  E.paymentDialogReceived.value=cash?'0':String(net);
  E.paymentQuickCash.innerHTML=cash?quickCashValues(net).map(value=>
    `<button class="quick-cash-btn" type="button" data-value="${value}">${money(value)}</button>`
  ).join(''):'';
  E.paymentQuickCash.querySelectorAll('button').forEach(button=>{
    button.onclick=()=>{E.paymentDialogReceived.value=button.dataset.value;updatePaymentDialog()};
  });
  updatePaymentDialog();
  E.paymentDialog.showModal();
  if(cash) setTimeout(()=>E.paymentDialogReceived.select(),0);
}

function updatePaymentDialog(){
  const net=netValue();
  const cash=E.payment.value==='CASH';
  const received=cash?Math.max(number(E.paymentDialogReceived.value),0):net;
  const shortage=Math.max(net-received,0);
  const change=cash?Math.max(received-net,0):0;
  E.paymentDialogChange.textContent=money(change);
  E.paymentDialogWarning.textContent =
    cash && received <= 0
      ? 'กรุณากรอกจำนวนเงินที่รับจากลูกค้า'
      : shortage > 0
        ? `เงินรับขาดอีก ${money(shortage)}`
        : 'พร้อมรับชำระ';
  E.confirmPayment.disabled=shortage>0 || net<=0;
}

async function approveDrawer(event){
  event.preventDefault();
  msg(E.drawerApprovalMsg,'กำลังตรวจสอบ...');
  const result=await supabaseClient.rpc('authorize_cash_drawer_reopen_v3_4',{
    p_employee_code:E.drawerApproverCode.value.trim(),
    p_pin:E.drawerApproverPin.value
  });
  if(result.error) return msg(E.drawerApprovalMsg,result.error.message,'error');
  await requestCashDrawer('MANUAL',result.data);
  drawerSoftwareLocked=true;
  E.drawerApproverPin.value='';
  E.drawerApprovalDialog.close();
  msg(E.actionMsg,`เปิดลิ้นชักโดยผู้อนุมัติ ${result.data.display_name}`,'ok');
}

async function checkout(event) {
  event?.preventDefault();
  const items=[...cart.values()].filter(item=>item.cartQuantity>0).map(item=>({
    product_id:item.productId,quantity:item.cartQuantity,
    unit_price:item.unitPrice,discount_amount:number(item.lineDiscount)
  }));
  if (!items.length) return msg(E.actionMsg,'กรุณาเพิ่มสินค้า','error');

  const net=netValue();
  const cash=E.payment.value==='CASH';
  const received=cash?number(E.paymentDialogReceived.value):net;
  if (cash && (received<=0 || received<net)) {
    return msg(E.paymentDialogWarning,'จำนวนเงินรับน้อยกว่ายอดสุทธิ','error');
  }

  E.confirmPayment.disabled=true;
  msg(E.actionMsg,'กำลังบันทึกการขาย...');
  const result=await supabaseClient.rpc('create_pos_sale',{
    p_branch_id:E.branch.value,p_items:items,
    p_discount_amount:discountValue(),p_payment_method:E.payment.value,
    p_received_amount:received,p_customer_name:E.customerName.value.trim()||null,
    p_customer_phone:E.customerPhone.value.trim()||null,
    p_notes:[E.notes.value.trim(),
      cashier?`Cashier: ${cashier.employee_code} ${cashier.display_name}`:'',
      shift?.shift_id?`Shift: ${shift.shift_id}`:''
    ].filter(Boolean).join('\n')||null
  });
  E.confirmPayment.disabled=false;
  if(result.error) return msg(E.actionMsg,result.error.message,'error');

  const change=number(result.data?.change_amount,received-net);
  pendingSale={saleNo:result.data.sale_no,net,received,change};
  if(cash && change>=0) await requestCashDrawer('SALE');

  E.paymentDialog.close();
  E.successNet.textContent=money(net);
  E.successReceived.textContent=money(received);
  E.successChange.textContent=money(change);
  E.changeGivenButton.textContent=change>0
    ? 'จ่ายเงินทอนแล้ว / ไปพิมพ์ใบเสร็จ'
    : 'ไปพิมพ์ใบเสร็จ';
  E.paymentSuccessDialog.showModal();
}

function finishSaleAndPrint(){
  if(!pendingSale) return;
  const saleNo=pendingSale.saleNo;
  E.paymentSuccessDialog.close();
  cart.clear();E.discount.value='0';E.received.value='0';
  E.customerName.value='';E.customerPhone.value='';E.notes.value='';
  E.results.innerHTML='';receivedManuallyEdited=false;lastAutoReceivedValue=0;
  renderCart();
  pendingSale=null;
  location.href=`./receipt.html?sale_no=${encodeURIComponent(saleNo)}&from=pos`;
}

function holdBill() {
  if (!cart.size) return msg(E.actionMsg,'ไม่มีสินค้าให้พักบิล','error');
  const payload={
    branch:E.branch.value,payment:E.payment.value,
    customerName:E.customerName.value,customerPhone:E.customerPhone.value,
    discount:E.discount.value,notes:E.notes.value,
    items:[...cart.values()],held_at:new Date().toISOString()
  };
  localStorage.setItem('tkn_pos_held_bill',JSON.stringify(payload));
  cart.clear();renderCart();
  msg(E.actionMsg,'พักบิลไว้ในเครื่องนี้แล้ว','ok');
}

function restoreBill() {
  try {
    const payload=JSON.parse(localStorage.getItem('tkn_pos_held_bill')||'null');
    if (!payload) return msg(E.actionMsg,'ไม่พบบิลพัก','error');
    E.branch.value=payload.branch;E.payment.value=payload.payment;
    E.customerName.value=payload.customerName||'';
    E.customerPhone.value=payload.customerPhone||'';
    E.discount.value=payload.discount||0;E.notes.value=payload.notes||'';
    cart.clear();
    for (const item of payload.items||[]) cart.set(item.productId,item);
    localStorage.removeItem('tkn_pos_held_bill');
    renderCart();
    msg(E.actionMsg,'เปิดบิลพักเรียบร้อย','ok');
  } catch (error) {
    msg(E.actionMsg,`เปิดบิลพักไม่สำเร็จ: ${error.message}`,'error');
  }
}

async function closeShift(event) {
  event.preventDefault();
  if (!shift?.shift_id) return E.closeShiftDialog.close();

  const result=await supabaseClient.rpc('close_cashier_shift',{
    p_shift_id:shift.shift_id,
    p_closing_cash_count:number(E.closingCash.value),
    p_notes:E.closingNotes.value.trim()||null
  });

  if (result.error) return msg(E.closeShiftMsg,result.error.message,'error');

  alert(
    `ปิดกะเรียบร้อย\nยอดที่ควรมี ${money(result.data.expected_cash)}\n`+
    `นับได้ ${money(result.data.closing_cash_count)}\n`+
    `ผลต่าง ${money(result.data.difference)}`
  );
  localStorage.removeItem('tkn_cashier_unlock');
  E.closeShiftDialog.close();
  await logout();
}

E.cashierUnlockForm.onsubmit=openShift;
E.searchForm.onsubmit=searchProducts;
E.branch.onchange=()=>{cart.clear();renderCart();E.results.innerHTML=''};
E.discount.oninput=()=>{
  resetReceivedAmount();
  updateTotals();
};
E.received.oninput=()=>{receivedManuallyEdited=true;updateTotals()};
E.payment.onchange=()=>{resetReceivedAmount();updateTotals()};
E.checkout.onclick=preparePaymentDialog;
E.paymentForm.onsubmit=checkout;
E.paymentDialogReceived.oninput=updatePaymentDialog;
E.cancelPayment.onclick=()=>E.paymentDialog.close();
E.changeGivenButton.onclick=finishSaleAndPrint;
E.manualDrawer.onclick=()=>requestCashDrawer('MANUAL');
E.drawerApprovalForm.onsubmit=approveDrawer;
E.cancelDrawerApproval.onclick=()=>E.drawerApprovalDialog.close();
E.holdBill.onclick=holdBill;
E.restoreBill.onclick=restoreBill;
E.logoutBtn.onclick=logout;
E.closeShift.onclick=()=>E.closeShiftDialog.showModal();
E.cancelCloseShift.onclick=()=>E.closeShiftDialog.close();
E.closeShiftForm.onsubmit=closeShift;

init().catch(error=>msg(E.actionMsg,error.message,'error'));
