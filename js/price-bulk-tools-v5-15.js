(() => {
  'use strict';
  const root = document.getElementById('priceBulkTools');
  if (!root) return;

  const E = {
    markup: root.querySelector('#bulkMarkupPercent'),
    vat: root.querySelector('#bulkVatRate'),
    vatMode: root.querySelector('#bulkVatMode'),
    rounding: root.querySelector('#bulkRoundPrice'),
    scope: root.querySelector('#bulkPriceScope'),
    calculate: root.querySelector('#bulkCalculateBtn'),
    undo: root.querySelector('#bulkUndoBtn'),
    result: root.querySelector('#bulkPriceResult'),
    presets: [...root.querySelectorAll('[data-markup-preset]')],
    dialog: document.getElementById('bulkPricePreviewDialog'),
    previewBody: document.getElementById('bulkPricePreviewBody'),
    previewSummary: document.getElementById('bulkPricePreviewSummary'),
    close: document.getElementById('bulkPricePreviewClose'),
    accept: document.getElementById('bulkPricePreviewAccept'),
    cancel: document.getElementById('bulkPricePreviewCancel'),
  };
  let pending = null;

  const money = value => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const setResult = (text, type = '') => {
    E.result.textContent = text;
    E.result.className = `price-bulk-result is-show ${type ? `is-${type}` : ''}`.trim();
  };

  function api() {
    return window.TKNMarketplacePriceAPI;
  }

  function options() {
    return {
      markupPercent: Number(E.markup.value),
      vatRate: Number(E.vat.value),
      costIncludesVat: E.vatMode.value === 'INCLUDED',
      roundToEndingZero: E.rounding.checked,
      scope: E.scope.value,
    };
  }

  function validateOptions(value) {
    if (!Number.isFinite(value.markupPercent) || value.markupPercent < 0 || value.markupPercent > 1000) return 'เปอร์เซ็นต์กำไรต้องอยู่ระหว่าง 0–1,000%';
    if (!Number.isFinite(value.vatRate) || value.vatRate < 0 || value.vatRate > 100) return 'VAT ต้องอยู่ระหว่าง 0–100%';
    return '';
  }

  function renderPreview(result) {
    const changed = result.rows || [];
    E.previewSummary.innerHTML = `
      <article><span>รายการเป้าหมาย</span><strong>${Number(result.targetCount || 0).toLocaleString('th-TH')}</strong></article>
      <article><span>คำนวณสำเร็จ</span><strong>${Number(result.changedCount || 0).toLocaleString('th-TH')}</strong></article>
      <article><span>ไม่มีต้นทุน/ข้าม</span><strong>${Number(result.skippedCount || 0).toLocaleString('th-TH')}</strong></article>
      <article><span>กำไรที่ใช้</span><strong>${Number(result.options?.markupPercent || 0).toLocaleString('th-TH')}%</strong></article>`;
    E.previewBody.innerHTML = changed.slice(0, 300).map(row => `<tr>
      <td>${esc(row.sku)}</td><td>${esc(row.name || '-')}</td>
      <td class="num">${money(row.cost)}</td><td class="num">${money(row.before)}</td>
      <td class="num">${money(row.raw)}</td><td class="num"><strong>${money(row.after)}</strong></td>
    </tr>`).join('') || '<tr><td colspan="6">ไม่มีรายการที่คำนวณได้</td></tr>';
    E.dialog?.showModal();
  }

  E.presets.forEach(button => button.addEventListener('click', () => {
    E.markup.value = button.dataset.markupPreset;
    E.presets.forEach(item => item.classList.toggle('is-active', item === button));
  }));
  E.markup.addEventListener('input', () => E.presets.forEach(item => item.classList.toggle('is-active', Number(item.dataset.markupPreset) === Number(E.markup.value))));

  E.calculate.addEventListener('click', () => {
    const service = api();
    if (!service?.preview || !service?.apply) return setResult('ระบบจัดการราคายังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่', 'error');
    const opts = options();
    const invalid = validateOptions(opts);
    if (invalid) return setResult(invalid, 'error');
    try {
      pending = service.preview(opts);
      if (!pending.changedCount) return setResult(`ไม่พบรายการที่คำนวณได้ · ข้าม ${pending.skippedCount || 0} รายการ`, 'error');
      renderPreview(pending);
    } catch (error) {
      setResult(error?.message || 'คำนวณราคาไม่สำเร็จ', 'error');
    }
  });

  E.accept?.addEventListener('click', () => {
    if (!pending) return;
    try {
      const applied = api().apply(pending);
      setResult(`ใส่ราคาขายร่างแล้ว ${Number(applied.changedCount || 0).toLocaleString('th-TH')} SKU · ยังไม่อัปเดตระบบจริง สามารถแก้ตัวเลขในตารางก่อนกดยืนยัน`, 'success');
      E.undo.disabled = false;
      E.dialog.close();
      pending = null;
    } catch (error) {
      setResult(error?.message || 'นำราคาขายร่างไปใช้ไม่สำเร็จ', 'error');
    }
  });
  E.cancel?.addEventListener('click', () => { pending = null; E.dialog.close(); });
  E.close?.addEventListener('click', () => { pending = null; E.dialog.close(); });
  E.undo.addEventListener('click', () => {
    const result = api()?.undo?.();
    if (!result?.restoredCount) return setResult('ไม่มีการคำนวณล่าสุดให้ย้อนคืน', 'error');
    setResult(`ย้อนคืนราคาก่อนคำนวณแล้ว ${Number(result.restoredCount).toLocaleString('th-TH')} SKU`, 'success');
    E.undo.disabled = true;
  });
})();
