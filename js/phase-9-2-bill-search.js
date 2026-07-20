import { supabaseClient } from './supabase-client.js';
import {
  applyPermissionUI
} from './phase-9-2-permissions.js';

const state = {
  role: sessionStorage.getItem('tkn_user_role') || 'owner',
  bills: [],
  filteredBills: [],
  selectedBill: null,
  loading: false
};

const els = {
  keyword: document.querySelector('#keyword'),
  dateFrom: document.querySelector('#dateFrom'),
  dateTo: document.querySelector('#dateTo'),
  paymentChannel: document.querySelector('#paymentChannel'),
  salesChannel: document.querySelector('#salesChannel'),
  status: document.querySelector('#status'),
  searchButton: document.querySelector('#searchButton'),
  resetButton: document.querySelector('#resetButton'),
  billRows: document.querySelector('#billRows'),
  resultMessage: document.querySelector('#resultMessage'),
  summaryBills: document.querySelector('#summaryBills'),
  summaryTotal: document.querySelector('#summaryTotal'),
  summaryReturns: document.querySelector('#summaryReturns'),
  billDialog: document.querySelector('#billDialog'),
  dialogBillNo: document.querySelector('#dialogBillNo'),
  dialogContent: document.querySelector('#dialogContent'),
  closeDialog: document.querySelector('#closeDialog'),
  reprintButton: document.querySelector('#reprintButton'),
  returnButton: document.querySelector('#returnButton')
};

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB'
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function channelLabel(value) {
  const normalized = String(value || '').toUpperCase();

  const labels = {
    STORE: 'หน้าร้าน',
    ONLINE: 'ออนไลน์',
    LINE: 'LINE OA',
    FACEBOOK: 'Facebook',
    WEBSITE: 'Website',
    MARKETPLACE: 'Marketplace',
    CASH: 'เงินสด',
    QR: 'QR',
    TRANSFER: 'โอน',
    CARD: 'บัตร',
    CREDIT_CARD: 'บัตรเครดิต',
    DEBIT_CARD: 'บัตรเดบิต'
  };

  return labels[normalized] || value || '-';
}

function statusLabel(value) {
  const normalized = String(value || '').toUpperCase();

  const labels = {
    COMPLETED: 'สำเร็จ',
    VOIDED: 'ยกเลิก',
    CANCELLED: 'ยกเลิก',
    RETURNED: 'คืนสินค้า',
    PARTIAL_RETURN: 'คืนบางส่วน',
    DRAFT: 'แบบร่าง'
  };

  return labels[normalized] || value || '-';
}

function setLoading(isLoading) {
  state.loading = isLoading;
  els.searchButton.disabled = isLoading;
  els.resetButton.disabled = isLoading;
  els.searchButton.textContent = isLoading ? 'กำลังค้นหา...' : 'ค้นหา';
}

function buildRpcParams() {
  return {
    p_keyword: els.keyword.value.trim() || null,
    p_date_from: els.dateFrom.value || null,
    p_date_to: els.dateTo.value || null,
    p_payment_method: els.paymentChannel.value || null,
    p_sales_channel: els.salesChannel.value || null,
    p_status: els.status.value || null,
    p_limit: 200
  };
}

async function searchBills() {
  setLoading(true);
  els.resultMessage.textContent = 'กำลังโหลดข้อมูล...';

  try {
    const { data, error } = await supabaseClient.rpc(
      'search_sales_bills_phase_9_2',
      buildRpcParams()
    );

    if (error) throw error;

    state.bills = Array.isArray(data) ? data : [];
    state.filteredBills = [...state.bills];
    render();
  } catch (error) {
    console.error('Search bill error:', error);
    state.bills = [];
    state.filteredBills = [];
    render();
    els.resultMessage.textContent = `โหลดข้อมูลไม่สำเร็จ: ${error.message}`;
  } finally {
    setLoading(false);
  }
}

