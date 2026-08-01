import { supabaseClient } from './supabase-client.js';
import { loadAccessContext, hasPermission } from './access-control.js';

const E = {
  period: document.getElementById('period'),
  paymentFilter: document.getElementById('paymentFilter'),
  anchor: document.getElementById('anchor'),
  anchorField: document.getElementById('anchorField'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  startField: document.getElementById('startField'),
  endField: document.getElementById('endField'),
  load: document.getElementById('load'),
  csv: document.getElementById('csv'),
  print: document.getElementById('print'),
  billSearchButton: document.getElementById('billSearchButton'),
  stats: document.getElementById('stats'),
  rows: document.getElementById('rows'),
  message: document.getElementById('message'),
  source: document.getElementById('reportDataSource'),
  diagnostics: document.getElementById('reportDiagnostics'),
  diagnosticsText: document.getElementById('reportDiagnosticsText'),
  dialog: document.getElementById('dialog'),
  title: document.getElementById('dialogTitle'),
  content: document.getElementById('dialogContent'),
  close: document.getElementById('close'),
};

const state = {
  bills: [],
  allBills: [],
  items: [],
  context: null,
  payload: null,
  source: '',
  requestId: 0,
};

const money = (value) => new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
}).format(Number(value || 0));

const dateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
};

const escapeHtml = (value) => String(value ?? '').replace(
  /[&<>"']/g,
  (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;',
  })[char],
);

function localDateValue(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function parseDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function selectedRange() {
  if (E.period.value === 'RANGE') {
    return { startDate: E.startDate.value, endDate: E.endDate.value };
  }

  const anchor = parseDate(E.anchor.value);
  if (!anchor) return { startDate: '', endDate: '' };

  if (E.period.value === 'YEAR') {
    return {
      startDate: `${anchor.getFullYear()}-01-01`,
      endDate: `${anchor.getFullYear()}-12-31`,
    };
  }

  if (E.period.value === 'MONTH') {
    return {
      startDate: dateValue(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)),
      endDate: dateValue(endOfMonth(anchor)),
    };
  }

  return { startDate: E.anchor.value, endDate: E.anchor.value };
}

function validateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) throw new Error('กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุดให้ครบ');
  if (end < start) throw new Error('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น');

  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > 366) throw new Error('ช่วงรายงานต้องไม่เกิน 366 วัน');
}

function canViewReports(context) {
  return ['report.view', 'reports.view', 'dashboard.view', 'dashboard.branch_view']
    .some((permission) => hasPermission(context, permission));
}

function canExportReports(context) {
  return ['report.export', 'reports.export']
    .some((permission) => hasPermission(context, permission));
}

function updatePeriodUI() {
  const custom = E.period.value === 'RANGE';
  E.anchorField.hidden = custom;
  E.startField.hidden = !custom;
  E.endField.hidden = !custom;
}

function setMessage(text, type = '') {
  E.message.textContent = text;
  E.message.dataset.type = type;
}

function setDiagnostics(errors = []) {
  if (!E.diagnostics || !E.diagnosticsText) return;
  if (!errors.length) {
    E.diagnostics.hidden = true;
    E.diagnostics.open = false;
    E.diagnosticsText.textContent = '';
    return;
  }

  E.diagnostics.hidden = false;
  E.diagnosticsText.textContent = errors.map((entry, index) => (
    `${index + 1}. ${entry.source}: ${entry.message}`
  )).join('\n');
}

function normalizePayload(data) {
  const payload = data?.report || data;
  if (!payload || typeof payload !== 'object') return null;
  return {
    period: payload.period || {},
    summary: payload.summary || {},
    voids: payload.voids || {},
    returns: payload.returns || {},
    bills: Array.isArray(payload.bills) ? payload.bills : [],
    items: Array.isArray(payload.items) ? payload.items : [],
    trend: Array.isArray(payload.trend) ? payload.trend : [],
  };
}

function isMissingRpc(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return text.includes('pgrst202')
    || text.includes('could not find the function')
    || text.includes('function public.') && text.includes('does not exist');
}

