import { supabaseClient } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const saleId = params.get('sale_id');
const saleNoFromUrl = params.get('sale_no') || '';

const CASH_APPROVAL_THRESHOLD = 5000;

const state = {
  header: null,
  items: [],
  balanceBySaleItemId: new Map(),
  pendingReturnRequest: null,
  submitting: false
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
  closeResultDialog: document.querySelector('#closeResultDialog'),
  refundDrawerApprovalDialog:
    document.querySelector('#refundDrawerApprovalDialog'),
  refundDrawerApprovalForm:
    document.querySelector('#refundDrawerApprovalForm'),
  refundApproverCode:
    document.querySelector('#refundApproverCode'),
  refundApproverPin:
    document.querySelector('#refundApproverPin'),
  refundApprovalMessage:
    document.querySelector('#refundApprovalMessage'),
  cancelRefundApproval:
    document.querySelector('#cancelRefundApproval'),
  confirmRefundApproval:
    document.querySelector('#confirmRefundApproval')
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


function setApprovalStatus(message, type = '') {
  if (!els.refundApprovalMessage) return;
  els.refundApprovalMessage.textContent = message || '';
  els.refundApprovalMessage.dataset.type = type;
}

function currentShift() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem('tkn_cashier_shift') || 'null'
    );
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function writeReturnAudit(
  actionType,
  entityId,
  label,
  details = {}
) {
  try {
    const branchId =
      state.header?.branch_id ||
      currentShift()?.branch_id ||
      null;

    const result = await supabaseClient.rpc('write_audit_log', {
      p_action_type: actionType,
      p_entity_type: 'CASH_DRAWER',
      p_entity_id: entityId ? String(entityId) : null,
      p_action_label: label,
      p_details: details,
      p_branch_id: branchId,
      p_user_agent: navigator.userAgent
    });

    if (result.error) {
      console.warn('Return drawer audit skipped:', result.error.message);
    }
  } catch (error) {
    console.warn('Return drawer audit unavailable:', error);
  }
}


async function updateRefundState(returnData, values = {}) {
  if (!returnData?.return_id) return {ok: false, skipped: true};

  try {
    const {data, error} = await supabaseClient.rpc(
      'set_sales_return_refund_state_v3_6_2',
      {
        p_return_id: returnData.return_id,
        p_refund_status: values.refund_status || null,
        p_transfer_reference: values.transfer_reference || null,
        p_drawer_status: values.drawer_status || null,
        p_drawer_last_error: values.drawer_last_error || null,
        p_hardware_job_key: values.hardware_job_key || null
      }
    );
    if (error) throw error;
    return {ok: true, data};
  } catch (error) {
    console.warn('Refund state update deferred:', error);
    return {ok: false, error: error.message};
  }
}

