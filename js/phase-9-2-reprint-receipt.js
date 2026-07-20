import { supabaseClient } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const saleId = params.get('sale_id');

const els = {
  receipt: document.querySelector('#receipt'),
  paperSize: document.querySelector('#paperSize'),
  printButton: document.querySelector('#printButton'),
  closeButton: document.querySelector('#closeButton'),
  toolbarStatus: document.querySelector('#toolbarStatus'),
  saleNo: document.querySelector('#saleNo'),
  saleDate: document.querySelector('#saleDate'),
  customerName: document.querySelector('#customerName'),
  paymentMethod: document.querySelector('#paymentMethod'),
  receiptItems: document.querySelector('#receiptItems'),
  subtotal: document.querySelector('#subtotal'),
  discount: document.querySelector('#discount'),
  netTotal: document.querySelector('#netTotal'),
  receivedAmount: document.querySelector('#receivedAmount'),
  changeAmount: document.querySelector('#changeAmount'),
  reprintTimestamp: document.querySelector('#reprintTimestamp')
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function paymentLabel(value) {
  const normalized = String(value || '').toUpperCase();
  const labels = {
    CASH: 'เงินสด',
    QR: 'QR',
    TRANSFER: 'โอน',
    CARD: 'บัตร',
    CREDIT_CARD: 'บัตรเครดิต',
    DEBIT_CARD: 'บัตรเดบิต'
  };
  return labels[normalized] || value || '-';
}

async function loadReceipt() {
  if (!saleId) {
    els.toolbarStatus.textContent = 'ไม่พบ sale_id';
    els.receiptItems.innerHTML =
      '<tr><td colspan="3">ไม่พบรหัสบิล</td></tr>';
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc(
      'get_sale_receipt_phase_9_2',
      { p_sale_id: saleId }
    );

    if (error) throw error;
    if (!data) throw new Error('ไม่พบข้อมูลใบเสร็จ');

    const header = data.header || {};
    const items = Array.isArray(data.items) ? data.items : [];

    els.saleNo.textContent = header.sale_no || '-';
    els.saleDate.textContent = formatDate(header.created_at);
    els.customerName.textContent = header.customer_name || 'Walk-in';
    els.paymentMethod.textContent = paymentLabel(header.payment_method);

    els.subtotal.textContent = formatMoney(header.subtotal);
    els.discount.textContent = formatMoney(header.discount_amount);
    els.netTotal.textContent = formatMoney(header.net_total);
    els.receivedAmount.textContent = formatMoney(header.received_amount);
    els.changeAmount.textContent = formatMoney(header.change_amount);

    els.receiptItems.innerHTML = items.length
      ? items.map((item) => `
          <tr>
            <td>
              <span class="item-name">${escapeHtml(item.product_name_snapshot || '-')}</span>
              <span class="item-code">
                ${escapeHtml(item.product_code_snapshot || '-')}
              </span>
            </td>
            <td class="number">
              ${Number(item.quantity || 0)}
            </td>
            <td class="number">
              ${formatMoney(item.line_total)}
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="3">ไม่พบรายการสินค้า</td></tr>';

    els.reprintTimestamp.textContent =
      `พิมพ์ซ้ำเมื่อ ${formatDate(new Date().toISOString())}`;

    els.toolbarStatus.textContent = `พร้อมพิมพ์ ${header.sale_no || ''}`;

    await logReprint(header.sale_no);
  } catch (error) {
    console.error('Load reprint receipt error:', error);
    els.toolbarStatus.textContent = `โหลดไม่สำเร็จ: ${error.message}`;
    els.receiptItems.innerHTML = `
      <tr>
        <td colspan="3">
          โหลดใบเสร็จไม่สำเร็จ: ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
  }
}

async function logReprint(saleNo) {
  try {
    const { error } = await supabaseClient.rpc(
      'log_receipt_reprint_phase_9_2',
      {
        p_sale_id: saleId,
        p_sale_no: saleNo || null,
        p_paper_size: Number(els.paperSize.value)
      }
    );

    if (error) {
      console.warn('Audit log reprint warning:', error);
    }
  } catch (error) {
    console.warn('Audit log reprint failed:', error);
  }
}

els.paperSize.addEventListener('change', () => {
  const size = els.paperSize.value;
  els.receipt.classList.toggle('receipt-58', size === '58');
  els.receipt.classList.toggle('receipt-80', size === '80');
});

els.printButton.addEventListener('click', () => {
  window.print();
});

els.closeButton.addEventListener('click', () => {
  if (window.opener) {
    window.close();
  } else {
    history.back();
  }
});

loadReceipt();
