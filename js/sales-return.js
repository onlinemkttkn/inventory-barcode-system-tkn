const E={
  searchForm:document.getElementById('searchForm'),
  saleNo:document.getElementById('saleNo'),
  saleSummary:document.getElementById('saleSummary'),
  searchMessage:document.getElementById('searchMessage'),
  items:document.getElementById('items'),
  refundMethod:document.getElementById('refundMethod'),
  reason:document.getElementById('reason'),
  notes:document.getElementById('notes'),
  refundEstimate:document.getElementById('refundEstimate'),
  returnBtn:document.getElementById('returnBtn'),
  actionMessage:document.getElementById('actionMessage')
};

let sale=null;
let rows=[];

function msg(el,t,c=''){el.textContent=t;el.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}
function num(v){return Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:3})}

async function requireAdmin(){
  const{data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='./dashboard.html';return null}

  const{data:profile,error}=await supabaseClient
    .from('profiles')
    .select('role,is_active')
    .eq('id',session.user.id)
    .maybeSingle();

  if(error||!profile||profile.is_active!==true){
    location.href='./dashboard.html';
    return null;
  }

  if(profile.role!=='admin'){
    msg(E.actionMessage,'เฉพาะ Admin เท่านั้นที่คืนสินค้าได้','error');
    E.returnBtn.disabled=true;
  }

  return profile;
}

async function loadSale(){
  const saleNo=E.saleNo.value.trim();
  if(!saleNo)return msg(E.searchMessage,'กรุณากรอกเลขที่บิล','error');

  const{data:s,error:sErr}=await supabaseClient
    .from('sale_list')
    .select('*')
    .eq('sale_no',saleNo)
    .maybeSingle();

  if(sErr)return msg(E.searchMessage,sErr.message,'error');
  if(!s)return msg(E.searchMessage,'ไม่พบบิลขาย','error');
  if(s.status!=='COMPLETED')return msg(E.searchMessage,'บิลนี้ถูกยกเลิกแล้ว','error');

  const{data:i,error:iErr}=await supabaseClient
    .from('sale_item_return_balance')
    .select('*')
    .eq('sale_id',s.id)
    .order('product_name');

  if(iErr)return msg(E.searchMessage,iErr.message,'error');

  sale=s;
  rows=i||[];

  E.saleSummary.innerHTML=
    `บิล <b>${esc(s.sale_no)}</b> • ${esc(s.branch_name)} • ${money(s.net_total)} • ${new Date(s.created_at).toLocaleString('th-TH')}`;

  renderItems();
  msg(E.searchMessage,`พบ ${rows.length} รายการ`);
}

function renderItems(){
  E.items.innerHTML='';

  rows.forEach(x=>{
    const row=document.createElement('div');
    row.className='return-item';

    const info=document.createElement('div');
    info.innerHTML=`
      <b>${esc(x.product_name)}</b>
      <small>${esc(x.product_code)} • ขาย ${num(x.sold_quantity)} • คืนแล้ว ${num(x.returned_quantity)} • คืนได้ ${num(x.returnable_quantity)}</small>`;

    const qty=document.createElement('input');
    qty.type='number';
    qty.min='0';
    qty.max=x.returnable_quantity;
    qty.step='.001';
    qty.value='0';
    qty.dataset.saleItemId=x.sale_item_id;
    qty.oninput=updateEstimate;
    qty.disabled=Number(x.returnable_quantity)<=0;

    const estimate=document.createElement('strong');
    estimate.dataset.estimateFor=x.sale_item_id;
    estimate.textContent=money(0);

    row.append(info,qty,estimate);
    E.items.appendChild(row);
  });

  updateEstimate();
}

function selectedItems(){
  return [...E.items.querySelectorAll('input[data-sale-item-id]')]
    .map(input=>{
      const row=rows.find(x=>x.sale_item_id===input.dataset.saleItemId);
      const quantity=Math.min(
        Math.max(Number(input.value)||0,0),
        Number(row.returnable_quantity)
      );

      return{
        sale_item_id:row.sale_item_id,
        quantity,
        estimate:row.sold_quantity>0
          ?(Number(row.line_total)/Number(row.sold_quantity))*quantity
          :0
      };
    })
    .filter(x=>x.quantity>0);
}

function updateEstimate(){
  const items=selectedItems();
  let total=0;

  items.forEach(x=>{
    total+=x.estimate;
    const node=E.items.querySelector(`[data-estimate-for="${x.sale_item_id}"]`);
    if(node)node.textContent=money(x.estimate);
  });

  E.items.querySelectorAll('[data-estimate-for]').forEach(node=>{
    if(!items.find(x=>x.sale_item_id===node.dataset.estimateFor)){
      node.textContent=money(0);
    }
  });

  E.refundEstimate.textContent=money(total);
}

async function createReturn(){
  if(!sale)return msg(E.actionMessage,'กรุณาค้นหาบิลก่อน','error');

  const items=selectedItems();
  if(!items.length)return msg(E.actionMessage,'กรุณาระบุจำนวนคืน','error');
  if(!E.reason.value.trim())return msg(E.actionMessage,'กรุณาระบุเหตุผล','error');

  if(!confirm(`ยืนยันคืนสินค้า ${items.length} รายการ ยอดประมาณ ${E.refundEstimate.textContent}?`))return;

  E.returnBtn.disabled=true;
  msg(E.actionMessage,'กำลังคืนสินค้าและปรับสต๊อก...');

  const{data,error}=await supabaseClient.rpc('create_sales_return',{
    p_sale_id:sale.id,
    p_items:items.map(x=>({
      sale_item_id:x.sale_item_id,
      quantity:x.quantity
    })),
    p_refund_method:E.refundMethod.value,
    p_reason:E.reason.value.trim(),
    p_notes:E.notes.value.trim()||null
  });

  E.returnBtn.disabled=false;

  if(error)return msg(E.actionMessage,error.message,'error');

  msg(
    E.actionMessage,
    `คืนสินค้าเรียบร้อย ${data.return_no} • คืนเงิน ${money(data.refund_amount)}`,
    'ok'
  );

  location.href=`./sales-return-receipt.html?return_no=${encodeURIComponent(data.return_no)}`;
}

E.searchForm.onsubmit=e=>{e.preventDefault();loadSale()};
E.returnBtn.onclick=createReturn;

requireAdmin();
