(() => {
  'use strict';

  const root = document.querySelector('#salesControlPanel');
  if (!root) return;

  const client = window.supabase?.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );

  const E = {
    period: document.querySelector('#reportPeriod'),
    anchor: document.querySelector('#reportAnchorDate'),
    load: document.querySelector('#loadSalesControl'),
    message: document.querySelector('#salesControlMessage'),
    billCount: document.querySelector('#reportBillCount'),
    revenue: document.querySelector('#reportRevenue'),
    cash: document.querySelector('#reportCash'),
    qr: document.querySelector('#reportQr'),
    card: document.querySelector('#reportCard'),
    avg: document.querySelector('#reportAverage'),
    voidCount: document.querySelector('#reportVoidCount'),
    returnAmount: document.querySelector('#reportReturnAmount'),
    rows: document.querySelector('#reportBillRows'),
    dialog: document.querySelector('#reportBillDialog'),
    dialogTitle: document.querySelector('#reportBillDialogTitle'),
    dialogBody: document.querySelector('#reportBillDialogBody'),
    dialogClose: document.querySelector('#reportBillDialogClose')
  };

  let state = { bills: [], items: [] };

  const money = v => new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 2
  }).format(Number(v || 0));
  const dateTime = v => new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[c]);

  function currentBranchId() {
    const select = document.querySelector('#branchFilter');
    return select?.value || null;
  }

  function render(data) {
    const s = data?.summary || {};
    const v = data?.voids || {};
    const r = data?.returns || {};
    state.bills = data?.bills || [];
    state.items = data?.items || [];

    E.billCount.textContent = Number(s.bill_count || 0).toLocaleString('th-TH');
    E.revenue.textContent = money(s.gross_revenue);
    E.cash.textContent = money(s.cash_revenue);
    E.qr.textContent = money(s.qr_transfer_revenue);
    E.card.textContent = money(s.card_revenue);
    E.avg.textContent = money(s.average_bill);
    E.voidCount.textContent = Number(v.void_count || 0).toLocaleString('th-TH');
    E.returnAmount.textContent = money(r.return_amount);

    E.rows.innerHTML = state.bills.length ? state.bills.map(b => `
      <tr>
        <td>${dateTime(b.created_at)}</td>
        <td><strong>${esc(b.sale_no)}</strong></td>
        <td>${esc(b.payment_method || '-')}</td>
        <td>${money(b.net_total)}</td>
        <td><span class="badge ${String(b.status).toUpperCase()==='VOIDED'?'out':'ok'}">${esc(b.status)}</span></td>
        <td><button type="button" class="report-detail-btn" data-id="${esc(b.id)}">รายละเอียด</button></td>
      </tr>`).join('') : '<tr><td colspan="6">ไม่พบข้อมูลในช่วงเวลานี้</td></tr>';

    document.querySelectorAll('.report-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => openBill(btn.dataset.id));
    });
  }

  function openBill(id) {
    const bill = state.bills.find(x => x.id === id);
    const items = state.items.filter(x => x.sale_id === id);
    if (!bill) return;
    E.dialogTitle.textContent = `${bill.sale_no} · ${money(bill.net_total)}`;
    E.dialogBody.innerHTML = `
      <div class="report-bill-meta">
        <p><strong>วันที่</strong><br>${dateTime(bill.created_at)}</p>
        <p><strong>ชำระ</strong><br>${esc(bill.payment_method || '-')}</p>
        <p><strong>ลูกค้า</strong><br>${esc(bill.customer_name || 'Walk-in')}</p>
        <p><strong>สถานะ</strong><br>${esc(bill.status || '-')}</p>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>รหัส</th><th>สินค้า</th><th>ขาย</th><th>คืนแล้ว</th><th>ราคาต่อหน่วย</th><th>รวม</th></tr></thead>
        <tbody>${items.length ? items.map(i => `
          <tr><td>${esc(i.product_code)}</td><td>${esc(i.product_name)}</td>
          <td>${Number(i.sold_quantity||0)}</td><td>${Number(i.returned_quantity||0)}</td>
          <td>${money(i.unit_price)}</td><td>${money(i.line_amount)}</td></tr>`).join('') : '<tr><td colspan="6">ไม่พบรายละเอียดสินค้า</td></tr>'}</tbody>
      </table></div>`;
    E.dialog.showModal();
  }

  async function load() {
    if (!client) return;
    E.load.disabled = true;
    E.message.textContent = 'กำลังโหลดรายงาน...';
    const { data, error } = await client.rpc('get_sales_control_dashboard_v2_1', {
      p_period: E.period.value,
      p_anchor_date: E.anchor.value || new Date().toISOString().slice(0,10),
      p_branch_id: currentBranchId(),
      p_limit: 200
    });
    E.load.disabled = false;
    if (error) {
      console.error(error);
      E.message.textContent = `โหลดรายงานไม่สำเร็จ: ${error.message}`;
      return;
    }
    render(data);
    E.message.textContent = 'อัปเดตข้อมูลแล้ว';
  }

  E.anchor.value = new Date().toISOString().slice(0,10);
  E.load.addEventListener('click', load);
  E.period.addEventListener('change', load);
  E.anchor.addEventListener('change', load);
  E.dialogClose.addEventListener('click', () => E.dialog.close());
  document.querySelector('#branchFilter')?.addEventListener('change', () => setTimeout(load, 0));

  window.addEventListener('tkn-dashboard-loaded', load);
  setTimeout(load, 1200);
})();
