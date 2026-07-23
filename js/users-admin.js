import { supabaseClient } from './supabase-client.js';
import { loadAccessContext, guardPage } from './access-control.js';

const E={
  search:document.getElementById('search'),
  reload:document.getElementById('reload'),
  rows:document.getElementById('rows'),
  message:document.getElementById('message'),
  roleFilter:document.getElementById('roleFilter'),
  statusFilter:document.getElementById('statusFilter')
};
let roles=[],branches=[],users=[],cashiers=new Map();

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
})[char]);

async function init(){
  const context=await loadAccessContext(supabaseClient);
  if(!guardPage(context,'user.manage')) return;

  const [roleResult,branchResult,cashierResult]=await Promise.all([
    supabaseClient.from('app_roles')
      .select('code,name_th').eq('is_active',true).order('sort_order'),
    supabaseClient.from('branches')
      .select('id,code,name').eq('is_active',true).order('sort_order'),
    supabaseClient.from('cashier_profiles')
      .select('user_id,employee_code,display_name,branch_id,max_discount_percent,can_open_drawer,is_active')
  ]);

  if(roleResult.error) throw roleResult.error;
  if(branchResult.error) throw branchResult.error;
  if(!cashierResult.error){
    cashiers=new Map((cashierResult.data||[]).map(row=>[row.user_id,row]));
  }
  roles=roleResult.data||[];
  E.roleFilter.innerHTML='<option value="ALL">ทุก Role</option>'+roles.map(role=>`<option value="${role.code}">${esc(role.name_th)}</option>`).join('');
  branches=branchResult.data||[];
  await load();
}

async function load(){
  E.message.textContent='กำลังโหลด...';
  const {data,error}=await supabaseClient.rpc('admin_list_users');
  if(error){E.message.textContent=error.message;return}
  users=data||[];
  render();
  E.message.textContent=`พบ ${users.length} บัญชี`;
}

function render(){
  const q=E.search.value.trim().toLowerCase();
  const roleFilter=E.roleFilter.value;
  const statusFilter=E.statusFilter.value;
  const filtered=users.filter(user=>
    (roleFilter==='ALL'||user.role_code===roleFilter) &&
    (statusFilter==='ALL'||(statusFilter==='ACTIVE'?user.is_active:!user.is_active)) &&
    (!q||String(user.email||'').toLowerCase().includes(q)
      ||String(user.full_name||'').toLowerCase().includes(q)
      ||String(user.role_code||'').toLowerCase().includes(q)
      ||String(cashiers.get(user.user_id)?.employee_code||'').toLowerCase().includes(q))
  );

  E.rows.innerHTML=filtered.map(user=>{
    const cashier=cashiers.get(user.user_id)||{};
    return `<tr data-id="${user.user_id}">
      <td><strong>${esc(user.full_name)}</strong><br><small>${esc(user.email)}</small></td>
      <td><select class="role">${roles.map(role=>
        `<option value="${role.code}" ${role.code===user.role_code?'selected':''}>${esc(role.name_th)} (${role.code})</option>`
      ).join('')}</select></td>
      <td><select class="branch"><option value="">ทุกสาขา/ไม่ระบุ</option>
        ${branches.map(branch=>`<option value="${branch.id}" ${branch.id===(cashier.branch_id||user.branch_id)?'selected':''}>${esc(branch.code)} — ${esc(branch.name)}</option>`).join('')}
      </select></td>
      <td><label class="active-label"><input class="active" type="checkbox" ${user.is_active?'checked':''}> ใช้งาน</label></td>
      <td>${user.last_sign_in_at
        ? `${new Date(user.last_sign_in_at).toLocaleDateString('th-TH')}<br><small>${new Date(user.last_sign_in_at).toLocaleTimeString('th-TH')}</small>`
        : '-'}</td>
      <td class="cashier-fields">
        <input class="employee-code" placeholder="รหัสพนักงาน" value="${esc(cashier.employee_code||'')}">
        <input class="pin" type="password" inputmode="numeric" placeholder="${cashier.employee_code?'PIN ใหม่ (เว้นว่าง=ไม่เปลี่ยน)':'PIN อย่างน้อย 4 ตัว'}">
        <label><input class="drawer" type="checkbox" ${cashier.can_open_drawer?'checked':''}> เปิดลิ้นชักเองได้</label>
        <input class="max-discount" type="number" min="0" max="100" step=".01"
          value="${Number(cashier.max_discount_percent||0)}" placeholder="ส่วนลดสูงสุด %">
      </td>
      <td><button class="button save">บันทึก</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="7">ไม่พบข้อมูล</td></tr>';

  E.rows.querySelectorAll('.save').forEach(button=>{
    button.addEventListener('click',()=>save(button.closest('tr')));
  });
}

async function save(row){
  const userId=row.dataset.id;
  const user=users.find(item=>item.user_id===userId);
  const role=row.querySelector('.role').value;
  const branch=row.querySelector('.branch').value||null;
  const active=row.querySelector('.active').checked;
  const employeeCode=row.querySelector('.employee-code').value.trim();
  const pin=row.querySelector('.pin').value;
  const drawer=row.querySelector('.drawer').checked;
  const maxDiscount=Number(row.querySelector('.max-discount').value)||0;
  const button=row.querySelector('.save');

  button.disabled=true;
  E.message.textContent='กำลังบันทึก...';

  const roleResult=await supabaseClient.rpc('admin_set_user_role',{
    p_user_id:userId,p_role_code:role,p_branch_id:branch,p_is_active:active
  });
  if(roleResult.error){
    button.disabled=false;E.message.textContent=roleResult.error.message;return;
  }

  if(employeeCode){
    const cashierResult=await supabaseClient.rpc('admin_set_cashier_profile',{
      p_user_id:userId,
      p_employee_code:employeeCode,
      p_display_name:user.full_name||user.email,
      p_pin:pin||null,
      p_branch_id:branch,
      p_max_discount_percent:maxDiscount,
      p_can_open_drawer:drawer,
      p_is_active:active
    });
    if(cashierResult.error){
      button.disabled=false;E.message.textContent=cashierResult.error.message;return;
    }
  }

  button.disabled=false;
  E.message.textContent='บันทึกสิทธิ์และข้อมูลแคชเชียร์เรียบร้อย';
  await init();
}

E.reload.onclick=load;
E.search.oninput=render;
E.roleFilter.onchange=render;
E.statusFilter.onchange=render;
init().catch(error=>E.message.textContent=error.message);
