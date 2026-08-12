(() => {
  'use strict';

  /*
    TKN v5.31.20 — presentation-only bridge for Products Admin.
    - Moves the existing Unified Scanner trigger into the page toolbar.
    - Normalizes every rendered product action cell without replacing the original controls.
    - Adds mobile data labels from the table header.
    - No Supabase/fetch/storage/business-data calls.
  */

  const tbody = document.getElementById('body');
  const scanMount = document.getElementById('productsScanMount');
  let scheduled = false;

  const important = (el, prop, value) => {
    try { el.style.setProperty(prop, value, 'important'); } catch (_) {}
  };

  function relocateScannerButton() {
    if (!scanMount) return;
    const button = document.getElementById('tknUnifiedScanButton');
    if (!button) return;
    if (button.parentElement !== scanMount) scanMount.appendChild(button);
    button.classList.add('tkn-products-scan-toolbar-v53120');
    important(button, 'position', 'static');
    for (const prop of ['right','bottom','left','top']) important(button, prop, 'auto');
    important(button, 'z-index', 'auto');
    important(button, 'width', 'auto');
    important(button, 'max-width', '100%');
    important(button, 'writing-mode', 'horizontal-tb');
    important(button, 'white-space', 'nowrap');
  }

  function typeOfAction(control) {
    const text = `${control.textContent || ''} ${control.getAttribute('title') || ''} ${control.getAttribute('aria-label') || ''}`
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (/รายละเอียด|detail|info/.test(text)) return 'detail';
    if (/แก้ไข|edit/.test(text)) return 'edit';
    if (/barcode|บาร์โค้ด|qr/.test(text)) return 'barcode';
    return 'other';
  }

  function normalizeControl(control) {
    control.classList.remove(
      'tkn-action-detail-v53120',
      'tkn-action-edit-v53120',
      'tkn-action-barcode-v53120',
      'tkn-action-other-v53120'
    );
    const type = typeOfAction(control);
    control.classList.add(`tkn-action-${type}-v53120`);

    important(control, 'display', 'inline-flex');
    important(control, 'align-items', 'center');
    important(control, 'justify-content', 'center');
    important(control, 'flex', 'none');
    important(control, 'width', '100%');
    important(control, 'min-width', '0');
    important(control, 'max-width', 'none');
    important(control, 'margin', '0');
    important(control, 'white-space', 'nowrap');
    important(control, 'word-break', 'keep-all');
    important(control, 'overflow-wrap', 'normal');
    important(control, 'writing-mode', 'horizontal-tb');
    important(control, 'text-orientation', 'mixed');
    return type;
  }

  function ensureActionShell(cell) {
    let shell = cell.querySelector(':scope > .tkn-products-action-shell-v53120');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'tkn-products-action-shell-v53120';

      /* Move every original child into one visual shell. Moving nodes keeps their listeners. */
      const originalChildren = [...cell.childNodes];
      originalChildren.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
          node.remove();
          return;
        }
        shell.appendChild(node);
      });
      cell.appendChild(shell);
    }

    const controls = [...shell.querySelectorAll('button,a,[role="button"],.btn')]
      .filter((el, index, arr) => el instanceof HTMLElement && arr.indexOf(el) === index);

    /* Keep original wrappers/listeners but let the buttons participate in the shell grid. */
    for (const wrapper of [...shell.querySelectorAll('*')]) {
      if (!(wrapper instanceof HTMLElement)) continue;
      if (wrapper.matches('button,a,[role="button"],.btn')) continue;
      if (wrapper.querySelector('button,a,[role="button"],.btn')) {
        wrapper.classList.add('tkn-action-wrapper-v53120');
      }
    }

    controls.forEach(normalizeControl);
    return shell;
  }

  function applyMobileLabels(row, labels) {
    [...row.cells].forEach((cell, index) => {
      if (!cell.dataset.label) cell.dataset.label = labels[index] || '';
    });
  }

  function normalizeRows() {
    if (!tbody) return;
    const table = tbody.closest('table');
    const labels = table
      ? [...table.querySelectorAll('thead th')].map((th) => (th.textContent || '').replace(/\s+/g, ' ').trim())
      : [];

    for (const row of [...tbody.rows]) {
      if (!(row instanceof HTMLTableRowElement) || row.cells.length < 8) continue;
      applyMobileLabels(row, labels);
      const cell = row.cells[row.cells.length - 1];
      cell.classList.add('tkn-products-action-cell-v53120');
      important(cell, 'white-space', 'normal');
      important(cell, 'word-break', 'normal');
      important(cell, 'overflow-wrap', 'normal');
      important(cell, 'writing-mode', 'horizontal-tb');
      ensureActionShell(cell);
    }
  }

  function run() {
    scheduled = false;
    relocateScannerButton();
    normalizeRows();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList:true, subtree:true });
  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule, { passive:true });
  schedule();
})();