async function callRpc(source, rpc, args, transform = normalizePayload) {
  const { data, error } = await supabaseClient.rpc(rpc, args);
  if (error) {
    const wrapped = new Error(error.message || `โหลดข้อมูลจาก ${rpc} ไม่สำเร็จ`);
    wrapped.code = error.code;
    wrapped.details = error.details;
    wrapped.hint = error.hint;
    wrapped.source = source;
    throw wrapped;
  }

  const payload = transform(data);
  if (!payload) {
    const wrapped = new Error('รูปแบบข้อมูลที่ได้รับไม่ถูกต้อง');
    wrapped.source = source;
    throw wrapped;
  }
  return { payload, source };
}

async function fetchReport(startDate, endDate) {
  const branchId = state.context?.branch_id || null;
  const errors = [];
  const candidates = [
    {
      source: 'Reports RPC v5.15.1',
      rpc: 'get_reports_range_v5_15_1',
      args: {
        p_start_date: startDate,
        p_end_date: endDate,
        p_branch_id: branchId,
        p_limit: 500,
      },
    },
    {
      source: 'Dashboard RPC v5.13',
      rpc: 'get_dashboard_range_v5_13',
      args: {
        p_start_date: startDate,
        p_end_date: endDate,
        p_branch_id: branchId,
        p_limit: 100,
      },
      transform: (data) => normalizePayload(data?.report),
    },
    {
      source: 'Reports Range RPC v3.4',
      rpc: 'get_sales_control_dashboard_range_v3_4',
      args: {
        p_start_date: startDate,
        p_end_date: endDate,
        p_branch_id: branchId,
        p_limit: 500,
      },
    },
  ];

  if (E.period.value !== 'RANGE') {
    candidates.push({
      source: 'Reports Legacy RPC v2.1',
      rpc: 'get_sales_control_dashboard_v2_1',
      args: {
        p_period: E.period.value,
        p_anchor_date: E.anchor.value,
        p_branch_id: branchId,
        p_limit: 500,
      },
    });
  }

  for (const candidate of candidates) {
    try {
      return await callRpc(
        candidate.source,
        candidate.rpc,
        candidate.args,
        candidate.transform || normalizePayload,
      );
    } catch (error) {
      errors.push({
        source: candidate.source,
        message: error.message || 'ไม่ทราบสาเหตุ',
        missing: isMissingRpc(error),
      });
    }
  }

  const finalError = new Error(
    errors.some((entry) => entry.missing)
      ? 'ยังไม่ได้ติดตั้ง SQL ซ่อมหน้ารายงาน หรือ RPC ในฐานข้อมูลยังไม่พร้อม'
      : 'ไม่สามารถโหลดข้อมูลรายงานจากฐานข้อมูลได้',
  );
  finalError.reportErrors = errors;
  throw finalError;
}

async function init() {
  state.context = await loadAccessContext(supabaseClient);
  if (!state.context) {
    location.replace('./index.html');
    return;
  }

  if (!canViewReports(state.context)) {
    location.replace(state.context.landing_page || './pos.html');
    return;
  }

  E.csv.hidden = !canExportReports(state.context);

  const canSearchBills = hasPermission(state.context, 'pos.search_bill')
    || hasPermission(state.context, 'bill.view');
  if (E.billSearchButton) {
    E.billSearchButton.hidden = !canSearchBills;
    E.billSearchButton.setAttribute('aria-hidden', String(!canSearchBills));
    E.billSearchButton.tabIndex = canSearchBills ? 0 : -1;
  }

  const today = localDateValue();
  E.anchor.value = today;
  E.startDate.value = today;
  E.endDate.value = today;
  updatePeriodUI();
  await load();
}

