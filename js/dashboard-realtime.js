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
        'connected',
        source === 'realtime'
          ? 'อัปเดตล่าสุดจาก Realtime'
          : 'เชื่อมต่อ Realtime แล้ว'
      );
    }, 650);
  }

  function cleanup() {
    window.clearTimeout(refreshTimer);
    window.clearTimeout(reconnectTimer);

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
    cleanup();

    if (
      typeof supabaseClient === 'undefined' ||
      !supabaseClient?.channel
    ) {
      setState('offline', 'Realtime ยังไม่พร้อม — ใช้ปุ่มรีเฟรชได้ตามปกติ');
      return;
    }

    setState('connecting', 'กำลังเชื่อมต่อ Realtime');

    try {
      channel = supabaseClient
        .channel(`tkn-dashboard-${Date.now()}`)
        .on(
          'postgres_changes',
          {event:'*',schema:'public',table:'sales'},
          () => requestRefresh('realtime')
        )
        .on(
          'postgres_changes',
          {event:'*',schema:'public',table:'sales_returns'},
          () => requestRefresh('realtime')
        )
        .on(
          'postgres_changes',
          {event:'*',schema:'public',table:'branch_inventory'},
          () => requestRefresh('realtime')
        )
        .subscribe(status => {
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
              'Realtime ขัดข้อง — ระบบยังใช้ปุ่มรีเฟรชได้'
            );

            window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(subscribe, 10000);
          }
        });
    } catch (error) {
      console.warn('Dashboard realtime unavailable:', error);
      setState(
        'offline',
        'Realtime ขัดข้อง — ระบบยังใช้ปุ่มรีเฟรชได้'
      );
    }
  }

  window.addEventListener('online', subscribe);
  window.addEventListener('offline', () => {
    setState('offline', 'ออฟไลน์ — รอเชื่อมต่ออินเทอร์เน็ต');
  });
  window.addEventListener('beforeunload', cleanup);

  subscribe();
})();