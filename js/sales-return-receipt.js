const E={receipt:document.getElementById('receipt'),printBtn:document.getElementById('printBtn'),message:document.getElementById('message')};
function msg(t,c=''){E.message.textContent=t;E.message.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}
async function load(){
  const returnNo=new URLSearchParams(location.search).get('return_no');
  if(!returnNo)return msg('ไม่พบเลขใบคืน','error');

  const{data:h,error:hErr}=await supabaseClient.from('sales_return_list').select('*').eq('return_no',returnNo).maybeSingle();
  if(hErr)return msg(hErr.message,'error');
  if(!h)return msg('ไม่พบใบคืนสินค้า','error');

  const{data:items,error:iErr}=await supabaseClient.from('sales_return_item_list').select('*').eq('return_id',h.id).order('product_name');
  if(iErr)return msg(iErr.message,'error');

  E.receipt.innerHTML=`
    <div class="receipt-center">
      <h2>ร้านเถ้าแก่น้อยชลบุรี</h2>
      <p>${esc(h.branch_name)}</p>
      <h3>ใบคืนสินค้า</h3>
    </div>
    <div class="receipt-line"></div>
    <p>เลขใบคืน: ${esc(h.return_no)}</p>
    <p>เลขบิลขาย: ${esc(h.sale_no)}</p>
    <p>วันที่: ${new Date(h.created_at).toLocaleString('th-TH')}</p>
    ${h.member_no?`<p>สมาชิก: ${esc(h.member_no)} ${esc(h.member_name||'')}</p>`:''}
    <p>เหตุผล: ${esc(h.reason)}</p>
    <div class="receipt-line"></div>
    <table class="receipt-table">
      <thead><tr><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">คืนเงิน</th></tr></thead>
      <tbody>${(items||[]).map(x=>`
        <tr>
          <td>${esc(x.product_name)}<br><small>${esc(x.product_code)}</small></td>
          <td style="text-align:right">${x.quantity}</td>
          <td style="text-align:right">${money(x.refund_amount)}</td>
        </tr>`).join('')}</tbody>
    </table>
    <div class="receipt-line"></div>
    <div class="receipt-summary">
      <div><span>ยอดคืนเงิน</span><strong>${money(h.refund_amount)}</strong></div>
      <div><span>คะแนนที่ปรับคืน</span><strong>${h.points_reversed}</strong></div>
      <div><span>วิธีคืนเงิน</span><strong>${esc(h.refund_method)}</strong></div>
    </div>
    <div class="receipt-line"></div>
    <p class="receipt-center">ขอบคุณที่ใช้บริการ</p>`;
}
E.printBtn.onclick=()=>window.print();
(async()=>{const{data:{session}}=await supabaseClient.auth.getSession();if(!session){location.href='./dashboard.html';return}load()})();