async function openCashRefundDrawer(returnData, approval = null) {
  const returnNo = returnData?.return_no || null;
  const refundAmount = Number(returnData?.refund_amount || 0);
  const saleNo =
    returnData?.sale_no ||
    state.header?.sale_no ||
    saleNoFromUrl ||
    null;
  const shift = currentShift();

  const auditDetails = {
    source: 'SALE_RETURN',
    return_no: returnNo,
    sale_id: saleId,
    sale_no: saleNo,
    refund_method: 'CASH',
    refund_amount: refundAmount,
    shift_id: shift?.shift_id || null,
    cashier_employee_code: shift?.employee_code || null,
    approver_employee_code: approval?.employee_code || null
  };

  if (!window.TKNHardware) {
    await writeReturnAudit(
      'CASH_DRAWER_OPEN_FAILED',
      returnNo || saleNo || saleId,
      'เปิดลิ้นชักคืนเงินสดไม่สำเร็จ',
      {
        ...auditDetails,
        result: 'HARDWARE_CLIENT_MISSING'
      }
    );

    return {
      ok: false,
      message:
        'คืนสินค้าสำเร็จ แต่ไม่พบ Hardware Client สำหรับเปิดลิ้นชัก'
    };
  }

  try {
    const drawerMeta = {
      reason: 'RETURN_CASH_REFUND',
      source: 'SALE_RETURN',
      return_id: returnData?.return_id || null,
      return_no: returnNo,
      sale_id: saleId,
      sale_no: saleNo,
      refund_amount: refundAmount,
      shift_id: shift?.shift_id || null,
      approval,
      idempotency_key:
        `SALE_RETURN:${returnData?.return_id || returnNo}:OPEN_DRAWER`
    };

    const drawerFn =
      window.TKNHardware.openDrawerReliable
      || window.TKNHardware.openDrawer;

    const result = await drawerFn(drawerMeta);

    if (result?.ok === false) {
      return {
        ok: false,
        status: result.status || 'PENDING_MANUAL',
        hardware_job_key: result.idempotency_key || drawerMeta.idempotency_key,
        message:
          result.status === 'UNKNOWN'
            ? 'คืนสินค้าสำเร็จ แต่ยังไม่ยืนยันว่าลิ้นชักเปิด กรุณาตรวจสอบก่อนลองใหม่'
            : 'คืนสินค้าสำเร็จ แต่ Hardware ยังไม่พร้อมเปิดลิ้นชัก'
      };
    }

    await writeReturnAudit(
      'CASH_DRAWER_OPEN_SUCCESS',
      returnNo || saleNo || saleId,
      'เปิดลิ้นชักเพื่อคืนเงินสดสำเร็จ',
      {
        ...auditDetails,
        result: 'SUCCESS',
        transport: result?.transport || result?.service || null
      }
    );

    return {
      ok: true,
      status: 'OPENED',
      hardware_job_key:
        result?.idempotency_key
        || `SALE_RETURN:${returnData?.return_id || returnNo}:OPEN_DRAWER`,
      message:
        `เปิดลิ้นชักเพื่อคืนเงินสดผ่าน ${
          result?.transport || result?.service || 'Hardware'
        }`
    };
  } catch (error) {
    await writeReturnAudit(
      'CASH_DRAWER_OPEN_FAILED',
      returnNo || saleNo || saleId,
      'เปิดลิ้นชักคืนเงินสดไม่สำเร็จ',
      {
        ...auditDetails,
        result: 'FAILED',
        error_message: error.message
      }
    );

    return {
      ok: false,
      status: 'FAILED',
      hardware_job_key:
        `SALE_RETURN:${returnData?.return_id || returnNo}:OPEN_DRAWER`,
      error: error.message,
      message:
        `คืนสินค้าสำเร็จ แต่เปิดลิ้นชักไม่สำเร็จ: ${error.message}`
    };
  }
}

function requestRefundApproval(request) {
  state.pendingReturnRequest = request;
  setApprovalStatus('');
  els.refundDrawerApprovalForm?.reset();
  els.refundDrawerApprovalDialog?.showModal();
  setTimeout(() => els.refundApproverCode?.focus(), 0);
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
  const target = './phase-9-2-bill-search.html?return_success=1';
  sessionStorage.setItem('tkn_return_success', JSON.stringify(payload));
  window.location.assign(target);
}

function showSuccessDialog(data) {
  const returnNo=data?.return_no||'-';
  els.resultDialogIcon.textContent='✓';
  els.resultDialogTitle.textContent='คืนสินค้าสำเร็จ';
  els.resultDialogMessage.textContent =
    `เลขที่คืน ${returnNo} · ยอดคืน ${formatMoney(data?.refund_amount)}`
    + (
      data?.transfer_pending
        ? ' · สถานะ: รอโอนเงิน'
        : data?.drawer_message
          ? ` · ${data.drawer_message}`
          : ''
    );
  if(els.closeCountdown) els.closeCountdown.closest('p')?.remove();
  if(!els.resultDialog.open) els.resultDialog.showModal();
  els.closeResultDialog.textContent='กลับไปหน้าตรวจสอบบิล';
  els.closeResultDialog.onclick=()=>goToBillSearch(data);
}

