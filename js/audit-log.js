const E={
  entity:document.getElementById('entityFilter'),
  action:document.getElementById('actionFilter'),
  search:document.getElementById('searchInput'),
  from:document.getElementById('dateFrom'),
  to:document.getElementById('dateTo'),
  refresh:document.getElementById('refreshBtn'),
  body:document.getElementById('tableBody'),
  message:document.getElementById('message'),
  dialog:document.getElementById('auditDetailDialog'),
  dialogTitle:document.getElementById('auditDetailTitle'),
  dialogSummary:document.getElementById('auditDetailSummary'),
  dialogFields:document.getElementById('auditDetailFields'),
  rawBlock:document.getElementById('auditRawJson'),
  rawPanel:document.getElementById('auditRawPanel'),
  closeDialog:document.getElementById('auditDetailClose'),
  toggleRaw:document.getElementById('auditToggleRaw'),
  copyDetail:document.getElementById('auditCopyDetail')
};

let rows=[];
let activeDetail=null;

const ACTIONS={
  CREATE:['สร้าง','create'],
  UPDATE:['แก้ไข','update'],
  DELETE:['ลบ','delete'],
  SHIFT_OPEN:['เปิดกะแคชเชียร์','create'],
  SHIFT_CLOSE:['ปิดกะแคชเชียร์','update'],
  CASH_DRAWER_OPEN_SUCCESS:['เปิดลิ้นชักสำเร็จ','create'],
  CASH_DRAWER_OPEN_FAILED:['เปิดลิ้นชักไม่สำเร็จ','delete'],
  CASH_DRAWER_OPEN_DENIED:['ปฏิเสธการเปิดลิ้นชัก','delete'],
  CASH_DRAWER_REOPEN_APPROVED:['อนุมัติเปิดลิ้นชักอีกครั้ง','update'],
  SALE_RETURN:['คืนสินค้า','update'],
  SALE_VOID:['ยกเลิกการขาย','delete']
};

const ENTITIES={
  PRODUCT:'สินค้า',
  STOCK_DOCUMENT:'เอกสารสต๊อก',
  TRANSFER_DOCUMENT:'เอกสารโอนสินค้า',
  STOCK_COUNT:'ตรวจนับสต๊อก',
  SALE:'รายการขาย',
  SALE_RETURN:'รายการคืนสินค้า',
  CASH_DRAWER:'ลิ้นชักเงินสด',
  CASHIER_SHIFT:'กะแคชเชียร์',
  USER:'ผู้ใช้งาน',
  ROLE:'บทบาทและสิทธิ์',
  MEMBER:'สมาชิก',
  PURCHASE_ORDER:'ใบสั่งซื้อ'
};

const KEYS={
  notes:'หมายเหตุ',
  status:'สถานะ',
  document_type:'ประเภทเอกสาร',
  reference_no:'เลขอ้างอิง',
  supplier_name:'ชื่อผู้ขาย',
  requester_name:'ชื่อผู้เบิก',
  department:'แผนก',
  name:'ชื่อสินค้า',
  barcode:'บาร์โค้ด',
  product_code:'รหัสสินค้า',
  quantity:'จำนวน',
  before_quantity:'จำนวนก่อนทำรายการ',
  after_quantity:'จำนวนหลังทำรายการ',
  selling_price:'ราคาขาย',
  unit_price:'ราคาต่อหน่วย',
  net_total:'ยอดสุทธิ',
  return_amount:'ยอดคืนเงิน',
  payment_method:'ช่องทางชำระเงิน',
  payment_channel:'ช่องทางชำระเงิน',
  sale_no:'เลขที่การขาย',
  return_no:'เลขที่คืนสินค้า',
  result:'ผลการทำรายการ',
  reason:'เหตุผล',
  manual_reason:'เหตุผลการเปิดด้วยตนเอง',
  source:'แหล่งที่มา',
  transport:'การเชื่อมต่อ',
  employee_code:'รหัสพนักงาน',
  approver_employee_code:'รหัสผู้อนุมัติ',
  cashier_employee_code:'รหัสแคชเชียร์',
  shift_id:'รหัสกะ',
  expected_cash:'เงินสดที่ควรมี',
  counted_cash:'เงินสดที่นับได้',
  difference:'ผลต่างเงินสด',
  branch_id:'รหัสสาขา',
  user_id:'รหัสผู้ใช้',
  sale_id:'รหัสรายการขาย',
  return_id:'รหัสรายการคืน',
  is_active:'สถานะใช้งาน',
  request_id:'รหัสคำขอ',
  error:'ข้อผิดพลาด',
  message:'ข้อความระบบ'
};

