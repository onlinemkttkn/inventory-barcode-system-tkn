const E={
  saleNo:document.getElementById('saleNo'),
  paperSize:document.getElementById('paperSize'),
  copies:document.getElementById('copies'),
  loadBtn:document.getElementById('loadBtn'),
  printBtn:document.getElementById('printBtn'),
  receiptArea:document.getElementById('receiptArea'),
  message:document.getElementById('message')
};

const COMPANY={get name(){return window.TKNBranding?.get?.().company_legal_name||'บริษัท เถ้าแก่น้อย ชลบุรี จำกัด';}};
function receiptFooterText(){return window.TKNBranding?.get?.().receipt_footer||'ขอบคุณที่ใช้บริการ';}

function companyReceiptLines(){
  const brand=window.TKNBranding?.get?.()||{};
  const lines=[];
  if(brand.address) lines.push(`<p>${esc(brand.address)}</p>`);
  if(brand.tax_id) lines.push(`<p>เลขประจำตัวผู้เสียภาษี ${esc(brand.tax_id)}</p>`);
  const contact=[brand.phone,brand.email].filter(Boolean).join(' · ');
  if(contact) lines.push(`<p>${esc(contact)}</p>`);
  return lines.join('');
}
async function ensureReceiptBranding(){try{await window.TKNBranding?.load?.();}catch(error){console.warn('Receipt branding fallback:',error);}}

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

