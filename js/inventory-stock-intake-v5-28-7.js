(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function client(){if(window.supabaseClient?.rpc)return window.supabaseClient;throw new Error('Supabase client ยังไม่พร้อม');}
function date(v){try{return v?new Date(v).toLocaleString('th-TH'):'-'}catch{return '-'}}
function qty(r){return Number(r.total_quantity??r.item_quantity??r.quantity??0)||0}
async function load(){const rowsEl=$('hubIntakeRows'),state=$('hubIntakeState'),count=$('hubWaitingCount');if(!rowsEl)return;try{const sb=await client();const {data,error}=await sb.rpc('tkn_v5284_list_waiting_box_queue',{p_search:null,p_limit:20});if(error)throw error;const rows=Array.isArray(data)?data:[];if(count)count.textContent=`${rows.length} กล่องรอรับ`;if(state)state.textContent=rows.length?`พบ ${rows.length} กล่องที่ปิดจากงานคัดแยกและยังไม่เข้าสต็อก`:'ยังไม่มีกล่อง WAITING_STOCK';rowsEl.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(date(r.closed_at))}</td><td><strong>${esc(r.box_code||'-')}</strong></td><td>${esc(qty(r))}</td><td>${esc(r.location_code||r.storage_location||'-')}</td><td><a href="./stock-intake.html?scan=${encodeURIComponent(r.box_code||'')}">ตรวจรับ</a></td></tr>`).join(''):'<tr><td colspan="5">ยังไม่มีกล่องรอตรวจรับ</td></tr>';}catch(e){if(count)count.textContent='ตรวจไม่ได้';if(state)state.textContent=`โหลดคิวไม่ได้: ${e.message||e}`;rowsEl.innerHTML='<tr><td colspan="5">ไม่สามารถอ่านคิว WAITING_STOCK ได้ — ตรวจ SQL v5.28.4/v5.28.5 ก่อน</td></tr>';console.error(e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(load,350));else setTimeout(load,350);window.TKNInventoryWaitingStock={reload:load};
})();
