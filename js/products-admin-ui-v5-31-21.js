(() => {
  'use strict';

  /*
    TKN v5.31.21 — Products Admin responsive presentation bridge.
    Scope: UI only.
    - Keeps the existing scanner trigger and product action nodes/listeners.
    - Adds data labels for card mode.
    - Applies a mobile/tablet hard layout guard at <= 1024px to neutralize
      legacy table/action inline widths without touching Desktop behavior.
    - No Supabase/fetch/XHR/storage/business-data calls.
  */

  const tbody = document.getElementById('body');
  const scanMount = document.getElementById('productsScanMount');
  const MOBILE_MAX = 1024;
  const PHONE_MAX = 600;
  const SMALL_PHONE_MAX = 360;
  let scheduled = false;

  const responsiveOriginals = new Map();

  const important = (el, prop, value) => {
    try { el.style.setProperty(prop, value, 'important'); } catch (_) {}
  };

  function saveAndSet(el, prop, value) {
    if (!(el instanceof HTMLElement)) return;
    let saved = responsiveOriginals.get(el);
    if (!saved) {
      saved = new Map();
      responsiveOriginals.set(el, saved);
    }
    if (!saved.has(prop)) {
      saved.set(prop, {
        value: el.style.getPropertyValue(prop),
        priority: el.style.getPropertyPriority(prop),
      });
    }
    important(el, prop, value);
  }

  function restoreResponsiveGuard() {
    for (const [el, props] of responsiveOriginals.entries()) {
      if (!(el instanceof HTMLElement)) continue;
      for (const [prop, original] of props.entries()) {
        try {
          if (original.value) el.style.setProperty(prop, original.value, original.priority || '');
          else el.style.removeProperty(prop);
        } catch (_) {}
      }
    }
    responsiveOriginals.clear();
    document.body.classList.remove('tkn-pa-mobile-v53121', 'tkn-pa-phone-v53121', 'tkn-pa-small-phone-v53121');
  }

  function relocateScannerButton() {
    if (!scanMount) return;
    const button = document.getElementById('tknUnifiedScanButton');
    if (!button) return;
    if (button.parentElement !== scanMount) scanMount.appendChild(button);
    button.classList.add('tkn-products-scan-toolbar-v53121');
    important(button, 'position', 'static');
    for (const prop of ['right', 'bottom', 'left', 'top']) important(button, prop, 'auto');
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
      'tkn-action-detail-v53121',
      'tkn-action-edit-v53121',
      'tkn-action-barcode-v53121',
      'tkn-action-other-v53121'
    );
    const type = typeOfAction(control);
    control.classList.add(`tkn-action-${type}-v53121`);

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
    let shell = cell.querySelector(':scope > .tkn-products-action-shell-v53121');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'tkn-products-action-shell-v53121';

      /* Moving the original nodes preserves their existing click listeners. */
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

    for (const wrapper of [...shell.querySelectorAll('*')]) {
      if (!(wrapper instanceof HTMLElement)) continue;
      if (wrapper.matches('button,a,[role="button"],.btn')) continue;
      if (wrapper.querySelector('button,a,[role="button"],.btn')) {
        wrapper.classList.add('tkn-action-wrapper-v53121');
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
      cell.classList.add('tkn-products-action-cell-v53121');
      important(cell, 'white-space', 'normal');
      important(cell, 'word-break', 'normal');
      important(cell, 'overflow-wrap', 'normal');
      important(cell, 'writing-mode', 'horizontal-tb');
      ensureActionShell(cell);
    }
  }

  function applyResponsiveGuard() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    if (width > MOBILE_MAX) {
      if (responsiveOriginals.size) restoreResponsiveGuard();
      return;
    }

    document.body.classList.add('tkn-pa-mobile-v53121');
    document.body.classList.toggle('tkn-pa-phone-v53121', width <= PHONE_MAX);
    document.body.classList.toggle('tkn-pa-small-phone-v53121', width <= SMALL_PHONE_MAX);

    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;
    const thead = table.tHead;
    const outerWrap = table.closest('.table-scroll');
    const appWrap = table.closest('.tkn-table-scroll');

    for (const wrap of [outerWrap, appWrap]) {
      if (!(wrap instanceof HTMLElement)) continue;
      saveAndSet(wrap, 'display', 'block');
      saveAndSet(wrap, 'width', '100%');
      saveAndSet(wrap, 'max-width', '100%');
      saveAndSet(wrap, 'min-width', '0');
      saveAndSet(wrap, 'overflow', 'visible');
      saveAndSet(wrap, 'overflow-x', 'visible');
      saveAndSet(wrap, 'overflow-y', 'visible');
      saveAndSet(wrap, 'padding', '0');
      saveAndSet(wrap, 'margin', '0');
      saveAndSet(wrap, 'box-sizing', 'border-box');
    }

    saveAndSet(table, 'display', 'block');
    saveAndSet(table, 'width', '100%');
    saveAndSet(table, 'max-width', '100%');
    saveAndSet(table, 'min-width', '0');
    saveAndSet(table, 'table-layout', 'auto');
    saveAndSet(table, 'margin', '0');

    saveAndSet(tbody, 'display', 'block');
    saveAndSet(tbody, 'width', '100%');
    saveAndSet(tbody, 'max-width', '100%');
    saveAndSet(tbody, 'min-width', '0');

    if (thead instanceof HTMLElement) saveAndSet(thead, 'display', 'none');

    for (const row of [...tbody.rows]) {
      if (!(row instanceof HTMLTableRowElement)) continue;
      saveAndSet(row, 'display', 'grid');
      saveAndSet(row, 'grid-template-columns', width <= SMALL_PHONE_MAX ? '1fr' : 'repeat(2,minmax(0,1fr))');
      saveAndSet(row, 'width', '100%');
      saveAndSet(row, 'max-width', '100%');
      saveAndSet(row, 'min-width', '0');
      saveAndSet(row, 'box-sizing', 'border-box');
      saveAndSet(row, 'overflow', 'hidden');

      [...row.cells].forEach((cell, index) => {
        saveAndSet(cell, 'width', 'auto');
        saveAndSet(cell, 'min-width', '0');
        saveAndSet(cell, 'max-width', 'none');
        saveAndSet(cell, 'position', 'static');
        saveAndSet(cell, 'right', 'auto');
        saveAndSet(cell, 'left', 'auto');
        saveAndSet(cell, 'float', 'none');
        saveAndSet(cell, 'writing-mode', 'horizontal-tb');
        saveAndSet(cell, 'text-orientation', 'mixed');
        saveAndSet(cell, 'word-break', 'normal');
        saveAndSet(cell, 'overflow-wrap', 'anywhere');
        saveAndSet(cell, 'white-space', 'normal');
        saveAndSet(cell, 'overflow', 'visible');
        saveAndSet(cell, 'box-sizing', 'border-box');

        const fullWidth = index === 0 || index === 1 || index === row.cells.length - 1 || width <= SMALL_PHONE_MAX;
        saveAndSet(cell, 'grid-column', fullWidth ? '1 / -1' : 'auto');

        if (index === row.cells.length - 1) {
          saveAndSet(cell, 'display', 'block');
          saveAndSet(cell, 'padding', '10px 12px 12px');
        } else {
          saveAndSet(cell, 'display', width <= SMALL_PHONE_MAX && index >= 2 ? 'grid' : 'flex');
          saveAndSet(cell, 'flex-direction', 'column');
          saveAndSet(cell, 'align-items', 'flex-start');
          saveAndSet(cell, 'justify-content', 'center');
        }
      });

      const actionCell = row.cells[row.cells.length - 1];
      const shell = actionCell?.querySelector(':scope > .tkn-products-action-shell-v53121');
      if (shell instanceof HTMLElement) {
        saveAndSet(shell, 'display', 'grid');
        saveAndSet(shell, 'grid-template-columns', width <= SMALL_PHONE_MAX ? '1fr' : 'repeat(2,minmax(0,1fr))');
        saveAndSet(shell, 'gap', '8px');
        saveAndSet(shell, 'width', '100%');
        saveAndSet(shell, 'max-width', 'none');
        saveAndSet(shell, 'min-width', '0');
        saveAndSet(shell, 'margin', '0');
        saveAndSet(shell, 'box-sizing', 'border-box');

        for (const wrapper of [...shell.querySelectorAll('.tkn-action-wrapper-v53121')]) {
          saveAndSet(wrapper, 'display', 'contents');
        }

        const controls = [...shell.querySelectorAll('button,a,[role="button"],.btn')]
          .filter((el, index, arr) => el instanceof HTMLElement && arr.indexOf(el) === index);
        for (const control of controls) {
          const type = typeOfAction(control);
          saveAndSet(control, 'display', 'inline-flex');
          saveAndSet(control, 'align-items', 'center');
          saveAndSet(control, 'justify-content', 'center');
          saveAndSet(control, 'width', '100%');
          saveAndSet(control, 'min-width', '0');
          saveAndSet(control, 'max-width', 'none');
          saveAndSet(control, 'height', width <= PHONE_MAX ? '46px' : '44px');
          saveAndSet(control, 'min-height', width <= PHONE_MAX ? '46px' : '44px');
          saveAndSet(control, 'margin', '0');
          saveAndSet(control, 'padding', '0 12px');
          saveAndSet(control, 'white-space', 'nowrap');
          saveAndSet(control, 'word-break', 'keep-all');
          saveAndSet(control, 'overflow-wrap', 'normal');
          saveAndSet(control, 'writing-mode', 'horizontal-tb');
          saveAndSet(control, 'text-orientation', 'mixed');
          saveAndSet(control, 'overflow', 'hidden');
          saveAndSet(control, 'text-overflow', 'clip');
          saveAndSet(control, 'font-size', width <= PHONE_MAX ? '12px' : '12px');
          saveAndSet(control, 'line-height', '1.2');
          saveAndSet(control, 'box-sizing', 'border-box');
          saveAndSet(control, 'grid-column', type === 'detail' || type === 'other' ? '1 / -1' : 'auto');
        }
      }
    }
  }

  function run() {
    scheduled = false;
    relocateScannerButton();
    normalizeRows();
    applyResponsiveGuard();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  schedule();
})();
