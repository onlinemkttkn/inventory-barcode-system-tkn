(() => {
  'use strict';

  /*
    TKN v5.31.14 presentation-only action-cell guard.
    It never reads/writes data and never replaces click handlers.
    Purpose: neutralize legacy fixed/square button widths after product rows render.
  */
  const tbody = document.getElementById('body');
  if (!tbody) return;

  const important = (el, prop, value) => el.style.setProperty(prop, value, 'important');

  function normalizeActionCell(row) {
    if (!(row instanceof HTMLTableRowElement) || row.cells.length < 8) return;
    const cell = row.cells[row.cells.length - 1];
    cell.classList.add('tkn-products-action-cell-v53114');

    important(cell, 'width', '190px');
    important(cell, 'min-width', '190px');
    important(cell, 'max-width', '190px');
    important(cell, 'white-space', 'nowrap');
    important(cell, 'word-break', 'normal');
    important(cell, 'overflow-wrap', 'normal');
    important(cell, 'writing-mode', 'horizontal-tb');
    important(cell, 'overflow', 'visible');
    important(cell, 'text-align', 'right');

    /* Current runtime may render action controls inside a div/wrapper. */
    for (const wrapper of cell.querySelectorAll(':scope > div, .actions, .row-actions, .action-buttons, .button-row')) {
      important(wrapper, 'display', 'flex');
      important(wrapper, 'flex-direction', 'row');
      important(wrapper, 'flex-wrap', 'nowrap');
      important(wrapper, 'align-items', 'center');
      important(wrapper, 'justify-content', 'flex-end');
      important(wrapper, 'gap', '6px');
      important(wrapper, 'width', '100%');
      important(wrapper, 'max-width', 'none');
      important(wrapper, 'white-space', 'nowrap');
    }

    for (const control of cell.querySelectorAll('button, a, .btn')) {
      important(control, 'display', 'inline-flex');
      important(control, 'flex', '0 0 auto');
      important(control, 'align-items', 'center');
      important(control, 'justify-content', 'center');
      important(control, 'width', 'auto');
      important(control, 'min-width', 'max-content');
      important(control, 'max-width', 'none');
      important(control, 'height', 'auto');
      important(control, 'min-height', '32px');
      important(control, 'margin', '0');
      important(control, 'padding', '6px 9px');
      important(control, 'white-space', 'nowrap');
      important(control, 'word-break', 'keep-all');
      important(control, 'overflow-wrap', 'normal');
      important(control, 'writing-mode', 'horizontal-tb');
      important(control, 'text-orientation', 'mixed');
      important(control, 'overflow', 'visible');
      important(control, 'line-height', '1.15');
    }
  }

  function normalizeAll() {
    for (const row of tbody.rows) normalizeActionCell(row);
  }

  const observer = new MutationObserver(normalizeAll);
  observer.observe(tbody, { childList: true, subtree: true });

  normalizeAll();
})();
