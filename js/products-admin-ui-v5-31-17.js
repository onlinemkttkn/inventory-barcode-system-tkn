(() => {
  'use strict';

  const tbody = document.getElementById('body');
  const scanMount = document.getElementById('productsScanMount');

  function important(el, prop, value) {
    try { el.style.setProperty(prop, value, 'important'); } catch (_) {}
  }

  function relocateScannerButton() {
    if (!scanMount) return;
    const button = document.getElementById('tknUnifiedScanButton');
    if (!button) return;
    if (button.parentElement !== scanMount) scanMount.appendChild(button);
    button.classList.add('tkn-products-scan-toolbar-v53117');
    important(button, 'position', 'static');
    ['right','bottom','left','top','inset'].forEach((prop) => important(button, prop, 'auto'));
    important(button, 'z-index', 'auto');
    important(button, 'width', 'auto');
    important(button, 'max-width', '100%');
  }

  function classifyAction(control) {
    const text = `${control.textContent || ''} ${control.getAttribute('title') || ''} ${control.getAttribute('aria-label') || ''}`.toLowerCase();
    control.classList.remove('tkn-action-detail-v53117', 'tkn-action-edit-v53117', 'tkn-action-barcode-v53117');
    if (/รายละเอียด|detail/.test(text)) return 'detail';
    if (/barcode|บาร์โค้ด|qr/.test(text)) return 'barcode';
    if (/แก้ไข|edit/.test(text)) return 'edit';
    return 'other';
  }

  function getDirectControls(cell) {
    return [...cell.querySelectorAll('button,a,.btn')].filter((el, index, arr) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.closest('.tkn-products-action-shell-v53117')) return false;
      if (arr.indexOf(el) !== index) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function normalizeActionCell(row) {
    if (!(row instanceof HTMLTableRowElement) || row.cells.length < 8) return;
    const cell = row.cells[row.cells.length - 1];
    const controls = getDirectControls(cell);
    if (!controls.length) return;

    const detail = [];
    const edit = [];
    const barcode = [];
    const other = [];

    controls.forEach((control) => {
      const kind = classifyAction(control);
      if (kind === 'detail') {
        control.classList.add('tkn-action-detail-v53117');
        detail.push(control);
      } else if (kind === 'edit') {
        control.classList.add('tkn-action-edit-v53117');
        edit.push(control);
      } else if (kind === 'barcode') {
        control.classList.add('tkn-action-barcode-v53117');
        barcode.push(control);
      } else {
        other.push(control);
      }
    });

    const shell = document.createElement('div');
    shell.className = 'tkn-products-action-shell-v53117';

    const ordered = [
      ...detail,
      ...edit,
      ...barcode,
      ...other,
    ];

    ordered.forEach((control) => {
      important(control, 'display', 'inline-flex');
      important(control, 'width', '100%');
      important(control, 'height', '34px');
      important(control, 'margin', '0');
      important(control, 'padding', '0 10px');
      important(control, 'white-space', 'nowrap');
      important(control, 'overflow', 'hidden');
      important(control, 'text-overflow', 'ellipsis');
      important(control, 'writing-mode', 'horizontal-tb');
      important(control, 'word-break', 'keep-all');
      shell.appendChild(control);
    });

    cell.replaceChildren(shell);
  }

  function normalizeRows() {
    if (!tbody) return;
    [...tbody.rows].forEach(normalizeActionCell);
  }

  function run() {
    relocateScannerButton();
    normalizeRows();
  }

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', run, { passive: true });
  window.addEventListener('load', run);
  run();
})();
