export class MobileBarcodeScanner {
  constructor({ onScan, messageElement = null } = {}) {
    this.onScan = onScan;
    this.messageElement = messageElement;
    this.stream = null;
    this.detector = null;
    this.raf = null;
    this.dialog = null;
    this.video = null;
  }

  message(text, type = '') {
    if (!this.messageElement) return;
    this.messageElement.textContent = text;
    this.messageElement.className = `message ${type}`.trim();
  }

  supported() {
    return Boolean(
      navigator.mediaDevices?.getUserMedia &&
      'BarcodeDetector' in window
    );
  }

  async open() {
    if (!this.supported()) {
      this.message(
        'อุปกรณ์นี้ยังไม่รองรับการสแกนผ่านกล้อง กรุณากรอกบาร์โค้ดด้วยตนเอง',
        'error'
      );
      return;
    }

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'scanner-dialog';
    this.dialog.innerHTML = `
      <div class="scanner-panel">
        <div class="scanner-head">
          <div>
            <strong>สแกน QR / Barcode</strong>
            <small>วางรหัสให้อยู่กลางกรอบ</small>
          </div>
          <button type="button" class="btn secondary" data-close>ปิด</button>
        </div>
        <div class="scanner-frame">
          <video playsinline muted></video>
          <div class="scanner-target"></div>
        </div>
        <p class="message" data-message>กำลังเปิดกล้อง...</p>
      </div>
    `;
    document.body.appendChild(this.dialog);
    this.video = this.dialog.querySelector('video');
    this.dialog.querySelector('[data-close]').onclick = () => this.close();
    this.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.close();
    });
    this.dialog.showModal();

    try {
      this.detector = new BarcodeDetector({
        formats: [
          'qr_code', 'code_128', 'code_39', 'ean_13',
          'ean_8', 'upc_a', 'upc_e', 'itf'
        ]
      });

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      this.dialog.querySelector('[data-message]').textContent =
        'พร้อมสแกน';
      this.scanLoop();
    } catch (error) {
      this.dialog.querySelector('[data-message]').textContent =
        `เปิดกล้องไม่สำเร็จ: ${error.message}`;
    }
  }

  async scanLoop() {
    if (!this.video || !this.detector) return;
    try {
      const codes = await this.detector.detect(this.video);
      const value = codes?.[0]?.rawValue?.trim();
      if (value) {
        navigator.vibrate?.(100);
        await this.onScan?.(value);
        this.close();
        return;
      }
    } catch (error) {
      console.warn('Barcode scan error:', error);
    }
    this.raf = requestAnimationFrame(() => this.scanLoop());
  }

  close() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(track => track.stop());
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.video = null;
    this.stream = null;
    this.detector = null;
  }
}
