const E={
  saleNo:document.getElementById('saleNo'),
  paperSize:document.getElementById('paperSize'),
  copies:document.getElementById('copies'),
  loadBtn:document.getElementById('loadBtn'),
  printBtn:document.getElementById('printBtn'),
  receiptArea:document.getElementById('receiptArea'),
  message:document.getElementById('message')
};

const COMPANY={name:'บริษัท เถ้าแก่น้อย ชลบุรี จำกัด'};

let header=null;
let items=[];

function msg(text,type=''){
  E.message.textContent=text;
  E.message.className=`msg ${type}`.trim();
}
function esc(value){
  return String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);
}
function money(value){
  return new Intl.NumberFormat('th-TH',{
    style:'currency',currency:'THB',minimumFractionDigits:2
  }).format(Number(value||0));
}
function vatBase(value){return Number(value||0)/1.07}
function vatValue(value){return Number(value||0)-vatBase(value)}
function num(value){
  return Number(value||0).toLocaleString('th-TH',{maximumFractionDigits:3});
}
function paymentLabel(value){
  return ({
    CASH:'เงินสด',
    QR:'QR Payment',
    TRANSFER:'เงินโอน',
    CARD:'บัตร',
    VOUCHER:'Voucher / คูปอง',
    OTHER:'ช่องทางอื่น'
  })[String(value||'').toUpperCase()]||value||'-';
}
function firstValue(...values){
  return values.find(value=>value!==null&&value!==undefined&&String(value).trim()!=='')||'-';
}
function cashierCode(){
  return firstValue(
    header.cashier_employee_code,
    header.employee_code,
    header.cashier_code
  );
}
function cashierName(){
  return firstValue(
    header.cashier_name,
    header.cashier_full_name,
    header.cashier_email
  );
}
function branchLabel(){
  return firstValue(header.branch_name,header.branch_code,'สำนักงานใหญ่');
}
function thaiDateTime(value){
  if(!value)return '-';
  return new Date(value).toLocaleString('th-TH',{
    dateStyle:'medium',
    timeStyle:'medium'
  });
}

async function requireSession(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){
    location.replace('./index.html');
    return null;
  }
  return session;
}

async function loadReceipt(){
  const saleNo=E.saleNo.value.trim();
  if(!saleNo)return msg('กรุณากรอกเลขที่บิล','error');

  E.loadBtn.disabled=true;
  E.printBtn.disabled=true;
  msg('กำลังโหลดใบเสร็จ...');

  try{
    const {data:h,error:hErr}=await supabaseClient
      .from('pos_receipt_header')
      .select('*')
      .eq('sale_no',saleNo)
      .maybeSingle();

    if(hErr)throw hErr;
    if(!h)throw new Error('ไม่พบเลขที่บิล');

    const {data:i,error:iErr}=await supabaseClient
      .from('pos_receipt_items')
      .select('*')
      .eq('sale_id',h.id)
      .order('id');

    if(iErr)throw iErr;

    header=h;
    items=i||[];

    await renderReceipt();
    E.printBtn.disabled=false;
    msg('โหลดใบเสร็จแล้ว','ok');
  }catch(error){
    console.error('Receipt load error:',error);
    msg(error.message||'โหลดใบเสร็จไม่สำเร็จ','error');
  }finally{
    E.loadBtn.disabled=false;
  }
}

