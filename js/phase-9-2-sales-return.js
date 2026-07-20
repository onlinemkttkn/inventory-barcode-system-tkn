import { supabaseClient } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const saleId = params.get('sale_id');
const saleNoFromUrl = params.get('sale_no') || '';

const state = {
  header: null,
  items: []
};

const els = {
  billSummary: document.querySelector('#billSummary'),
  returnRows: document.querySelector('#returnRows'),
  returnReason: document.querySelector('#returnReason'),
  refundMethod: document.querySelector('#refundMethod'),
  totalReturnQty: document.querySelector('#totalReturnQty'),
  estimatedRefund: document.querySelector('#estimatedRefund'),
  confirmButton: document.querySelector('#confirmButton'),
  cancelButton: document.querySelector('#cancelButton'),
  backButton: document.querySelector('#backButton'),
  statusMessage: document.querySelector('#statusMessage')
};

function formatMoney(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB'
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

async function loadSale() {
  if (!saleId) {
    els.billSummary.textContent = 'ไม่พบ sale_id';
    els.returnRows.innerHTML =
      '<tr><td colspan="6" class="empty-row">ไม่พบรหัสบิล</td></tr>';
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc(
      'get_sale_receipt_phase_9_2',
      { p_sale_id: saleId }
    );

    if (error) throw error;

    state.header = data?.header || null;
    state.items = Array.isArray(data?.items) ? data.items : [];

    if (!state.header) {
      throw new Error('ไม่พบข้อมูลหัวบิล');
    }

    els.billSummary.textContent =
      `เลขบิล ${state.header.sale_no || saleNoFromUrl || '-'}`
      + ` · สถานะ ${state.header.status || '-'}`;

    const status = String(state.header.status || '').toUpperCase();

    if (['VOIDED', 'CANCELLED'].includes(status)) {
      setStatus('บิลที่ยกเลิกแล้วไม่สามารถทำรายการคืนสินค้าได้');
      els.confirmButton.disabled = true;
    }

    renderRows();
  } catch (error) {
    console.error('Load sales return error:', error);
    setStatus(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`);
    els.returnRows.innerHTML =
      '<tr><td colspan="6" class="empty-row">โหลดข้อมูลไม่สำเร็จ</td></tr>';
  }
}

function renderRows() {
  if (!state.items.length) {
    els.returnRows.innerHTML =
      '<tr><td colspan="6" class="empty-row">ไม่พบรายการสินค้า</td></tr>';
    return;
  }

  els.returnRows.innerHTML = state.items.map((item, index) => `
    <tr>
      <td>${escapeHtml(item.product_name_snapshot || '-')}</td>
      <td>${escapeHtml(item.product_code_snapshot || '-')}</td>
      <td>${Number(item.quantity || 0)}</td>
      <td>
        <input
          class="qty-input"
          type="number"
          min="0"
          max="${Number(item.quantity || 0)}"
          step="1"
          value="0"
          data-index="${index}">
      </td>
      <td>${formatMoney(item.unit_price)}</td>
      <td class="line-refund">${formatMoney(0)}</td>
    </tr>
  `).join('');

  document.querySelectorAll('.qty-input').forEach((input) => {
    input.addEventListener('input', updateSummary);
  });
}

function getReturnLines() {
  return [...document.querySelectorAll('.qty-input')]
    .map((input) => {
      const item = state.items[Number(input.dataset.index)];
      const quantity = Math.max(
        0,
        Math.min(
          Number(input.value || 0),
          Number(item.quantity || 0)
        )
      );

      return {
        sale_item_id: item.id,
        product_id: item.product_id,
        quantity,
        unit_price: Number(item.unit_price || 0),
        line_refund: quantity * Number(item.unit_price || 0)
      };
    })
    .filter((line) => line.quantity > 0);
}

function updateSummary() {
  const lines = getReturnLines();
  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalRefund = lines.reduce(
    (sum, line) => sum + line.line_refund,
    0
  );

  document.querySelectorAll('.qty-input').forEach((input) => {
    const index = Number(input.dataset.index);
    const item = state.items[index];
    const quantity = Math.max(
      0,
      Math.min(
        Number(input.value || 0),
        Number(item.quantity || 0)
      )
    );

    input.value = String(quantity);
    input.closest('tr').querySelector('.line-refund').textContent =
      formatMoney(quantity * Number(item.unit_price || 0));
  });

  els.totalReturnQty.textContent = String(totalQty);
  els.estimatedRefund.textContent = formatMoney(totalRefund);

  const reasonValid = els.returnReason.value.trim().length >= 5;
  const billStatus = String(state.header?.status || '').toUpperCase();
  const billAllowed = !['VOIDED', 'CANCELLED'].includes(billStatus);

  // Disabled until the database return RPC is installed in Module 2.6.2.
  els.confirmButton.disabled = true;

  if (totalQty > 0 && reasonValid && billAllowed) {
    setStatus(
      'เลือกสินค้าเรียบร้อยแล้ว ขั้นต่อไปคือติดตั้ง Return RPC สำหรับบันทึกจริง'
    );
  } else {
    setStatus('');
  }
}

els.returnReason.addEventListener('input', updateSummary);

els.confirmButton.addEventListener('click', () => {
  setStatus('ยังไม่เปิดการบันทึกจริง กรุณาติดตั้ง Module 2.6.2 ก่อน');
});

function goBack() {
  if (history.length > 1) {
    history.back();
  } else {
    window.location.href = './phase-9-2-bill-search.html';
  }
}

els.cancelButton.addEventListener('click', goBack);
els.backButton.addEventListener('click', goBack);

loadSale();