const VALUES={
  POSTED:'บันทึกสำเร็จ',
  SUCCESS:'สำเร็จ',
  FAILED:'ไม่สำเร็จ',
  DENIED:'ถูกปฏิเสธ',
  REQUESTED:'กำลังส่งคำขอ',
  PENDING:'รอดำเนินการ',
  RECEIVE:'รับสินค้าเข้า',
  ISSUE:'เบิก/จ่ายสินค้า',
  RETURN:'คืนสินค้า',
  CASH:'เงินสด',
  QR:'คิวอาร์โค้ด',
  TRANSFER:'เงินโอน',
  CARD:'บัตร',
  STORE_CREDIT:'เครดิตร้านค้า',
  ORIGINAL:'ช่องทางเดิม',
  SERVICE:'Hardware Service',
  MANUAL:'เปิดด้วยตนเอง',
  SALE:'การขาย',
  ACTIVE:'ใช้งาน',
  INACTIVE:'ปิดใช้งาน'
};

function msg(text,cls=''){
  E.message.textContent=text;
  E.message.className='msg '+cls;
}

function esc(value){
  return String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',
    '"':'&quot;',"'":'&#039;'
  }[char]));
}

function normalizeDetails(value){
  if(!value)return {};
  if(typeof value==='object')return value;
  try{return JSON.parse(value)}catch{return {message:String(value)}}
}

function translatedValue(value){
  if(value===true)return 'ใช่';
  if(value===false)return 'ไม่ใช่';
  if(value==null||value==='')return '';
  if(typeof value==='number')return value.toLocaleString('th-TH');
  const text=String(value);
  return VALUES[text.toUpperCase()]||text;
}

function flattenDetails(value,prefix='',result=[],depth=0){
  if(depth>4)return result;
  if(value==null||value==='')return result;

  if(Array.isArray(value)){
    value.forEach((item,index)=>{
      flattenDetails(item,`${prefix} ${index+1}`.trim(),result,depth+1);
    });
    return result;
  }

  if(typeof value==='object'){
    Object.entries(value).forEach(([key,item])=>{
      const label=KEYS[key]||key.replaceAll('_',' ');
      flattenDetails(item,prefix?`${prefix} › ${label}`:label,result,depth+1);
    });
    return result;
  }

  result.push({label:prefix||'รายละเอียด',value:translatedValue(value)});
  return result;
}

function actionInfo(type){
  return ACTIONS[String(type||'').toUpperCase()]||[
    String(type||'-').replaceAll('_',' '),
    ''
  ];
}

function entityLabel(type){
  const key=String(type||'').toUpperCase();
  return ENTITIES[key]||String(type||'-').replaceAll('_',' ');
}

function detailSummary(row){
  const details=normalizeDetails(row.details);
  const action=actionInfo(row.action_type)[0];
  const entity=entityLabel(row.entity_type);
  const item=row.action_label||row.entity_id||'';
  const result=translatedValue(details.result||details.status||'');
  const quantity=details.quantity??details.after_quantity;
  const parts=[`${action} ${entity}`];
  if(item)parts.push(item);
  if(quantity!=null)parts.push(`จำนวน ${translatedValue(quantity)}`);
  if(result)parts.push(result);
  return parts.join(' · ');
}

function detailSearchText(row){
  const fields=flattenDetails(normalizeDetails(row.details));
  return [
    row.action_label,row.action_type,actionInfo(row.action_type)[0],
    row.entity_type,entityLabel(row.entity_type),row.entity_id,
    row.user_name,row.user_email,row.branch_name,detailSummary(row),
    ...fields.flatMap(field=>[field.label,field.value])
  ].join(' ').toLowerCase();
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
  E.refresh.disabled=true;

  let query=supabaseClient
    .from('audit_log_list')
    .select('*')
    .order('created_at',{ascending:false})
    .limit(2000);

  if(E.entity.value)query=query.eq('entity_type',E.entity.value);
  if(E.action.value)query=query.eq('action_type',E.action.value);
  if(E.from.value)query=query.gte('created_at',`${E.from.value}T00:00:00`);
  if(E.to.value)query=query.lte('created_at',`${E.to.value}T23:59:59`);

  const {data,error}=await query;
  E.refresh.disabled=false;

  if(error){
    msg(error.message,'error');
    return;
  }

  rows=data||[];
  render();
}

