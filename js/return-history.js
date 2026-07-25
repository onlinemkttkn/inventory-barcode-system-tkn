import { supabaseClient } from './supabase-client.js';

const E = {
  keyword: document.querySelector('#keyword'),
  dateFrom: document.querySelector('#dateFrom'),
  dateTo: document.querySelector('#dateTo'),
  refundMethod: document.querySelector('#refundMethod'),
  refundStatus: document.querySelector('#refundStatus'),
  searchButton: document.querySelector('#searchButton'),
  resetButton: document.querySelector('#resetButton'),
  returnRows: document.querySelector('#returnRows'),
  summaryCount: document.querySelector('#summaryCount'),
  summaryPaid: document.querySelector('#summaryPaid'),
  summaryPending: document.querySelector('#summaryPending'),
  summaryHardware: document.querySelector('#summaryHardware'),
  resultMessage: document.querySelector('#resultMessage'),
  transferDialog: document.querySelector('#transferDialog'),
  transferForm: document.querySelector('#transferForm'),
  transferReturnSummary: document.querySelector('#transferReturnSummary'),
  transferReference: document.querySelector('#transferReference'),
  transferMessage: document.querySelector('#transferMessage'),
  cancelTransfer: document.querySelector('#cancelTransfer'),
  confirmTransfer: document.querySelector('#confirmTransfer')
};

let rows = [];
let selectedReturn = null;
let busy = false;

const money = value => new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB'
}).format(Number(value || 0));

const dateTime = value => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date);
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#039;'
})[char]);

function refundMethodLabel(value) {
  return {
    CASH: 'เงินสด',
    TRANSFER: 'เงินโอน'
  }[String(value || '').toUpperCase()] || String(value || '-');
}

function refundStatusLabel(value) {
  return {
    PAID: 'คืนเงินแล้ว',
    PENDING_TRANSFER: 'รอโอน',
    PROCESSING: 'กำลังดำเนินการ',
    FAILED: 'มีปัญหา'
  }[String(value || '').toUpperCase()] || String(value || '-');
}

function drawerStatusLabel(value) {
  return {
    OPENED: 'เปิดสำเร็จ',
    NOT_REQUIRED: 'ไม่ต้องเปิด',
    REQUESTED: 'กำลังส่งคำสั่ง',
    UNKNOWN: 'ต้องตรวจสอบ',
    PENDING_MANUAL: 'รอลองใหม่',
    FAILED: 'เปิดไม่สำเร็จ',
    LEGACY_UNKNOWN: 'ข้อมูลเดิม'
  }[String(value || '').toUpperCase()] || String(value || '-');
}

function badgeClass(value) {
  const upper = String(value || '').toUpperCase();
  if (['PAID','OPENED','NOT_REQUIRED'].includes(upper)) return 'ok';
  if (['PENDING_TRANSFER','PROCESSING','REQUESTED'].includes(upper)) return 'pending';
  if (['FAILED','UNKNOWN','PENDING_MANUAL'].includes(upper)) return 'danger';
  return 'neutral';
}

