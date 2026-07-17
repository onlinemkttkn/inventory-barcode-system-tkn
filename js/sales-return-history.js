const E={search:document.getElementById('search'),refreshBtn:document.getElementById('refreshBtn'),body:document.getElementById('body'),message:document.getElementById('message')};
let rows=[];
function msg(t,c=''){E.message.textContent=t;E.message.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
function money(v){return new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0))}
async function load(){
  const{data,error}=await supabaseClient.from('sales_return_list').select('*').order('created_at',{ascending:false}).limit(1000);
  if(error)return msg(error.message,'error');
  rows=data||[];
  render();
  msg(`พบ ${rows.length} รายการ`);
}
function render(){
  const q=E.search.value.trim().toLowerCase();
  E.body.innerHTML='';
  rows.filter(x=>!q||[x.return_no,x.sale_no,x.branch_name,x.member_no,x.member_name,x.reason].join(' ').toLowerCase().includes(q)).forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${new Date(x.created_at).toLocaleString('th-TH')}</td>
      <td>${esc(x.return_no)}</td>
      <td>${esc(x.sale_no)}</td>
      <td>${esc(x.branch_name)}</td>
      <td>${x.total_quantity}</td>
      <td>${money(x.refund_amount)}</td>
      <td>${x.points_reversed}</td>
      <td>${esc(x.reason)}</td>
      <td><a class="btn secondary" href="./sales-return-receipt.html?return_no=${encodeURIComponent(x.return_no)}">พิมพ์</a></td>`;
    E.body.appendChild(tr);
  });
}
E.refreshBtn.onclick=load;E.search.oninput=render;
(async()=>{const{data:{session}}=await supabaseClient.auth.getSession();if(!session){location.href='./dashboard.html';return}load()})();
