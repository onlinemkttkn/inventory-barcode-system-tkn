import { supabaseClient } from './supabase-client.js';
import {
  loadAccessContext, guardPage, hasPermission
} from './access-control.js';

const E = {
  period: document.getElementById('period'),
  paymentFilter: document.getElementById('paymentFilter'),
  branch: document.getElementById('branchFilter'),
  branchField: document.getElementById('branchField'),
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
  dialog: document.getElementById('dialog'),
  title: document.getElementById('dialogTitle'),
  content: document.getElementById('dialogContent'),
  close: document.getElementById('close')
};

let state = { bills: [], allBills: [], items: [], context: null };

const money = value => new Intl.NumberFormat('th-TH', {
  style: 'currency', currency: 'THB'
}).format(Number(value || 0));

const dateTime = value =>
  new Date(value).toLocaleString('th-TH');

const escapeHtml = value => String(value ?? '').replace(
  /[&<>"']/g,
  char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;'
  })[char]
);

function toLocalIsoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function today() {
  return toLocalIsoDate();
}

function branchLabel(branch) {
  const code = String(branch?.code || '').trim();
  const name = String(branch?.name || '').trim();
  if (code && name) return `${code} — ${name}`;
  return code || name || 'สาขาประจำ';
}

async function fetchAccessibleBranches() {
  const rpcResult = await supabaseClient.rpc(
    'report_list_accessible_branches'
  );

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return {
      rows: rpcResult.data,
      source: 'secure_rpc',
      error: null
    };
  }

  // Fallback for the short period before the SQL patch is installed.
  const directResult = await supabaseClient
    .from('branches')
    .select('id,code,name,sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  return {
    rows: Array.isArray(directResult.data) ? directResult.data : [],
    source: 'direct_query',
    error: directResult.error || rpcResult.error || null
  };
}

async function setupBranchFilter() {
  if (!E.branch) return;

  E.branch.disabled = true;
  E.branch.innerHTML =
    '<option value="">กำลังโหลดสาขา...</option>';

  const canViewAll = hasPermission(
    state.context,
    'report.all_branches'
  );

  const assignedBranchId = state.context?.branch_id || '';
  const result = await fetchAccessibleBranches();
  const rows = result.rows;

  if (canViewAll) {
    E.branch.innerHTML =
      '<option value="">ทุกสาขา</option>' +
      rows.map(branch => `
        <option value="${escapeHtml(branch.id)}">
          ${escapeHtml(branchLabel(branch))}
        </option>
      `).join('');

    E.branch.value = '';
    E.branch.disabled = false;

    if (result.error) {
      E.message.textContent =
        `โหลดรายชื่อสาขาไม่ครบ: ${result.error.message}`;
    }
    return;
  }

  const assigned = rows.find(
    branch => branch.id === assignedBranchId
  );

  if (!assignedBranchId) {
    E.branch.innerHTML =
      '<option value="">ยังไม่ได้กำหนดสาขาประจำ</option>';
    E.branch.disabled = true;
    E.message.textContent =
      'บัญชีนี้ยังไม่ได้กำหนดสาขาประจำ จึงไม่สามารถโหลดรายงานได้';
    return;
  }

  E.branch.innerHTML = `
    <option value="${escapeHtml(assignedBranchId)}">
      ${escapeHtml(branchLabel(assigned))}
    </option>
  `;
  E.branch.value = assignedBranchId;
  E.branch.disabled = true;

  if (result.error) {
    console.warn(
      'โหลดรายชื่อสาขาไม่สำเร็จ:',
      result.error.message
    );
  }
}

function selectedBranchId() {
  return E.branch?.value || null;
}

function updatePeriodUI() {
  const custom = E.period.value === 'RANGE';

  E.anchorField.hidden = custom;
  E.startField.hidden = !custom;
  E.endField.hidden = !custom;

  if (custom) {
    if (!E.startDate.value) E.startDate.value = today();
    if (!E.endDate.value) E.endDate.value = today();
  }
}

function validateRange() {
  if (E.period.value !== 'RANGE') return true;

  if (!E.startDate.value || !E.endDate.value) {
    E.message.textContent =
      'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด';
    return false;
  }

  if (E.endDate.value < E.startDate.value) {
    E.message.textContent =
      'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น';
    return false;
  }

  return true;
}

async function init() {
  state.context = await loadAccessContext(supabaseClient);
  if (!guardPage(state.context, 'report.view')) return;

  E.csv.hidden = !hasPermission(state.context, 'report.export');

  const canSearchBills = hasPermission(state.context, 'pos.search_bill');
  if (E.billSearchButton) {
    E.billSearchButton.hidden = !canSearchBills;
    E.billSearchButton.setAttribute('aria-hidden', String(!canSearchBills));
    E.billSearchButton.tabIndex = canSearchBills ? 0 : -1;
  }
  E.anchor.value = today();
  E.startDate.value = today();
  E.endDate.value = today();
  updatePeriodUI();

  try {
    await setupBranchFilter();
  } catch (error) {
    E.branch.innerHTML =
      '<option value="">โหลดสาขาไม่สำเร็จ</option>';
    E.branch.disabled = true;
    E.message.textContent =
      `โหลดสาขาไม่สำเร็จ: ${error.message}`;
    throw error;
  }

  await load();
}

