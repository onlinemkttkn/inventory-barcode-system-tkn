(() => {
  'use strict';

  const normalizeValue = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    try {
      const url = new URL(value);
      for (const key of ['tracking', 'tracking_number', 'order', 'order_number', 'scan', 'code']) {
        const found = url.searchParams.get(key);
        if (found) return found.trim();
      }
    } catch (_) {}
    return value;
  };

  class TKNTrackingCameraScanner {
    constructor({ onScan, onMessage } = {}) {
      this.onScan = onScan;
      this.onMessage = onMessage;
      this.dialog = null;
      this.video = null;
      this.messageElement = null;
      this.stream = null;
      this.track = null;
      this.detector = null;
      this.reader = null;
      this.controls = null;
      this.raf = null;
      this.busy = false;
      this.closed = true;
      this.torchOn = false;
    }

    supported() {
      return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
    }

    notify(text, type = 'info') {
      this.onMessage?.(text, type);
      if (!this.messageElement) return;
      this.messageElement.textContent = text;
      this.messageElement.className = `sp-camera-message${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
    }

    cameraError(error) {
      const name = String(error?.name || '');
      if (!window.isSecureContext) return 'กล้องใช้งานได้เมื่อเปิดเว็บไซต์ผ่าน HTTPS เท่านั้น';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์ Camera ใน Browser';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'ไม่พบกล้องในอุปกรณ์นี้';
      if (name === 'NotReadableError' || name === 'TrackStartError') return 'กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปกล้องแล้วลองใหม่';
      return `เปิดกล้องไม่สำเร็จ: ${error?.message || 'Unknown error'}`;
    }

    buildDialog() {
      const dialog = document.createElement('dialog');
      dialog.id = 'trackingCameraDialog';
      dialog.className = 'sp-camera-dialog';
      dialog.setAttribute('aria-label', 'กล้องสแกน Tracking');
      dialog.innerHTML = `
        <div class="sp-camera-panel">
          <header class="sp-camera-head">
            <div><strong>สแกน Tracking พัสดุ</strong><small>ใช้กล้องหลัง เล็งบาร์โค้ดหรือ QR ให้อยู่ในกรอบ</small></div>
            <button type="button" class="sp-camera-close" data-camera-close>ปิด</button>
          </header>
          <div class="sp-camera-frame">
            <video playsinline webkit-playsinline muted autoplay></video>
            <div class="sp-camera-target" aria-hidden="true"></div>
          </div>
          <footer class="sp-camera-footer">
            <p class="sp-camera-message" data-camera-message>กำลังเปิดกล้อง...</p>
            <button type="button" class="sp-camera-torch" data-camera-torch hidden>เปิดไฟฉาย</button>
          </footer>
        </div>`;
      document.body.appendChild(dialog);
      this.dialog = dialog;
      this.video = dialog.querySelector('video');
      this.messageElement = dialog.querySelector('[data-camera-message]');
      dialog.querySelector('[data-camera-close]').addEventListener('click', () => this.close());
      dialog.querySelector('[data-camera-torch]').addEventListener('click', () => this.toggleTorch());
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); this.close(); });
      dialog.addEventListener('close', () => this.cleanupDialog());
    }

    async preferredDeviceId() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        const rear = cameras.find((device) => /back|rear|environment|หลัง/i.test(device.label));
        return rear?.deviceId || cameras.at(-1)?.deviceId || null;
      } catch (_) {
        return null;
      }
    }

    async open() {
      if (!this.supported()) {
        this.notify(location.protocol === 'https:' ? 'อุปกรณ์นี้ไม่อนุญาตให้เปิดกล้อง กรุณาตรวจสิทธิ์กล้อง' : 'กล้องมือถือจำเป็นต้องเปิดเว็บไซต์ผ่าน HTTPS', 'error');
        return;
      }
      if (!('BarcodeDetector' in window) && !window.ZXingBrowser?.BrowserMultiFormatReader) {
        this.notify('โหลดตัวอ่านบาร์โค้ดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า', 'error');
        return;
      }
      if (this.dialog?.open) return;
      this.closed = false;
      this.busy = false;
      this.buildDialog();
      document.body.classList.add('sp-camera-open');
      this.dialog.showModal();
      try {
        if ('BarcodeDetector' in window) await this.openNative();
        else await this.openZXing();
      } catch (error) {
        console.error('Tracking camera:', error);
        this.notify(this.cameraError(error), 'error');
        this.stopCamera();
      }
    }

    async openNative() {
      const requestedFormats = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar'];
      const supportedFormats = typeof BarcodeDetector.getSupportedFormats === 'function'
        ? await BarcodeDetector.getSupportedFormats()
        : requestedFormats;
      const formats = requestedFormats.filter((format) => supportedFormats.includes(format));
      this.detector = new BarcodeDetector(formats.length ? { formats } : undefined);
      const deviceId = await this.preferredDeviceId();
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.track = this.stream.getVideoTracks()[0] || null;
      this.setupTorch();
      this.notify('พร้อมสแกน · เล็ง Tracking ให้อยู่กลางกรอบ', 'success');
      this.nativeLoop();
    }

    async openZXing() {
      this.reader = new window.ZXingBrowser.BrowserMultiFormatReader();
      const devices = await window.ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
      if (!devices.length) throw new Error('ไม่พบกล้องในอุปกรณ์นี้');
      const rear = devices.find((device) => /back|rear|environment|หลัง/i.test(device.label));
      const selected = rear || devices.at(-1);
      this.controls = await this.reader.decodeFromVideoDevice(selected?.deviceId, this.video, async (result, error) => {
        if (this.closed || this.busy) return;
        if (result) {
          const value = result.getText?.();
          if (value) await this.handleScan(value);
          return;
        }
        const NotFound = window.ZXingBrowser.NotFoundException;
        if (error && NotFound && !(error instanceof NotFound)) console.debug('ZXing tracking scan:', error);
      });
      this.stream = this.video.srcObject || null;
      this.track = this.stream?.getVideoTracks?.()[0] || null;
      this.setupTorch();
      this.notify('พร้อมสแกน · โหมดรองรับมือถือ', 'success');
    }

    setupTorch() {
      const button = this.dialog?.querySelector('[data-camera-torch]');
      if (!button) return;
      const capabilities = this.track?.getCapabilities?.() || {};
      button.hidden = !capabilities.torch;
    }

    async toggleTorch() {
      if (!this.track) return;
      try {
        this.torchOn = !this.torchOn;
        await this.track.applyConstraints({ advanced: [{ torch: this.torchOn }] });
        const button = this.dialog?.querySelector('[data-camera-torch]');
        if (button) button.textContent = this.torchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย';
      } catch (error) {
        this.notify('อุปกรณ์นี้ไม่รองรับการเปิดไฟฉายผ่าน Browser', 'error');
      }
    }

    async nativeLoop() {
      if (this.closed || !this.detector || !this.video) return;
      if (this.video.readyState >= 2) {
        try {
          const codes = await this.detector.detect(this.video);
          const value = codes?.[0]?.rawValue;
          if (value) {
            await this.handleScan(value);
            return;
          }
        } catch (error) {
          console.debug('BarcodeDetector tracking scan:', error);
        }
      }
      if (!this.closed) this.raf = requestAnimationFrame(() => this.nativeLoop());
    }

    async handleScan(raw) {
      if (this.busy || this.closed) return;
      const value = normalizeValue(raw);
      if (!value) return;
      this.busy = true;
      navigator.vibrate?.(90);
      this.notify(`สแกนสำเร็จ: ${value}`, 'success');
      const callback = this.onScan;
      this.close();
      await callback?.(value);
    }

    stopCamera() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      try { this.controls?.stop?.(); } catch (_) {}
      this.controls = null;
      this.stream?.getTracks?.().forEach((track) => track.stop());
      if (this.video) this.video.srcObject = null;
      this.stream = null;
      this.track = null;
      this.detector = null;
      this.reader = null;
      this.torchOn = false;
    }

    cleanupDialog() {
      this.stopCamera();
      document.body.classList.remove('sp-camera-open');
      this.dialog?.remove();
      this.dialog = null;
      this.video = null;
      this.messageElement = null;
      this.closed = true;
      this.busy = false;
    }

    close() {
      this.closed = true;
      this.stopCamera();
      if (this.dialog?.open) this.dialog.close();
      else this.cleanupDialog();
    }
  }

  window.TKNTrackingCameraScanner = TKNTrackingCameraScanner;
})();