function salesChannelLabel(value){
  const labels={
    STORE:'หน้าร้าน', POS:'หน้าร้าน', OFFLINE:'หน้าร้าน',
    ONLINE:'ออนไลน์', LINE:'LINE OA', LINE_OA:'LINE OA',
    FACEBOOK:'Facebook', WEBSITE:'Website', MARKETPLACE:'Marketplace',
    SHOPEE:'Shopee', LAZADA:'Lazada', TIKTOK:'TikTok Shop'
  };
  const normalized=String(value||'').trim().toUpperCase();
  return labels[normalized]||value||'-';
}
function salesChannelValue(){
  return salesChannelLabel(firstValue(
    header?.sales_channel,
    header?.salesChannel,
    header?.order_channel
  ));
}
function paymentChannelValue(){
  return paymentLabel(firstValue(
    header?.payment_channel,
    header?.payment_method
  ));
}
function customerNameValue(){
  return String(header?.customer_name||'').trim();
}
function customerPhoneValue(){
  return String(header?.customer_phone||'').trim();
}
function customerReceiptMeta(){
  const customerName=customerNameValue();
  const customerPhone=customerPhoneValue();
  if(!customerName&&!customerPhone)return '';
  const namePart=customerName
    ? `<span class="receipt-meta-unit receipt-meta-customer-name"><span class="receipt-meta-key">ลูกค้า</span><strong class="receipt-meta-value">${esc(customerName)}</strong></span>`
    : '';
  const phonePart=customerPhone
    ? `<span class="receipt-meta-unit receipt-meta-customer-phone"><span class="receipt-meta-key">โทร</span><strong class="receipt-meta-value">${esc(customerPhone)}</strong></span>`
    : '';
  return `<div class="receipt-meta-row receipt-meta-customer">${namePart}${phonePart}</div>`;
}
function receiptMetaStyle(){
  if(document.getElementById('tknReceiptMetaHF6')) return;
  const style=document.createElement('style');
  style.id='tknReceiptMetaHF6';
  style.textContent=`
    .receipt-meta.receipt-meta-hf6{display:block!important;width:100%!important;margin:0!important}
    .receipt-meta-hf6 .receipt-meta-row{display:flex!important;align-items:baseline;gap:1.2mm;width:100%;min-width:0;margin:.55mm 0;line-height:1.22}
    .receipt-meta-hf6 .receipt-meta-key{flex:0 0 auto;white-space:nowrap;font-weight:400}
    .receipt-meta-hf6 .receipt-meta-value{min-width:0;font-weight:700}
    .receipt-meta-hf6 .receipt-meta-nowrap{flex-wrap:nowrap!important;white-space:nowrap!important}
    .receipt-meta-hf6 .receipt-meta-nowrap .receipt-meta-value{white-space:nowrap!important}
    .receipt-meta-hf6 .receipt-meta-branch{align-items:flex-start;flex-wrap:nowrap!important}
    .receipt-meta-hf6 .receipt-meta-branch .receipt-meta-value{white-space:normal!important;overflow-wrap:break-word;word-break:normal;line-height:1.18}
    .receipt-meta-hf6 .receipt-meta-combined{display:flex!important;flex-wrap:nowrap!important;align-items:baseline;gap:1.35mm;white-space:nowrap!important;font-size:.88em;letter-spacing:-.01em}
    .receipt-meta-hf6 .receipt-meta-combined .receipt-meta-unit{display:inline-flex;align-items:baseline;gap:.5mm;min-width:0;white-space:nowrap!important}
    .receipt-meta-hf6 .receipt-meta-combined .receipt-meta-employee{flex:1 1 auto;min-width:0}
    .receipt-meta-hf6 .receipt-meta-combined .receipt-meta-employee .receipt-meta-value{min-width:0;white-space:nowrap!important}
    .receipt-meta-hf6 .receipt-meta-combined .receipt-meta-sales{flex:0 0 auto;font-weight:700}
    .receipt-meta-hf6 .receipt-meta-combined .receipt-meta-payment{flex:0 0 auto}
    .receipt.receipt-58 .receipt-meta-hf6 .receipt-meta-row{gap:.8mm;font-size:.9em}
    .receipt.receipt-58 .receipt-meta-hf6 .receipt-meta-combined{gap:.75mm;font-size:.73em;letter-spacing:-.025em}
    .receipt.receipt-80 .receipt-meta-hf6 .receipt-meta-combined{font-size:.84em}
    .receipt.receipt-a4 .receipt-meta-hf6 .receipt-meta-combined{font-size:1em}
    .receipt-meta-hf6 .receipt-meta-customer{display:flex!important;align-items:baseline;gap:1.35mm;min-width:0;flex-wrap:wrap!important}
    .receipt-meta-hf6 .receipt-meta-customer .receipt-meta-unit{display:inline-flex;align-items:baseline;gap:.5mm;min-width:0}
    .receipt-meta-hf6 .receipt-meta-customer-name{flex:1 1 auto}
    .receipt-meta-hf6 .receipt-meta-customer-name .receipt-meta-value{overflow-wrap:anywhere}
    .receipt-meta-hf6 .receipt-meta-customer-phone{flex:0 0 auto;white-space:nowrap}
    .receipt.receipt-58 .receipt-meta-hf6 .receipt-meta-customer{gap:.75mm;font-size:.82em}
    @media print{
      .receipt-meta-hf6 .receipt-meta-nowrap,.receipt-meta-hf6 .receipt-meta-combined{break-inside:avoid;page-break-inside:avoid}
    }
  `;
  document.head.appendChild(style);
}
function fitReceiptMetaLayout(root){
  if(!root) return;
  const fitOneLine=(row,minPx=7)=>{
    if(!row) return;
    row.style.fontSize='';
    let size=parseFloat(getComputedStyle(row).fontSize)||11;
    let guard=0;
    while(row.scrollWidth>row.clientWidth+1&&size>minPx&&guard<24){
      size=Math.max(minPx,size-.25);
      row.style.fontSize=`${size}px`;
      guard+=1;
    }
  };
  root.querySelectorAll('.receipt-meta-nowrap').forEach(row=>fitOneLine(row,7.5));
  fitOneLine(root.querySelector('.receipt-meta-combined'),7);

  const branchRow=root.querySelector('.receipt-meta-branch');
  const branchValue=branchRow?.querySelector('.receipt-meta-value');
  if(branchValue){
    branchValue.style.fontSize='';
    let size=parseFloat(getComputedStyle(branchValue).fontSize)||11;
    let guard=0;
    const tooTall=()=>{
      const cs=getComputedStyle(branchValue);
      const line=parseFloat(cs.lineHeight)||(size*1.18);
      return branchValue.scrollHeight>line*2.12;
    };
    while(tooTall()&&size>7.5&&guard<24){
      size=Math.max(7.5,size-.25);
      branchValue.style.fontSize=`${size}px`;
      guard+=1;
    }
  }
}

