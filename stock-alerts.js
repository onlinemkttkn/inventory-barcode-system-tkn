const E={
  branch:document.getElementById('branchFilter'),
  inactiveDays:document.getElementById('inactiveDays'),
  refresh:document.getElementById('refreshBtn'),
  outCount:document.getElementById('outCount'),
  lowCount:document.getElementById('lowCount'),
  inactiveCount:document.getElementById('inactiveCount'),
  reorderCost:document.getElementById('reorderCost'),
  head:document.getElementById('tableHead'),
  body:document.getElementById('tableBody'),
  message:document.getElementById('message')
};

let currentTab='alerts';
let alertRows=[];
let inactiveRows=[];
let branchRows=[];

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

function num(v){
  return Number(v||0).toLocaleString('th-TH',{
    maximumFractionDigits:3
  });
}

function money(v){
  return new Intl.NumberFormat('th-TH',{
    style:'currency',
    currency:'THB',
    minimumFractionDigits:2
  }).format(Number(v||0));
}

async function requireSession(){
  const {data:{session}}=await supabaseClient.auth.getSession();

  if(!session){
    location.href='./dashboard.html';
    return null;
  }

  return session;
}

async function loadBranches(){
  const {data,error}=await supabaseClient
    .from('branches')
    .select('id,code,name')
    .eq('is_active',true)
    .order('sort_order');

  if(error)throw error;

  E.branch.innerHTML=
    '<option value="">ทุกสาขา</option>'+
    (data||[]).map(x=>
      `<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`
    ).join('');
}

async function loadAll(){
  msg('กำลังโหลดข้อมูล...');

  const branchId=E.branch.value||null;
  const days=Number(E.inactiveDays.value||90);

  const summaryPromise=supabaseClient.rpc(
    'get_stock_alert_summary',
    {
      p_branch_id:branchId,
      p_inactive_days:days
    }
  );

  let alertsQuery=supabaseClient
    .from('stock_alert_list')
    .select('*')
    .order('alert_type')
    .order('quantity',{ascending:true});

  if(branchId){
    alertsQuery=alertsQuery.eq('branch_id',branchId);
  }

  let inactiveQuery=supabaseClient
    .from('inactive_stock_list')
    .select('*')
    .gte('inactive_days',days)
    .order('inactive_days',{ascending:false});

  if(branchId){
    inactiveQuery=inactiveQuery.eq('branch_id',branchId);
  }

  let branchesQuery=supabaseClient
    .from('executive_stock_dashboard')
    .select('*')
    .order('branch_name');

  if(branchId){
    branchesQuery=branchesQuery.eq('branch_id',branchId);
  }

  const [summary,alerts,inactive,branches]=await Promise.all([
    summaryPromise,
    alertsQuery,
    inactiveQuery,
    branchesQuery
  ]);

  const error=[
    summary.error,
    alerts.error,
    inactive.error,
    branches.error
  ].find(Boolean);

  if(error){
    console.error(error);
    msg(error.message,'error');
    return;
  }

  const s=summary.data||{};

  E.outCount.textContent=num(s.out_of_stock);
  E.lowCount.textContent=num(s.low_stock);
  E.inactiveCount.textContent=num(s.inactive_stock);
  E.reorderCost.textContent=money(s.estimated_reorder_cost);

  alertRows=alerts.data||[];
  inactiveRows=inactive.data||[];
  branchRows=branches.data||[];

  render();
  msg('อัปเดตข้อมูลแล้ว');
}

function render(){
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.tab===currentTab);
  });

  if(currentTab==='alerts'){
    renderAlerts();
  }else if(currentTab==='inactive'){
    renderInactive();
  }else{
    renderBranches();
  }
}

function renderAlerts(){
  E.head.innerHTML=`
    <tr>
      <th>สถานะ</th>
      <th>สาขา</th>
      <th>รหัส</th>
      <th>สินค้า</th>
      <th>คงเหลือ</th>
      <th>ขั้นต่ำ</th>
      <th>แนะนำสั่งเพิ่ม</th>
      <th>งบประมาณ</th>
    </tr>`;

  E.body.innerHTML='';

  alertRows.forEach(x=>{
    const isOut=x.alert_type==='OUT_OF_STOCK';

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>
        <span class="badge ${isOut?'out':'low'}">
          ${isOut?'สินค้าหมด':'ใกล้หมด'}
        </span>
      </td>
      <td>${esc(x.branch_name)}</td>
      <td>${esc(x.product_code)}</td>
      <td>${esc(x.product_name)}</td>
      <td>${num(x.quantity)} ${esc(x.unit_name||'')}</td>
      <td>${num(x.minimum_stock)}</td>
      <td>${num(x.suggested_reorder_quantity)}</td>
      <td>${money(x.estimated_reorder_cost)}</td>
    `;
    E.body.appendChild(tr);
  });
}

function renderInactive(){
  E.head.innerHTML=`
    <tr>
      <th>สาขา</th>
      <th>รหัส</th>
      <th>สินค้า</th>
      <th>คงเหลือ</th>
      <th>ไม่เคลื่อนไหว</th>
      <th>มูลค่าทุน</th>
      <th>เคลื่อนไหวล่าสุด</th>
    </tr>`;

  E.body.innerHTML='';

  inactiveRows.forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${esc(x.branch_name)}</td>
      <td>${esc(x.product_code)}</td>
      <td>${esc(x.product_name)}</td>
      <td>${num(x.quantity)} ${esc(x.unit_name||'')}</td>
      <td><span class="badge inactive">${num(x.inactive_days)} วัน</span></td>
      <td>${money(x.stock_cost_value)}</td>
      <td>${x.last_movement_at
        ?new Date(x.last_movement_at).toLocaleString('th-TH')
        :'-'}</td>
    `;
    E.body.appendChild(tr);
  });
}

function renderBranches(){
  E.head.innerHTML=`
    <tr>
      <th>สาขา</th>
      <th>จำนวนสินค้า</th>
      <th>สินค้าหมด</th>
      <th>ใกล้หมด</th>
      <th>จำนวนคงเหลือรวม</th>
      <th>มูลค่าทุน</th>
      <th>มูลค่าขาย</th>
    </tr>`;

  E.body.innerHTML='';

  branchRows.forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${esc(x.branch_code)} — ${esc(x.branch_name)}</td>
      <td>${num(x.total_products)}</td>
      <td>${num(x.out_of_stock_count)}</td>
      <td>${num(x.low_stock_count)}</td>
      <td>${num(x.total_quantity)}</td>
      <td>${money(x.total_cost_value)}</td>
      <td>${money(x.total_sale_value)}</td>
    `;
    E.body.appendChild(tr);
  });
}

document.querySelectorAll('.tab').forEach(btn=>{
  btn.onclick=()=>{
    currentTab=btn.dataset.tab;
    render();
  };
});

E.refresh.onclick=loadAll;
E.branch.onchange=loadAll;
E.inactiveDays.onchange=loadAll;

requireSession().then(async session=>{
  if(!session)return;

  try{
    await loadBranches();
    await loadAll();
  }catch(error){
    console.error(error);
    msg(error.message,'error');
  }
});
