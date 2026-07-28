(() => {
  'use strict';

  const root = document.querySelector('#salesControlPanel');
  if (!root) return;

  const client = window.supabaseClient;

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
  let loadSequence = 0;
  let initialized = false;

  const money = v => new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 2
  }).format(Number(v || 0));
  const dateTime = v => new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(v));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[c]);

  const paymentLabel = value => ({
    CASH: 'เงินสด',
    QR: 'QR',
    TRANSFER: 'เงินโอน',
    CARD: 'บัตร',
    VOUCHER: 'Voucher',
    OTHER: 'อื่น ๆ'
  })[String(value || '').toUpperCase()] || String(value || '-');


  const statusLabel = value => ({
    COMPLETED: 'สำเร็จ',
    RETURNED: 'คืนสินค้าแล้ว',
    PARTIALLY_RETURNED: 'คืนสินค้าบางส่วน',
    VOIDED: 'ยกเลิกบิล',
    CANCELLED: 'ยกเลิก',
    CANCELED: 'ยกเลิก',
    REFUNDED: 'คืนเงินแล้ว',
    PENDING: 'รอดำเนินการ',
    HELD: 'พักบิล',
    OPEN: 'เปิดอยู่',
    FAILED: 'ไม่สำเร็จ'
  })[String(value || '').toUpperCase()] || String(value || '-');

  const statusClass = value => ({
    COMPLETED: 'status-completed',
    RETURNED: 'status-returned',
    PARTIALLY_RETURNED: 'status-partial',
    VOIDED: 'status-voided',
    CANCELLED: 'status-voided',
    CANCELED: 'status-voided',
    REFUNDED: 'status-refunded',
    PENDING: 'status-pending',
    HELD: 'status-held',
    OPEN: 'status-open',
    FAILED: 'status-voided'
  })[String(value || '').toUpperCase()] || 'status-default';

  const setLiveNumber = (element, value, type = 'number') => {
    if (window.TKNLiveNumber?.set) {
      window.TKNLiveNumber.set(element, value, { type });
      return;
    }
    if (element) element.textContent = type === 'money' ? money(value) : Number(value || 0).toLocaleString('th-TH');
  };

  function currentBranchId() {
    const select = document.querySelector('#branchFilter');
    return select?.value || null;
  }

  function render(data) {
    const s = data?.summary || {};
    const v = data?.voids || {};
    const r = data?.returns || {};
    state.bills = (data?.bills || []).slice(0, 10);
    state.items = data?.items || [];

    setLiveNumber(E.billCount, s.bill_count, 'number');
    setLiveNumber(E.revenue, s.gross_revenue, 'money');
    setLiveNumber(E.cash, s.cash_revenue, 'money');
    setLiveNumber(E.qr, s.qr_transfer_revenue, 'money');
    setLiveNumber(E.card, s.card_revenue, 'money');
    setLiveNumber(E.avg, s.average_bill, 'money');
    setLiveNumber(E.voidCount, v.void_count, 'number');
    setLiveNumber(E.returnAmount, r.return_amount, 'money');

    E.rows.innerHTML = state.bills.length ? state.bills.map(b => `
      <tr>
        <td>${dateTime(b.created_at)}</td>
        <td><strong>${esc(b.sale_no)}</strong></td>
        <td>${esc(paymentLabel(b.payment_method))}</td>
        <td>${money(b.net_total)}</td>
        <td><span class="dashboard-status-badge ${statusClass(b.status)}">${esc(statusLabel(b.status))}</span></td>
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
        <p><strong>ชำระ</strong><br>${esc(paymentLabel(bill.payment_method))}</p>
        <p><strong>ลูกค้า</strong><br>${esc(bill.customer_name || 'Walk-in')}</p>
        <p><strong>สถานะ</strong><br><span class="dashboard-status-badge ${statusClass(bill.status)}">${esc(statusLabel(bill.status))}</span></p>
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
    if (!client) {
      E.message.textContent = 'ไม่พบ Supabase Client กลาง';
      return;
    }

    /*
     * The report panel exists in dashboard.html even while the Login view is
     * visible. Never call a protected RPC until both the authenticated
     * Dashboard and its Supabase session are ready.
     */
    if (document.querySelector('#appArea')?.classList.contains('hidden')) return;

    const {
      data: { session },
      error: sessionError
    } = await client.auth.getSession();

    if (sessionError || !session?.user?.id) return;

    const sequence = ++loadSequence;
    E.load.disabled = true;
    E.message.textContent = 'กำลังโหลดรายงาน...';

    const { data, error } = await client.rpc('get_sales_control_dashboard_v2_1', {
      p_period: E.period.value,
      p_anchor_date: E.anchor.value || new Date().toISOString().slice(0,10),
      p_branch_id: currentBranchId(),
      p_limit: 10
    });
    if (sequence !== loadSequence) return;
    E.load.disabled = false;
    if (error) {
      console.error(error);
      E.message.textContent = `โหลดรายงานไม่สำเร็จ: ${error.message}`;
      return;
    }
    render(data);
    E.message.textContent = 'อัปเดตข้อมูลแล้ว · แสดง 10 รายการล่าสุด';
  }

  E.anchor.value = new Date().toISOString().slice(0,10);
  E.load.addEventListener('click', load);
  E.period.addEventListener('change', load);
  E.anchor.addEventListener('change', load);
  E.dialogClose.addEventListener('click', () => E.dialog.close());

  window.addEventListener('tkn-dashboard-loaded', () => {
    initialized = true;
    load();
  });

  // If the event fired before this script finished, use the visible app state.
  if (!document.querySelector('#appArea')?.classList.contains('hidden')) {
    initialized = true;
    load();
  }
})();
