const E={
  saleNo:document.getElementById('saleNo'),
  paperSize:document.getElementById('paperSize'),
  copies:document.getElementById('copies'),
  loadBtn:document.getElementById('loadBtn'),
  printBtn:document.getElementById('printBtn'),
  receiptArea:document.getElementById('receiptArea'),
  message:document.getElementById('message')
};

let header=null;
let items=[];

function msg(t,c=''){E.message.textContent=t;E.message.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2}).format(Number(v||0))}
function num(v){return Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:3})}
function paymentLabel(v){return({CASH:'เงินสด',TRANSFER:'โอนเงิน',QR:'QR Payment',CARD:'บัตร',OTHER:'อื่น ๆ'})[v]||v}

async function requireSession(){
  const{data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='./dashboard.html';return null}
  return session;
}

async function loadReceipt(){
  const saleNo=E.saleNo.value.trim();
  if(!saleNo)return msg('กรุณากรอกเลขที่บิล','error');

  msg('กำลังโหลดใบเสร็จ...');

  const {data:h,error:hErr}=await supabaseClient
    .from('pos_receipt_header')
    .select('*')
    .eq('sale_no',saleNo)
    .maybeSingle();

  if(hErr)return msg(hErr.message,'error');
  if(!h)return msg('ไม่พบเลขที่บิล','error');

  const {data:i,error:iErr}=await supabaseClient
    .from('pos_receipt_items')
    .select('*')
    .eq('sale_id',h.id)
    .order('id');

  if(iErr)return msg(iErr.message,'error');

  header=h;
  items=i||[];
  try {
    await renderReceipt();
  } catch (error) {
    console.error('Receipt rendering warning:', error);
    msg('โหลดใบเสร็จแล้ว แต่บางส่วนแสดงไม่ครบ','error');
  } finally {
    E.printBtn.disabled=false;
  }
  if (!E.message.classList.contains('error')) {
    msg('โหลดใบเสร็จแล้ว','ok');
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
      <div class="receipt-center">
        <h2>ร้านเถ้าแก่น้อยชลบุรี</h2>
        <p>${esc(header.branch_name)}</p>
        <p>${esc(header.branch_address||'')}</p>
        <p>${esc(header.branch_phone||'')}</p>
      </div>

      <div class="receipt-line"></div>

      <p>เลขที่: ${esc(header.sale_no)}</p>
      <p>วันที่: ${new Date(header.created_at).toLocaleString('th-TH')}</p>
      <p>พนักงาน: ${esc(header.cashier_name||header.cashier_email||'-')}</p>
      ${header.member_no?`<p>สมาชิก: ${esc(header.member_no)} ${esc(header.member_name||'')}</p>`:''}
      ${copies>1?`<p>สำเนาที่ ${copy}/${copies}</p>`:''}

      <div class="receipt-line"></div>

      <table class="receipt-table">
        <thead>
          <tr><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">รวม</th></tr>
        </thead>
        <tbody>
          ${items.map(x=>`
            <tr>
              <td>${esc(x.product_name)}<br><small>${esc(x.product_code)}</small></td>
              <td style="text-align:right">${num(x.quantity)}</td>
              <td style="text-align:right">${money(x.line_total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div class="receipt-line"></div>

      <div class="receipt-summary">
        <div><span>ยอดสินค้า</span><strong>${money(header.subtotal)}</strong></div>
        <div><span>ส่วนลด</span><strong>${money(header.discount_amount)}</strong></div>
        <div><span>ยอดสุทธิ</span><strong>${money(header.net_total)}</strong></div>
        <div><span>ชำระ</span><strong>${paymentLabel(header.payment_method)}</strong></div>
        <div><span>รับเงิน</span><strong>${money(header.received_amount)}</strong></div>
        <div><span>เงินทอน</span><strong>${money(header.change_amount)}</strong></div>
        ${header.points_earned?`<div><span>คะแนนที่ได้รับ</span><strong>${num(header.points_earned)}</strong></div>`:''}
        ${header.points_redeemed?`<div><span>คะแนนที่ใช้</span><strong>${num(header.points_redeemed)}</strong></div>`:''}
      </div>

      <div class="receipt-line"></div>

      <div class="receipt-center">
        <canvas class="receipt-qr"></canvas>
        <p>ขอบคุณที่ใช้บริการ</p>
      </div>
    `;

    E.receiptArea.appendChild(receipt);

    const canvas=receipt.querySelector('.receipt-qr');
    try {
      await window.TKNReceiptQR?.render(canvas, header.sale_no, {
        width:E.paperSize.value==='receipt-a4'?150:90,
        margin:1
      });
    } catch (error) {
      console.warn('Receipt QR skipped:', error);
      canvas?.remove();
    }

    if(copy<copies){
      const pageBreak=document.createElement('div');
      pageBreak.style.breakAfter='page';
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

requireSession().then(s=>{
  if(s&&E.saleNo.value)loadReceipt();
});
