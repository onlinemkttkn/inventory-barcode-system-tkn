(() => {
  'use strict';
  const VERSION='5.31.28-HF1';
  const $=(id)=>document.getElementById(id);
  const money=(value)=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',minimumFractionDigits:2}).format(Number(value)||0);
  const number=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lastShiftReceipt=null;

  function tick(){
    const now=new Date();
    if($('posLiveDate')) $('posLiveDate').textContent=now.toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'numeric'});
    if($('posLiveTime')) $('posLiveTime').textContent=now.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }

  function syncMeta(){
    const cashier=($('cashierStatus')?.textContent||'').trim();
    const branch=$('branch');
    const branchLabel=branch?.selectedOptions?.[0]?.textContent?.trim()||'ยังไม่เลือกสาขา';
    const noShift=document.body.classList.contains('pos-no-shift');
    if($('posTerminalBranch')) $('posTerminalBranch').textContent=branchLabel;
    if(noShift){
      if($('posTerminalSeller')) $('posTerminalSeller').textContent='รอพนักงาน';
      if($('posTerminalShift')) $('posTerminalShift').textContent='ยังไม่เปิดกะ';
      if($('posTerminalStatus')) $('posTerminalStatus').textContent='รอเปิดกะ';
      return;
    }
    if($('posTerminalSeller')){
      const seller=cashier.includes('·')?cashier.split('·').slice(0,2).join(' · ').trim():cashier;
      $('posTerminalSeller').textContent=seller||'พนักงานแคชเชียร์';
    }
    if($('posTerminalShift')) $('posTerminalShift').textContent=cashier.includes('เปิดกะ')?cashier.split('·').slice(-1)[0].trim():'เปิดกะแล้ว';
    if($('posTerminalStatus')) $('posTerminalStatus').textContent='พร้อมขาย';
  }

  function parseCurrencyText(text){
    return number(String(text||'').replace(/[^0-9.\-]/g,''),0);
  }

  function installMainQuickCash(){
    const wrap=$('posMainQuickCash');
    if(!wrap)return;
    wrap.querySelectorAll('button[data-cash]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const checkout=$('checkout');
        if(!checkout||checkout.disabled){ checkout?.click(); return; }
        checkout.click();
        queueMicrotask(()=>{
          const dialog=$('paymentDialog');
          if(!dialog?.open)return;
          const payment=$('payment');
          if(payment){payment.value='CASH';payment.dispatchEvent(new Event('change',{bubbles:true}));}
          const input=$('paymentDialogReceived');
          if(!input)return;
          const cash=btn.dataset.cash==='exact'?parseCurrencyText($('netTotal')?.textContent):number(btn.dataset.cash);
          input.value=String(cash);
          input.dispatchEvent(new Event('input',{bubbles:true}));
        });
      });
    });
  }

  async function loadSalesSummary(detail){
    const client=window.supabaseClient||window.tknSupabaseClient;
    const branchId=detail?.branch_id;
    const openedAt=detail?.shift?.opened_at;
    const closedAt=detail?.closed_at;
    if(!client?.from||!branchId||!openedAt||!closedAt)return null;
    try{
      const {data,error}=await client.from('sales')
        .select('id,net_total,payment_method,status,created_at')
        .eq('branch_id',branchId)
        .gte('created_at',openedAt)
        .lte('created_at',closedAt)
        .order('created_at',{ascending:true});
      if(error)throw error;
      const rows=(data||[]).filter((row)=>String(row.status||'').toUpperCase()!=='VOIDED');
      const totals={CASH:0,QR:0,TRANSFER:0,CARD:0,OTHER:0};
      let total=0;
      rows.forEach((row)=>{
        const amount=number(row.net_total);
        const method=String(row.payment_method||'OTHER').toUpperCase();
        totals[Object.prototype.hasOwnProperty.call(totals,method)?method:'OTHER']+=amount;
        total+=amount;
      });
      return {bill_count:rows.length,total,totals};
    }catch(error){
      console.warn('Shift receipt sales summary unavailable:',error);
      return null;
    }
  }

  function branding(){
    return window.TKNBranding?.get?.()||{
      company_name:'เถ้าแก่น้อย ชลบุรี',
      company_legal_name:'', tax_id:'', phone:'', address:'',
      receipt_footer:'ขอบคุณที่ใช้บริการ'
    };
  }

  function receiptMarkup(detail,summary){
    const b=branding();
    const s=detail.shift||{};
    const r=detail.result||{};
    const opening=number(s.opening_float);
    const expected=number(r.expected_cash);
    const counted=number(r.closing_cash_count,detail.closing_cash_count);
    const diff=number(r.difference,counted-expected);
    const opened=s.opened_at?new Date(s.opened_at).toLocaleString('th-TH'):'-';
    const closed=detail.closed_at?new Date(detail.closed_at).toLocaleString('th-TH'):'-';
    const payment=summary?`<section class="shift-receipt-section"><h3>ยอดขายระหว่างกะ</h3>
      <div><span>จำนวนบิล</span><b>${summary.bill_count.toLocaleString('th-TH')}</b></div>
      <div><span>ยอดขายรวม</span><b>${money(summary.total)}</b></div>
      <div><span>เงินสด</span><b>${money(summary.totals.CASH)}</b></div>
      <div><span>QR</span><b>${money(summary.totals.QR)}</b></div>
      <div><span>โอนเงิน</span><b>${money(summary.totals.TRANSFER)}</b></div>
      <div><span>บัตร</span><b>${money(summary.totals.CARD)}</b></div></section>`:'';
    return `<div class="shift-receipt-brand"><strong>${esc(b.company_name)}</strong>${b.company_legal_name?`<small>${esc(b.company_legal_name)}</small>`:''}${b.address?`<small>${esc(b.address)}</small>`:''}${b.tax_id?`<small>เลขผู้เสียภาษี ${esc(b.tax_id)}</small>`:''}</div>
      <h3 class="shift-receipt-title">ใบสรุปปิดกะ</h3>
      <section class="shift-receipt-section">
        <div><span>สาขา</span><b>${esc(detail.branch_label||'-')}</b></div>
        <div><span>พนักงาน</span><b>${esc(s.display_name||s.employee_code||'-')}</b></div>
        <div><span>รหัสพนักงาน</span><b>${esc(s.employee_code||'-')}</b></div>
        <div><span>เปิดกะ</span><b>${esc(opened)}</b></div>
        <div><span>ปิดกะ</span><b>${esc(closed)}</b></div>
      </section>${payment}
      <section class="shift-receipt-section money-block">
        <div><span>เงินทอนตั้งต้น</span><b>${money(opening)}</b></div>
        <div><span>เงินสดที่ควรมี</span><b>${money(expected)}</b></div>
        <div><span>เงินสดที่นับได้</span><b>${money(counted)}</b></div>
        <div class="difference ${diff===0?'zero':diff>0?'positive':'negative'}"><span>ผลต่าง</span><b>${money(diff)}</b></div>
      </section>
      ${detail.closing_notes?`<section class="shift-receipt-notes"><span>หมายเหตุ</span><p>${esc(detail.closing_notes)}</p></section>`:''}
      <footer>${esc(b.receipt_footer||'')}</footer>`;
  }

  async function showShiftCloseReceipt(detail){
    const dialog=$('shiftCloseReceiptDialog');
    const body=$('shiftCloseReceiptBody');
    if(!dialog||!body)return;
    body.innerHTML='<div class="shift-receipt-loading">กำลังสร้างใบสรุปปิดกะ...</div>';
    if(!dialog.open)dialog.showModal();
    const summary=await loadSalesSummary(detail);
    lastShiftReceipt={detail,summary,html:receiptMarkup(detail,summary)};
    body.innerHTML=lastShiftReceipt.html;
  }

  function printShiftCloseReceipt(){
    if(!lastShiftReceipt)return;
    const b=branding();
    const frame=document.createElement('iframe');
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    const doc=frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบสรุปปิดกะ</title><style>
      @page{size:80mm auto;margin:4mm}*{box-sizing:border-box}body{font-family:Arial,"Tahoma",sans-serif;color:#111;font-size:12px;margin:0}.receipt{width:72mm;margin:auto}.shift-receipt-brand{text-align:center;display:grid;gap:2px}.shift-receipt-brand strong{font-size:16px}.shift-receipt-brand small{font-size:10px}.shift-receipt-title{text-align:center;border-top:1px dashed #555;border-bottom:1px dashed #555;padding:7px 0;margin:8px 0}.shift-receipt-section{display:grid;gap:4px;padding:6px 0;border-bottom:1px dashed #888}.shift-receipt-section div{display:flex;justify-content:space-between;gap:10px}.shift-receipt-section b{text-align:right}.money-block .difference{font-size:14px}.shift-receipt-notes{padding:6px 0;border-bottom:1px dashed #888}.shift-receipt-notes p{margin:3px 0;white-space:pre-wrap}footer{text-align:center;padding-top:8px;font-size:10px}</style></head><body><div class="receipt">${lastShiftReceipt.html}</div></body></html>`);
    doc.close();
    frame.onload=()=>setTimeout(()=>{frame.contentWindow.focus();frame.contentWindow.print();setTimeout(()=>frame.remove(),1500)},80);
  }

  function closeReceipt(){ $('shiftCloseReceiptDialog')?.close(); }

  function init(){
    tick();setInterval(tick,1000);syncMeta();
    const observer=new MutationObserver(syncMeta);
    if($('cashierStatus'))observer.observe($('cashierStatus'),{childList:true,subtree:true,characterData:true});
    $('branch')?.addEventListener('change',syncMeta);
    installMainQuickCash();
    $('shiftCloseReceiptPrint')?.addEventListener('click',printShiftCloseReceipt);
    $('shiftCloseReceiptClose')?.addEventListener('click',closeReceipt);
    $('shiftCloseReceiptX')?.addEventListener('click',closeReceipt);
    window.addEventListener('tkn:shift-closed',(event)=>showShiftCloseReceipt(event.detail||{}));
    window.addEventListener('tkn:branding-ready',()=>{ if(lastShiftReceipt){lastShiftReceipt.html=receiptMarkup(lastShiftReceipt.detail,lastShiftReceipt.summary);if($('shiftCloseReceiptBody'))$('shiftCloseReceiptBody').innerHTML=lastShiftReceipt.html;} });
  }

  window.TKNPOSClassic=Object.freeze({version:VERSION,showShiftCloseReceipt,printShiftCloseReceipt,syncMeta});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
