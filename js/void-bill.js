import { supabaseClient } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const saleId = params.get('sale_id');
const saleNo = params.get('sale_no') || '';

const els = {
  billSummary: document.querySelector('#billSummary'),
  reason: document.querySelector('#reason'),
  cancelButton: document.querySelector('#cancelButton'),
  confirmButton: document.querySelector('#confirmButton'),
  statusMessage: document.querySelector('#statusMessage')
};

function setStatus(message, type = '') {
  els.statusMessage.textContent = message;
  els.statusMessage.className = type;
}

function setLoading(isLoading) {
  els.confirmButton.disabled = isLoading;
  els.cancelButton.disabled = isLoading;
  els.confirmButton.textContent =
    isLoading ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิกบิล';
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

  setLoading(true);
  setStatus('กำลังยกเลิกบิล...');

  try {
    const { data, error } = await supabaseClient.rpc(
      'void_sale_phase_9_2',
      {
        p_sale_id: saleId,
        p_reason: reason
      }
    );

    if (error) throw error;

    setStatus(
      `ยกเลิกบิลสำเร็จ ${data?.sale_no || saleNo || ''}`,
      'success'
    );

    sessionStorage.setItem('tkn_bill_search_refresh', '1');

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
  } catch (error) {
    console.error('Void bill error:', error);
    setStatus(`ยกเลิกบิลไม่สำเร็จ: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

els.confirmButton.addEventListener('click', confirmVoid);
els.cancelButton.addEventListener('click', () => {
  if (window.opener) {
    window.close();
  } else {
    window.location.href = './phase-9-2-bill-search.html';
  }
});

loadBill();
