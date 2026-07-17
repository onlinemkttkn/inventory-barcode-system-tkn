const E={
  entity:document.getElementById('entityFilter'),
  action:document.getElementById('actionFilter'),
  search:document.getElementById('searchInput'),
  from:document.getElementById('dateFrom'),
  to:document.getElementById('dateTo'),
  refresh:document.getElementById('refreshBtn'),
  body:document.getElementById('tableBody'),
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

async function requireSession(){
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){
    location.href='./dashboard.html';
    return null;
  }
  return session;
}

async function loadLogs(){
  msg('กำลังโหลดข้อมูล...');

  let query=supabaseClient
    .from('audit_log_list')
    .select('*')
    .order('created_at',{ascending:false})
    .limit(2000);

  if(E.entity.value){
    query=query.eq('entity_type',E.entity.value);
  }

  if(E.action.value){
    query=query.eq('action_type',E.action.value);
  }

  if(E.from.value){
    query=query.gte('created_at',`${E.from.value}T00:00:00`);
  }

  if(E.to.value){
    query=query.lte('created_at',`${E.to.value}T23:59:59`);
  }

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

  const filtered=rows.filter(x=>{
    const text=[
      x.action_label,
      x.entity_type,
      x.user_name,
      x.user_email,
      x.branch_name,
      JSON.stringify(x.details)
    ].join(' ').toLowerCase();

    return !q||text.includes(q);
  });

  E.body.innerHTML='';

  filtered.forEach(x=>{
    const actionMap={
      CREATE:['สร้าง','create'],
      UPDATE:['แก้ไข','update'],
      DELETE:['ลบ','delete']
    };

    const [label,cls]=actionMap[x.action_type]||[x.action_type,''];

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${new Date(x.created_at).toLocaleString('th-TH')}</td>
      <td>${esc(x.user_name||x.user_email||'-')}</td>
      <td><span class="badge ${cls}">${esc(label)}</span></td>
      <td>${esc(x.entity_type)}</td>
      <td>${esc(x.action_label||x.entity_id||'-')}</td>
      <td>${esc(x.branch_name||'-')}</td>
      <td class="details">${esc(JSON.stringify(x.details||{}))}</td>
    `;
    E.body.appendChild(tr);
  });
}

E.refresh.onclick=loadLogs;
E.entity.onchange=loadLogs;
E.action.onchange=loadLogs;
E.search.oninput=render;

requireSession().then(s=>{
  if(s)loadLogs();
});
