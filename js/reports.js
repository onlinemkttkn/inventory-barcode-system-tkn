import { supabaseClient } from './supabase-client.js';
import {
  loadAccessContext, guardPage, hasPermission
} from './access-control.js';

const E = {
  period: document.getElementById('period'),
  anchor: document.getElementById('anchor'),
  anchorField: document.getElementById('anchorField'),
  startDate: document.getElementById('startDate'),
  endDate: document.getElementById('endDate'),
  startField: document.getElementById('startField'),
  endField: document.getElementById('endField'),
  load: document.getElementById('load'),
  csv: document.getElementById('csv'),
  print: document.getElementById('print'),
  logout: document.getElementById('logoutBtn'),
  stats: document.getElementById('stats'),
  rows: document.getElementById('rows'),
  message: document.getElementById('message'),
  dialog: document.getElementById('dialog'),
  title: document.getElementById('dialogTitle'),
  content: document.getElementById('dialogContent'),
  close: document.getElementById('close')
};

let state = { bills: [], items: [], context: null };

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function updatePeriodUI() {
  const custom = E.period.value === 'RANGE';
  E.anchorField.hidden = custom;
  E.startField.hidden = !custom;
  E.endField.hidden = !custom;
}

async function init() {
  state.context = await loadAccessContext(supabaseClient);
  if (!guardPage(state.context, 'report.view')) return;

  E.csv.hidden = !hasPermission(state.context, 'report.export');
  E.anchor.value = today();
  E.startDate.value = today();
  E.endDate.value = today();
  updatePeriodUI();
  await load();
}

async function load() {
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
        p_branch_id: state.context.branch_id || null,
        p_limit: 500
      }
    : {
        p_period: E.period.value,
        p_anchor_date: E.anchor.value,
        p_branch_id: state.context.branch_id || null,
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

function render(data) {
  state.bills = data?.bills || [];
  state.items = data?.items || [];

  const s = data?.summary || {};
  const v = data?.voids || {};
  const r = data?.returns || {};

  const cards = [
    ['จำนวนบิล', Number(s.bill_count || 0).toLocaleString('th-TH')],
    ['รายรับรวม', money(s.gross_revenue)],
    ['เงินสด', money(s.cash_revenue)],
    ['QR / โอน', money(s.qr_transfer_revenue)],
    ['บัตร', money(s.card_revenue)],
    ['เฉลี่ยต่อบิล', money(s.average_bill)],
    ['บิลยกเลิก', Number(v.void_count || 0).toLocaleString('th-TH')],
    ['ยอดคืนสินค้า', money(r.return_amount)]
  ];

  E.stats.innerHTML = cards.map(([label, value]) => `
    <article class="stat">
      <span>${label}</span><strong>${value}</strong>
    </article>
  `).join('');

  E.rows.innerHTML = state.bills.map(bill => `
    <tr>
      <td>${dateTime(bill.created_at)}</td>
      <td><strong>${escapeHtml(bill.sale_no)}</strong></td>
      <td>${escapeHtml(bill.payment_method || '-')}</td>
      <td>${money(bill.net_total)}</td>
      <td>${escapeHtml(bill.status || '-')}</td>
      <td>
        <button class="button secondary detail"
          data-id="${bill.id}" type="button">รายละเอียด</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">ไม่พบข้อมูล</td></tr>';

  E.rows.querySelectorAll('.detail').forEach(button => {
    button.onclick = () => openBill(button.dataset.id);
  });
}

function openBill(id) {
  const bill = state.bills.find(item => item.id === id);
  const items = state.items.filter(item => item.sale_id === id);
  if (!bill) return;

  E.title.textContent = `${bill.sale_no} · ${money(bill.net_total)}`;
  E.content.innerHTML = `
    <div class="bill-meta">
      <p><b>วันที่</b><br>${dateTime(bill.created_at)}</p>
      <p><b>ชำระ</b><br>${escapeHtml(bill.payment_method || '-')}</p>
      <p><b>สถานะ</b><br>${escapeHtml(bill.status || '-')}</p>
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
      bill.payment_method,
      bill.net_total,
      bill.status
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

async function logout() {
  await supabaseClient.auth.signOut();
  sessionStorage.clear();
  location.replace('./index.html');
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
E.logout.onclick = logout;

init().catch(error => {
  E.message.textContent = error.message;
});
