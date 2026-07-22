import {
 loadAccessContext,guardPage,hasPermission
} from './access-control.js';

const E={
 period:document.getElementById('period'),anchor:document.getElementById('anchor'),
 load:document.getElementById('load'),csv:document.getElementById('csv'),
 print:document.getElementById('print'),stats:document.getElementById('stats'),
 rows:document.getElementById('rows'),message:document.getElementById('message'),
 dialog:document.getElementById('dialog'),title:document.getElementById('dialogTitle'),
 content:document.getElementById('dialogContent'),close:document.getElementById('close')
};
let state={bills:[],items:[],context:null};
const money=v=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0));
const dt=v=>new Date(v).toLocaleString('th-TH');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
})[c]);

async function init(){
 state.context=await loadAccessContext(supabaseClient);
 if(!guardPage(state.context,'reports.view')) return;
 E.csv.hidden=!hasPermission(state.context,'reports.export');
 E.anchor.value=new Date().toISOString().slice(0,10);
 await load();
}
async function load(){
 E.message.textContent='กำลังโหลดรายงาน...';
 const {data,error}=await supabaseClient.rpc('get_sales_control_dashboard_v2_1',{
  p_period:E.period.value,p_anchor_date:E.anchor.value,
  p_branch_id:state.context.branch_id||null,p_limit:500
 });
 if(error){E.message.textContent=error.message;return;}
 state.bills=data?.bills||[];state.items=data?.items||[];
 const s=data?.summary||{},v=data?.voids||{},r=data?.returns||{};
 const cards=[
  ['จำนวนบิล',Number(s.bill_count||0).toLocaleString('th-TH')],
  ['รายรับรวม',money(s.gross_revenue)],['เงินสด',money(s.cash_revenue)],
  ['QR / โอน',money(s.qr_transfer_revenue)],['บัตร',money(s.card_revenue)],
  ['เฉลี่ยต่อบิล',money(s.average_bill)],['บิลยกเลิก',v.void_count||0],
  ['ยอดคืนสินค้า',money(r.return_amount)]
 ];
 E.stats.innerHTML=cards.map(x=>`<article class="stat"><span>${x[0]}</span><strong>${x[1]}</strong></article>`).join('');
 E.rows.innerHTML=state.bills.map(b=>`<tr><td>${dt(b.created_at)}</td>
  <td><strong>${esc(b.sale_no)}</strong></td><td>${esc(b.payment_method)}</td>
  <td>${money(b.net_total)}</td><td>${esc(b.status)}</td>
  <td><button class="button secondary detail" data-id="${b.id}">รายละเอียด</button></td></tr>`).join('')
  ||'<tr><td colspan="6">ไม่พบข้อมูล</td></tr>';
 E.rows.querySelectorAll('.detail').forEach(btn=>btn.onclick=()=>openBill(btn.dataset.id));
 E.message.textContent='อัปเดตข้อมูลแล้ว';
}
function openBill(id){
 const b=state.bills.find(x=>x.id===id);
 const items=state.items.filter(x=>x.sale_id===id);
 E.title.textContent=`${b.sale_no} · ${money(b.net_total)}`;
 E.content.innerHTML=`<div class="bill-meta"><p><b>วันที่</b><br>${dt(b.created_at)}</p>
  <p><b>ชำระ</b><br>${esc(b.payment_method)}</p><p><b>สถานะ</b><br>${esc(b.status)}</p>
  <p><b>ลูกค้า</b><br>${esc(b.customer_name||'Walk-in')}</p></div>
  <div class="table-wrap"><table><thead><tr><th>รหัส</th><th>สินค้า</th>
  <th>ขาย</th><th>คืนแล้ว</th><th>ราคา</th><th>รวม</th></tr></thead><tbody>
  ${items.map(i=>`<tr><td>${esc(i.product_code)}</td><td>${esc(i.product_name)}</td>
  <td>${i.sold_quantity}</td><td>${i.returned_quantity}</td>
  <td>${money(i.unit_price)}</td><td>${money(i.line_amount)}</td></tr>`).join('')
  ||'<tr><td colspan="6">ไม่พบสินค้า</td></tr>'}</tbody></table></div>`;
 E.dialog.showModal();
}
function exportCsv(){
 const rows=[['วันที่','เลขบิล','ชำระ','ยอดสุทธิ','สถานะ'],
  ...state.bills.map(b=>[dt(b.created_at),b.sale_no,b.payment_method,b.net_total,b.status])];
 const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
 a.download=`sales-${E.period.value.toLowerCase()}-${E.anchor.value}.csv`;a.click();
 URL.revokeObjectURL(a.href);
}
E.load.onclick=load;E.period.onchange=load;E.anchor.onchange=load;
E.csv.onclick=exportCsv;E.print.onclick=()=>print();E.close.onclick=()=>E.dialog.close();
init().catch(e=>E.message.textContent=e.message);
