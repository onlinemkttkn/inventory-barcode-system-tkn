(() => {
  'use strict';

  const STORAGE_KEY = 'tkn_hardware_settings_v1';
  const DEFAULTS = Object.freeze({
    mode: 'AUTO',
    service_url: 'http://127.0.0.1:17890',
    powershell_url: 'http://127.0.0.1:17891',
    printer_name: 'RONGTA 80mm Series Printer',
    paper_width_mm: 80,
    auto_print: false,
    auto_drawer_cash: true,
    browser_print_fallback: true,
    request_timeout_ms: 2500
  });

  function normalize(settings = {}) {
    const merged = {...DEFAULTS, ...settings};
    merged.mode = ['AUTO', 'SERVICE', 'POWERSHELL', 'BROWSER']
      .includes(String(merged.mode).toUpperCase())
      ? String(merged.mode).toUpperCase()
      : 'AUTO';
    merged.paper_width_mm = Number(merged.paper_width_mm) === 58 ? 58 : 80;
    merged.request_timeout_ms = Math.min(
      Math.max(Number(merged.request_timeout_ms) || 2500, 1000),
      15000
    );
    return merged;
  }

  function getSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return normalize(saved);
    } catch {
      return normalize();
    }
  }

  function saveSettings(next) {
    const settings = normalize(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('tkn-hardware-settings-change', {
      detail: settings
    }));
    return settings;
  }

  async function request(baseUrl, path, options = {}) {
    const controller = new AbortController();
    const timeout = options.timeout || getSettings().request_timeout_ms;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers: {'Content-Type': 'application/json'},
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Hardware HTTP ${response.status}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function probe(baseUrl, expectedService) {
    try {
      const data = await request(baseUrl, '/health', {timeout: 1800});
      const service = String(data.service || '');
      if (expectedService && service !== expectedService) {
        return {
          ok: false,
          base_url: baseUrl,
          error: `Unexpected service: ${service || 'unknown'}`
        };
      }
      return {...data, ok: true, base_url: baseUrl};
    } catch (error) {
      return {
        ok: false,
        base_url: baseUrl,
        error: error.name === 'AbortError'
          ? 'Connection timeout'
          : error.message
      };
    }
  }

  async function status() {
    const settings = getSettings();
    const serviceResult = await probe(
      settings.service_url,
      'tkn-hardware-service'
    );
    const powershellResult = await probe(
      settings.powershell_url,
      'tkn-rongta-bridge'
    );

    return {
      ok: serviceResult.ok || powershellResult.ok,
      mode: settings.mode,
      selected: serviceResult.ok
        ? 'SERVICE'
        : powershellResult.ok
          ? 'POWERSHELL'
          : 'BROWSER',
      service: serviceResult,
      powershell: powershellResult,
      browser_print: true,
      settings
    };
  }

  async function resolveEndpoint(action) {
    const settings = getSettings();
    if (settings.mode === 'BROWSER') {
      return {type: 'BROWSER', base_url: null};
    }

    if (settings.mode === 'SERVICE') {
      const result = await probe(
        settings.service_url,
        'tkn-hardware-service'
      );
      if (!result.ok) throw new Error(
        `Windows Service unavailable: ${result.error}`
      );
      return {type: 'SERVICE', base_url: settings.service_url};
    }

    if (settings.mode === 'POWERSHELL') {
      const result = await probe(
        settings.powershell_url,
        'tkn-rongta-bridge'
      );
      if (!result.ok) throw new Error(
        `PowerShell Bridge unavailable: ${result.error}`
      );
      return {type: 'POWERSHELL', base_url: settings.powershell_url};
    }

    const serviceResult = await probe(
      settings.service_url,
      'tkn-hardware-service'
    );
    if (serviceResult.ok) {
      return {type: 'SERVICE', base_url: settings.service_url};
    }

    const powershellResult = await probe(
      settings.powershell_url,
      'tkn-rongta-bridge'
    );
    if (powershellResult.ok) {
      return {type: 'POWERSHELL', base_url: settings.powershell_url};
    }

    if (action === 'PRINT' && settings.browser_print_fallback) {
      return {type: 'BROWSER', base_url: null};
    }

    throw new Error(
      'Hardware Service and PowerShell Bridge are unavailable'
    );
  }

  async function openDrawer(meta = {}) {
    const settings = getSettings();
    if (!settings.auto_drawer_cash && meta.reason === 'SALE') {
      return {ok: true, skipped: true, reason: 'auto drawer disabled'};
    }

    const endpoint = await resolveEndpoint('DRAWER');
    if (endpoint.type === 'BROWSER') {
      throw new Error('Browser mode cannot open the cash drawer');
    }

    const result = await request(endpoint.base_url, '/drawer', {
      method: 'POST',
      body: meta,
      timeout: 6000
    });
    return {...result, transport: endpoint.type};
  }

  async function printers() {
    const endpoint = await resolveEndpoint('PRINTERS');
    if (endpoint.type === 'BROWSER') {
      return {ok: true, printers: [], transport: 'BROWSER'};
    }
    const result = await request(endpoint.base_url, '/printers');
    return {...result, transport: endpoint.type};
  }

  async function printRaw(base64Data) {
    if (!base64Data) throw new Error('Print data is required');
    const endpoint = await resolveEndpoint('PRINT');
    if (endpoint.type === 'BROWSER') {
      window.print();
      return {ok: true, transport: 'BROWSER'};
    }

    const result = await request(endpoint.base_url, '/print/raw', {
      method: 'POST',
      body: {data_base64: base64Data},
      timeout: 12000
    });
    return {...result, transport: endpoint.type};
  }

  async function printReceipt(options = {}) {
    const settings = getSettings();

    // Styled Thai receipt uses browser print unless a verified ESC/POS payload
    // is supplied. This preserves layout and Thai text on Rongta 80 mm.
    if (options.data_base64) {
      try {
        return await printRaw(options.data_base64);
      } catch (error) {
        if (!settings.browser_print_fallback) throw error;
      }
    }

    window.print();
    return {ok: true, transport: 'BROWSER'};
  }

  window.TKNHardware = Object.freeze({
    defaults: DEFAULTS,
    getSettings,
    saveSettings,
    status,
    health: status,
    printers,
    openDrawer,
    printRaw,
    printReceipt
  });
})();