function render() {
  E.returnRows.innerHTML = rows.length
    ? rows.map(row => {
        const canConfirmTransfer =
          String(row.refund_method).toUpperCase() === 'TRANSFER'
          && String(row.refund_status).toUpperCase() === 'PENDING_TRANSFER';

        return `<tr>
          <td>
            <strong>${esc(row.return_no)}</strong><br>
            <small>${esc(row.sale_no)}</small>
          </td>
          <td>${dateTime(row.created_at)}</td>
          <td>${esc(refundMethodLabel(row.refund_method))}</td>
          <td><strong>${money(row.refund_amount)}</strong></td>
          <td>
            <span class="status-badge ${badgeClass(row.refund_status)}">
              ${esc(refundStatusLabel(row.refund_status))}
            </span>
            ${row.refunded_at ? `<small>${dateTime(row.refunded_at)}</small>` : ''}
          </td>
          <td>
            <span class="status-badge ${badgeClass(row.drawer_status)}">
              ${esc(drawerStatusLabel(row.drawer_status))}
            </span>
            ${row.drawer_last_error
              ? `<small class="error-text">${esc(row.drawer_last_error)}</small>`
              : ''}
          </td>
          <td>${esc(row.transfer_reference || '-')}</td>
          <td class="row-actions">
            ${canConfirmTransfer
              ? `<button class="primary-button confirm-transfer"
                   data-id="${esc(row.return_id)}">ยืนยันโอนแล้ว</button>`
              : ''}
            <button class="secondary-button print-return"
              data-id="${esc(row.return_id)}"
              data-no="${esc(row.return_no)}">ดู / พิมพ์</button>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="8" class="empty-row">ไม่พบรายการคืนสินค้า</td></tr>';

  E.summaryCount.textContent = String(rows.length);
  E.summaryPaid.textContent = money(
    rows.filter(row => row.refund_status === 'PAID')
      .reduce((sum, row) => sum + Number(row.refund_amount || 0), 0)
  );
  E.summaryPending.textContent = money(
    rows.filter(row => row.refund_status === 'PENDING_TRANSFER')
      .reduce((sum, row) => sum + Number(row.refund_amount || 0), 0)
  );
  E.summaryHardware.textContent = String(
    rows.filter(row =>
      ['FAILED','UNKNOWN','PENDING_MANUAL'].includes(
        String(row.drawer_status || '').toUpperCase()
      )
    ).length
  );

  document.querySelectorAll('.print-return').forEach(button => {
    button.addEventListener('click', () => {
      const url =
        `./sales-return-receipt.html?return_id=${
          encodeURIComponent(button.dataset.id)
        }&return_no=${encodeURIComponent(button.dataset.no || '')}`;
      window.open(
        url,
        '_blank',
        'width=620,height=820,resizable=yes,scrollbars=yes'
      );
    });
  });

  document.querySelectorAll('.confirm-transfer').forEach(button => {
    button.addEventListener('click', () => {
      selectedReturn = rows.find(row => row.return_id === button.dataset.id);
      if (!selectedReturn) return;
      E.transferForm.reset();
      E.transferMessage.textContent = '';
      E.transferReturnSummary.textContent =
        `${selectedReturn.return_no} · ${money(selectedReturn.refund_amount)}`;
      E.transferDialog.showModal();
      setTimeout(() => E.transferReference.focus(), 0);
    });
  });
}

async function searchReturns() {
  if (busy) return;
  busy = true;
  E.searchButton.disabled = true;
  E.resultMessage.textContent = 'กำลังโหลด...';

  try {
    const {data, error} = await supabaseClient.rpc(
      'search_sales_returns_refund_status_v3_6_4',
      {
        p_keyword: E.keyword.value.trim() || null,
        p_date_from: E.dateFrom.value || null,
        p_date_to: E.dateTo.value || null,
        p_refund_method: E.refundMethod.value || null,
        p_refund_status: E.refundStatus.value || null,
        p_limit: 300
      }
    );
    if (error) throw error;
    rows = Array.isArray(data) ? data : [];
    render();
    E.resultMessage.textContent = `พบ ${rows.length} รายการ`;
  } catch (error) {
    console.error('Load return status error:', error);
    rows = [];
    render();
    E.resultMessage.textContent = `โหลดไม่สำเร็จ: ${error.message}`;
  } finally {
    busy = false;
    E.searchButton.disabled = false;
  }
}

async function confirmTransfer(event) {
  event.preventDefault();
  if (!selectedReturn || busy) return;

  const reference = E.transferReference.value.trim();
  if (!reference) {
    E.transferMessage.textContent = 'กรุณากรอกเลขอ้างอิงการโอน';
    return;
  }

  busy = true;
  E.confirmTransfer.disabled = true;
  E.transferMessage.textContent = 'กำลังบันทึก...';

  try {
    const {error} = await supabaseClient.rpc(
      'confirm_transfer_refund_v3_6_4',
      {
        p_return_id: selectedReturn.return_id,
        p_transfer_reference: reference
      }
    );
    if (error) throw error;
    E.transferDialog.close();
    selectedReturn = null;
    await searchReturns();
  } catch (error) {
    E.transferMessage.textContent = error.message || 'บันทึกไม่สำเร็จ';
  } finally {
    busy = false;
    E.confirmTransfer.disabled = false;
  }
}

E.searchButton.addEventListener('click', searchReturns);
E.resetButton.addEventListener('click', () => {
  [E.keyword,E.dateFrom,E.dateTo,E.refundMethod,E.refundStatus]
    .forEach(element => element.value = '');
  searchReturns();
});
E.keyword.addEventListener('keydown', event => {
  if (event.key === 'Enter') searchReturns();
});
E.transferForm.addEventListener('submit', confirmTransfer);
E.cancelTransfer.addEventListener('click', () => {
  selectedReturn = null;
  E.transferDialog.close();
});

searchReturns();
