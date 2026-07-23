import { supabaseClient } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const saleId = params.get('sale_id');
const saleNoFromUrl = params.get('sale_no') || '';

const state = {
  header: null,
  items: [],
  balanceBySaleItemId: new Map()
};

const els = {
  billSummary: document.querySelector('#billSummary'),
  returnRows: document.querySelector('#returnRows'),
  returnReason: document.querySelector('#returnReason'),
  refundMethod: document.querySelector('#refundMethod'),
  totalPurchasedQty: document.querySelector('#totalPurchasedQty'),
  totalReturnedBefore: document.querySelector('#totalReturnedBefore'),
  totalReturnQty: document.querySelector('#totalReturnQty'),
  totalRemainingAfter: document.querySelector('#totalRemainingAfter'),
  estimatedRefund: document.querySelector('#estimatedRefund'),
  confirmButton: document.querySelector('#confirmButton'),
  cancelButton: document.querySelector('#cancelButton'),
  backButton: document.querySelector('#backButton'),
  statusMessage: document.querySelector('#statusMessage'),
  resultDialog: document.querySelector('#resultDialog'),
  resultDialogIcon: document.querySelector('#resultDialogIcon'),
  resultDialogTitle: document.querySelector('#resultDialogTitle'),
  resultDialogMessage: document.querySelector('#resultDialogMessage'),
  closeCountdown: document.querySelector('#closeCountdown'),
  closeResultDialog: document.querySelector('#closeResultDialog')
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

function setStatus(message, type = '') {
  els.statusMessage.textContent = message;
  els.statusMessage.dataset.type = type;
}


async function loadReturnBalances() {
  const { data, error } = await supabaseClient
    .from('sale_item_return_balance')
    .select(
      'sale_item_id,sale_id,sold_quantity,returned_quantity,'
      + 'returnable_quantity,unit_price,product_name'
    )
    .eq('sale_id', saleId);

  if (error) {
    console.warn('Load return balance fallback:', error);
    state.balanceBySaleItemId = new Map();
    return;
  }

  state.balanceBySaleItemId = new Map(
    (data || []).map((row) => [String(row.sale_item_id), row])
  );
}

function getItemBalance(item) {
  const row = state.balanceBySaleItemId.get(String(item.id));
  const sold = Number(row?.sold_quantity ?? item.quantity ?? 0);
  const returned = Number(row?.returned_quantity ?? 0);
  const returnable = Number(
    row?.returnable_quantity ?? Math.max(0, sold - returned)
  );

  return {
    sold,
    returned,
    returnable,
    unitPrice: Number(row?.unit_price ?? item.unit_price ?? 0)
  };
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
    await loadReturnBalances();

    if (!state.header) throw new Error('ไม่พบข้อมูลหัวบิล');

    els.billSummary.textContent =
      `เลขบิล ${state.header.sale_no || saleNoFromUrl || '-'}`
      + ` · สถานะ ${state.header.status || '-'}`;

    const status = String(state.header.status || '').toUpperCase();

    if (['VOIDED', 'CANCELLED'].includes(status)) {
      setStatus('บิลที่ยกเลิกแล้วไม่สามารถคืนสินค้าได้', 'error');
      els.confirmButton.disabled = true;
    }

    if (status === 'RETURNED') {
      setStatus('บิลนี้คืนสินค้าครบแล้ว', 'error');
      els.confirmButton.disabled = true;
    }

    renderRows();
  } catch (error) {
    console.error('Load sales return error:', error);
    setStatus(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    els.returnRows.innerHTML =
      '<tr><td colspan="6" class="empty-row">โหลดข้อมูลไม่สำเร็จ</td></tr>';
  }
}

function renderRows() {
  if (!state.items.length) {
    els.returnRows.innerHTML =
      '<tr><td colspan="9" class="empty-row">ไม่พบรายการสินค้า</td></tr>';
    updateSummary();
    return;
  }

  els.returnRows.innerHTML = state.items.map((item, index) => {
    const balance = getItemBalance(item);
    const fullyReturned = balance.returnable <= 0;

    return `
      <tr class="${fullyReturned ? 'fully-returned-row' : ''}">
        <td>
          <strong>${escapeHtml(item.product_name_snapshot || '-')}</strong>
          ${fullyReturned ? '<span class="return-badge complete">คืนครบแล้ว</span>' : ''}
        </td>
        <td>${escapeHtml(item.product_code_snapshot || '-')}</td>
        <td>${balance.sold}</td>
        <td class="returned-before">${balance.returned}</td>
        <td><strong class="returnable-before">${balance.returnable}</strong></td>
        <td>
          <input
            class="qty-input"
            type="number"
            min="0"
            max="${balance.returnable}"
            step="1"
            value="0"
            data-index="${index}"
            ${fullyReturned ? 'disabled' : ''}>
        </td>
        <td class="remaining-after">${balance.returnable}</td>
        <td>${formatMoney(balance.unitPrice)}</td>
        <td class="line-refund">${formatMoney(0)}</td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.qty-input').forEach((input) => {
    input.addEventListener('input', updateSummary);
  });

  updateSummary();
}

function getReturnLines() {
  return [...document.querySelectorAll('.qty-input')]
    .map((input) => {
      const item = state.items[Number(input.dataset.index)];
      const balance = getItemBalance(item);
      const quantity = Math.max(
        0,
        Math.min(Number(input.value || 0), balance.returnable)
      );

      return {
        sale_item_id: item.id,
        product_id: item.product_id,
        quantity,
        unit_price: balance.unitPrice,
        refund_amount: quantity * balance.unitPrice
      };
    })
    .filter((line) => line.quantity > 0);
}

function updateSummary() {
  let totalPurchased = 0;
  let totalReturnedBefore = 0;
  let totalReturnNow = 0;
  let totalRemainingAfter = 0;
  let totalRefund = 0;

  document.querySelectorAll('.qty-input').forEach((input) => {
    const item = state.items[Number(input.dataset.index)];
    const balance = getItemBalance(item);
    const quantity = Math.max(
      0,
      Math.min(Number(input.value || 0), balance.returnable)
    );
    const remainingAfter = Math.max(0, balance.returnable - quantity);
    const lineRefund = quantity * balance.unitPrice;

    input.value = String(quantity);

    const row = input.closest('tr');
    row.querySelector('.remaining-after').textContent = String(remainingAfter);
    row.querySelector('.line-refund').textContent = formatMoney(lineRefund);
    row.classList.toggle('return-selected-row', quantity > 0);

    totalPurchased += balance.sold;
    totalReturnedBefore += balance.returned;
    totalReturnNow += quantity;
    totalRemainingAfter += remainingAfter;
    totalRefund += lineRefund;
  });

  // Include rows whose input is disabled (fully returned).
  state.items.forEach((item, index) => {
    const input = document.querySelector(`.qty-input[data-index="${index}"]`);
    if (input) return;
    const balance = getItemBalance(item);
    totalPurchased += balance.sold;
    totalReturnedBefore += balance.returned;
    totalRemainingAfter += balance.returnable;
  });

  els.totalPurchasedQty.textContent = String(totalPurchased);
  els.totalReturnedBefore.textContent = String(totalReturnedBefore);
  els.totalReturnQty.textContent = String(totalReturnNow);
  els.totalRemainingAfter.textContent = String(totalRemainingAfter);
  els.estimatedRefund.textContent = formatMoney(totalRefund);

  const reasonValid = els.returnReason.value.trim().length >= 5;
  const status = String(state.header?.status || '').toUpperCase();
  const allowed = !['VOIDED', 'CANCELLED', 'RETURNED'].includes(status);
  const hasReturnable = state.items.some(
    (item) => getItemBalance(item).returnable > 0
  );

  els.confirmButton.disabled =
    !(totalReturnNow > 0 && reasonValid && allowed && hasReturnable);

  if (!hasReturnable && state.items.length) {
    setStatus('บิลนี้คืนสินค้าครบทุกชิ้นแล้ว', 'error');
  }
}


function goToBillSearch(data) {
  const payload={type:'TKN_SALE_RETURN_SUCCESS',returnNo:data?.return_no||'',saleId,
    saleNo:data?.sale_no||state.header?.sale_no||saleNoFromUrl||'',
    saleStatus:data?.sale_status||'',refundAmount:Number(data?.refund_amount||0)};
  if(window.opener&&!window.opener.closed){window.opener.postMessage(payload,window.location.origin)}
  window.location.replace('./phase-9-2-bill-search.html?return_success=1');
}

function showSuccessDialog(data) {
  const returnNo=data?.return_no||'-';
  els.resultDialogIcon.textContent='✓';
  els.resultDialogTitle.textContent='คืนสินค้าสำเร็จ';
  els.resultDialogMessage.textContent=`เลขที่คืน ${returnNo} · ยอดคืน ${formatMoney(data?.refund_amount)}`;
  if(els.closeCountdown) els.closeCountdown.closest('p')?.remove();
  if(!els.resultDialog.open) els.resultDialog.showModal();
  els.closeResultDialog.textContent='กลับไปหน้าตรวจสอบบิล';
  els.closeResultDialog.onclick=()=>goToBillSearch(data);
}

async function submitReturn() {
  const lines = getReturnLines();
  const reason = els.returnReason.value.trim();

  if (!lines.length) {
    setStatus(
      'กรุณาเลือกจำนวนสินค้าที่ต้องการคืน',
      'error'
    );
    return;
  }

  if (reason.length < 5) {
    setStatus(
      'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร',
      'error'
    );
    return;
  }

  const confirmed = window.confirm(
    `ยืนยันคืนสินค้าจากบิล `
    + `${state.header?.sale_no || saleNoFromUrl || ''}`
    + ` ใช่หรือไม่?`
  );

  if (!confirmed) return;

  els.confirmButton.disabled = true;
  setStatus('กำลังบันทึกคืนสินค้า...');

  try {
    const { data, error } = await supabaseClient.rpc(
      'process_sale_return_phase_9_2',
      {
        p_sale_id: saleId,
        p_reason: reason,
        p_refund_method: els.refundMethod.value,
        p_items: lines
      }
    );

    if (error) throw error;

    setStatus(
      `คืนสินค้าสำเร็จ ${data?.return_no || ''}`
      + ` · ยอดคืน ${formatMoney(data?.refund_amount)}`,
      'success'
    );

    sessionStorage.setItem('tkn_bill_search_refresh', '1');
    showSuccessDialog(data);
  } catch (error) {
    console.error('Process sales return error:', error);

    const message = String(error.message || '');

    if (message.includes('RETURN_QUANTITY_EXCEEDS_BALANCE')) {
      setStatus(
        'จำนวนคืนเกินยอดที่สามารถคืนได้ กรุณารีเฟรชและตรวจสอบอีกครั้ง',
        'error'
      );
    } else if (message.includes('UNSUPPORTED_REFUND_METHOD')) {
      setStatus(
        'วิธีคืนเงินนี้ยังไม่รองรับในฐานข้อมูล',
        'error'
      );
    } else if (
      message.includes('invalid input value for enum sale_status')
    ) {
      setStatus(
        'ฐานข้อมูลยังไม่มีสถานะคืนสินค้า กรุณารัน SQL Upgrade v2.2 ก่อน',
        'error'
      );
    } else {
      setStatus(
        `คืนสินค้าไม่สำเร็จ: ${message}`,
        'error'
      );
    }

    updateSummary();
  }
}

els.returnReason.addEventListener(
  'input',
  updateSummary
);

els.confirmButton.addEventListener(
  'click',
  submitReturn
);

function goBack() {
  if (history.length > 1) {
    history.back();
  } else {
    window.location.href =
      './phase-9-2-bill-search-v2-2.html';
  }
}

els.cancelButton.addEventListener('click', goBack);
els.backButton.addEventListener('click', goBack);

loadSale();
