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

function money(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB'
  }).format(Number(value || 0));
}

function date(value) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function payment(value) {
  const labels = {
    CASH: 'เงินสด',
    QR: 'QR',
    TRANSFER: 'โอน',
    CARD: 'บัตร'
  };
  return labels[String(value || '').toUpperCase()] || value || '-';
}

async function load() {
  if (!saleId) {
    els.toolbarStatus.textContent = 'ไม่พบ sale_id';
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc(
      'get_sale_receipt_phase_9_2',
      { p_sale_id: saleId }
    );

    if (error) throw error;

    const header = data?.header || {};
    const items = data?.items || [];

    els.saleNo.textContent = header.sale_no || '-';
    els.saleDate.textContent = date(header.created_at);
    els.customerName.textContent = header.customer_name || 'Walk-in';
    els.paymentMethod.textContent = payment(header.payment_method);
    els.subtotal.textContent = money(header.subtotal);
    els.discount.textContent = money(header.discount_amount);
    els.netTotal.textContent = money(header.net_total);
    els.receivedAmount.textContent = money(header.received_amount);
    els.changeAmount.textContent = money(header.change_amount);

    els.receiptItems.innerHTML = items.map((item) => `
      <tr>
        <td>
          <span class="item-name">${item.product_name_snapshot || '-'}</span>
          <span class="item-code">${item.product_code_snapshot || '-'}</span>
        </td>
        <td class="number">${Number(item.quantity || 0)}</td>
        <td class="number">${money(item.line_total)}</td>
      </tr>
    `).join('');

    els.reprintTimestamp.textContent = `พิมพ์ซ้ำเมื่อ ${date(new Date())}`;
    els.toolbarStatus.textContent = `พร้อมพิมพ์ ${header.sale_no || ''}`;
  } catch (error) {
    console.error(error);
    els.toolbarStatus.textContent = `โหลดไม่สำเร็จ: ${error.message}`;
  }
}

function applyReprintPageStyle() {
  const is58 = els.paperSize.value === '58';
  const width = is58 ? 58 : 80;
  els.receipt.classList.toggle('receipt-58', is58);
  els.receipt.classList.toggle('receipt-80', !is58);

  let style = document.getElementById('tknReprintDynamicPage');
  if (!style) {
    style = document.createElement('style');
    style.id = 'tknReprintDynamicPage';
    document.head.appendChild(style);
  }
  style.textContent = `
    @page{size:${width}mm auto;margin:0}
    @media print{
      html,body,.receipt-page{width:${width}mm!important;max-width:${width}mm!important;min-width:${width}mm!important;margin:0!important;padding:0!important}
      .receipt{width:${width}mm!important;max-width:${width}mm!important;margin:0!important;padding:3mm!important}
    }`;
}

async function waitForPrintReady() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch (error) {
    console.warn('Font readiness check skipped:', error);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

els.paperSize.addEventListener('change', applyReprintPageStyle);

els.printButton.addEventListener('click', async () => {
  els.printButton.disabled = true;
  try {
    applyReprintPageStyle();
    await waitForPrintReady();
    window.print();
  } finally {
    els.printButton.disabled = false;
  }
});
els.closeButton.addEventListener('click', () => window.close());

applyReprintPageStyle();
load();
