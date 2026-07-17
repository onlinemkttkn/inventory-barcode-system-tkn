const E={
  branch:document.getElementById('branch'),
  status:document.getElementById('status'),
  search:document.getElementById('search'),
  refresh:document.getElementById('refresh'),
  body:document.getElementById('body'),
  message:document.getElementById('message')
};

let rows=[];

function msg(t,c=''){
  E.message.textContent=t;
  E.message.className='msg '+c;
}

function esc(v){
  return String(v??'').replace(/[&<>"']/g,x=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',
    '"':'&quot;',"'":'&#039;'
  }[x]));
}

function money(v){
  return new Intl.NumberFormat('th-TH',{
    style:'currency',
    currency:'THB'
  }).format(Number(v||0));
}

async function init(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){
    location.href='./dashboard.html';
    return;
  }

  const {data}=await supabaseClient
    .from('branches')
    .select('id,code,name')
    .eq('is_active',true)
    .order('sort_order');

  E.branch.innerHTML='<option value="">ทุกสาขา</option>'+
    (data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');

  load();
}

async function load(){
  msg('กำลังโหลด...');

  let query=supabaseClient
    .from('sale_list')
    .select('*')
    .order('created_at',{ascending:false})
    .limit(1000);

  if(E.branch.value)query=query.eq('branch_id',E.branch.value);
  if(E.status.value)query=query.eq('status',E.status.value);

  const {data,error}=await query;

  if(error){
    msg(error.message,'error');
    return;
  }

  rows=data||[];
  render();
  msg(`พบ ${rows.length} รายการ`);
}

function render(){
  const q=E.search.value.trim().toLowerCase();

  E.body.innerHTML='';

  rows.filter(x=>{
    const text=[
      x.sale_no,x.customer_name,x.customer_phone,
      x.created_by_name,x.created_by_email,x.branch_name
    ].join(' ').toLowerCase();

    return !q||text.includes(q);
  }).forEach(x=>{
    const completed=x.status==='COMPLETED';

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${new Date(x.created_at).toLocaleString('th-TH')}</td>
      <td>${esc(x.sale_no)}</td>
      <td>${esc(x.branch_name)}</td>
      <td><span class="badge ${completed?'done':'void'}">${completed?'สำเร็จ':'ยกเลิก'}</span></td>
      <td>${x.total_lines}</td>
      <td>${x.total_quantity}</td>
      <td>${money(x.net_total)}</td>
      <td>${esc(x.payment_method)}</td>
      <td>${esc(x.created_by_name||x.created_by_email||'-')}</td>
      <td><a class="btn secondary" href="./receipt.html?sale_no=${encodeURIComponent(x.sale_no)}">พิมพ์</a></td>
    `;
    E.body.appendChild(tr);
  });
}

E.refresh.onclick=load;
E.branch.onchange=load;
E.status.onchange=load;
E.search.oninput=render;

init();