async function load() {
  if (!validateRange()) return;

  E.load.disabled = true;
  E.message.textContent = 'กำลังโหลดรายงาน...';

  const custom = E.period.value === 'RANGE';
  const rpc = custom
    ? 'get_sales_control_dashboard_range_v3_4'
    : 'get_sales_control_dashboard_v2_1';

  const args = custom
    ? {
        p_start_date: E.startDate.value,
        p_end_date: E.endDate.value,
        p_branch_id: selectedBranchId(),
        p_limit: 500
      }
    : {
        p_period: E.period.value,
        p_anchor_date: E.anchor.value,
        p_branch_id: selectedBranchId(),
        p_limit: 500
      };

  const { data, error } = await supabaseClient.rpc(rpc, args);
  E.load.disabled = false;

  if (error) {
    E.message.textContent = error.message;
    return;
  }

  render(data);
  E.message.textContent = 'อัปเดตข้อมูลแล้ว';
}

function paymentGroup(method){
  const raw = String(method || '').trim();
  const value = raw.toUpperCase().replace(/[\s-]+/g, '_');

  if (value === 'CASH' || raw === 'เงินสด') return 'CASH';
  if (['QR', 'PROMPTPAY', 'QR_CODE'].includes(value) || raw === 'พร้อมเพย์') return 'QR';
  if (
    ['TRANSFER', 'BANK_TRANSFER', 'BANK', 'WIRE_TRANSFER', 'MOBILE_BANKING'].includes(value) ||
    ['เงินโอน', 'โอน', 'โอนเงิน'].includes(raw)
  ) return 'TRANSFER';
  if (['CARD', 'CREDIT_CARD', 'DEBIT_CARD'].includes(value) || raw === 'บัตร') return 'CARD';
  if (['VOUCHER', 'COUPON'].includes(value)) return 'VOUCHER';
  return 'OTHER';
}

function paymentLabel(method){
  return ({
    CASH: 'เงินสด',
    QR: 'QR',
    TRANSFER: 'เงินโอน',
    CARD: 'บัตร',
    VOUCHER: 'Voucher',
    OTHER: 'อื่น ๆ'
  })[paymentGroup(method)] || String(method || '-');
}

