(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = {
    form: $('hardwareForm'),
    mode: $('mode'),
    serviceUrl: $('serviceUrl'),
    powershellUrl: $('powershellUrl'),
    printerName: $('printerName'),
    hardwareToken: $('hardwareToken'),
    paperWidth: $('paperWidth'),
    timeout: $('timeout'),
    autoPrint: $('autoPrint'),
    autoDrawer: $('autoDrawer'),
    browserFallback: $('browserFallback'),
    serviceStatus: $('serviceStatus'),
    serviceDetail: $('serviceDetail'),
    powershellStatus: $('powershellStatus'),
    powershellDetail: $('powershellDetail'),
    selectedTransport: $('selectedTransport'),
    checkStatus: $('checkStatus'),
    loadPrinters: $('loadPrinters'),
    testDrawer: $('testDrawer'),
    testPrint: $('testPrint'),
    message: $('message'),
    printerList: $('printerList')
  };

  function showMessage(text, type = '') {
    E.message.textContent = text;
    E.message.className = `hardware-message ${type}`.trim();
  }

  async function writeHardwareAudit(actionType, label, details = {}) {
    try {
      const client = window.supabaseClient;
      if (!client?.rpc) return;
      const result = await client.rpc('write_audit_log', {
        p_action_type: actionType,
        p_entity_type: 'HARDWARE',
        p_entity_id: null,
        p_action_label: label,
        p_details: details,
        p_branch_id: null,
        p_user_agent: navigator.userAgent
      });
      if (result.error) console.warn('Hardware audit skipped:', result.error.message);
    } catch (error) {
      console.warn('Hardware audit unavailable:', error);
    }
  }

  function openBrowserPrintTest() {
    const width = Number(E.paperWidth.value) === 58 ? 58 : 80;
    const printable = width === 58 ? 52 : 74;
    const testWindow = window.open('', '_blank', 'width=420,height=640');
    if (!testWindow) throw new Error('Browser บล็อกหน้าต่างพิมพ์');
    testWindow.document.write(`
      <!doctype html><html lang="th"><head><meta charset="utf-8">
      <title>ทดสอบ Rongta ${width}mm</title>
      <style>
        @page{size:${width}mm auto;margin:2mm}
        body{font-family:Tahoma,sans-serif;width:${printable}mm;margin:0 auto;color:#000}
        h1,p{text-align:center;margin:4px 0}hr{border:0;border-top:1px dashed #000}
      </style></head><body>
      <h1>TKN POS ERP</h1>
      <p>Browser / Driver Test ${width} mm</p>
      <hr><p>${new Date().toLocaleString('th-TH')}</p>
      <script>window.onload=()=>window.print()<\/script>
      </body></html>
    `);
    testWindow.document.close();
  }

  function fill(settings) {
    E.mode.value = settings.mode;
    E.serviceUrl.value = settings.service_url;
    E.powershellUrl.value = settings.powershell_url;
    E.printerName.value = settings.printer_name;
    if (E.hardwareToken) E.hardwareToken.value = window.TKNHardware.getSessionToken();
    E.paperWidth.value = String(settings.paper_width_mm);
    E.timeout.value = String(settings.request_timeout_ms);
    E.autoPrint.checked = settings.auto_print;
    E.autoDrawer.checked = settings.auto_drawer_cash;
    E.browserFallback.checked = settings.browser_print_fallback;
  }

  function readForm() {
    return {
      mode: E.mode.value,
      service_url: E.serviceUrl.value.trim(),
      powershell_url: E.powershellUrl.value.trim(),
      printer_name: E.printerName.value.trim(),
      paper_width_mm: Number(E.paperWidth.value),
      request_timeout_ms: Number(E.timeout.value),
      auto_print: E.autoPrint.checked,
      auto_drawer_cash: E.autoDrawer.checked,
      browser_print_fallback: E.browserFallback.checked
    };
  }

  function renderOne(element, detail, result) {
    element.textContent = result.ok ? 'พร้อมใช้งาน' : 'ไม่พร้อม';
    element.dataset.state = result.ok ? 'ok' : 'error';
    detail.textContent = result.ok
      ? `${result.service || 'service'} · ${result.printer || '-'}`
      : result.error || 'เชื่อมต่อไม่ได้';
  }

  async function refreshStatus() {
    E.checkStatus.disabled = true;
    showMessage('กำลังตรวจสอบ Hardware...');
    try {
      const result = await window.TKNHardware.status();
      renderOne(E.serviceStatus, E.serviceDetail, result.service);
      renderOne(
        E.powershellStatus,
        E.powershellDetail,
        result.powershell
      );
      E.selectedTransport.textContent = result.selected;
      E.selectedTransport.dataset.state =
        result.selected === 'BROWSER' ? 'warning' : 'ok';
      const tokenRequired = result.service?.token_required === true
        || result.powershell?.token_required === true;
      const tokenMissing = tokenRequired
        && !window.TKNHardware.getSessionToken();
      showMessage(
        tokenMissing
          ? 'พบ Hardware Service แล้ว แต่ยังไม่ได้ใส่ Hardware Security Token'
          : result.ok
            ? `พร้อมใช้งานผ่าน ${result.selected}`
            : 'ไม่พบ Service/Bridge — ใบเสร็จยังใช้ Browser Print ได้',
        tokenMissing ? 'warning' : (result.ok ? 'ok' : 'warning')
      );
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      E.checkStatus.disabled = false;
    }
  }

  E.form.addEventListener('submit', event => {
    event.preventDefault();
    const settings = window.TKNHardware.saveSettings(readForm());
    window.TKNHardware.setSessionToken(E.hardwareToken?.value || '');
    fill(settings);
    showMessage(window.TKNHardware.getSessionToken()
      ? 'บันทึกการตั้งค่าและ Hardware Token ของ session นี้แล้ว'
      : 'บันทึกการตั้งค่าแล้ว แต่ยังไม่ได้ใส่ Hardware Token',
      window.TKNHardware.getSessionToken() ? 'ok' : 'warning');
    refreshStatus();
  });

  E.checkStatus.addEventListener('click', refreshStatus);

  E.loadPrinters.addEventListener('click', async () => {
    E.loadPrinters.disabled = true;
    showMessage('กำลังอ่านรายชื่อเครื่องพิมพ์...');
    try {
      const result = await window.TKNHardware.printers();
      E.printerList.hidden = false;
      E.printerList.textContent = result.printers?.length
        ? result.printers.join('\n')
        : `ไม่พบรายการเครื่องพิมพ์จาก ${result.transport}`;
      showMessage(`อ่านรายชื่อผ่าน ${result.transport}`, 'ok');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      E.loadPrinters.disabled = false;
    }
  });

  E.testDrawer.addEventListener('click', async () => {
    if (!confirm('ต้องการส่งคำสั่งเปิดลิ้นชักทดสอบหรือไม่?')) return;
    E.testDrawer.disabled = true;
    showMessage('กำลังส่งคำสั่งเปิดลิ้นชัก...');
    const idempotencyKey = `ADMIN_TEST:${Date.now()}:OPEN_DRAWER`;
    try {
      const drawerFn = window.TKNHardware.openDrawerReliable
        || window.TKNHardware.openDrawer;
      const result = await drawerFn({
        reason: 'ADMIN_TEST',
        source: 'HARDWARE_SETTINGS',
        idempotency_key: idempotencyKey
      });
      if (!result?.ok) {
        throw new Error(result?.error || 'Hardware ไม่ยืนยันการส่งคำสั่ง');
      }
      showMessage(
        `ส่งคำสั่งเปิดลิ้นชักสำเร็จผ่าน ${result.transport || result.service || 'Hardware'}`,
        'ok'
      );
      await writeHardwareAudit(
        'HARDWARE_DRAWER_TEST_SUCCESS',
        'ทดสอบเปิดลิ้นชักสำเร็จ',
        {
          transport: result.transport || result.service || null,
          printer_name: E.printerName.value.trim(),
          idempotency_key: idempotencyKey
        }
      );
    } catch (error) {
      showMessage(error.message, 'error');
      await writeHardwareAudit(
        'HARDWARE_DRAWER_TEST_FAILED',
        'ทดสอบเปิดลิ้นชักไม่สำเร็จ',
        {
          error_message: error.message,
          printer_name: E.printerName.value.trim(),
          idempotency_key: idempotencyKey
        }
      );
    } finally {
      E.testDrawer.disabled = false;
    }
  });

  E.testPrint.addEventListener('click', async () => {
    E.testPrint.disabled = true;
    showMessage('กำลังทดสอบ Driver และเครื่องพิมพ์...');
    try {
      const result = await window.TKNHardware.testPrinter({
        printer_name: E.printerName.value.trim(),
        paper_width_mm: Number(E.paperWidth.value)
      });
      if (result.transport === 'BROWSER' || result.skipped) {
        openBrowserPrintTest();
        showMessage('เปิดหน้าทดสอบ Browser Print แล้ว', 'warning');
      } else {
        showMessage(
          `ส่งงานทดสอบ Driver สำเร็จผ่าน ${result.transport || result.service || 'Hardware'}`,
          'ok'
        );
      }
      await writeHardwareAudit(
        'HARDWARE_PRINT_TEST_SUCCESS',
        'ทดสอบพิมพ์สำเร็จ',
        {
          transport: result.transport || result.service || 'BROWSER',
          printer_name: E.printerName.value.trim(),
          paper_width_mm: Number(E.paperWidth.value)
        }
      );
    } catch (error) {
      showMessage(`ทดสอบ Driver ไม่สำเร็จ: ${error.message}`, 'error');
      await writeHardwareAudit(
        'HARDWARE_PRINT_TEST_FAILED',
        'ทดสอบพิมพ์ไม่สำเร็จ',
        {
          error_message: error.message,
          printer_name: E.printerName.value.trim(),
          paper_width_mm: Number(E.paperWidth.value)
        }
      );
    } finally {
      E.testPrint.disabled = false;
    }
  });

  (async () => {
    if (window.TKNSecurityReady) {
      const access = await window.TKNSecurityReady;
      if (!access) return;
    }
    fill(window.TKNHardware.getSettings());
    refreshStatus();
  })();
})();
