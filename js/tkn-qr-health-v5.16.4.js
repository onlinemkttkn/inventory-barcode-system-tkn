(() => {
  'use strict';
  const VERSION = '5.16.4';
  const isReady = () => Boolean(window.QRCode && typeof window.QRCode.toCanvas === 'function');
  const detail = () => ({ ready: isReady(), version: window.TKNQR?.version || 'missing', checkedAt: new Date().toISOString() });
  async function wait(timeoutMs = 2500) {
    if (isReady()) return true;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(isReady()); } };
      window.addEventListener('tkn:qr-ready', finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }
  function errorText() {
    return 'ระบบสร้าง QR ยังไม่พร้อม กรุณาตรวจไฟล์ js/vendor/tkn-qrcode-local-v5.16.4.js แล้วรีเฟรชหน้า';
  }
  window.TKNQRHealth = { VERSION, isReady, wait, detail, errorText };
  document.documentElement.dataset.qrEngine = isReady() ? 'ready' : 'missing';
})();
