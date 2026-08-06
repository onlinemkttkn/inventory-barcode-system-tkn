(() => {
  'use strict';

  const VERSION = '5.14.2';
  const STACK_KEY = 'tkn_safe_page_stack_v2';
  const MAX_STACK = 30;
  const ROOT_PAGES = new Set(['index.html', 'dashboard.html']);

  const PAGE_FALLBACKS = {
    'mobile-stock-check.html': './box-qr-stock.html',
    'box-qr-stock.html': './import-export.html',
    'shopee-import.html': './import-export.html',
    'lazada-import.html': './import-export.html',
    'import-export.html': './dashboard.html',

    'categories-admin.html': './products-admin.html',
    'product-stock-admin.html': './products-admin.html',
    'branch-stock.html': './products-admin.html',

    'receive.html': './inventory-operations.html',
    'issue.html': './inventory-operations.html',
    'transactions.html': './inventory-operations.html',
    'stock-count.html': './inventory-operations.html',
    'stock-count-history.html': './inventory-operations.html',
    'stock-alerts.html': './inventory-operations.html',
    'transfer-create.html': './inventory-operations.html',
    'transfer-receive.html': './inventory-operations.html',
    'transfer-history.html': './inventory-operations.html',

    'pos-box-sale.html': './pos.html',
    'sales-history.html': './pos.html',
    'pos-member.html': './pos.html',
    'receipt.html': './pos.html',
    'sales-return.html': './phase-9-2-bill-search.html',
    'sales-return-history.html': './reports.html',
    'sales-return-report.html': './reports.html',
    'sales-return-receipt.html': './sales-return-history.html',
    'phase-9-2-bill-search.html': './reports.html',
    'phase-9-2-reprint-receipt.html': './phase-9-2-bill-search.html',
    'phase-9-2-void-bill.html': './phase-9-2-bill-search.html',

    'member-history.html': './members.html',
    'purchase-order-create.html': './purchase-order-history.html',
    'purchase-order-history.html': './suppliers.html',
    'hardware-settings.html': './users-admin.html',
    'audit-log.html': './dashboard.html',
    'reports.html': './dashboard.html',
    'products-admin.html': './dashboard.html',
    'inventory-operations.html': './dashboard.html',
    'users-admin.html': './dashboard.html',
    'suppliers.html': './dashboard.html',
    'members.html': './dashboard.html',
    'print-labels.html': './products-admin.html',
    'scanner.html': './inventory-operations.html',
    'pos.html': './dashboard.html'
  };

  const pageName = () => location.pathname.split('/').pop() || 'index.html';

  function normalizeInternalUrl(value) {
    if (!value) return null;
    try {
      const parsed = new URL(value, location.href);
      if (parsed.origin !== location.origin) return null;
      parsed.hash = '';
      return parsed;
    } catch {
      return null;
    }
  }

  function samePage(url) {
    return Boolean(url && url.pathname === location.pathname && url.search === location.search);
  }

  function readStack() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  function writeStack(stack) {
    try {
      sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)));
    } catch {}
  }

  function rememberCurrentPage() {
    const current = normalizeInternalUrl(location.href);
    if (!current || pageName() === 'index.html') return;
    const stack = readStack().filter(value => {
      const parsed = normalizeInternalUrl(value);
      return parsed && !samePage(parsed);
    });
    stack.push(current.href);
    writeStack(stack);
  }

  function stackTarget() {
    const stack = readStack();
    while (stack.length) {
      const value = stack.pop();
      const parsed = normalizeInternalUrl(value);
      if (parsed && !samePage(parsed) && pageNameFromUrl(parsed) !== 'index.html') {
        writeStack(stack);
        return parsed.href;
      }
    }
    writeStack([]);
    return null;
  }

  function pageNameFromUrl(url) {
    return url.pathname.split('/').pop() || 'index.html';
  }

  function referrerTarget() {
    const referrer = normalizeInternalUrl(document.referrer);
    if (!referrer || samePage(referrer)) return null;
    if (pageNameFromUrl(referrer) === 'index.html') return null;
    return referrer.href;
  }

  function fallbackTarget(explicitFallback) {
    const explicit = normalizeInternalUrl(explicitFallback);
    if (explicit && !samePage(explicit)) return explicit.href;

    const bodyFallback = normalizeInternalUrl(document.body?.dataset?.backFallback);
    if (bodyFallback && !samePage(bodyFallback)) return bodyFallback.href;

    const fromStack = stackTarget();
    if (fromStack) return fromStack;

    const mapped = normalizeInternalUrl(PAGE_FALLBACKS[pageName()] || './dashboard.html');
    return mapped?.href || new URL('./dashboard.html', location.href).href;
  }

  function canUseHistory() {
    return Boolean(referrerTarget() && history.length > 1);
  }

  function go(options = {}) {
    const explicitFallback = typeof options === 'string' ? options : options.fallback;
    const preferHistory = typeof options === 'object' ? options.preferHistory !== false : true;
    const replace = typeof options === 'object' && options.replace === true;
    const target = fallbackTarget(explicitFallback);
    const beforeUrl = location.href;

    window.dispatchEvent(new CustomEvent('tkn:before-back', {
      detail: { target, current: beforeUrl, version: VERSION }
    }));

    if (preferHistory && canUseHistory()) {
      history.back();
      window.setTimeout(() => {
        if (location.href === beforeUrl) {
          if (replace) location.replace(target);
          else location.assign(target);
        }
      }, 700);
      return;
    }

    if (replace) location.replace(target);
    else location.assign(target);
  }

  function bind(root = document) {
    root.querySelectorAll('[data-tkn-back]').forEach(button => {
      if (button.dataset.tknBackBound === VERSION) return;
      button.dataset.tknBackBound = VERSION;
      button.addEventListener('click', event => {
        event.preventDefault();
        go({ fallback: button.dataset.backFallback || null });
      });
    });
  }

  window.TKNSafeBack = {
    version: VERSION,
    go,
    bind,
    getFallback: fallbackTarget,
    remember: rememberCurrentPage,
    pageFallbacks: { ...PAGE_FALLBACKS }
  };

  window.addEventListener('pageshow', rememberCurrentPage);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      rememberCurrentPage();
      bind();
    }, { once: true });
  } else {
    rememberCurrentPage();
    bind();
  }
})();
