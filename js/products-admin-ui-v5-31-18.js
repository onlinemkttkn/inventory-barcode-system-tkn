(() => {
  'use strict';

  /* Presentation-only bridge for Products Admin.
     - Moves existing Unified Scanner button into the page toolbar.
     - Groups the existing Edit + Barcode controls without replacing click handlers.
     - Does not call Supabase and does not change product/stock data. */

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
    button.classList.add('tkn-products-scan-toolbar-v53118');
    important(button, 'position', 'static');
    for (const prop of ['right','bottom','left','top','inset']) important(button, prop, 'auto');
    important(button, 'z-index', 'auto');
  }

  function actionType(control) {
    const text = `${control.textContent || ''} ${control.getAttribute('title') || ''} ${control.getAttribute('aria-label') || ''}`.toLowerCase();
    if (/barcode|บาร์โค้ด|qr/.test(text)) return 'barcode';
    if (/แก้ไข|edit/.test(text)) return 'edit';
    return 'other';
  }

  function normalizeActionCell(row) {
    if (!(row instanceof HTMLTableRowElement) || row.cells.length < 8) return;
    const cell = row.cells[row.cells.length - 1];
    if (cell.querySelector(':scope > .tkn-products-action-shell-v53118')) return;

    const controls = [...cell.children].filter((el) => el instanceof HTMLElement && el.matches('button,a,.btn'));
    if (!controls.length) return;

    const shell = document.createElement('div');
    shell.className = 'tkn-products-action-shell-v53118';

    const edit = [];
    const barcode = [];
    const other = [];
    for (const control of controls) {
      const kind = actionType(control);
      control.classList.remove('tkn-action-edit-v53118','tkn-action-barcode-v53118');
      if (kind === 'edit') {
        control.classList.add('tkn-action-edit-v53118');
        edit.push(control);
      } else if (kind === 'barcode') {
        control.classList.add('tkn-action-barcode-v53118');
        barcode.push(control);
      } else {
        other.push(control);
      }
    }

    [...edit, ...barcode, ...other].forEach((control) => shell.appendChild(control));
    cell.appendChild(shell);
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
  window.addEventListener('load', run);
  run();
})();
