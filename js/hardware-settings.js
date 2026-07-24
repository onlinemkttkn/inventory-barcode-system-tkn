(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const E = {
    form: $('hardwareForm'),
    mode: $('mode'),
    serviceUrl: $('serviceUrl'),
    powershellUrl: $('powershellUrl'),
    printerName: $('printerName'),
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

  function fill(settings) {
    E.mode.value = settings.mode;
    E.serviceUrl.value = settings.service_url;
    E.powershellUrl.value = settings.powershell_url;
    E.printerName.value = settings.printer_name;
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
      showMessage(
        result.ok
          ? `พร้อมใช้งานผ่าน ${result.selected}`
          : 'ไม่พบ Service/Bridge — ใบเสร็จยังใช้ Browser Print ได้',
        result.ok ? 'ok' : 'warning'
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
    fill(settings);
    showMessage('บันทึกการตั้งค่าของเครื่องนี้แล้ว', 'ok');
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
    try {
      const result = await window.TKNHardware.openDrawer({
        reason: 'ADMIN_TEST'
      });
      showMessage(
        `ส่งคำสั่งสำเร็จผ่าน ${result.transport || result.service}`,
        'ok'
      );
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      E.testDrawer.disabled = false;
    }
  });

  E.testPrint.addEventListener('click', () => {
    const testWindow = window.open('', '_blank', 'width=420,height=640');
    if (!testWindow) {
      showMessage('Browser บล็อกหน้าต่างพิมพ์', 'error');
      return;
    }
    testWindow.document.write(`
      <!doctype html><html lang="th"><head><meta charset="utf-8">
      <title>ทดสอบ Rongta 80mm</title>
      <style>
        @page{size:80mm auto;margin:3mm}
        body{font-family:Tahoma,sans-serif;width:74mm;margin:0 auto;color:#000}
        h1,p{text-align:center;margin:4px 0}
        hr{border:0;border-top:1px dashed #000}
      </style></head><body>
      <h1>TKN POS ERP</h1>
      <p>ทดสอบเครื่องพิมพ์ RONGTA 80mm</p>
      <hr><p>${new Date().toLocaleString('th-TH')}</p>
      <script>window.onload=()=>window.print()<\/script>
      </body></html>
    `);
    testWindow.document.close();
  });

  fill(window.TKNHardware.getSettings());
  refreshStatus();
})();
