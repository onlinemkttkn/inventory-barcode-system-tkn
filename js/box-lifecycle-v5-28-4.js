(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v) => v ? new Date(v).toLocaleString('th-TH') : '-';
  const statusLabel = (s) => ({WAITING_STOCK:'รอเข้าสต็อก',IN_STOCK:'อยู่ในสต็อก',REOPENED:'เปิดแก้ไข',CANCELLED:'ยกเลิก'}[s] || s || '-');
  const statusClass = (s) => s === 'IN_STOCK' ? 'stock' : s === 'REOPENED' ? 'reopened' : 'waiting';
  async function client(){
    if (typeof supabaseClient !== 'undefined') return supabaseClient;
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise(r=>setTimeout(r,250));
    if (typeof supabaseClient !== 'undefined') return supabaseClient;
    return window.supabaseClient;
  }
  async function loadQueue(){
    const tbody=$('boxLifecycleRows'); if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="7">กำลังโหลดคิว...</td></tr>';
    const sb=await client(); if(!sb){tbody.innerHTML='<tr><td colspan="7">ยังเชื่อมฐานข้อมูลไม่ได้</td></tr>';return;}
    const q=$('boxLifecycleSearch')?.value?.trim() || null;
    const {data,error}=await sb.rpc('tkn_v5284_list_waiting_box_queue',{p_search:q,p_limit:200});
    if(error){tbody.innerHTML=`<tr><td colspan="7">${esc(error.message)}</td></tr>`;return;}
    const rows=Array.isArray(data)?data:[];
    $('boxLifecycleCount').textContent=`${rows.length} กล่อง`;
    tbody.innerHTML=rows.map(r=>`<tr><td>${fmt(r.closed_at)}</td><td><b>${esc(r.box_code)}</b><br><small>rev ${esc(r.revision)}</small></td><td>${esc(r.category_text||'-')} / ${esc(r.zone_code||'-')}</td><td>${esc(r.sku_count)} SKU · ${esc(r.total_quantity)} ชิ้น</td><td>${esc(r.location_text||'-')}</td><td><span class="box-life-status ${statusClass(r.workflow_status)}">${esc(statusLabel(r.workflow_status))}</span></td><td><button type="button" data-life-history="${esc(r.history_id)}">Timeline</button></td></tr>`).join('') || '<tr><td colspan="7" class="box-life-empty">ไม่มีกล่องรอเข้าสต็อก</td></tr>';
  }
  async function showTimeline(historyId){
    const host=$('boxLifecycleTimeline'); if(!host) return; host.hidden=false; host.innerHTML='กำลังโหลด Timeline...';
    const sb=await client(); const {data,error}=await sb.rpc('tkn_v5284_box_lifecycle_detail',{p_history_id:historyId});
    if(error){host.innerHTML=esc(error.message);return;}
    const h=data?.history||{}; const events=data?.events||[];
    host.innerHTML=`<div class="box-life-summary"><article><span>กล่อง</span><b>${esc(h.box_code)}</b></article><article><span>สถานะ</span><b>${esc(statusLabel(h.workflow_status))}</b></article><article><span>สินค้า</span><b>${esc(h.sku_count)} SKU · ${esc(h.total_quantity)} ชิ้น</b></article><article><span>รับเข้าสต็อก</span><b>${esc(h.stock_document_no||'-')}</b></article></div><div class="box-life-events">${events.map(e=>`<div class="box-life-event"><small>${fmt(e.event_at)}</small><b>${esc(e.event_type)}</b><div>${esc(e.status_from||'-')} → ${esc(e.status_to||'-')}<br><small>${esc(e.note||'')}</small></div></div>`).join('') || '<div class="box-life-empty">ยังไม่มี Event</div>'}</div>`;
    host.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  document.addEventListener('click',(ev)=>{
    const btn=ev.target.closest('[data-life-history]'); if(btn) void showTimeline(btn.dataset.lifeHistory);
  });
  document.addEventListener('DOMContentLoaded',()=>{
    $('boxLifecycleRefresh')?.addEventListener('click',()=>void loadQueue());
    $('boxLifecycleSearchBtn')?.addEventListener('click',()=>void loadQueue());
    $('boxLifecycleSearch')?.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();void loadQueue();}});
    setTimeout(()=>void loadQueue(),500);
  });
  window.addEventListener('tkn:box-history-changed',()=>void loadQueue());
})();