async function load() {
  const requestId = ++state.requestId;
  const { startDate, endDate } = selectedRange();

  try {
    validateRange(startDate, endDate);
    E.load.disabled = true;
    E.load.setAttribute('aria-busy', 'true');
    E.rows.innerHTML = '<tr><td colspan="6" class="report-loading-cell">กำลังโหลดข้อมูลจากฐานข้อมูล...</td></tr>';
    setMessage('กำลังโหลดรายงาน...', 'loading');
    setDiagnostics();
    if (E.source) E.source.textContent = 'กำลังเชื่อมต่อ...';

    const result = await fetchReport(startDate, endDate);
    if (requestId !== state.requestId) return;

    state.payload = result.payload;
    state.source = result.source;
    render(result.payload);

    const billCount = state.allBills.length;
    const rangeText = startDate === endDate ? startDate : `${startDate} ถึง ${endDate}`;
    setMessage(
      billCount
        ? `อัปเดตข้อมูลแล้ว ${billCount.toLocaleString('th-TH')} บิล · ${rangeText}`
        : `ไม่พบรายการขายในช่วง ${rangeText}`,
      billCount ? 'success' : 'empty',
    );
    if (E.source) E.source.textContent = `แหล่งข้อมูล: ${result.source}`;
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.payload = null;
    state.allBills = [];
    state.bills = [];
    state.items = [];
    E.stats.innerHTML = '';
    E.rows.innerHTML = '<tr><td colspan="6" class="report-error-cell">โหลดรายงานไม่สำเร็จ กรุณาตรวจ SQL และลองอีกครั้ง</td></tr>';
    setMessage(error.message || 'โหลดรายงานไม่สำเร็จ', 'error');
    setDiagnostics(error.reportErrors || [{ source: 'Reports', message: error.message }]);
    if (E.source) E.source.textContent = 'ไม่สามารถเชื่อมต่อข้อมูลรายงาน';
    console.error('[TKN Reports v5.15.1]', error);
  } finally {
    if (requestId === state.requestId) {
      E.load.disabled = false;
      E.load.removeAttribute('aria-busy');
    }
  }
}

function paymentGroup(method) {
  const raw = String(method || '').trim();
  const value = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (value === 'CASH' || raw === 'เงินสด') return 'CASH';
  if (['QR', 'PROMPTPAY', 'QR_CODE'].includes(value) || raw === 'พร้อมเพย์') return 'QR';
  if (
    ['TRANSFER', 'BANK_TRANSFER', 'BANK', 'WIRE_TRANSFER', 'MOBILE_BANKING'].includes(value)
    || ['เงินโอน', 'โอน', 'โอนเงิน'].includes(raw)
  ) return 'TRANSFER';
  if (['CARD', 'CREDIT_CARD', 'DEBIT_CARD'].includes(value) || raw === 'บัตร') return 'CARD';
  if (['VOUCHER', 'COUPON'].includes(value)) return 'VOUCHER';
  return 'OTHER';
}

function paymentLabel(method) {
  return ({
    CASH: 'เงินสด',
    QR: 'QR',
    TRANSFER: 'เงินโอน',
    CARD: 'บัตร',
    VOUCHER: 'Voucher',
    OTHER: 'อื่น ๆ',
  })[paymentGroup(method)] || String(method || '-');
}

