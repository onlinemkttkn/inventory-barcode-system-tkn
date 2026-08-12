(() => {
  'use strict';

  /* TKN v5.31.16 — presentation-only Products Admin UI bridge.
     It only relocates the existing scanner button and normalizes row action layout.
     It does not call remote data APIs and does not replace action click handlers. */

  const tbody = document.getElementById('body');
  const scanMount = document.getElementById('productsScanMount');
  const important = (el, prop, value) => {
    try { el.style.setProperty(prop, value, 'important'); } catch (_) {}
  };

  function relocateScannerButton() {
    if (!scanMount) return;
    const button = document.getElementById('tknUnifiedScanButton');
    if (!button) return;
    if (button.parentElement !== scanMount) scanMount.appendChild(button);
    button.classList.add('tkn-products-scan-toolbar-v53116');
    important(button, 'position', 'static');
    important(button, 'right', 'auto');
    important(button, 'bottom', 'auto');
    important(button, 'left', 'auto');
    important(button, 'top', 'auto');
    important(button, 'z-index', 'auto');
  }

  function classifyAction(control) {
    const text = `${control.textContent || ''} ${control.getAttribute('title') || ''} ${control.getAttribute('aria-label') || ''}`.toLowerCase();
    if (/รายละเอียด|detail/.test(text)) control.classList.add('tkn-action-detail-v53116');
    else if (/barcode|บาร์โค้ด|qr/.test(text)) control.classList.add('tkn-action-barcode-v53116');
    else if (/แก้ไข|edit/.test(text)) control.classList.add('tkn-action-edit-v53116');
  }

  function normalizeActionCell(row) {
    if (!(row instanceof HTMLTableRowElement) || row.cells.length < 8) return;
    const cell = row.cells[row.cells.length - 1];
    cell.classList.add('tkn-products-action-cell-v53116');

    important(cell, 'width', '237px');
    important(cell, 'min-width', '237px');
    important(cell, 'max-width', '237px');
    important(cell, 'white-space', 'nowrap');
    important(cell, 'word-break', 'normal');
    important(cell, 'overflow-wrap', 'normal');
    important(cell, 'writing-mode', 'horizontal-tb');

    const directControls = [...cell.children].filter(el => el.matches?.('button,a,.btn'));
    if (directControls.length > 1 && !cell.querySelector(':scope > .tkn-products-action-group-v53116')) {
      const group = document.createElement('div');
      group.className = 'tkn-products-action-group-v53116';
      directControls.forEach(el => group.appendChild(el));
      cell.appendChild(group);
    }

    for (const wrapper of cell.querySelectorAll(':scope > div, .actions, .row-actions, .action-buttons, .button-row, .tkn-products-action-group-v53116')) {
      important(wrapper, 'display', 'flex');
      important(wrapper, 'flex-direction', 'row');
      important(wrapper, 'flex-wrap', 'nowrap');
      important(wrapper, 'align-items', 'center');
      important(wrapper, 'justify-content', 'flex-end');
      important(wrapper, 'gap', '5px');
      important(wrapper, 'width', '100%');
      important(wrapper, 'max-width', 'none');
      important(wrapper, 'white-space', 'nowrap');
    }

    for (const control of cell.querySelectorAll('button,a,.btn')) {
      classifyAction(control);
      important(control, 'display', 'inline-flex');
      important(control, 'flex', '0 0 auto');
      important(control, 'width', 'auto');
      important(control, 'min-width', '0');
      important(control, 'max-width', 'none');
      important(control, 'height', '32px');
      important(control, 'min-height', '32px');
      important(control, 'margin', '0');
      important(control, 'padding', '0 8px');
      important(control, 'white-space', 'nowrap');
      important(control, 'word-break', 'keep-all');
      important(control, 'overflow-wrap', 'normal');
      important(control, 'writing-mode', 'horizontal-tb');
      important(control, 'overflow', 'visible');
    }
  }

  function normalizeRows() {
    if (!tbody) return;
    for (const row of tbody.rows) normalizeActionCell(row);
  }

  function run() {
    relocateScannerButton();
    normalizeRows();
  }

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('resize', run, { passive:true });
  run();
})();
