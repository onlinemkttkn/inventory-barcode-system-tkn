export class MobileBarcodeScanner {
  constructor({ onScan, messageElement = null } = {}) {
    this.onScan = onScan;
    this.messageElement = messageElement;
    this.stream = null;
    this.detector = null;
    this.raf = null;
    this.dialog = null;
    this.video = null;
    this.zxingReader = null;
    this.zxingControls = null;
    this.mode = null;
    this.closed = false;
  }

  message(text, type = '') {
    if (!this.messageElement) return;
    this.messageElement.textContent = text;
    this.messageElement.className = `message ${type}`.trim();
  }

  cameraSupported() {
    return Boolean(
      window.isSecureContext &&
      navigator.mediaDevices?.getUserMedia
    );
  }

  detectorSupported() {
    return 'BarcodeDetector' in window;
  }

  zxingSupported() {
    return Boolean(window.ZXingBrowser?.BrowserMultiFormatReader);
  }

  async open() {
    if (!this.cameraSupported()) {
      this.message(
        location.protocol === 'https:'
          ? 'อุปกรณ์นี้ไม่อนุญาตให้เปิดกล้อง กรุณาตรวจสิทธิ์กล้อง'
          : 'กล้องมือถือจำเป็นต้องเปิดเว็บไซต์ผ่าน HTTPS',
        'error'
      );
      return;
    }

    if (!this.detectorSupported() && !this.zxingSupported()) {
      this.message(
        'โหลดระบบสแกนไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
        'error'
      );
      return;
    }

    this.closed = false;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'scanner-dialog';
    this.dialog.innerHTML = `
      <div class="scanner-panel">
        <div class="scanner-head">
          <div>
            <strong>สแกน QR / Barcode</strong>
            <small>ใช้กล้องหลังและวางรหัสให้อยู่กลางกรอบ</small>
          </div>
          <button type="button" class="btn secondary" data-close>ปิด</button>
        </div>
        <div class="scanner-frame">
          <video playsinline webkit-playsinline muted autoplay></video>
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
    this.dialog.addEventListener('close', () => this.cleanup());
    this.dialog.showModal();

    try {
      if (this.detectorSupported()) {
        await this.openWithBarcodeDetector();
      } else {
        await this.openWithZXing();
      }
    } catch (error) {
      console.error('Mobile scanner open error:', error);
      const message = this.dialog?.querySelector('[data-message]');
      if (message) {
        message.textContent = this.cameraErrorMessage(error);
        message.className = 'message error';
      }
      this.message(this.cameraErrorMessage(error), 'error');
      this.cleanupCamera();
    }
  }

  cameraErrorMessage(error) {
    const name = String(error?.name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์ Camera ใน Browser';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'ไม่พบกล้องในอุปกรณ์นี้';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปกล้องแล้วลองใหม่';
    }
    return `เปิดกล้องไม่สำเร็จ: ${error?.message || 'Unknown error'}`;
  }

  async preferredDeviceId() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const rear = cameras.find(device =>
        /back|rear|environment|หลัง/i.test(device.label)
      );
      return rear?.deviceId || cameras.at(-1)?.deviceId || null;
    } catch {
      return null;
    }
  }

  async openWithBarcodeDetector() {
    this.mode = 'BARCODE_DETECTOR';
    this.detector = new BarcodeDetector({
      formats: [
        'qr_code', 'code_128', 'code_39', 'ean_13',
        'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar'
      ]
    });

    const deviceId = await this.preferredDeviceId();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
      audio: false
    });

    this.video.srcObject = this.stream;
    await this.video.play();
    this.setDialogMessage('พร้อมสแกน · ใช้กล้องหลัง', 'success');
    this.scanLoop();
  }

  async openWithZXing() {
    this.mode = 'ZXING';
    this.zxingReader = new window.ZXingBrowser.BrowserMultiFormatReader();

    const devices = await window.ZXingBrowser.BrowserCodeReader
      .listVideoInputDevices();
    if (!devices.length) throw new Error('ไม่พบกล้องในอุปกรณ์นี้');

    const rear = devices.find(device =>
      /back|rear|environment|หลัง/i.test(device.label)
    );
    const selected = rear || devices.at(-1);

    this.zxingControls = await this.zxingReader.decodeFromVideoDevice(
      selected?.deviceId,
      this.video,
      async (result, error) => {
        if (this.closed) return;
        if (result) {
          const value = result.getText?.()?.trim();
          if (value) await this.handleScan(value);
          return;
        }

        const notFound = window.ZXingBrowser.NotFoundException;
        if (error && notFound && !(error instanceof notFound)) {
          console.debug('ZXing scan:', error);
        }
      }
    );

    this.setDialogMessage('พร้อมสแกน · โหมดรองรับมือถือ', 'success');
  }

  setDialogMessage(text, type = '') {
    const element = this.dialog?.querySelector('[data-message]');
    if (!element) return;
    element.textContent = text;
    element.className = `message ${type}`.trim();
  }

  async scanLoop() {
    if (
      this.closed ||
      !this.video ||
      !this.detector ||
      this.video.readyState < 2
    ) {
      if (!this.closed) {
        this.raf = requestAnimationFrame(() => this.scanLoop());
      }
      return;
    }

    try {
      const codes = await this.detector.detect(this.video);
      const value = codes?.[0]?.rawValue?.trim();
      if (value) {
        await this.handleScan(value);
        return;
      }
    } catch (error) {
      console.warn('BarcodeDetector scan error:', error);
    }

    if (!this.closed) {
      this.raf = requestAnimationFrame(() => this.scanLoop());
    }
  }

  async handleScan(value) {
    if (this.closed) return;
    this.closed = true;
    navigator.vibrate?.(100);
    this.setDialogMessage(`สแกนสำเร็จ: ${value}`, 'success');

    try {
      await this.onScan?.(value);
    } finally {
      this.close();
    }
  }

  cleanupCamera() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;

    try {
      this.zxingControls?.stop();
    } catch {}
    this.zxingControls = null;

    this.stream?.getTracks().forEach(track => track.stop());
    if (this.video) this.video.srcObject = null;

    this.stream = null;
    this.detector = null;
    this.zxingReader = null;
    this.mode = null;
  }

  cleanup() {
    this.cleanupCamera();
    this.dialog?.remove();
    this.dialog = null;
    this.video = null;
  }

  close() {
    this.closed = true;
    this.cleanupCamera();
    if (this.dialog?.open) this.dialog.close();
    else this.cleanup();
  }
}
