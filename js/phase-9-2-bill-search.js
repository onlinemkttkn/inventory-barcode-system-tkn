import {
  applyPermissionUI
} from './phase-9-2-permissions.js';

const state = {
  role: sessionStorage.getItem('tkn_user_role') || 'owner',
  bills: [],
  filteredBills: [],
  selectedBill: null
};

// Demo fallback. Replace with Supabase query after schema validation.
const demoBills = [
  {
    id: 'INV20260720001',
    createdAt: '2026-07-20T08:35:00+07:00',
    customer: 'Walk-in',
    salesChannel: 'store',
    paymentChannel: 'cash',
    total: 550,
    status: 'completed',
    cashier: 'พนักงาน 01',
    items: [
      { sku: 'TKN-001', barcode: '885123400001', name: 'สาหร่ายทอดกรอบ', qty: 2, price: 150 },
      { sku: 'TKN-002', barcode: '885123400002', name: 'หมึกกรอบ', qty: 1, price: 250 }
    ]
  },
  {
    id: 'INV20260719018',
    createdAt: '2026-07-19T15:15:00+07:00',
    customer: 'คุณสมชาย',
    salesChannel: 'line',
    paymentChannel: 'transfer',
    total: 1250,
    status: 'completed',
    cashier: 'ฝ่ายขายออนไลน์',
    items: [
      { sku: 'TKN-010', barcode: '885123400010', name: 'ชุดของฝาก A', qty: 1, price: 1250 }
    ]
  },
  {
    id: 'INV20260718007',
    createdAt: '2026-07-18T11:20:00+07:00',
    customer: 'Walk-in',
    salesChannel: 'store',
    paymentChannel: 'qr',
    total: 300,
    status: 'returned',
    cashier: 'พนักงาน 02',
    items: [
      { sku: 'TKN-005', barcode: '885123400005', name: 'ข้าวแต๋น', qty: 2, price: 150 }
    ]
  }
];

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
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function channelLabel(value) {
  const labels = {
    store: 'หน้าร้าน',
    line: 'LINE OA',
    facebook: 'Facebook',
    website: 'Website',
    marketplace: 'Marketplace',
    cash: 'เงินสด',
    qr: 'QR',
    transfer: 'โอน',
    card: 'บัตร'
  };
  return labels[value] || value;
}

function statusLabel(value) {
  const labels = {
    completed: 'สำเร็จ',
    voided: 'ยกเลิก',
    returned: 'คืนสินค้า'
  };
  return labels[value] || value;
}

function matchesKeyword(bill, keyword) {
  if (!keyword) return true;
  const needle = keyword.toLowerCase();

  return [
    bill.id,
    bill.customer,
    bill.cashier,
    ...bill.items.flatMap(item => [
      item.sku,
      item.barcode,
      item.name
    ])
  ].some(value => String(value || '').toLowerCase().includes(needle));
}

function applyFilters() {
  const keyword = els.keyword.value.trim();
  const from = els.dateFrom.value ? new Date(`${els.dateFrom.value}T00:00:00`) : null;
  const to = els.dateTo.value ? new Date(`${els.dateTo.value}T23:59:59`) : null;

  state.filteredBills = state.bills.filter(bill => {
    const billDate = new Date(bill.createdAt);

    return matchesKeyword(bill, keyword)
      && (!from || billDate >= from)
      && (!to || billDate <= to)
      && (!els.paymentChannel.value || bill.paymentChannel === els.paymentChannel.value)
      && (!els.salesChannel.value || bill.salesChannel === els.salesChannel.value)
      && (!els.status.value || bill.status === els.status.value);
  });

  render();
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
        <td><strong>${bill.id}</strong></td>
        <td>${formatDate(bill.createdAt)}</td>
        <td>${bill.customer || 'Walk-in'}</td>
        <td>${channelLabel(bill.salesChannel)}</td>
        <td>${channelLabel(bill.paymentChannel)}</td>
        <td>${formatMoney(bill.total)}</td>
        <td><span class="status ${bill.status}">${statusLabel(bill.status)}</span></td>
        <td>
          <button class="secondary-button view-bill" type="button"
            data-id="${bill.id}">ดูรายละเอียด</button>
        </td>
      `;
      els.billRows.append(row);
    }
  }

  const total = state.filteredBills.reduce((sum, bill) => sum + Number(bill.total || 0), 0);
  const returns = state.filteredBills.filter(bill => bill.status === 'returned').length;

  els.summaryBills.textContent = String(state.filteredBills.length);
  els.summaryTotal.textContent = formatMoney(total);
  els.summaryReturns.textContent = String(returns);
  els.resultMessage.textContent = `พบ ${state.filteredBills.length} บิล`;

  document.querySelectorAll('.view-bill').forEach(button => {
    button.addEventListener('click', () => openBill(button.dataset.id));
  });
}

function openBill(id) {
  const bill = state.bills.find(item => item.id === id);
  if (!bill) return;

  state.selectedBill = bill;
  els.dialogBillNo.textContent = bill.id;
  els.dialogContent.innerHTML = `
    <div class="bill-meta">
      <p><strong>วันที่:</strong><br>${formatDate(bill.createdAt)}</p>
      <p><strong>ลูกค้า:</strong><br>${bill.customer || 'Walk-in'}</p>
      <p><strong>พนักงาน:</strong><br>${bill.cashier}</p>
      <p><strong>ช่องทาง:</strong><br>${channelLabel(bill.salesChannel)} / ${channelLabel(bill.paymentChannel)}</p>
    </div>
    <ul class="item-list">
      ${bill.items.map(item => `
        <li>
          <span>${item.name}<br><small>${item.sku} · ${item.barcode}</small></span>
          <strong>${item.qty} × ${formatMoney(item.price)}</strong>
        </li>
      `).join('')}
    </ul>
    <p><strong>ยอดสุทธิ: ${formatMoney(bill.total)}</strong></p>
  `;

  applyPermissionUI({
    role: state.role,
    root: els.billDialog
  });

  els.billDialog.showModal();
}

function resetFilters() {
  [
    els.keyword,
    els.dateFrom,
    els.dateTo,
    els.paymentChannel,
    els.salesChannel,
    els.status
  ].forEach(element => {
    element.value = '';
  });
  applyFilters();
}

els.searchButton.addEventListener('click', applyFilters);
els.resetButton.addEventListener('click', resetFilters);
els.keyword.addEventListener('keydown', event => {
  if (event.key === 'Enter') applyFilters();
});
els.closeDialog.addEventListener('click', () => els.billDialog.close());

els.reprintButton.addEventListener('click', () => {
  if (!state.selectedBill) return;
  window.print();
});

els.returnButton.addEventListener('click', () => {
  if (!state.selectedBill) return;
  alert(`เตรียมเปิดขั้นตอนคืนสินค้าสำหรับ ${state.selectedBill.id}`);
});

async function loadBills() {
  // TODO: Replace demo data with Supabase RPC:
  // const { data, error } = await supabase.rpc('search_sales_bills', {...})
  state.bills = demoBills;
  state.filteredBills = [...state.bills];
  render();
}

applyPermissionUI({
  role: state.role,
  root: document
});

loadBills().catch(error => {
  console.error(error);
  els.resultMessage.textContent = 'โหลดข้อมูลไม่สำเร็จ';
});
