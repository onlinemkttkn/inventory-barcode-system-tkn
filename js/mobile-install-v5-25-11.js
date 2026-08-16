(() => {
  'use strict';

  const statusEl = document.getElementById('installStatus');
  const installBtn = document.getElementById('installBtn');
  const iosHelp = document.getElementById('iosHelp');
  const androidHelp = document.getElementById('androidHelp');

  let deferredPrompt = null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  if (isStandalone) {
    setStatus('ติดตั้งแล้ว — เปิดใช้งานจากไอคอน TKN บนหน้าจอมือถือได้เลย');
    return;
  }

  if (isIOS) {
    setStatus('พร้อมติดตั้งบน iPhone / iPad');
    iosHelp.hidden = false;
  } else if (isAndroid) {
    setStatus('พร้อมติดตั้งบน Android');
    androidHelp.hidden = false;
  } else {
    setStatus('เปิดหน้านี้จากมือถือเพื่อทำการติดตั้ง');
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
    setStatus('พร้อมติดตั้ง — แตะ “ติดตั้งแอป” ได้เลย');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      setStatus('ยังไม่พบคำสั่งติดตั้งจากเบราว์เซอร์ กรุณาใช้เมนูของ Chrome เพื่อ “ติดตั้งแอป”');
      androidHelp.hidden = false;
      return;
    }

    installBtn.disabled = true;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setStatus('ติดตั้งสำเร็จแล้ว');
        installBtn.hidden = true;
      } else {
        setStatus('ยกเลิกการติดตั้งแล้ว สามารถติดตั้งใหม่ได้ภายหลัง');
      }
    } catch (error) {
      console.error('[TKN Mobile Install]', error);
      setStatus('ติดตั้งไม่สำเร็จ กรุณาใช้เมนูของ Chrome แล้วเลือก “ติดตั้งแอป”');
    } finally {
      deferredPrompt = null;
      installBtn.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    setStatus('ติดตั้ง TKN POS ERP ลงมือถือเรียบร้อยแล้ว');
    installBtn.hidden = true;
    deferredPrompt = null;
  });
})();
