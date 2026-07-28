(() => {
  'use strict';

  const indicator = document.getElementById('realtimeIndicator');
  const text = document.getElementById('realtimeText');
  const refreshButton = document.getElementById('refreshBtn');
  const reportButton = document.getElementById('loadSalesControl');

  let channel = null;
  let refreshTimer = null;
  let lastRefreshAt = 0;
  let reconnectTimer = null;
  let pollingTimer = null;

  function setState(state, message) {
    if (indicator) indicator.dataset.state = state;
    if (text) text.textContent = message;
  }

  function requestRefresh(source = 'realtime') {
    window.clearTimeout(refreshTimer);

    refreshTimer = window.setTimeout(() => {
      const now = Date.now();
      if (now - lastRefreshAt < 1200) return;
      lastRefreshAt = now;

      if (
        refreshButton &&
        !refreshButton.disabled &&
        !refreshButton.classList.contains('hidden')
      ) {
        refreshButton.click();
      }

      if (reportButton && !reportButton.disabled) {
        reportButton.click();
      }

      setState(
        source === 'polling' ? 'connecting' : 'connected',
        source === 'realtime'
          ? 'อัปเดตล่าสุดจาก Realtime'
          : source === 'polling'
            ? 'ตรวจสอบข้อมูลอัตโนมัติแล้ว'
            : 'เชื่อมต่อ Realtime แล้ว'
      );
    }, 650);
  }

  function startPolling() {
    window.clearInterval(pollingTimer);
    pollingTimer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) requestRefresh('polling');
    }, 30000);
  }

  function cleanup() {
    window.clearTimeout(refreshTimer);
    window.clearTimeout(reconnectTimer);
    window.clearInterval(pollingTimer);

    try {
      if (channel && typeof supabaseClient !== 'undefined') {
        supabaseClient.removeChannel(channel);
      }
    } catch (error) {
      console.warn('Dashboard realtime cleanup skipped:', error);
    }

    channel = null;
  }

  function subscribe() {
    if (channel) {
      try { supabaseClient.removeChannel(channel); } catch (_) { /* no-op */ }
      channel = null;
    }

    window.clearTimeout(reconnectTimer);
    startPolling();

    if (
      typeof supabaseClient === 'undefined' ||
      !supabaseClient?.channel
    ) {
      setState('offline', 'Realtime ยังไม่พร้อม — ระบบตรวจข้อมูลทุก 30 วินาที');
      return;
    }

    setState('connecting', 'กำลังเชื่อมต่อ Realtime');

    try {
      const builder = supabaseClient.channel(`tkn-dashboard-${Date.now()}`);
      const watchedTables = [
        'sales',
        'sales_returns',
        'branch_inventory',
        'products',
        'categories',
        'transfer_documents',
      ];

      watchedTables.forEach((table) => {
        builder.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => requestRefresh('realtime')
        );
      });

      channel = builder.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setState('connected', 'Realtime พร้อมใช้งาน');
          requestRefresh('connected');
          return;
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setState(
            'offline',
            'Realtime ขัดข้อง — ระบบตรวจข้อมูลทุก 30 วินาที'
          );

          window.clearTimeout(reconnectTimer);
          reconnectTimer = window.setTimeout(subscribe, 10000);
        }
      });
    } catch (error) {
      console.warn('Dashboard realtime unavailable:', error);
      setState(
        'offline',
        'Realtime ขัดข้อง — ระบบตรวจข้อมูลทุก 30 วินาที'
      );
    }
  }

  window.addEventListener('online', subscribe);
  window.addEventListener('offline', () => {
    setState('offline', 'ออฟไลน์ — รอเชื่อมต่ออินเทอร์เน็ต');
  });
  window.addEventListener('beforeunload', cleanup);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) requestRefresh('polling');
  });

  subscribe();
})();