function render() {
  els.billRows.innerHTML = '';

  if (!state.filteredBills.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td class="empty-row" colspan="8">ไม่พบข้อมูลตามเงื่อนไข</td>';
    els.billRows.append(row);
  } else {
    for (const bill of state.filteredBills) {
      const row = document.createElement('tr');

      row.innerHTML = `
        <td><strong>${escapeHtml(bill.sale_no)}</strong></td>
        <td>${formatDate(bill.created_at)}</td>
        <td>${escapeHtml(bill.customer_name || 'Walk-in')}</td>
        <td>${channelLabel(bill.sales_channel)}</td>
        <td>${channelLabel(bill.payment_method)}</td>
        <td>${formatMoney(bill.net_total)}</td>
        <td>
          <span class="status ${String(bill.status || '').toLowerCase()}">
            ${statusLabel(bill.status)}
          </span>
        </td>
        <td>
          <button class="secondary-button view-bill" type="button"
            data-id="${escapeHtml(bill.id)}">
            ดูรายละเอียด
          </button>
        </td>
      `;

      els.billRows.append(row);
    }
  }

  const total = state.filteredBills.reduce(
    (sum, bill) => sum + Number(bill.net_total || 0),
    0
  );

  const returns = state.filteredBills.filter((bill) =>
    ['RETURNED', 'PARTIAL_RETURN'].includes(
      String(bill.status || '').toUpperCase()
    )
  ).length;

  els.summaryBills.textContent = String(state.filteredBills.length);
  els.summaryTotal.textContent = formatMoney(total);
  els.summaryReturns.textContent = String(returns);
  els.resultMessage.textContent = `พบ ${state.filteredBills.length} บิล`;

  document.querySelectorAll('.view-bill').forEach((button) => {
    button.addEventListener('click', () => openBill(button.dataset.id));
  });
}

async function openBill(id) {
  const bill = state.bills.find((item) => String(item.id) === String(id));
  if (!bill) return;

  state.selectedBill = bill;
  els.dialogBillNo.textContent = bill.sale_no || '-';
  els.dialogContent.innerHTML = '<p>กำลังโหลดรายละเอียด...</p>';
  els.billDialog.showModal();

  try {
    const { data: items, error } = await supabaseClient
      .from('sale_items')
      .select(`
        id,
        sale_id,
        product_id,
        quantity,
        unit_price,
        discount_amount,
        line_total,
        product_code_snapshot,
        barcode_snapshot,
        product_name_snapshot,
        created_at
      `)
      .eq('sale_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    els.dialogContent.innerHTML = `
      <div class="bill-meta">
        <p><strong>วันที่:</strong><br>${formatDate(bill.created_at)}</p>
        <p><strong>ลูกค้า:</strong><br>${escapeHtml(bill.customer_name || 'Walk-in')}</p>
        <p><strong>เบอร์โทร:</strong><br>${escapeHtml(bill.customer_phone || '-')}</p>
        <p><strong>ชำระเงิน:</strong><br>${channelLabel(bill.payment_method)}</p>
      </div>

      <ul class="item-list">
        ${(items || []).map((item) => `
          <li>
            <span>
              ${escapeHtml(item.product_name_snapshot || '-')}
              <br>
              <small>
                ${escapeHtml(item.product_code_snapshot || '-')}
                ·
                ${escapeHtml(item.barcode_snapshot || '-')}
              </small>
            </span>
            <strong>
              ${Number(item.quantity || 0)}
              ×
              ${formatMoney(item.unit_price)}
              =
              ${formatMoney(item.line_total)}
            </strong>
          </li>
        `).join('')}
      </ul>

      <p><strong>ยอดสุทธิ: ${formatMoney(bill.net_total)}</strong></p>
    `;

    applyPermissionUI({
      role: state.role,
      root: els.billDialog
    });
  } catch (error) {
    console.error('Load bill detail error:', error);
    els.dialogContent.innerHTML = `
      <p>โหลดรายละเอียดบิลไม่สำเร็จ: ${escapeHtml(error.message)}</p>
    `;
  }
}

function resetFilters() {
  [
    els.keyword,
    els.dateFrom,
    els.dateTo,
    els.paymentChannel,
    els.salesChannel,
    els.status
  ].forEach((element) => {
    element.value = '';
  });

  searchBills();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

els.searchButton.addEventListener('click', searchBills);
els.resetButton.addEventListener('click', resetFilters);

els.keyword.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') searchBills();
});

els.closeDialog.addEventListener('click', () => {
  els.billDialog.close();
});

els.reprintButton.addEventListener('click', () => {
  if (!state.selectedBill) return;
  window.print();
});

els.returnButton.addEventListener('click', () => {
  if (!state.selectedBill) return;

  const saleNo = state.selectedBill.sale_no || state.selectedBill.id;

  window.location.href =
    `./sales-return.html?sale_id=${encodeURIComponent(state.selectedBill.id)}`
    + `&sale_no=${encodeURIComponent(saleNo)}`;
});

applyPermissionUI({
  role: state.role,
  root: document
});

searchBills();
