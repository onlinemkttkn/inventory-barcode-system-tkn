(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = v => v ? new Date(v).toLocaleString('th-TH') : '-';

  async function client() {
    if (!window.supabaseClient?.rpc) throw new Error('Supabase ยังไม่พร้อม');
    return window.supabaseClient;
  }

  async function loadIntake() {
    try {
      const sb = await client();
      const { data, error } = await sb.rpc('tkn_v5285_list_stock_intake_queue', { p_search:null, p_limit:30 });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if ($('hubWaitingCount')) $('hubWaitingCount').textContent = `${rows.length} กล่องรอรับ`;
      if ($('hubIntakeState')) $('hubIntakeState').textContent = rows.length ? `พบ ${rows.length} กล่อง WAITING_STOCK` : 'ไม่มีคิวรอตรวจรับ';
      if ($('hubIntakeRows')) {
        $('hubIntakeRows').innerHTML = rows.map(x => `<tr><td>${fmt(x.closed_at)}</td><td><b>${esc(x.box_code)}</b></td><td>${esc(x.sku_count)} SKU · ${esc(x.total_quantity)} ชิ้น</td><td>${esc(x.branch_name||'โกดังเก็บสินค้า')}</td><td><a href="./stock-intake.html?scan=${encodeURIComponent(x.box_code)}">ตรวจรับ</a></td></tr>`).join('') || '<tr><td colspan="5">ไม่มีคิว</td></tr>';
      }
    } catch (e) {
      if ($('hubIntakeState')) $('hubIntakeState').textContent = e.message || String(e);
      console.error('Inventory intake hub:', e);
    }
  }

  async function init() {
    try { await window.TKNWarehouseContext?.resolve?.(); } catch (_) {}
    void loadIntake();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
  window.TKNInventoryFlowV5312 = { reload:loadIntake };
})();
