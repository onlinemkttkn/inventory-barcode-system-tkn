import {
  loadAccessContext, guardPage
} from './access-control.js';

const E = {
  search: document.getElementById('search'),
  reload: document.getElementById('reload'),
  rows: document.getElementById('rows'),
  message: document.getElementById('message')
};

let roles=[];
let branches=[];
let users=[];

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
})[c]);

async function init(){
 const context=await loadAccessContext(supabaseClient);
 if(!guardPage(context,'user.manage')) return;

 const [roleResult,branchResult]=await Promise.all([
  supabaseClient.from('app_roles')
   .select('code,name_th').eq('is_active',true).order('sort_order'),
  supabaseClient.from('branches')
   .select('id,code,name').eq('is_active',true).order('sort_order')
 ]);
 if(roleResult.error) throw roleResult.error;
 if(branchResult.error) throw branchResult.error;
 roles=roleResult.data||[];
 branches=branchResult.data||[];
 await load();
}

async function load(){
 E.message.textContent='กำลังโหลด...';
 const {data,error}=await supabaseClient.rpc('admin_list_users');
 if(error){E.message.textContent=error.message;return;}
 users=data||[];
 render();
 E.message.textContent=`พบ ${users.length} บัญชี`;
}

function render(){
 const q=E.search.value.trim().toLowerCase();
 const filtered=users.filter(u=>
  !q||String(u.email||'').toLowerCase().includes(q)
    ||String(u.full_name||'').toLowerCase().includes(q)
 );
 E.rows.innerHTML=filtered.map(u=>`
  <tr data-id="${u.user_id}">
   <td><strong>${esc(u.full_name)}</strong><br><small>${esc(u.email)}</small></td>
   <td><select class="role">${roles.map(r=>
    `<option value="${r.code}" ${r.code===u.role_code?'selected':''}>
      ${esc(r.name_th)} (${r.code})
    </option>`).join('')}</select></td>
   <td><select class="branch"><option value="">ทุกสาขา/ไม่ระบุ</option>
    ${branches.map(b=>`<option value="${b.id}" ${b.id===u.branch_id?'selected':''}>
      ${esc(b.code)} — ${esc(b.name)}
    </option>`).join('')}</select></td>
   <td><label><input class="active" type="checkbox"
    ${u.is_active?'checked':''}> ใช้งาน</label></td>
   <td>${u.last_sign_in_at
      ? `${new Date(u.last_sign_in_at).toLocaleDateString('th-TH')}<br>
         <small>${new Date(u.last_sign_in_at).toLocaleTimeString('th-TH')}</small>`
      : '-'}</td>
   <td><button class="button save">บันทึก</button></td>
  </tr>`).join('')||'<tr><td colspan="6">ไม่พบข้อมูล</td></tr>';

 E.rows.querySelectorAll('.save').forEach(button=>{
  button.addEventListener('click',()=>save(button.closest('tr')));
 });
}

async function save(row){
 const userId=row.dataset.id;
 const role=row.querySelector('.role').value;
 const branch=row.querySelector('.branch').value||null;
 const active=row.querySelector('.active').checked;
 const button=row.querySelector('.save');
 button.disabled=true;
 E.message.textContent='กำลังบันทึก...';
 const {error}=await supabaseClient.rpc('admin_set_user_role',{
  p_user_id:userId,p_role_code:role,p_branch_id:branch,p_is_active:active
 });
 button.disabled=false;
 if(error){E.message.textContent=error.message;return;}
 E.message.textContent='บันทึกสิทธิ์เรียบร้อย';
 await load();
}

E.reload.addEventListener('click',load);
E.search.addEventListener('input',render);
init().catch(error=>E.message.textContent=error.message);
