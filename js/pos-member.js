'use strict';

const E={
  saleNo:document.getElementById('saleNo'),
  phone:document.getElementById('phone'),
  redeem:document.getElementById('redeem'),
  apply:document.getElementById('applyBtn'),
  message:document.getElementById('message'),
  scopeText:document.getElementById('scopeText')
};
const state={access:null,permissions:new Set()};

function msg(text,cls=''){E.message.textContent=text;E.message.className=`msg ${cls}`.trim();}
function has(permission){return state.permissions.has(permission);}

E.apply?.addEventListener('click',async()=>{
  const saleNo=E.saleNo.value.trim();
  const phone=E.phone.value.replace(/\D/g,'');
  if(!saleNo||!phone)return msg('กรุณากรอกเลขบิลและเบอร์โทร','error');
  if(!has('member.apply'))return msg('บัญชีนี้ไม่มีสิทธิ์ผูกสมาชิกกับบิล','error');

  E.apply.disabled=true;
  msg('กำลังผูกสมาชิกและคำนวณคะแนน...');
  try{
    const {data,error}=await supabaseClient.rpc('apply_member_to_sale_by_lookup',{
      p_sale_no:saleNo,
      p_phone:phone,
      p_points_to_redeem:0
    });
    if(error)throw error;

    msg(`สำเร็จ ${data.member_no} ${data.member_name} • ได้ ${Number(data.points_earned||0)} คะแนน • คะแนนคงเหลือ ${Number(data.points_balance||0)}`,'ok');
    E.saleNo.value='';
    E.phone.value='';
  }catch(error){
    msg(error?.message||'ผูกสมาชิกไม่สำเร็จ','error');
  }finally{
    E.apply.disabled=false;
  }
});

async function init(){
  try{
    const access=await window.TKNAuthGuard.requireAccess('member.apply',{
      loadingText:'กำลังตรวจสอบสิทธิ์ผูกสมาชิกกับบิล...'
    });
    if(!access)return;
    state.access=access;
    state.permissions=new Set(Array.isArray(access.permissions)?access.permissions:[]);
    E.scopeText.textContent=has('member.all_branches')
      ? 'ขอบเขตการทำรายการ: ทุกสาขา'
      : 'ขอบเขตการทำรายการ: เฉพาะสาขาประจำของบัญชี';
    window.TKNAuthGuard.ready();
  }catch(error){
    if(error?.code==='INVENTORY_PERMISSION_DENIED')return;
    window.TKNAuthGuard.fail(error,init);
  }
}

init();
