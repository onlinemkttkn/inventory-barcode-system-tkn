import { supabaseClient } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const saleId = params.get('sale_id');
const saleNo = params.get('sale_no') || '';

const state = {
  submitting: false,
  pendingReason: null
};

const els = {
  billSummary: document.querySelector('#billSummary'),
  reason: document.querySelector('#reason'),
  cancelButton: document.querySelector('#cancelButton'),
  confirmButton: document.querySelector('#confirmButton'),
  statusMessage: document.querySelector('#statusMessage'),
  approvalDialog: document.querySelector('#voidApprovalDialog'),
  approvalForm: document.querySelector('#voidApprovalForm'),
  approverCode: document.querySelector('#voidApproverCode'),
  approverPin: document.querySelector('#voidApproverPin'),
  approvalMessage: document.querySelector('#voidApprovalMessage'),
  cancelApproval: document.querySelector('#cancelVoidApproval'),
  confirmApproval: document.querySelector('#confirmVoidApproval')
};

function setStatus(message, type = '') {
  els.statusMessage.textContent = message;
  els.statusMessage.className = type;
}

function setApprovalStatus(message, type = '') {
  if (!els.approvalMessage) return;
  els.approvalMessage.textContent = message || '';
  els.approvalMessage.dataset.type = type;
}

function setLoading(isLoading) {
  state.submitting = isLoading;
  els.confirmButton.disabled = isLoading;
  els.cancelButton.disabled = isLoading;
  els.confirmButton.textContent =
    isLoading ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิกบิล';
  if (els.confirmApproval) els.confirmApproval.disabled = isLoading;
}

function isApprovalRequired(error) {
  const message = String(error?.message || error || '');
  return message.includes('APPROVAL_REQUIRED:pos.void_bill')
    || message.includes('ไม่มีสิทธิ์ยกเลิกบิล');
}

function openApprovalDialog(reason) {
  state.pendingReason = reason;
  els.approvalForm?.reset();
  setApprovalStatus('');
  if (els.approvalDialog && !els.approvalDialog.open) {
    els.approvalDialog.showModal();
  }
  setTimeout(() => els.approverCode?.focus(), 0);
}

function closeApprovalDialog() {
  state.pendingReason = null;
  els.approvalForm?.reset();
  setApprovalStatus('');
  els.approvalDialog?.close();
}

async function loadBill() {
  if (!saleId) {
    els.billSummary.textContent = 'ไม่พบ sale_id';
    els.confirmButton.disabled = true;
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc(
      'get_sale_receipt_phase_9_2',
      { p_sale_id: saleId }
    );

    if (error) throw error;

    const header = data?.header;
    if (!header) throw new Error('ไม่พบข้อมูลบิล');

    els.billSummary.textContent =
      `เลขบิล ${header.sale_no || saleNo || '-'} · สถานะ ${header.status || '-'}`;

    if (String(header.status || '').toUpperCase() === 'VOIDED') {
      setStatus('บิลนี้ถูกยกเลิกแล้ว', 'error');
      els.confirmButton.disabled = true;
    }
  } catch (error) {
    console.error('Load void bill error:', error);
    setStatus(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    els.confirmButton.disabled = true;
  }
}

function finishVoid(data) {
  setStatus(
    `ยกเลิกบิลสำเร็จ ${data?.sale_no || saleNo || ''}`,
    'success'
  );

  sessionStorage.setItem('tkn_bill_search_refresh', '1');
  closeApprovalDialog();

  setTimeout(() => {
    if (window.opener) {
      window.opener.postMessage(
        { type: 'TKN_BILL_VOIDED', saleId },
        window.location.origin
      );
      window.close();
    } else {
      window.location.href = './phase-9-2-bill-search.html';
    }
  }, 900);
}

async function executeVoid(reason, approval = null) {
  if (state.submitting) return false;

  setLoading(true);
  if (approval) {
    setApprovalStatus('กำลังตรวจสอบรหัสผู้อนุมัติและยกเลิกบิล...');
  } else {
    setStatus('กำลังยกเลิกบิล...');
  }

  try {
    const rpcName = approval
      ? 'void_sale_phase_9_2_approved'
      : 'void_sale_phase_9_2';

    const rpcArgs = approval
      ? {
          p_sale_id: saleId,
          p_reason: reason,
          p_approver_employee_code: approval.employeeCode,
          p_approver_pin: approval.pin
        }
      : {
          p_sale_id: saleId,
          p_reason: reason
        };

    const { data, error } = await supabaseClient.rpc(rpcName, rpcArgs);

    if (error) {
      if (!approval && isApprovalRequired(error)) {
        setStatus(
          'รายการนี้ต้องได้รับอนุมัติ กรุณาใส่รหัสผู้ที่มีสิทธิ์ยกเลิกบิล',
          'warning'
        );
        openApprovalDialog(reason);
        return false;
      }
      throw error;
    }

    finishVoid(data);
    return true;
  } catch (error) {
    console.error('Void bill error:', error);
    if (approval) {
      setApprovalStatus(
        error.message || 'รหัสผู้อนุมัติไม่ถูกต้องหรือไม่มีสิทธิ์ยกเลิกบิล',
        'error'
      );
      if (els.approverPin) {
        els.approverPin.value = '';
        els.approverPin.focus();
      }
    } else {
      setStatus(`ยกเลิกบิลไม่สำเร็จ: ${error.message}`, 'error');
    }
    return false;
  } finally {
    setLoading(false);
  }
}

async function confirmVoid() {
  const reason = els.reason.value.trim();

  if (!saleId) {
    setStatus('ไม่พบรหัสบิล', 'error');
    return;
  }

  if (reason.length < 5) {
    setStatus('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร', 'error');
    els.reason.focus();
    return;
  }

  const confirmed = window.confirm(
    `ยืนยันยกเลิกบิล ${saleNo || saleId} ใช่หรือไม่?`
  );

  if (!confirmed) return;

  await executeVoid(reason);
}

async function approveVoid(event) {
  event.preventDefault();

  if (!state.pendingReason || state.submitting) return;

  const employeeCode = els.approverCode?.value.trim() || '';
  const pin = els.approverPin?.value || '';

  if (!employeeCode || !pin) {
    setApprovalStatus('กรุณากรอกรหัสผู้อนุมัติและ PIN', 'error');
    return;
  }

  await executeVoid(state.pendingReason, { employeeCode, pin });
}

els.confirmButton.addEventListener('click', confirmVoid);
els.cancelButton.addEventListener('click', () => {
  if (window.opener) {
    window.close();
  } else {
    window.location.href = './phase-9-2-bill-search.html';
  }
});
els.approvalForm?.addEventListener('submit', approveVoid);
els.cancelApproval?.addEventListener('click', closeApprovalDialog);
els.approvalDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeApprovalDialog();
});

loadBill();
