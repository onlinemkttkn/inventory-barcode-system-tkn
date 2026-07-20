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

async function loadBill() {
  if (!saleId) {
    els.billSummary.textContent = 'ไม่พบ sale_id';
    els.confirmButton.disabled = true;
    return;
  }

  const { data, error } = await supabaseClient.rpc(
    'get_sale_receipt_phase_9_2',
    { p_sale_id: saleId }
  );

  if (error) {
    els.billSummary.textContent = `โหลดไม่สำเร็จ: ${error.message}`;
    els.confirmButton.disabled = true;
    return;
  }

  const header = data?.header || {};
  els.billSummary.textContent =
    `เลขบิล ${header.sale_no || saleNo || '-'} · สถานะ ${header.status || '-'}`;

  if (String(header.status || '').toUpperCase() === 'VOIDED') {
    els.statusMessage.textContent = 'บิลนี้ถูกยกเลิกแล้ว';
    els.confirmButton.disabled = true;
  }
}

els.confirmButton.addEventListener('click', async () => {
  const reason = els.reason.value.trim();

  if (reason.length < 5) {
    els.statusMessage.textContent = 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร';
    return;
  }

  if (!confirm(`ยืนยันยกเลิกบิล ${saleNo || saleId} ใช่หรือไม่?`)) return;

  els.confirmButton.disabled = true;
  els.statusMessage.textContent = 'กำลังยกเลิกบิล...';

  try {
    const { data, error } = await supabaseClient.rpc(
      'void_sale_phase_9_2',
      {
        p_sale_id: saleId,
        p_reason: reason
      }
    );

    if (error) throw error;

    els.statusMessage.textContent =
      `ยกเลิกบิลสำเร็จ ${data?.sale_no || saleNo || ''}`;

    sessionStorage.setItem('tkn_bill_search_refresh', '1');

    setTimeout(() => {
      if (window.opener) {
        window.opener.postMessage(
          { type: 'TKN_BILL_VOIDED', saleId },
          window.location.origin
        );
        window.close();
      }
    }, 800);
  } catch (error) {
    console.error(error);
    els.statusMessage.textContent = `ยกเลิกไม่สำเร็จ: ${error.message}`;
    els.confirmButton.disabled = false;
  }
});

els.cancelButton.addEventListener('click', () => window.close());

loadBill();
