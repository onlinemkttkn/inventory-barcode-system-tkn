import { supabaseClient } from './supabase-client.js';
import { loadAccessContext, hasPermission } from './access-control.js';

const E = {
  period: document.getElementById('period'),
  paymentFilter: document.getElementById('paymentFilter'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  startField: document.getElementById('startField'),
  endField: document.getElementById('endField'),
  selectedRange: document.getElementById('reportSelectedRange'),
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
  discountDialog: document.getElementById('discountDialog'),
  discountTitle: document.getElementById('discountDialogTitle'),
  discountContent: document.getElementById('discountDialogContent'),
  discountClose: document.getElementById('discountDialogClose'),
};

const state = {
  bills: [],
  allBills: [],
  items: [],
  context: null,
  payload: null,
  source: '',
  requestId: 0,
  appliedRange: null,
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

function addDays(date, amount) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function presetRange(preset = E.period?.value) {
  const today = parseDate(localDateValue()) || new Date();

  switch (preset) {
    case 'YESTERDAY': {
      const yesterday = addDays(today, -1);
      return { startDate: dateValue(yesterday), endDate: dateValue(yesterday) };
    }
    case 'LAST_7_DAYS':
      return { startDate: dateValue(addDays(today, -6)), endDate: dateValue(today) };
    case 'LAST_30_DAYS':
      return { startDate: dateValue(addDays(today, -29)), endDate: dateValue(today) };
    case 'THIS_MONTH':
      return { startDate: dateValue(startOfMonth(today)), endDate: dateValue(today) };
    case 'LAST_MONTH': {
      const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12, 0, 0, 0);
      return {
        startDate: dateValue(startOfMonth(previousMonth)),
        endDate: dateValue(endOfMonth(previousMonth)),
      };
    }
    case 'THIS_YEAR':
      return { startDate: `${today.getFullYear()}-01-01`, endDate: dateValue(today) };
    case 'CUSTOM':
      return {
        startDate: E.startDate?.value || localDateValue(),
        endDate: E.endDate?.value || localDateValue(),
      };
    case 'TODAY':
    default: {
      const value = dateValue(today);
      return { startDate: value, endDate: value };
    }
  }
}

function applyPresetRange({ loadAfter = false } = {}) {
  const range = presetRange();
  E.startDate.value = range.startDate;
  E.endDate.value = range.endDate;
  updateRangeText(range.startDate, range.endDate, false);
  if (loadAfter) load();
}

function selectedRange() {
  return {
    startDate: E.startDate.value,
    endDate: E.endDate.value,
  };
}

function validateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) throw new Error('กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุดให้ครบ');
  if (end < start) throw new Error('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น');

  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > 366) throw new Error('ช่วงรายงานต้องไม่เกิน 366 วัน');
}

