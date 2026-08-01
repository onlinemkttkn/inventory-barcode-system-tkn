(() => {
  'use strict';
  const root = document.querySelector('#salesControlPanel');
  if (!root) return;

  const E = {
    load: document.querySelector('#loadSalesControl'),
    rangeText: document.querySelector('#reportRangeText'),
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
    dialogClose: document.querySelector('#reportBillDialogClose'),
  };

  let state = { bills: [], items: [] };
  const money = (v) => new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB', minimumFractionDigits:2 }).format(Number(v || 0));
  const dateTime = (v) => new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeStyle:'short' }).format(new Date(v));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]);
  const paymentLabel = (value) => ({ CASH:'เงินสด', QR:'QR', TRANSFER:'เงินโอน', CARD:'บัตร', VOUCHER:'Voucher', OTHER:'อื่น ๆ' })[String(value || '').toUpperCase()] || String(value || '-');
  const statusLabel = (value) => ({ COMPLETED:'สำเร็จ', RETURNED:'คืนสินค้าแล้ว', PARTIALLY_RETURNED:'คืนสินค้าบางส่วน', VOIDED:'ยกเลิกบิล', CANCELLED:'ยกเลิก', CANCELED:'ยกเลิก', REFUNDED:'คืนเงินแล้ว', PENDING:'รอดำเนินการ', HELD:'พักบิล', OPEN:'เปิดอยู่', FAILED:'ไม่สำเร็จ' })[String(value || '').toUpperCase()] || String(value || '-');
  const statusClass = (value) => ({ COMPLETED:'status-completed', RETURNED:'status-returned', PARTIALLY_RETURNED:'status-partial', VOIDED:'status-voided', CANCELLED:'status-voided', CANCELED:'status-voided', REFUNDED:'status-refunded', PENDING:'status-pending', HELD:'status-held', OPEN:'status-open', FAILED:'status-voided' })[String(value || '').toUpperCase()] || 'status-default';

  function setLiveNumber(element, value, type = 'number') {
    if (window.TKNLiveNumber?.set) return window.TKNLiveNumber.set(element, value, { type });
    if (element) element.textContent = type === 'money' ? money(value) : Number(value || 0).toLocaleString('th-TH');
  }

  function rangeLabel(range) {
    const start = range?.startDate || range?.start_date;
    const end = range?.endDate || range?.end_date;
    if (!start || !end) return 'ใช้ช่วงวันที่จากด้านบน';
    const parse = (value) => { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d,12); };
    const fmt = new Intl.DateTimeFormat('th-TH', { day:'numeric', month:'short', year:'numeric' });
    return start === end ? fmt.format(parse(start)) : `${fmt.format(parse(start))} – ${fmt.format(parse(end))}`;
  }

  function render(data, range) {
    const report = data?.report || {};
    const summary = report.summary || data?.summary || {};
    const voids = report.voids || {};
    const returns = report.returns || {};
    state.bills = (report.bills || data?.recent_sales || []).slice(0, 10);
    state.items = report.items || [];

    setLiveNumber(E.billCount, summary.bill_count ?? summary.bills_range, 'number');
    setLiveNumber(E.revenue, summary.gross_revenue ?? summary.sales_range, 'money');
    setLiveNumber(E.cash, summary.cash_revenue ?? summary.cash_total, 'money');
    setLiveNumber(E.qr, summary.qr_transfer_revenue ?? summary.qr_total, 'money');
    setLiveNumber(E.card, summary.card_revenue ?? summary.card_total, 'money');
    setLiveNumber(E.avg, summary.average_bill, 'money');
    setLiveNumber(E.voidCount, voids.void_count ?? summary.void_count, 'number');
    setLiveNumber(E.returnAmount, returns.return_amount ?? summary.returns_range, 'money');
    if (E.rangeText) E.rangeText.textContent = rangeLabel(range || data?.period);

    E.rows.innerHTML = state.bills.length ? state.bills.map((b) => `
      <tr>
        <td>${dateTime(b.created_at)}</td>
        <td><strong>${esc(b.sale_no)}</strong></td>
        <td>${esc(paymentLabel(b.payment_method))}</td>
        <td>${money(b.net_total)}</td>
        <td><span class="dashboard-status-badge ${statusClass(b.status)}">${esc(statusLabel(b.status))}</span></td>
        <td><button type="button" class="report-detail-btn" data-id="${esc(b.id)}">รายละเอียด</button></td>
      </tr>`).join('') : '<tr><td colspan="6">ไม่พบข้อมูลในช่วงเวลานี้</td></tr>';

    document.querySelectorAll('.report-detail-btn').forEach((btn) => btn.addEventListener('click', () => openBill(btn.dataset.id)));
    if (E.message) E.message.textContent = 'ใช้ช่วงวันที่เดียวกับ Dashboard · แสดง 10 รายการล่าสุด';
  }

  function openBill(id) {
    const bill = state.bills.find((x) => String(x.id) === String(id));
    const items = state.items.filter((x) => String(x.sale_id) === String(id));
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
        <tbody>${items.length ? items.map((i) => `<tr><td>${esc(i.product_code)}</td><td>${esc(i.product_name)}</td><td>${Number(i.sold_quantity || 0)}</td><td>${Number(i.returned_quantity || 0)}</td><td>${money(i.unit_price)}</td><td>${money(i.line_amount)}</td></tr>`).join('') : '<tr><td colspan="6">ไม่พบรายละเอียดสินค้า</td></tr>'}</tbody>
      </table></div>`;
    E.dialog?.showModal();
  }

  E.load?.addEventListener('click', () => window.TKNDashboardRange?.reload?.());
  E.dialogClose?.addEventListener('click', () => E.dialog?.close());
  window.addEventListener('tkn-dashboard-loaded', (event) => render(event.detail?.data || {}, event.detail?.range));

  const initial = window.TKNDashboardRange?.getData?.();
  if (initial) render(initial, window.TKNDashboardRange.getRange?.());
})();