function normalizeStatus(status) {
  return String(status ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function statusLabel(status) {
  const raw = String(status ?? '').trim();
  if (!raw) return '-';
  if (/[ก-๙]/.test(raw)) return raw;

  const labels = {
    COMPLETED: 'สำเร็จ', COMPLETE: 'สำเร็จ', PAID: 'ชำระเงินแล้ว',
    RETURNED: 'คืนสินค้าแล้ว', PARTIALLY_RETURNED: 'คืนสินค้าบางส่วน',
    PARTIAL_RETURN: 'คืนสินค้าบางส่วน', REFUNDED: 'คืนเงินแล้ว',
    VOIDED: 'ยกเลิกบิล', VOID: 'ยกเลิกบิล', CANCELLED: 'ยกเลิก',
    CANCELED: 'ยกเลิก', PENDING: 'รอดำเนินการ', OPEN: 'เปิดอยู่',
    DRAFT: 'แบบร่าง', HELD: 'พักบิล', ON_HOLD: 'พักบิล',
    UNPAID: 'ยังไม่ชำระเงิน', FAILED: 'ไม่สำเร็จ',
  };
  return labels[normalizeStatus(raw)] || raw;
}

function statusTone(status) {
  const key = normalizeStatus(status);
  if (['COMPLETED', 'COMPLETE', 'PAID'].includes(key)) return 'success';
  if (key === 'RETURNED') return 'returned';
  if (['PARTIALLY_RETURNED', 'PARTIAL_RETURN'].includes(key)) return 'partial';
  if (key === 'REFUNDED') return 'refunded';
  if (['VOIDED', 'VOID', 'CANCELLED', 'CANCELED', 'FAILED'].includes(key)) return 'danger';
  if (['PENDING', 'UNPAID'].includes(key)) return 'warning';
  if (key === 'OPEN') return 'info';
  if (['HELD', 'ON_HOLD'].includes(key)) return 'held';
  return 'neutral';
}

function statusBadge(status) {
  const label = escapeHtml(statusLabel(status));
  const tone = statusTone(status);
  const raw = escapeHtml(String(status ?? '').trim() || '-');
  return `<span class="report-status report-status--${tone}" title="สถานะระบบ: ${raw}">${label}</span>`;
}

function isRevenueBill(bill) {
  const status = normalizeStatus(bill?.status);
  return !['VOIDED', 'VOID', 'CANCELLED', 'CANCELED', 'REFUNDED', 'FAILED'].includes(status);
}

function paymentBreakdown(bills) {
  return (bills || []).reduce((totals, bill) => {
    if (!isRevenueBill(bill)) return totals;
    const group = paymentGroup(bill.payment_method);
    totals[group] += Number(bill.net_total || 0);
    return totals;
  }, { CASH: 0, QR: 0, TRANSFER: 0, CARD: 0, VOUCHER: 0, OTHER: 0 });
}

function applyPaymentFilter() {
  const selected = E.paymentFilter?.value || 'ALL';
  state.bills = selected === 'ALL'
    ? [...state.allBills]
    : state.allBills.filter((bill) => paymentGroup(bill.payment_method) === selected);
}

function filteredSummary() {
  const revenueBills = state.bills.filter(isRevenueBill);
  const grossRevenue = revenueBills.reduce((sum, bill) => sum + Number(bill.net_total || 0), 0);
  return {
    billCount: revenueBills.length,
    grossRevenue,
    averageBill: revenueBills.length ? grossRevenue / revenueBills.length : 0,
  };
}

function renderStats() {
  const payload = state.payload || {};
  const summary = payload.summary || {};
  const voids = payload.voids || {};
  const returns = payload.returns || {};
  const payments = paymentBreakdown(state.bills);
  const filtered = filteredSummary();
  const isFiltered = (E.paymentFilter?.value || 'ALL') !== 'ALL';

  const cards = [
    ['จำนวนบิล', Number(isFiltered ? filtered.billCount : summary.bill_count || state.allBills.filter(isRevenueBill).length).toLocaleString('th-TH')],
    ['รายรับรวม', money(isFiltered ? filtered.grossRevenue : summary.gross_revenue)],
    ['เงินสด', money(payments.CASH)],
    ['QR', money(payments.QR)],
    ['เงินโอน', money(payments.TRANSFER)],
    ['บัตร', money(payments.CARD)],
    ['Voucher', money(payments.VOUCHER)],
    ['อื่น ๆ', money(payments.OTHER)],
    ['เฉลี่ยต่อบิล', money(isFiltered ? filtered.averageBill : summary.average_bill)],
    ['บิลยกเลิก', Number(voids.void_count || 0).toLocaleString('th-TH')],
    ['ยอดคืนสินค้า', money(returns.return_amount)],
  ];

  E.stats.innerHTML = cards.map(([label, value]) => `
    <article class="stat"><span>${label}</span><strong>${value}</strong></article>
  `).join('');
}

function render(data) {
  state.allBills = Array.isArray(data?.bills) ? data.bills : [];
  state.items = Array.isArray(data?.items) ? data.items : [];
  applyPaymentFilter();
  renderStats();
  renderTableOnly();
}

function openBill(id) {
  const bill = state.bills.find((item) => String(item.id) === String(id));
  const items = state.items.filter((item) => String(item.sale_id) === String(id));
  if (!bill) return;

  E.title.textContent = `${bill.sale_no || '-'} · ${money(bill.net_total)}`;
  E.content.innerHTML = `
    <div class="bill-meta">
      <p><b>วันที่</b><br>${dateTime(bill.created_at)}</p>
      <p><b>ชำระ</b><br>${escapeHtml(paymentLabel(bill.payment_method))}</p>
      <p><b>สถานะ</b><br>${statusBadge(bill.status)}</p>
      <p><b>ลูกค้า</b><br>${escapeHtml(bill.customer_name || 'Walk-in')}</p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>รหัส</th><th>สินค้า</th><th>ขาย</th><th>คืนแล้ว</th><th>ราคา</th><th>รวม</th></tr></thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.product_code || '-')}</td>
              <td>${escapeHtml(item.product_name || '-')}</td>
              <td>${Number(item.sold_quantity || 0).toLocaleString('th-TH')}</td>
              <td>${Number(item.returned_quantity || 0).toLocaleString('th-TH')}</td>
              <td>${money(item.unit_price)}</td>
              <td>${money(item.line_amount)}</td>
            </tr>
          `).join('') || '<tr><td colspan="6">ไม่พบสินค้าในบิล</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  if (typeof E.dialog.showModal === 'function') E.dialog.showModal();
  else E.dialog.setAttribute('open', '');
}

function exportCsv() {
  if (!state.bills.length) {
    setMessage('ไม่มีข้อมูลสำหรับ Export', 'empty');
    return;
  }

  const rows = [
    ['วันที่', 'เลขบิล', 'ชำระ', 'ยอดสุทธิ', 'สถานะ'],
    ...state.bills.map((bill) => [
      dateTime(bill.created_at),
      bill.sale_no,
      paymentLabel(bill.payment_method),
      bill.net_total,
      statusLabel(bill.status),
    ]),
  ];

  const csv = `\ufeff${rows.map((row) => row.map((value) => (
    `"${String(value ?? '').replaceAll('"', '""')}"`
  )).join(',')).join('\n')}`;

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `sales-report-${localDateValue()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderTableOnly() {
  E.rows.innerHTML = state.bills.map((bill) => `
    <tr>
      <td>${dateTime(bill.created_at)}</td>
      <td><strong>${escapeHtml(bill.sale_no || '-')}</strong></td>
      <td>${escapeHtml(paymentLabel(bill.payment_method))}</td>
      <td>${money(bill.net_total)}</td>
      <td>${statusBadge(bill.status)}</td>
      <td><button class="button secondary detail" data-id="${escapeHtml(bill.id)}" type="button">รายละเอียด</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">ไม่พบข้อมูลตามตัวกรอง</td></tr>';

  E.rows.querySelectorAll('.detail').forEach((button) => {
    button.addEventListener('click', () => openBill(button.dataset.id));
  });
}

E.paymentFilter?.addEventListener('change', () => {
  applyPaymentFilter();
  renderStats();
  renderTableOnly();
});

E.period?.addEventListener('change', () => {
  updatePeriodUI();
  load();
});
E.anchor?.addEventListener('change', load);
E.startDate?.addEventListener('change', () => {
  if (E.endDate.value && E.startDate.value > E.endDate.value) E.endDate.value = E.startDate.value;
});
E.endDate?.addEventListener('change', () => {
  if (E.startDate.value && E.endDate.value < E.startDate.value) E.startDate.value = E.endDate.value;
});
E.load?.addEventListener('click', load);
E.csv?.addEventListener('click', exportCsv);
E.print?.addEventListener('click', () => window.print());
E.close?.addEventListener('click', () => {
  if (typeof E.dialog.close === 'function') E.dialog.close();
  else E.dialog.removeAttribute('open');
});

init().catch((error) => {
  E.rows.innerHTML = '<tr><td colspan="6" class="report-error-cell">เปิดหน้ารายงานไม่สำเร็จ</td></tr>';
  setMessage(error.message || 'เปิดหน้ารายงานไม่สำเร็จ', 'error');
  setDiagnostics([{ source: 'เริ่มต้นระบบ', message: error.message || 'Unknown error' }]);
  console.error('[TKN Reports init v5.15.1]', error);
});
