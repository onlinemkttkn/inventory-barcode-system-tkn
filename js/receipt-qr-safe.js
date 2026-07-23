(() => {
  'use strict';

  async function render(canvas, value, options = {}) {
    if (!canvas) return false;

    if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
      try {
        await window.QRCode.toCanvas(canvas, String(value || ''), options);
        return true;
      } catch (error) {
        console.warn('QR rendering failed:', error);
      }
    }

    const width = Number(options.width || 90);
    canvas.width = width;
    canvas.height = width;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, width);
    context.strokeStyle = '#111';
    context.strokeRect(1, 1, width - 2, width - 2);
    context.fillStyle = '#111';
    context.textAlign = 'center';
    context.font = `${Math.max(9, Math.floor(width / 10))}px sans-serif`;
    context.fillText('QR ไม่พร้อม', width / 2, width / 2 - 5);
    context.font = `${Math.max(7, Math.floor(width / 13))}px sans-serif`;
    context.fillText(String(value || '').slice(0, 18), width / 2, width / 2 + 13);
    return false;
  }

  window.TKNReceiptQR = { render };
})();