function formatThaiDate(value) {
  const date = parseDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function updateRangeText(startDate, endDate, applied = false) {
  if (!E.selectedRange) return;
  const prefix = applied ? 'ช่วงข้อมูลที่แสดง' : 'ช่วงข้อมูลที่เลือก';
  E.selectedRange.textContent = startDate === endDate
    ? `${prefix}: ${formatThaiDate(startDate)}`
    : `${prefix}: ${formatThaiDate(startDate)} – ${formatThaiDate(endDate)}`;
  E.selectedRange.dataset.applied = String(applied);
}

function canViewReports(context) {
  return ['report.view', 'reports.view', 'dashboard.view', 'dashboard.branch_view']
    .some((permission) => hasPermission(context, permission));
}

function canExportReports(context) {
  return ['report.export', 'reports.export']
    .some((permission) => hasPermission(context, permission));
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

function legacyCandidateForRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return null;

  if (startDate === endDate) {
    return { period: 'DAY', anchorDate: startDate };
  }

  const sameMonth = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth();
  if (sameMonth
    && start.getDate() === 1
    && end.getDate() === endOfMonth(end).getDate()) {
    return { period: 'MONTH', anchorDate: startDate };
  }

  if (start.getMonth() === 0 && start.getDate() === 1
    && end.getMonth() === 11 && end.getDate() === 31
    && start.getFullYear() === end.getFullYear()) {
    return { period: 'YEAR', anchorDate: startDate };
  }

  return null;
}

async function fetchReport(startDate, endDate) {
  const branchId = state.context?.branch_id || null;
  const errors = [];
  const candidates = [
    {
      source: 'Reports Discount RPC v5.16.1',
      rpc: 'get_reports_range_v5_16_1',
      args: {
        p_start_date: startDate,
        p_end_date: endDate,
        p_branch_id: branchId,
        p_limit: 500,
      },
    },
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

  const legacy = legacyCandidateForRange(startDate, endDate);
  if (legacy) {
    candidates.push({
      source: 'Reports Legacy RPC v2.1',
      rpc: 'get_sales_control_dashboard_v2_1',
      args: {
        p_period: legacy.period,
        p_anchor_date: legacy.anchorDate,
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

  const params = new URLSearchParams(location.search);
  const deepStart = String(params.get('start') || '');
  const deepEnd = String(params.get('end') || '');
  const deepBranch = String(params.get('branch') || '');
  if (deepBranch && (hasPermission(state.context, 'dashboard.branch_view') || hasPermission(state.context, 'report.view') || hasPermission(state.context, 'reports.view'))) state.context.branch_id = deepBranch;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deepStart) && /^\d{4}-\d{2}-\d{2}$/.test(deepEnd)) {
    E.period.value = 'CUSTOM';
    E.startDate.value = deepStart;
    E.endDate.value = deepEnd;
    updateRangeText(deepStart, deepEnd, false);
  } else {
    E.period.value = 'TODAY';
    applyPresetRange();
  }
  await load();
  const focus = params.get('focus');
  const target = focus === 'bills' ? document.querySelector('.report-list-card') : document.querySelector('#stats');
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    updateRangeText(startDate, endDate, false);
    if (E.source) E.source.textContent = 'กำลังเชื่อมต่อ...';

    const result = await fetchReport(startDate, endDate);
    if (requestId !== state.requestId) return;

    state.payload = result.payload;
    state.source = result.source;
    state.appliedRange = { startDate, endDate };
    render(result.payload);
    updateRangeText(startDate, endDate, true);

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
    console.error('[TKN Reports v5.16.1]', error);
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


function itemDiscountAmount(item) {
  return Number(item?.discount_total ?? item?.item_discount_amount ?? 0) || 0;
}

function hasDiscount(item) {
  return itemDiscountAmount(item) > 0.0001;
}

function conditionCode(item) {
  const raw = String(item?.condition_code || '').trim().toUpperCase();
  if (raw) return raw;
  const label = String(item?.condition_label || '').trim();
  return ({
    'แกะซีล': 'OPENED', 'กล่องบุบ': 'DENTED_BOX', 'มีตำหนิ': 'DEFECT',
    'ชำรุด': 'DAMAGED', 'อุปกรณ์ไม่ครบ': 'INCOMPLETE', 'เคลียร์สต็อก': 'CLEARANCE',
  })[label] || '';
}

function conditionLabel(item) {
  const provided = String(item?.condition_label || '').trim();
  if (provided) return provided;
  return ({
    OPENED: 'แกะซีล', DENTED_BOX: 'กล่องบุบ', DEFECT: 'มีตำหนิ',
    DAMAGED: 'ชำรุด', INCOMPLETE: 'อุปกรณ์ไม่ครบ', CLEARANCE: 'เคลียร์สต็อก',
    OTHER: 'อื่น ๆ',
  })[conditionCode(item)] || (hasDiscount(item) ? 'มีส่วนลด' : 'ปกติ');
}

function discountTypeLabel(type) {
  return ({
    PERCENT: 'ลดเป็นเปอร์เซ็นต์',
    AMOUNT: 'ลดเป็นบาทต่อชิ้น',
    NET_PRICE: 'กำหนดราคาสุทธิต่อชิ้น',
  })[String(type || '').trim().toUpperCase()] || 'ไม่ระบุรูปแบบ';
}

function itemTone(item) {
  if (item?.below_cost === true || String(item?.below_cost).toLowerCase() === 'true') return 'danger';
  const code = conditionCode(item);
  if (code === 'DAMAGED') return 'danger';
  if (['DEFECT', 'INCOMPLETE', 'OTHER'].includes(code)) return 'attention';
  if (['OPENED', 'DENTED_BOX', 'CLEARANCE'].includes(code)) return 'warning';
  if (hasDiscount(item)) return 'info';
  return 'neutral';
}

const TONE_RANK = { neutral: 0, info: 1, warning: 2, attention: 3, danger: 4 };

function billDiscountInfo(billId) {
  const items = state.items.filter((item) => String(item.sale_id) === String(billId) && hasDiscount(item));
  const tone = items.reduce((current, item) => (
    TONE_RANK[itemTone(item)] > TONE_RANK[current] ? itemTone(item) : current
  ), 'neutral');
  return {
    items,
    tone,
    total: items.reduce((sum, item) => sum + itemDiscountAmount(item), 0),
    belowCostCount: items.filter((item) => itemTone(item) === 'danger' && item?.below_cost).length,
  };
}

function discountTypeValue(item) {
  const type = String(item?.discount_type || '').toUpperCase();
  const value = Number(item?.discount_input_value);
  if (type === 'PERCENT' && Number.isFinite(value)) return `${value.toLocaleString('th-TH')}%`;
  if (type === 'NET_PRICE' && Number.isFinite(value)) return `${money(value)} / ชิ้น`;
  if (type === 'AMOUNT' && Number.isFinite(value)) return `${money(value)} / ชิ้น`;
  return `${money(Number(item?.discount_per_unit || 0))} / ชิ้น`;
}

function detailField(label, value, { wide = false, className = '' } = {}) {
  return `<div class="discount-detail-field${wide ? ' discount-detail-field--wide' : ''}">
    <span>${escapeHtml(label)}</span>
    <strong class="${escapeHtml(className)}">${value}</strong>
  </div>`;
}

function openDiscountDetail(item) {
  if (!item || !E.discountDialog || !E.discountContent) return;
  const tone = itemTone(item);
  const discount = itemDiscountAmount(item);
  const perUnit = Number(item.discount_per_unit || 0);
  const original = Number(item.unit_price || 0);
  const effective = Number.isFinite(Number(item.effective_unit_price))
    ? Number(item.effective_unit_price)
    : Math.max(original - perUnit, 0);
  const cost = Number(item.cost_price);
  const profit = Number.isFinite(cost) ? effective - cost : null;
  const qty = Number(item.discount_quantity || 0);
  const approver = item.approved_by_name || item.approved_by_code || '-';
  const recordedBy = item.recorded_by_name || '-';
  const hasSnapshot = Boolean(
    item.condition_label || item.condition_code || item.discount_reason
    || item.discount_type || item.discount_notes || item.recorded_by_name
  );

  E.discountDialog.dataset.tone = tone;
  E.discountTitle.textContent = `${item.product_name || 'สินค้า'} · ${item.product_code || '-'}`;
  E.discountContent.innerHTML = `
    <section class="discount-status-banner" data-tone="${tone}">
      <div>
        <h3>${escapeHtml(conditionLabel(item))}</h3>
        <p>${escapeHtml(item.discount_reason || 'ไม่ระบุเหตุผลส่วนลด')}</p>
      </div>
      <div class="discount-status-amount">ลดรวม ${money(discount)}</div>
    </section>
    <section class="discount-detail-grid">
      ${detailField('รูปแบบส่วนลด', escapeHtml(discountTypeLabel(item.discount_type)))}
      ${detailField('ค่าที่กรอก', escapeHtml(discountTypeValue(item)))}
      ${detailField('จำนวนที่ลดราคา', `${qty.toLocaleString('th-TH')} ชิ้น จากขาย ${Number(item.sold_quantity || 0).toLocaleString('th-TH')} ชิ้น`)}
      ${detailField('ราคาปกติต่อชิ้น', money(original))}
      ${detailField('ส่วนลดต่อชิ้น', money(perUnit))}
      ${detailField('ราคาหลังลดต่อชิ้น', money(effective))}
      ${detailField('ต้นทุนต่อชิ้น', Number.isFinite(cost) ? money(cost) : '-')}
      ${detailField('กำไรหลังลดต่อชิ้น', profit === null ? '-' : money(profit), {
        className: profit !== null && profit < 0 ? 'discount-profit--negative' : 'discount-profit--positive',
      })}
      ${detailField('ขายต่ำกว่าทุน', item?.below_cost === true || String(item?.below_cost).toLowerCase() === 'true' ? 'ใช่ — ต้องตรวจผู้อนุมัติ' : 'ไม่ใช่')}
      ${detailField('ผู้ทำรายการ', escapeHtml(recordedBy))}
      ${detailField('ผู้อนุมัติ', escapeHtml(approver))}
      ${detailField('เวลาบันทึกรายละเอียด', item.audit_created_at ? dateTime(item.audit_created_at) : '-')}
      ${detailField('หมายเหตุ', escapeHtml(item.discount_notes || '-'), { wide: true })}
    </section>
    ${hasSnapshot ? '' : '<p class="discount-legacy-note">รายการนี้มีส่วนลด แต่เป็นข้อมูลบิลรุ่นเก่าที่ไม่ได้บันทึกสภาพ เหตุผล หรือผู้อนุมัติไว้ครบ ระบบจึงแสดงได้เฉพาะยอดส่วนลดที่มีอยู่</p>'}
  `;

  if (typeof E.discountDialog.showModal === 'function') E.discountDialog.showModal();
  else E.discountDialog.setAttribute('open', '');
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
    ['บิลมีส่วนลด', new Set(state.items.filter(hasDiscount).map((item) => String(item.sale_id))).size.toLocaleString('th-TH')],
    ['ยอดส่วนลดสินค้า', money(state.items.filter(hasDiscount).reduce((sum, item) => sum + itemDiscountAmount(item), 0))],
    ['รายการต่ำกว่าทุน', state.items.filter((item) => hasDiscount(item) && (item?.below_cost === true || String(item?.below_cost).toLowerCase() === 'true')).length.toLocaleString('th-TH')],
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
        <thead><tr><th>รหัส</th><th>สินค้า</th><th>ขาย</th><th>คืนแล้ว</th><th>ราคา</th><th>รวม</th><th>ตรวจสอบ</th></tr></thead>
        <tbody>
          ${items.map((item, index) => {
            const discount = itemDiscountAmount(item);
            const tone = itemTone(item);
            const condition = conditionLabel(item);
            return `
              <tr class="${hasDiscount(item) ? `report-item-row--${tone}` : ''}">
                <td>${escapeHtml(item.product_code || '-')}</td>
                <td><div class="report-item-name">
                  <strong>${escapeHtml(item.product_name || '-')}</strong>
                  ${hasDiscount(item) ? `<div class="report-item-badges">
                    <span class="report-item-badge report-item-badge--discount">ลด ${money(discount)}</span>
                    <span class="report-item-badge report-item-badge--${tone}">${escapeHtml(condition)}</span>
                    ${(item?.below_cost === true || String(item?.below_cost).toLowerCase() === 'true') ? '<span class="report-item-badge report-item-badge--danger">ต่ำกว่าทุน</span>' : ''}
                  </div>` : ''}
                </div></td>
                <td>${Number(item.sold_quantity || 0).toLocaleString('th-TH')}</td>
                <td>${Number(item.returned_quantity || 0).toLocaleString('th-TH')}</td>
                <td>${money(item.unit_price)}</td>
                <td>${money(item.line_amount)}</td>
                <td>${hasDiscount(item)
                  ? `<button class="button secondary discount-detail-open" data-item-index="${index}" type="button">ดูรายละเอียด</button>`
                  : '<span class="report-item-badge">ราคาปกติ</span>'}</td>
              </tr>`;
          }).join('') || '<tr><td colspan="7">ไม่พบสินค้าในบิล</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  E.content.querySelectorAll('.discount-detail-open').forEach((button) => {
    button.addEventListener('click', () => openDiscountDetail(items[Number(button.dataset.itemIndex)]));
  });
  if (typeof E.dialog.showModal === 'function') E.dialog.showModal();
  else E.dialog.setAttribute('open', '');
}

function exportCsv() {
  if (!state.bills.length) {
    setMessage('ไม่มีข้อมูลสำหรับ Export', 'empty');
    return;
  }

  const rows = [
    ['วันที่', 'เลขบิล', 'ชำระ', 'ยอดสุทธิ', 'สถานะ', 'ยอดส่วนลดสินค้า', 'จำนวนรายการมีส่วนลด', 'สภาพ/เหตุผล'],
    ...state.bills.map((bill) => {
      const info = billDiscountInfo(bill.id);
      const descriptions = info.items.map((item) => (
        `${item.product_code || '-'}: ${conditionLabel(item)} / ${item.discount_reason || 'ไม่ระบุเหตุผล'}`
      )).join(' | ');
      return [
        dateTime(bill.created_at),
        bill.sale_no,
        paymentLabel(bill.payment_method),
        bill.net_total,
        statusLabel(bill.status),
        info.total,
        info.items.length,
        descriptions,
      ];
    }),
  ];

  const csv = `\ufeff${rows.map((row) => row.map((value) => (
    `"${String(value ?? '').replaceAll('"', '""')}"`
  )).join(',')).join('\n')}`;

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const range = state.appliedRange || selectedRange();
  link.href = url;
  link.download = `sales-report-${range.startDate}-to-${range.endDate}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderTableOnly() {
  E.rows.innerHTML = state.bills.map((bill) => {
    const info = billDiscountInfo(bill.id);
    const hasBillDiscount = info.items.length > 0;
    return `
      <tr class="${hasBillDiscount ? `report-bill-row--${info.tone}` : ''}">
        <td>${dateTime(bill.created_at)}</td>
        <td><strong>${escapeHtml(bill.sale_no || '-')}</strong>
          ${hasBillDiscount ? `<span class="report-discount-summary report-discount-summary--${info.tone}">${info.items.length.toLocaleString('th-TH')} รายการ · ลด ${money(info.total)}</span>` : ''}
        </td>
        <td>${escapeHtml(paymentLabel(bill.payment_method))}</td>
        <td>${money(bill.net_total)}</td>
        <td>${statusBadge(bill.status)}</td>
        <td><button class="button secondary detail" data-id="${escapeHtml(bill.id)}" type="button">รายละเอียด</button></td>
      </tr>`;
  }).join('') || '<tr><td colspan="6">ไม่พบข้อมูลตามตัวกรอง</td></tr>';

  E.rows.querySelectorAll('.detail').forEach((button) => {
    button.addEventListener('click', () => openBill(button.dataset.id));
  });
}

function markCustomRange() {
  if (E.period.value !== 'CUSTOM') E.period.value = 'CUSTOM';
  updateRangeText(E.startDate.value, E.endDate.value, false);
}

E.paymentFilter?.addEventListener('change', () => {
  applyPaymentFilter();
  renderStats();
  renderTableOnly();
});

E.period?.addEventListener('change', () => {
  applyPresetRange({ loadAfter: true });
});
E.startDate?.addEventListener('change', () => {
  markCustomRange();
  if (E.endDate.value && E.startDate.value > E.endDate.value) E.endDate.value = E.startDate.value;
  updateRangeText(E.startDate.value, E.endDate.value, false);
});
E.endDate?.addEventListener('change', () => {
  markCustomRange();
  if (E.startDate.value && E.endDate.value < E.startDate.value) E.startDate.value = E.endDate.value;
  updateRangeText(E.startDate.value, E.endDate.value, false);
});
E.load?.addEventListener('click', load);
E.csv?.addEventListener('click', exportCsv);
E.print?.addEventListener('click', () => window.print());
E.close?.addEventListener('click', () => {
  if (typeof E.dialog.close === 'function') E.dialog.close();
  else E.dialog.removeAttribute('open');
});
E.discountClose?.addEventListener('click', () => {
  if (typeof E.discountDialog.close === 'function') E.discountDialog.close();
  else E.discountDialog.removeAttribute('open');
});

init().catch((error) => {
  E.rows.innerHTML = '<tr><td colspan="6" class="report-error-cell">เปิดหน้ารายงานไม่สำเร็จ</td></tr>';
  setMessage(error.message || 'เปิดหน้ารายงานไม่สำเร็จ', 'error');
  setDiagnostics([{ source: 'เริ่มต้นระบบ', message: error.message || 'Unknown error' }]);
  console.error('[TKN Reports init v5.16.1]', error);
});