// แสดงสถานะบิลเป็นภาษาไทย โดยยังคงค่าจริงจากฐานข้อมูลไว้เหมือนเดิม
function normalizeStatus(status) {
  return String(status ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function statusLabel(status) {
  const raw = String(status ?? '').trim();
  if (!raw) return '-';

  // ถ้าฐานข้อมูลส่งข้อความภาษาไทยมาอยู่แล้ว ให้แสดงตามเดิม
  if (/[ก-๙]/.test(raw)) return raw;

  const labels = {
    COMPLETED: 'สำเร็จ',
    COMPLETE: 'สำเร็จ',
    PAID: 'ชำระเงินแล้ว',
    RETURNED: 'คืนสินค้าแล้ว',
    PARTIALLY_RETURNED: 'คืนสินค้าบางส่วน',
    PARTIAL_RETURN: 'คืนสินค้าบางส่วน',
    REFUNDED: 'คืนเงินแล้ว',
    VOIDED: 'ยกเลิกบิล',
    VOID: 'ยกเลิกบิล',
    CANCELLED: 'ยกเลิก',
    CANCELED: 'ยกเลิก',
    PENDING: 'รอดำเนินการ',
    OPEN: 'เปิดอยู่',
    DRAFT: 'แบบร่าง',
    HELD: 'พักบิล',
    ON_HOLD: 'พักบิล',
    UNPAID: 'ยังไม่ชำระเงิน',
    FAILED: 'ไม่สำเร็จ'
  };

  return labels[normalizeStatus(raw)] || raw;
}

function statusTone(status) {
  const key = normalizeStatus(status);

  if (['COMPLETED', 'COMPLETE', 'PAID'].includes(key)) return 'success';
  if (['RETURNED'].includes(key)) return 'returned';
  if (['PARTIALLY_RETURNED', 'PARTIAL_RETURN'].includes(key)) return 'partial';
  if (['REFUNDED'].includes(key)) return 'refunded';
  if (['VOIDED', 'VOID', 'CANCELLED', 'CANCELED', 'FAILED'].includes(key)) return 'danger';
  if (['PENDING', 'UNPAID'].includes(key)) return 'warning';
  if (['OPEN'].includes(key)) return 'info';
  if (['HELD', 'ON_HOLD'].includes(key)) return 'held';
  return 'neutral';
}

function statusBadge(status) {
  const label = escapeHtml(statusLabel(status));
  const tone = statusTone(status);
  const raw = escapeHtml(String(status ?? '').trim() || '-');
  return `<span class="report-status report-status--${tone}" title="สถานะระบบ: ${raw}">${label}</span>`;
}
function applyPaymentFilter(){
  const selected=E.paymentFilter?.value||'ALL';
  state.bills=selected==='ALL'?state.allBills:[...state.allBills].filter(bill=>paymentGroup(bill.payment_method)===selected);
}

function isRevenueBill(bill){
  const status = String(bill?.status || '').toUpperCase();
  return !['VOIDED', 'CANCELLED', 'CANCELED', 'REFUNDED'].includes(status);
}

function paymentBreakdown(bills){
  return (bills || []).reduce((totals, bill) => {
    if (!isRevenueBill(bill)) return totals;
    const group = paymentGroup(bill.payment_method);
    totals[group] += Number(bill.net_total || 0);
    return totals;
  }, { CASH: 0, QR: 0, TRANSFER: 0, CARD: 0, VOUCHER: 0, OTHER: 0 });
}

function render(data) {
  state.allBills = data?.bills || [];
  applyPaymentFilter();
  state.items = data?.items || [];

  const s = data?.summary || {};
  const v = data?.voids || {};
  const r = data?.returns || {};
  const payments = paymentBreakdown(state.allBills);

  const cards = [
    ['จำนวนบิล', Number(s.bill_count || 0).toLocaleString('th-TH')],
    ['รายรับรวม', money(s.gross_revenue)],
    ['เงินสด', money(payments.CASH)],
    ['QR', money(payments.QR)],
    ['เงินโอน', money(payments.TRANSFER)],
    ['บัตร', money(payments.CARD)],
    ['Voucher', money(payments.VOUCHER)],
    ['อื่น ๆ', money(payments.OTHER)],
    ['เฉลี่ยต่อบิล', money(s.average_bill)],
    ['บิลยกเลิก', Number(v.void_count || 0).toLocaleString('th-TH')],
    ['ยอดคืนสินค้า', money(r.return_amount)]
  ];

  E.stats.innerHTML = cards.map(([label, value]) => `
    <article class="stat">
      <span>${label}</span><strong>${value}</strong>
    </article>
  `).join('');

  renderTableOnly();
}

function openBill(id) {
  const bill = state.bills.find(item => item.id === id);
  const items = state.items.filter(item => item.sale_id === id);
  if (!bill) return;

  E.title.textContent = `${bill.sale_no} · ${money(bill.net_total)}`;
  E.content.innerHTML = `
    <div class="bill-meta">
      <p><b>วันที่</b><br>${dateTime(bill.created_at)}</p>
      <p><b>ชำระ</b><br>${escapeHtml(paymentLabel(bill.payment_method))}</p>
      <p><b>สถานะ</b><br>${statusBadge(bill.status)}</p>
      <p><b>ลูกค้า</b><br>${escapeHtml(bill.customer_name || 'Walk-in')}</p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>รหัส</th><th>สินค้า</th><th>ขาย</th>
        <th>คืนแล้ว</th><th>ราคา</th><th>รวม</th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${escapeHtml(item.product_code)}</td>
              <td>${escapeHtml(item.product_name)}</td>
              <td>${item.sold_quantity}</td>
              <td>${item.returned_quantity}</td>
              <td>${money(item.unit_price)}</td>
              <td>${money(item.line_amount)}</td>
            </tr>
          `).join('') || '<tr><td colspan="6">ไม่พบสินค้า</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  E.dialog.showModal();
}

function exportCsv() {
  const rows = [
    ['วันที่', 'เลขบิล', 'ชำระ', 'ยอดสุทธิ', 'สถานะ'],
    ...state.bills.map(bill => [
      dateTime(bill.created_at),
      bill.sale_no,
      paymentLabel(bill.payment_method),
      bill.net_total,
      statusLabel(bill.status)
    ])
  ];

  const csv = '\ufeff' + rows.map(row =>
    row.map(value =>
      `"${String(value ?? '').replaceAll('"', '""')}"`
    ).join(',')
  ).join('\n');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' })
  );
  link.download = `sales-${E.period.value.toLowerCase()}-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}


E.paymentFilter.onchange=()=>{applyPaymentFilter();renderTableOnly();};

function renderTableOnly(){
  E.rows.innerHTML = state.bills.map(bill => `
    <tr><td>${dateTime(bill.created_at)}</td><td><strong>${escapeHtml(bill.sale_no)}</strong></td><td>${escapeHtml(paymentLabel(bill.payment_method))}</td><td>${money(bill.net_total)}</td><td>${statusBadge(bill.status)}</td><td><button class="button secondary detail" data-id="${bill.id}" type="button">รายละเอียด</button></td></tr>`).join('') || '<tr><td colspan="6">ไม่พบข้อมูล</td></tr>';
  E.rows.querySelectorAll('.detail').forEach(button=>{button.onclick=()=>openBill(button.dataset.id)});
}

E.period.onchange = () => {
  updatePeriodUI();
  load();
};

E.anchor.onchange = load;
E.startDate.onchange = load;
E.endDate.onchange = load;
E.load.onclick = load;
E.csv.onclick = exportCsv;
E.print.onclick = () => print();
E.close.onclick = () => E.dialog.close();

E.branch?.addEventListener('change', load);

init().catch(error => {
  E.message.textContent = error.message;
});