async function renderReceipt(){
  if(!header)return;

  E.receiptArea.innerHTML='';
  const copies=Math.min(Math.max(Number(E.copies.value)||1,1),5);

  for(let copy=1;copy<=copies;copy+=1){
    const receipt=document.createElement('article');
    receipt.className=`receipt ${E.paperSize.value}`;

    receipt.innerHTML=`
      <header class="receipt-company-header">
        <p class="receipt-document-title">ใบเสร็จรับเงิน</p>
        <h2>${esc(COMPANY.name)}</h2>
      </header>

      <div class="receipt-line"></div>

      <section class="receipt-meta">
        <div><span>เลขที่บิล</span><strong>${esc(header.sale_no)}</strong></div>
        <div><span>วันที่</span><strong>${esc(thaiDateTime(header.created_at))}</strong></div>
        <div><span>สาขา</span><strong>${esc(branchLabel())}</strong></div>
        <div><span>รหัสแคชเชียร์</span><strong>${esc(cashierCode())}</strong></div>
        <div><span>พนักงาน</span><strong>${esc(cashierName())}</strong></div>
        <div><span>ช่องทางชำระ</span><strong>${esc(paymentLabel(header.payment_method))}</strong></div>
        ${header.member_no?`
          <div><span>สมาชิก</span>
          <strong>${esc(header.member_no)} ${esc(header.member_name||'')}</strong></div>
        `:''}
        ${copies>1?`<div><span>สำเนา</span><strong>${copy}/${copies}</strong></div>`:''}
      </section>

      <div class="receipt-line"></div>

      <table class="receipt-table">
        <thead>
          <tr>
            <th>รายการ</th>
            <th class="number-cell">จำนวน</th>
            <th class="number-cell">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item=>`
            <tr>
              <td>
                <strong>${esc(item.product_name)}</strong>
                <br><small>${esc(item.product_code)}</small>
                <br><small>${num(item.quantity)} × ${money(item.unit_price)}</small>
              </td>
              <td class="number-cell">${num(item.quantity)}</td>
              <td class="number-cell">${money(item.line_total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="receipt-line"></div>

      <section class="receipt-summary">
        <div><span>ยอดสินค้า</span><strong>${money(header.subtotal)}</strong></div>
        <div><span>ส่วนลด</span><strong>${money(header.discount_amount)}</strong></div>
        <div><span>มูลค่าก่อน VAT</span><strong>${money(vatBase(header.net_total))}</strong></div>
        <div><span>VAT 7%</span><strong>${money(vatValue(header.net_total))}</strong></div>
        <div class="receipt-net">
          <span>ยอดชำระสุทธิ</span><strong>${money(header.net_total)}</strong>
        </div>
        <div><span>รับเงิน</span><strong>${money(header.received_amount)}</strong></div>
        <div><span>เงินทอน</span><strong>${money(header.change_amount)}</strong></div>
        ${header.points_earned?`
          <div><span>คะแนนที่ได้รับ</span><strong>${num(header.points_earned)}</strong></div>
        `:''}
        ${header.points_redeemed?`
          <div><span>คะแนนที่ใช้</span><strong>${num(header.points_redeemed)}</strong></div>
        `:''}
      </section>

      <div class="receipt-line"></div>

      <footer class="receipt-footer receipt-center">
        <canvas class="receipt-qr" aria-label="QR เลขที่บิล"></canvas>
        <p class="receipt-thank">ขอบคุณที่ใช้บริการ</p>
        <p>กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน</p>
        <p>สามารถเปลี่ยนหรือคืนสินค้า<br>ตามเงื่อนไขของบริษัท</p>
        <p class="receipt-powered">TKN POS ERP · Master 3.4 LTS</p>
      </footer>
    `;

    E.receiptArea.appendChild(receipt);

    const canvas=receipt.querySelector('.receipt-qr');
    try{
      await window.TKNReceiptQR?.render(canvas,header.sale_no,{
        width:E.paperSize.value==='receipt-a4'?150:90,
        margin:1
      });
    }catch(error){
      console.warn('Receipt QR skipped:',error);
      canvas?.remove();
    }

    if(copy<copies){
      const pageBreak=document.createElement('div');
      pageBreak.className='receipt-page-break';
      E.receiptArea.appendChild(pageBreak);
    }
  }
}

E.loadBtn.onclick=loadReceipt;
E.paperSize.onchange=()=>header&&renderReceipt();
E.copies.onchange=()=>header&&renderReceipt();
E.printBtn.onclick=()=>window.print();

const params=new URLSearchParams(location.search);
if(params.get('sale_no'))E.saleNo.value=params.get('sale_no');

requireSession().then(session=>{
  if(session&&E.saleNo.value)loadReceipt();
});
