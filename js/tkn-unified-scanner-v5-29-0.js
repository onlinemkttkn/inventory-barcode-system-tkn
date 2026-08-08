(() => {
  'use strict';
  if (window.TKNUnifiedScanner?.version === '5.29.0') return;

  const CONFIG = {
    usbGapMs: 55,
    usbMinLength: 4,
    duplicateMs: 700,
    cameraThrottleMs: 100,
    zxingUrl: 'https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js',
  };

  const state = {
    buffer: '', lastKeyAt: 0, startedAt: 0,
    lastValue: '', lastScanAt: 0,
    dialog: null, video: null, stream: null, track: null,
    detector: null, reader: null, controls: null, raf: 0,
    cameraBusy: false, cameraClosed: true, target: null,
  };

  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function pageName() { return location.pathname.split('/').pop() || 'index.html'; }
  function protectedPage() { return ['stock-promotions.html','print-labels.html'].includes(pageName()); }

  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
  }

  function isTextControl(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }

  function isScanTarget(el) {
    if (!isTextControl(el) || !visible(el)) return false;
    if (el.matches('[type="password"],[type="email"],[type="number"],[type="date"],[type="time"]')) return false;
    if (el.hasAttribute('data-tkn-scan')) return true;
    const text = `${el.id} ${el.name} ${el.placeholder}`.toLowerCase();
    if (/customer|phone|name|note|หมายเหตุ|ค้นหาประวัติ|queueSearch|historySearch/i.test(text)) return false;
    return /(scan|barcode|บาร์โค้ด|สแกน|qr|sku|tracking|รหัสสินค้า|tkn-b|tkn-p)/i.test(text);
  }

  function scoreTarget(el) {
    let score = 0;
    if (el.hasAttribute('data-tkn-scan')) score += 100;
    if (el.autofocus) score += 30;
    const text = `${el.id} ${el.placeholder}`;
    if (/scan|สแกน/i.test(text)) score += 25;
    if (/barcode|บาร์โค้ด|qr|tracking/i.test(text)) score += 20;
    if (document.activeElement === el) score += 80;
    return score;
  }

  function targets() {
    if (protectedPage()) return [];
    return [...document.querySelectorAll('input,textarea')]
      .filter(isScanTarget)
      .sort((a,b) => scoreTarget(b)-scoreTarget(a));
  }

  function activeTarget() {
    const active = document.activeElement;
    if (isScanTarget(active)) return active;
    return targets()[0] || null;
  }

  function normalize(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    try {
      const url = new URL(value);
      for (const key of ['scan','code','barcode','sku','tracking','tracking_number','id']) {
        const found = url.searchParams.get(key);
        if (found) return found.trim();
      }
    } catch (_) {}
    return value;
  }

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.035;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.055);
      osc.addEventListener('ended', () => ctx.close().catch(()=>{}), { once:true });
    } catch (_) {}
  }

  function fireEnter(el) {
    if (el.dataset?.tknScanSubmit === 'false') return;
    const down = new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true });
    el.dispatchEvent(down);
    el.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true }));
    if (!down.defaultPrevented && el.form && typeof el.form.requestSubmit === 'function') {
      queueMicrotask(() => { if (el.isConnected) el.form.requestSubmit(); });
    }
  }

  function deliver(raw, { target = null, source = 'scanner' } = {}) {
    const value = normalize(raw);
    if (!value) return false;
    const now = Date.now();
    if (value === state.lastValue && now - state.lastScanAt < CONFIG.duplicateMs) return false;
    const el = target || activeTarget();
    if (!el) {
      document.dispatchEvent(new CustomEvent('tkn:scan', { detail:{ value, source, target:null } }));
      return false;
    }
    state.lastValue = value; state.lastScanAt = now;
    el.focus({ preventScroll:true });
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
    document.dispatchEvent(new CustomEvent('tkn:scan', { detail:{ value, source, target:el } }));
    navigator.vibrate?.(55); beep();
    fireEnter(el);
    return true;
  }

  function resetBuffer() { state.buffer=''; state.lastKeyAt=0; state.startedAt=0; }

  function usbKeydown(event) {
    if (protectedPage() || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const active = document.activeElement;
    // ถ้า scanner focus อยู่ในช่องสแกน ให้ flow เดิมของหน้าเป็นผู้จัดการ เพื่อเร็วและไม่ยิงซ้ำ
    if (isScanTarget(active)) return;
    // ไม่ดักการพิมพ์ในช่องข้อความทั่วไป
    if (isTextControl(active) || active?.isContentEditable) { resetBuffer(); return; }

    const now = performance.now();
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (state.buffer.length >= CONFIG.usbMinLength) {
        const avg = state.buffer.length > 1 ? (now - state.startedAt) / state.buffer.length : 0;
        if (avg <= CONFIG.usbGapMs * 1.4) {
          event.preventDefault();
          const value = state.buffer;
          resetBuffer();
          deliver(value, { source:'usb' });
          return;
        }
      }
      resetBuffer(); return;
    }
    if (event.key.length !== 1) return;
    if (state.lastKeyAt && now - state.lastKeyAt > CONFIG.usbGapMs * 2.2) resetBuffer();
    if (!state.buffer) state.startedAt = now;
    state.buffer += event.key;
    state.lastKeyAt = now;
  }

  async function ensureZXing() {
    if (window.ZXingBrowser?.BrowserMultiFormatReader) return true;
    const old = document.querySelector('script[data-tkn-zxing]');
    if (old) return new Promise(resolve => {
      if (window.ZXingBrowser?.BrowserMultiFormatReader) return resolve(true);
      old.addEventListener('load',()=>resolve(true),{once:true}); old.addEventListener('error',()=>resolve(false),{once:true});
      setTimeout(()=>resolve(Boolean(window.ZXingBrowser?.BrowserMultiFormatReader)),5500);
    });
    return new Promise(resolve => {
      const s=document.createElement('script'); s.src=CONFIG.zxingUrl; s.async=true; s.dataset.tknZxing='1';
      s.onload=()=>resolve(Boolean(window.ZXingBrowser?.BrowserMultiFormatReader)); s.onerror=()=>resolve(false);
      document.head.appendChild(s); setTimeout(()=>resolve(Boolean(window.ZXingBrowser?.BrowserMultiFormatReader)),5500);
    });
  }

  function cameraSupported() { return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia); }

  function cameraError(error) {
    const name=String(error?.name||'');
    if (!window.isSecureContext) return 'กล้องต้องเปิดผ่าน HTTPS';
    if (/NotAllowed|PermissionDenied/.test(name)) return 'ไม่ได้รับสิทธิ์ใช้กล้อง กรุณาอนุญาต Camera ใน Browser';
    if (/NotFound|DevicesNotFound/.test(name)) return 'ไม่พบกล้องในอุปกรณ์';
    if (/NotReadable|TrackStart/.test(name)) return 'กล้องถูกใช้งานโดยแอปอื่น';
    return error?.message || 'เปิดกล้องไม่สำเร็จ';
  }

  function closeCamera() {
    state.cameraClosed=true; state.cameraBusy=false;
    if (state.raf) cancelAnimationFrame(state.raf); state.raf=0;
    try { state.controls?.stop?.(); } catch (_) {}
    state.controls=null; state.reader=null; state.detector=null;
    state.stream?.getTracks?.().forEach(t=>t.stop()); state.stream=null; state.track=null;
    if (state.video) state.video.srcObject=null;
    if (state.dialog?.open) state.dialog.close();
    state.dialog?.remove(); state.dialog=null; state.video=null;
  }

  function buildDialog(label) {
    const d=document.createElement('dialog'); d.className='tkn-unified-scan-dialog';
    d.innerHTML=`<section class="tkn-unified-scan-panel"><header><div><b>สแกนด้วยกล้อง</b><small>${escapeHtml(label||'QR / Barcode')}</small></div><button type="button" data-close>ปิด</button></header><div class="tkn-unified-video-wrap"><video playsinline muted autoplay></video><i></i></div><footer><span data-status>กำลังเปิดกล้อง...</span><button type="button" data-torch hidden>ไฟฉาย</button></footer></section>`;
    document.body.appendChild(d); state.dialog=d; state.video=d.querySelector('video');
    d.querySelector('[data-close]').onclick=closeCamera; d.addEventListener('cancel',e=>{e.preventDefault();closeCamera()});
    d.querySelector('[data-torch]').onclick=async()=>{ try { const on=d.dataset.torch!=='1'; await state.track?.applyConstraints?.({advanced:[{torch:on}]}); d.dataset.torch=on?'1':'0'; d.querySelector('[data-torch]').textContent=on?'ปิดไฟ':'ไฟฉาย'; } catch(_){} };
    return d;
  }

  async function nativeCameraLoop() {
    if (state.cameraClosed || !state.detector || !state.video) return;
    if (!state.cameraBusy && state.video.readyState >= 2) {
      state.cameraBusy=true;
      try {
        const codes=await state.detector.detect(state.video); const value=codes?.[0]?.rawValue;
        if (value) { deliver(value,{target:state.target,source:'camera'}); closeCamera(); return; }
      } catch(_) {}
      finally { state.cameraBusy=false; }
    }
    if (!state.cameraClosed) state.raf=requestAnimationFrame(nativeCameraLoop);
  }

  async function openCamera(target = null) {
    state.target = target || activeTarget();
    if (!state.target) return alert('ไม่พบช่องสำหรับรับค่าจากการสแกนในหน้านี้');
    if (!cameraSupported()) return alert('อุปกรณ์/Browser นี้ไม่รองรับกล้อง กรุณาใช้เครื่องยิง USB หรือกรอกรหัส');
    if (state.dialog?.open) return;
    state.cameraClosed=false; state.cameraBusy=false;
    const d=buildDialog(state.target.placeholder || state.target.id || 'QR / Barcode'); d.showModal();
    const status=d.querySelector('[data-status]');
    try {
      if ('BarcodeDetector' in window) {
        const wanted=['qr_code','code_128','code_39','ean_13','ean_8','upc_a','upc_e','itf','codabar'];
        const supported=typeof BarcodeDetector.getSupportedFormats==='function'?await BarcodeDetector.getSupportedFormats():wanted;
        const formats=wanted.filter(x=>supported.includes(x));
        state.detector=new BarcodeDetector(formats.length?{formats}:undefined);
        state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
        state.video.srcObject=state.stream; await state.video.play(); state.track=state.stream.getVideoTracks()[0]||null;
        const caps=state.track?.getCapabilities?.()||{}; d.querySelector('[data-torch]').hidden=!caps.torch;
        status.textContent='พร้อมสแกน'; nativeCameraLoop(); return;
      }
      const ok=await ensureZXing(); if(!ok) throw new Error('โหลดตัวอ่านบาร์โค้ดไม่สำเร็จ');
      state.reader=new window.ZXingBrowser.BrowserMultiFormatReader();
      const devices=await window.ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
      const rear=devices.find(x=>/back|rear|environment|หลัง/i.test(x.label))||devices.at(-1);
      state.controls=await state.reader.decodeFromVideoDevice(rear?.deviceId,state.video,(result,error)=>{
        if (result && !state.cameraBusy) { state.cameraBusy=true; deliver(result.getText?.(),{target:state.target,source:'camera'}); closeCamera(); }
        else if(error && window.ZXingBrowser.NotFoundException && !(error instanceof window.ZXingBrowser.NotFoundException)) console.debug('Unified scanner:',error);
      });
      state.stream=state.video.srcObject||null; state.track=state.stream?.getVideoTracks?.()[0]||null;
      const caps=state.track?.getCapabilities?.()||{}; d.querySelector('[data-torch]').hidden=!caps.torch; status.textContent='พร้อมสแกน';
    } catch(error) { status.textContent=cameraError(error); status.classList.add('error'); console.error('Unified camera:',error); }
  }

  function installButtons() {
    if (protectedPage()) return;
    document.querySelectorAll('[data-tkn-camera-for]').forEach(btn => {
      if (btn.dataset.tknCameraBound) return; btn.dataset.tknCameraBound='1';
      btn.addEventListener('click',()=>openCamera(document.querySelector(btn.dataset.tknCameraFor)));
    });
    const ts=targets();
    let floater=document.getElementById('tknUnifiedScanButton');
    const nativeCameraPages=new Set(['box-qr-stock.html','sort-pack-qr.html','receive.html','issue.html','transfer-create.html','mobile-stock-check.html','scanner.html','stock-intake.html']);
    if (!ts.length || !cameraSupported() || nativeCameraPages.has(pageName())) { floater?.remove(); return; }
    if (!floater) {
      floater=document.createElement('button'); floater.id='tknUnifiedScanButton'; floater.type='button'; floater.className='tkn-unified-scan-fab'; floater.innerHTML='<span>▣</span> สแกน';
      floater.addEventListener('click',()=>openCamera()); document.body.appendChild(floater);
    }
  }

  function init() {
    if (protectedPage()) return;
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('./service-worker-v5.29.0.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
    }
    document.addEventListener('keydown',usbKeydown,true);
    installButtons();
    const mo=new MutationObserver(()=>installButtons()); mo.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pagehide',closeCamera);
  }

  window.TKNUnifiedScanner = Object.freeze({ targets, activeTarget, deliver, openCamera, closeCamera, version:'5.29.0' });
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