async function executeReturn(request, approval = null) {
  if (state.submitting) return;

  state.submitting = true;
  els.confirmButton.disabled = true;
  if (els.confirmRefundApproval) {
    els.confirmRefundApproval.disabled = true;
  }
  setStatus('กำลังบันทึกคืนสินค้า...');

  try {
    const { data, error } = await supabaseClient.rpc(
      'process_sale_return_phase_9_2',
      {
        p_sale_id: saleId,
        p_reason: request.reason,
        p_refund_method: request.refundMethod,
        p_items: request.lines
      }
    );

    if (error) throw error;

    let drawerResult = null;

    if (request.refundMethod === 'CASH') {
      await updateRefundState(data, {
        refund_status: 'PROCESSING',
        drawer_status: 'REQUESTED'
      });

      drawerResult = await openCashRefundDrawer(data, approval);

      await updateRefundState(data, {
        refund_status: 'PAID',
        drawer_status:
          drawerResult?.ok
            ? 'OPENED'
            : (drawerResult?.status || 'FAILED'),
        drawer_last_error:
          drawerResult?.ok
            ? null
            : (drawerResult?.error || drawerResult?.message || null),
        hardware_job_key: drawerResult?.hardware_job_key || null
      });
    } else if (request.refundMethod === 'TRANSFER') {
      await updateRefundState(data, {
        refund_status: 'PENDING_TRANSFER',
        drawer_status: 'NOT_REQUIRED'
      });
      data.transfer_pending = true;
    }

    const successText =
      `คืนสินค้าสำเร็จ ${data?.return_no || ''}`
      + ` · ยอดคืน ${formatMoney(data?.refund_amount)}`;

    const refundMessage = data?.transfer_pending
      ? 'บันทึกรายการคืนแล้ว · รอโอนเงินให้ลูกค้า'
      : drawerResult?.message || '';

    setStatus(
      refundMessage
        ? `${successText} · ${refundMessage}`
        : successText,
      drawerResult && !drawerResult.ok ? 'warning' : 'success'
    );

    sessionStorage.setItem('tkn_bill_search_refresh', '1');

    if (drawerResult?.message) {
      data.drawer_message = drawerResult.message;
      data.drawer_ok = drawerResult.ok;
    }

    els.refundDrawerApprovalDialog?.close();
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
  } finally {
    state.submitting = false;
    state.pendingReturnRequest = null;
    if (els.confirmRefundApproval) {
      els.confirmRefundApproval.disabled = false;
    }
    updateSummary();
  }
}

async function submitReturn() {
  const lines = getReturnLines();
  const reason = els.returnReason.value.trim();
  const refundMethod = els.refundMethod.value;
  const refundAmount = lines.reduce(
    (sum, line) => sum + Number(line.refund_amount || 0),
    0
  );

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

  const request = {
    lines,
    reason,
    refundMethod,
    refundAmount
  };

  if (
    refundMethod === 'CASH' &&
    refundAmount >= CASH_APPROVAL_THRESHOLD
  ) {
    requestRefundApproval(request);
    return;
  }

  await executeReturn(request);
}

async function approveCashRefund(event) {
  event.preventDefault();

  if (!state.pendingReturnRequest || state.submitting) return;

  const employeeCode =
    els.refundApproverCode.value.trim();
  const pin = els.refundApproverPin.value;

  if (!employeeCode || !pin) {
    setApprovalStatus(
      'กรุณากรอกรหัสผู้อนุมัติและ PIN',
      'error'
    );
    return;
  }

  els.confirmRefundApproval.disabled = true;
  setApprovalStatus('กำลังตรวจสอบสิทธิ์...');

  try {
    const { data, error } = await supabaseClient.rpc(
      'authorize_cash_drawer_reopen_v3_4',
      {
        p_employee_code: employeeCode,
        p_pin: pin
      }
    );

    if (error) {
      await writeReturnAudit(
        'CASH_DRAWER_OPEN_DENIED',
        state.header?.sale_no || saleId,
        'ปฏิเสธการเปิดลิ้นชักคืนเงินสด',
        {
          source: 'SALE_RETURN',
          sale_id: saleId,
          sale_no: state.header?.sale_no || saleNoFromUrl || null,
          requested_employee_code: employeeCode,
          refund_amount:
            state.pendingReturnRequest.refundAmount,
          error_message: error.message
        }
      );
      throw error;
    }

    await executeReturn(
      state.pendingReturnRequest,
      data
    );
  } catch (error) {
    setApprovalStatus(
      error.message || 'ตรวจสอบสิทธิ์ไม่สำเร็จ',
      'error'
    );
    els.confirmRefundApproval.disabled = false;
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


els.refundDrawerApprovalForm?.addEventListener(
  'submit',
  approveCashRefund
);

els.cancelRefundApproval?.addEventListener('click', () => {
  state.pendingReturnRequest = null;
  els.refundDrawerApprovalForm?.reset();
  setApprovalStatus('');
  els.refundDrawerApprovalDialog?.close();
  updateSummary();
});

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