function render(){
  const query=E.search.value.trim().toLowerCase();
  const filtered=rows.filter(row=>!query||detailSearchText(row).includes(query));

  E.body.innerHTML=filtered.map((row,index)=>{
    const [action,cls]=actionInfo(row.action_type);
    return `
      <tr>
        <td>${new Date(row.created_at).toLocaleString('th-TH')}</td>
        <td>${esc(row.user_name||row.user_email||'-')}</td>
        <td><span class="badge ${esc(cls)}">${esc(action)}</span></td>
        <td>${esc(entityLabel(row.entity_type))}</td>
        <td>${esc(row.action_label||row.entity_id||'-')}</td>
        <td>${esc(row.branch_name||'-')}</td>
        <td class="details">
          <p class="audit-summary">${esc(detailSummary(row))}</p>
          <button class="audit-detail-button" type="button"
            data-row-index="${index}">ดูรายละเอียด</button>
        </td>
      </tr>
    `;
  }).join('')||'<tr><td colspan="7">ไม่พบข้อมูลตามเงื่อนไข</td></tr>';

  E.body.querySelectorAll('.audit-detail-button').forEach(button=>{
    button.addEventListener('click',()=>openDetail(filtered[
      Number(button.dataset.rowIndex)
    ]));
  });

  msg(`พบ ${filtered.length} รายการ จากทั้งหมด ${rows.length} รายการ`);
}

function openDetail(row){
  if(!row)return;
  activeDetail=row;
  const details=normalizeDetails(row.details);
  const fields=flattenDetails(details);

  E.dialogTitle.textContent=actionInfo(row.action_type)[0];
  E.dialogSummary.textContent=detailSummary(row);
  E.dialogFields.innerHTML=`
    <div class="audit-field"><span>วันเวลา</span><strong>${
      new Date(row.created_at).toLocaleString('th-TH')
    }</strong></div>
    <div class="audit-field"><span>ผู้ใช้งาน</span><strong>${
      esc(row.user_name||row.user_email||'-')
    }</strong></div>
    <div class="audit-field"><span>ประเภทข้อมูล</span><strong>${
      esc(entityLabel(row.entity_type))
    }</strong></div>
    <div class="audit-field"><span>รายการ</span><strong>${
      esc(row.action_label||row.entity_id||'-')
    }</strong></div>
    <div class="audit-field"><span>สาขา</span><strong>${
      esc(row.branch_name||'-')
    }</strong></div>
    ${fields.map(field=>`
      <div class="audit-field">
        <span>${esc(field.label)}</span>
        <strong>${esc(field.value)}</strong>
      </div>
    `).join('')||'<p class="audit-empty">ไม่มีรายละเอียดเพิ่มเติม</p>'}
  `;
  E.rawBlock.textContent=JSON.stringify(details,null,2);
  E.rawPanel.hidden=true;
  E.toggleRaw.textContent='ดูข้อมูลต้นฉบับ';
  E.dialog.showModal();
}

function detailClipboardText(){
  if(!activeDetail)return '';
  const fields=flattenDetails(normalizeDetails(activeDetail.details));
  return [
    detailSummary(activeDetail),
    `วันเวลา: ${new Date(activeDetail.created_at).toLocaleString('th-TH')}`,
    `ผู้ใช้งาน: ${activeDetail.user_name||activeDetail.user_email||'-'}`,
    `สาขา: ${activeDetail.branch_name||'-'}`,
    ...fields.map(field=>`${field.label}: ${field.value}`)
  ].join('\n');
}

E.refresh.onclick=loadLogs;
E.entity.onchange=loadLogs;
E.action.onchange=loadLogs;
E.search.oninput=render;
E.closeDialog.onclick=()=>E.dialog.close();
E.dialog.addEventListener('click',event=>{
  if(event.target===E.dialog)E.dialog.close();
});
E.toggleRaw.onclick=()=>{
  E.rawPanel.hidden=!E.rawPanel.hidden;
  E.toggleRaw.textContent=E.rawPanel.hidden
    ?'ดูข้อมูลต้นฉบับ'
    :'ซ่อนข้อมูลต้นฉบับ';
};
E.copyDetail.onclick=async()=>{
  try{
    await navigator.clipboard.writeText(detailClipboardText());
    E.copyDetail.textContent='คัดลอกแล้ว';
    setTimeout(()=>{E.copyDetail.textContent='คัดลอกรายละเอียด'},1200);
  }catch{
    E.copyDetail.textContent='คัดลอกไม่สำเร็จ';
  }
};

requireSession().then(session=>{
  if(session)loadLogs();
});
