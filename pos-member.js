const E={saleNo:document.getElementById('saleNo'),phone:document.getElementById('phone'),redeem:document.getElementById('redeem'),apply:document.getElementById('applyBtn'),message:document.getElementById('message')};
function msg(t,c=''){E.message.textContent=t;E.message.className='msg '+c}
E.apply.onclick=async()=>{
  const saleNo=E.saleNo.value.trim();
  const phone=E.phone.value.replace(/\D/g,'');
  if(!saleNo||!phone)return msg('กรุณากรอกเลขบิลและเบอร์โทร','error');

  const [{data:sale,error:saleErr},{data:member,error:memberErr}]=await Promise.all([
    supabaseClient.from('sales').select('id,sale_no,member_id').eq('sale_no',saleNo).maybeSingle(),
    supabaseClient.from('members').select('id,member_no,full_name,points_balance').eq('phone',phone).eq('is_active',true).maybeSingle()
  ]);

  if(saleErr)return msg(saleErr.message,'error');
  if(memberErr)return msg(memberErr.message,'error');
  if(!sale)return msg('ไม่พบบิลขาย','error');
  if(!member)return msg('ไม่พบสมาชิก','error');

  const {data,error}=await supabaseClient.rpc('apply_member_to_sale',{
    p_sale_id:sale.id,
    p_member_id:member.id,
    p_points_to_redeem:Number(E.redeem.value)||0
  });

  if(error)return msg(error.message,'error');

  msg(`สำเร็จ ${member.member_no} ${member.full_name} • ได้ ${data.points_earned} คะแนน • ใช้ ${data.points_redeemed} คะแนน`,'ok');
};
(async()=>{const{data:{session}}=await supabaseClient.auth.getSession();if(!session)location.href='./dashboard.html'})();
