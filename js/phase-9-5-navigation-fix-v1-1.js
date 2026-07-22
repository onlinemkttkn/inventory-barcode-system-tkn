(() => {
  'use strict';

  const routes = Object.freeze({
    dashboard: './dashboard-integrated-phase-9-5-v1-1.html',
    billSearch: './phase-9-2-bill-search-integrated-v1-1.html',
    returnHistory: './sales-return-history-integrated-v1-1.html',
    returnReport: './sales-return-report-integrated-v1-1.html'
  });

  function go(url) {
    window.location.assign(url);
  }

  function isPopup() {
    return Boolean(window.opener && !window.opener.closed);
  }

  function closeOrGo(fallback) {
    if (isPopup()) {
      window.close();
      window.setTimeout(() => {
        if (!window.closed) go(fallback);
      }, 200);
      return;
    }
    go(fallback);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest(
      '#backButton, #cancelButton, #closeButton, '
      + '[data-nav-dashboard], [data-nav-bill-search]'
    );
    if (!target) return;

    // Capture before legacy history.back()/window.location handlers.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (target.matches('[data-nav-dashboard]')) {
      go(routes.dashboard);
      return;
    }

    if (target.matches('[data-nav-bill-search]')) {
      go(routes.billSearch);
      return;
    }

    const page = document.body.dataset.integratedPage || '';

    if (target.id === 'closeButton') {
      closeOrGo(page === 'return-receipt' ? routes.returnHistory : routes.dashboard);
      return;
    }

    if (page === 'sales-return') {
      closeOrGo(routes.billSearch);
      return;
    }

    if (page === 'bill-search') {
      go(routes.dashboard);
      return;
    }

    go(routes.dashboard);
  }, true);

  // Browser Back on integrated pages also follows the app route instead of
  // wandering through popup/query history.
  if (document.body.dataset.lockBack === 'true') {
    history.replaceState({ tknIntegrated: true }, '', window.location.href);
    history.pushState({ tknIntegrated: true }, '', window.location.href);

    window.addEventListener('popstate', () => {
      const page = document.body.dataset.integratedPage || '';
      if (page === 'sales-return') {
        closeOrGo(routes.billSearch);
      } else {
        go(routes.dashboard);
      }
    });
  }
})();