function currentCashierShift(){
  try{
    const value=JSON.parse(
      sessionStorage.getItem('tkn_cashier_shift')||'null'
    );
    return value&&typeof value==='object'?value:null;
  }catch{
    return null;
  }
}
function normalizedCode(value){
  return String(value||'').trim().toUpperCase();
}
function cashierCode(){
  return firstValue(
    header.cashier_employee_code,
    header.employee_code,
    header.cashier_code
  );
}
function cashierName(){
  const profileName=firstValue(
    header.cashier_name,
    header.cashier_full_name,
    header.cashier_display_name
  );

  if(profileName&&profileName!=='-'){
    return profileName;
  }

  const shift=currentCashierShift();
  const receiptCode=normalizedCode(cashierCode());
  const shiftCode=normalizedCode(shift?.employee_code);

  if(shiftCode&&receiptCode&&shiftCode===receiptCode){
    return firstValue(
      shift.display_name,
      shift.cashier_name,
      shift.full_name,
      shift.employee_code
    );
  }

  return firstValue(
    header.cashier_email,
    cashierCode()
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

function itemGrossTotal(item){
  return Math.max(Number(item?.quantity||0)*Number(item?.unit_price||0),0);
}
function itemDiscountAmount(item){
  const stored=Number(item?.discount_amount);
  if(Number.isFinite(stored)&&stored>=0)return Math.min(stored,itemGrossTotal(item));
  const lineTotal=Number(item?.line_total);
  if(Number.isFinite(lineTotal))return Math.max(itemGrossTotal(item)-lineTotal,0);
  return 0;
}
function itemNetTotal(item){
  const stored=Number(item?.line_total);
  if(Number.isFinite(stored)&&stored>=0)return stored;
  return Math.max(itemGrossTotal(item)-itemDiscountAmount(item),0);
}
function itemDiscountTotal(){
  return items.reduce((sum,item)=>sum+itemDiscountAmount(item),0);
}
function billDiscountAmount(){
  return Math.max(Number(header?.discount_amount||0),0);
}
function receiptTotalDiscount(){
  return itemDiscountTotal()+billDiscountAmount();
}
function receiptGrossSubtotal(){
  if(items.length)return items.reduce((sum,item)=>sum+itemGrossTotal(item),0);
  return Math.max(Number(header?.subtotal||0)+itemDiscountTotal(),0);
}
function receiptNetTotal(){
  const stored=Number(header?.net_total);
  if(Number.isFinite(stored)&&stored>=0)return stored;
  return Math.max(receiptGrossSubtotal()-receiptTotalDiscount(),0);
}
function beforeVatAmount(){
  const stored=Number(header?.vat_base_amount);
  if(Number.isFinite(stored)&&stored>=0)return stored;
  const rate=Math.max(Number(header?.vat_rate||7),0);
  return rate>0?receiptNetTotal()/(1+(rate/100)):receiptNetTotal();
}
function vatAmount(){
  const stored=Number(header?.vat_amount);
  if(Number.isFinite(stored)&&stored>=0)return stored;
  return receiptNetTotal()-beforeVatAmount();
}
function vatRate(){
  const rate=Number(header?.vat_rate||7);
  return Number.isFinite(rate)?rate:7;
}

async function requireSession(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){
    location.replace('./index.html');
    return null;
  }
  return session;
}


function applyReceiptPageStyle(){
  const paper=E.paperSize?.value||'receipt-80';
  const isA4=paper==='receipt-a4';
  const width=paper==='receipt-58'?58:paper==='receipt-80'?80:210;
  let style=document.getElementById('tknReceiptDynamicPage');
  if(!style){
    style=document.createElement('style');
    style.id='tknReceiptDynamicPage';
    document.head.appendChild(style);
  }

  if(isA4){
    style.textContent=`
      @page{size:A4 portrait;margin:0}
      @media print{
        html,body,.shell,.card,#receiptArea{width:210mm!important;max-width:210mm!important;min-width:210mm!important;margin:0!important;padding:0!important}
        .receipt-a4{width:210mm!important;max-width:210mm!important;min-height:297mm!important;margin:0!important;padding:15mm!important}
      }`;
  }else{
    style.textContent=`
      @page{size:${width}mm auto;margin:0}
      @media print{
        html,body,.shell,.card,#receiptArea{width:${width}mm!important;max-width:${width}mm!important;min-width:${width}mm!important;margin:0!important;padding:0!important}
        .receipt{width:${width}mm!important;max-width:${width}mm!important;margin:0!important;padding:${width===58?'3mm':'3mm 4mm'}!important}
      }`;
  }
}

async function waitForReceiptPrintReady(){
  try{
    if(document.fonts?.ready) await document.fonts.ready;
  }catch(error){
    console.warn('Font readiness check skipped:',error);
  }
  E.receiptArea?.querySelectorAll('.receipt').forEach(fitReceiptMetaLayout);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}

async function loadReceipt(){
  const saleNo=E.saleNo.value.trim();
  if(!saleNo)return msg('กรุณากรอกเลขที่บิล','error');

  E.loadBtn.disabled=true;
  E.printBtn.disabled=true;
  msg('กำลังโหลดใบเสร็จ...');

  try{
    await ensureReceiptBranding();
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

    // Read additive POS Stable fields directly from sales. This avoids replacing
    // the existing receipt view and remains compatible with older bills.
    const {data:stableFields,error:stableErr}=await supabaseClient
      .from('sales')
      .select('cashier_shift_id,cashier_user_id,cashier_employee_code,cashier_display_name,vat_rate,vat_included,vat_base_amount,vat_amount')
      .eq('id',h.id)
      .maybeSingle();

    if(stableErr){
      console.warn('Stable receipt fields unavailable; using legacy receipt data:',stableErr);
    }

    // HF6: read channel fields separately. If an older database does not have these
    // additive columns, receipt rendering continues with the existing payment_method.
    const {data:channelFields,error:channelErr}=await supabaseClient
      .from('sales')
      .select('sales_channel,payment_channel')
      .eq('id',h.id)
      .maybeSingle();
    if(channelErr){
      console.warn('Receipt channel fields unavailable; using existing receipt fields:',channelErr);
    }

    header={...h,...(stableFields||{}),...(channelFields||{})};
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
  receiptMetaStyle();

  E.receiptArea.innerHTML='';
  const copies=Math.min(Math.max(Number(E.copies.value)||1,1),5);

  for(let copy=1;copy<=copies;copy+=1){
    const receipt=document.createElement('article');
    receipt.className=`receipt ${E.paperSize.value}`;

    receipt.innerHTML=`
      <header class="receipt-company-header">
        <p class="receipt-document-title">ใบเสร็จรับเงิน</p>
        <h2>${esc(COMPANY.name)}</h2>
        ${companyReceiptLines()}
      </header>

      <div class="receipt-line"></div>

      <section class="receipt-meta receipt-meta-hf6">
        <div class="receipt-meta-row receipt-meta-nowrap"><span class="receipt-meta-key">เลขที่บิล</span><strong class="receipt-meta-value">${esc(header.sale_no)}</strong></div>
        <div class="receipt-meta-row receipt-meta-nowrap"><span class="receipt-meta-key">วันที่</span><strong class="receipt-meta-value">${esc(thaiDateTime(header.created_at))}</strong></div>
        <div class="receipt-meta-row receipt-meta-branch"><span class="receipt-meta-key">สาขา</span><strong class="receipt-meta-value">${esc(branchLabel())}</strong></div>
        <div class="receipt-meta-row receipt-meta-nowrap"><span class="receipt-meta-key">รหัสแคชเชียร์</span><strong class="receipt-meta-value">${esc(cashierCode())}</strong></div>
        <div class="receipt-meta-row receipt-meta-combined">
          <span class="receipt-meta-unit receipt-meta-employee"><span class="receipt-meta-key">พนักงาน</span><strong class="receipt-meta-value">${esc(cashierName())}</strong></span>
          <span class="receipt-meta-unit receipt-meta-sales"><strong>${esc(salesChannelValue())}</strong></span>
          <span class="receipt-meta-unit receipt-meta-payment"><span class="receipt-meta-key">ช่องทาง</span><strong class="receipt-meta-value">${esc(paymentChannelValue())}</strong></span>
        </div>
        ${customerReceiptMeta()}
        ${header.member_no?`
          <div class="receipt-meta-row"><span class="receipt-meta-key">สมาชิก</span>
          <strong class="receipt-meta-value">${esc(header.member_no)} ${esc(header.member_name||'')}</strong></div>
        `:''}
        ${copies>1?`<div class="receipt-meta-row receipt-meta-nowrap"><span class="receipt-meta-key">สำเนา</span><strong class="receipt-meta-value">${copy}/${copies}</strong></div>`:''}
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
          ${items.map(item=>{
            const lineDiscount=itemDiscountAmount(item);
            return `
            <tr class="${lineDiscount>0?'receipt-item-has-discount':''}">
              <td>
                ${esc(item.product_name)}
                <br><small>${esc(item.product_code)}</small>
                ${lineDiscount>0?`<br><small class="receipt-item-discount">ส่วนลด -${money(lineDiscount)}</small>`:''}
              </td>
              <td class="number-cell">${num(item.quantity)}</td>
              <td class="number-cell">${money(itemNetTotal(item))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <div class="receipt-line"></div>

      <section class="receipt-summary">
        <div><span>ยอดก่อนส่วนลด</span><strong>${money(receiptGrossSubtotal())}</strong></div>
        <div class="receipt-discount-total"><span>ส่วนลด</span><strong>-${money(receiptTotalDiscount())}</strong></div>
        <div><span>มูลค่าก่อน VAT</span><strong>${money(beforeVatAmount())}</strong></div>
        <div><span>VAT ${esc(vatRate())}%</span><strong>${money(vatAmount())}</strong></div>
        <div class="receipt-net">
          <span>ยอดสุทธิ (รวม VAT)</span><strong>${money(receiptNetTotal())}</strong>
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
        <p class="receipt-thank">${esc(receiptFooterText())}</p>
        <p>กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน</p>
        <p>สามารถเปลี่ยนหรือคืนสินค้า<br>ตามเงื่อนไขของบริษัท</p>
        <p class="receipt-powered">${esc(window.TKNBranding?.get?.().app_short_name||'เถ้าแก่น้อย ชลบุรี')} · Final v5.31.28-HF11</p>
      </footer>
    `;

    E.receiptArea.appendChild(receipt);
    fitReceiptMetaLayout(receipt);

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
E.paperSize.onchange=async()=>{
  applyReceiptPageStyle();
  if(header) await renderReceipt();
};
E.copies.onchange=async()=>header&&renderReceipt();

// Master 3.4.13: return to POS only after the active print dialog closes.
// This does not change Browser Print, Hardware Client, or cash-drawer logic.
let returnToPosAfterPrint = false;
let printReturnHandled = false;

function returnToPosOnce(){
  if(!returnToPosAfterPrint || printReturnHandled) return;
  printReturnHandled = true;
  returnToPosAfterPrint = false;
  window.location.replace('./pos.html');
}

window.addEventListener('afterprint', returnToPosOnce);

E.printBtn.onclick=async()=>{
  returnToPosAfterPrint=true;
  printReturnHandled=false;
  E.printBtn.disabled=true;
  try{
    applyReceiptPageStyle();
    await renderReceipt();
    await waitForReceiptPrintReady();
    if(window.TKNHardware){
      const result=await window.TKNHardware.printReceipt();
      msg(`เปิดหน้าต่างพิมพ์ผ่าน ${result.transport||'Browser'}`,'ok');
    }else{
      window.print();
    }
  }catch(error){
    console.warn('Hardware print fallback:',error);
    await waitForReceiptPrintReady();
    window.print();
    msg('Hardware ไม่พร้อม จึงใช้ Browser Print','error');
  }finally{
    E.printBtn.disabled=false;
  }
};


// Master 3.4.12: Rongta 80 mm is the stable default.
if (E.paperSize && !E.paperSize.dataset.userSelected) {
  E.paperSize.value = 'receipt-80';
}
applyReceiptPageStyle();
E.paperSize?.addEventListener('change', () => {
  E.paperSize.dataset.userSelected = '1';
});

const params=new URLSearchParams(location.search);
if(params.get('sale_no'))E.saleNo.value=params.get('sale_no');

requireSession().then(session=>{
  if(session&&E.saleNo.value)loadReceipt();
});
