const E={branch:document.getElementById('branch'),search:document.getElementById('search'),loadBtn:document.getElementById('loadBtn'),body:document.getElementById('body'),message:document.getElementById('message')};
function msg(t,c=''){E.message.textContent=t;E.message.className='msg '+c}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]))}
async function init(){
  const{data:{session}}=await supabaseClient.auth.getSession();
  if(!session){location.href='./dashboard.html';return}
  const{data,error}=await supabaseClient.from('branches').select('id,code,name').eq('is_active',true).order('sort_order');
  if(error)return msg(error.message,'error');
  E.branch.innerHTML=(data||[]).map(x=>`<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
  load();
}
async function load(){
  const q=E.search.value.trim().replace(/[%_,()]/g,'');
  let query=supabaseClient.from('branch_inventory_list').select('*').eq('branch_id',E.branch.value).order('product_name').limit(1000);
  if(q)query=query.or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%,barcode.ilike.%${q}%`);
  const{data,error}=await query;
  if(error)return msg(error.message,'error');
  E.body.innerHTML='';
  (data||[]).forEach(x=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(x.product_code)}</td><td>${esc(x.product_name)}</td><td>${x.quantity}</td><td>${x.minimum_stock}</td>`;
    const qty=document.createElement('input');qty.type='number';qty.min='0';qty.step='.001';qty.value=x.quantity;
    const min=document.createElement('input');min.type='number';min.min='0';min.step='.001';min.value=x.minimum_stock;
    const reason=document.createElement('input');reason.placeholder='เหตุผล';
    const save=document.createElement('button');save.className='btn primary';save.textContent='บันทึก';
    save.onclick=async()=>{
      const{error}=await supabaseClient.rpc('set_branch_product_stock',{
        p_branch_id:E.branch.value,
        p_product_id:x.product_id,
        p_quantity:Number(qty.value)||0,
        p_minimum_stock:Number(min.value)||0,
        p_reason:reason.value||null
      });
      if(error)return msg(error.message,'error');
      msg('ปรับสต๊อกเรียบร้อย','ok');
      load();
    };
    [qty,min,reason,save].forEach(node=>{const td=document.createElement('td');td.appendChild(node);tr.appendChild(td)});
    E.body.appendChild(tr);
  });
  msg(`พบ ${(data||[]).length} รายการ`);
}
E.loadBtn.onclick=load;E.branch.onchange=load;E.search.onkeydown=e=>{if(e.key==='Enter')load()};init();
