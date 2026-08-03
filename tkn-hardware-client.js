(() => {
  'use strict';

  const STORAGE_KEY = 'tkn_hardware_settings_v1';
  const TOKEN_KEY = 'tkn_hardware_token_v1';
  const CIRCUIT_KEY = 'tkn_hardware_circuit_v1';
  const DB_NAME = 'tkn_hardware_jobs_v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'jobs';
  const CLIENT_VERSION = '5.17.1';
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


  function getSessionToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function setSessionToken(token) {
    const normalized = String(token || '').trim();
    try {
      if (normalized) sessionStorage.setItem(TOKEN_KEY, normalized);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {}
    return normalized;
  }

  async function request(baseUrl, path, options = {}) {
    const controller = new AbortController();
    const timeout = options.timeout || getSettings().request_timeout_ms;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(getSessionToken() ? {'X-TKN-Hardware-Token': getSessionToken()} : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(
          data.error || `Hardware HTTP ${response.status}`
        );
        error.status = response.status;
        error.data = data;
        throw error;
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
      if (data?.ok === false) {
        return {
          ...data,
          ok: false,
          base_url: baseUrl,
          error: data.error || 'Hardware service reported not ready'
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
      body: {
        ...meta,
        printer_name: settings.printer_name,
        paper_width_mm: settings.paper_width_mm
      },
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

  async function printRaw(base64Data, options = {}) {
    if (!base64Data) throw new Error('Print data is required');
    const endpoint = await resolveEndpoint('PRINT');
    if (endpoint.type === 'BROWSER') {
      window.print();
      return {ok: true, transport: 'BROWSER'};
    }

    const settings = getSettings();
    const result = await request(endpoint.base_url, '/print/raw', {
      method: 'POST',
      body: {
        data_base64: base64Data,
        printer_name: options.printer_name || settings.printer_name,
        paper_width_mm: options.paper_width_mm || settings.paper_width_mm,
        job_name: options.job_name || 'TKN RAW PRINT'
      },
      timeout: 12000
    });
    return {...result, transport: endpoint.type};
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(offset, offset + chunkSize)
      );
    }
    return btoa(binary);
  }

  function buildPrinterTestPayload(options = {}) {
    const settings = getSettings();
    const width = Number(options.paper_width_mm || settings.paper_width_mm) === 58
      ? 58
      : 80;
    const printer = String(
      options.printer_name || settings.printer_name || 'DEFAULT PRINTER'
    );
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const encoder = new TextEncoder();
    const text = [
      'TKN POS ERP',
      `DRIVER TEST ${width}MM`,
      `PRINTER: ${printer}`,
      `TIME: ${timestamp}`,
      '--------------------------------',
      'PRINT DRIVER READY',
      '',
      '',
      ''
    ].join('\n');
    const body = encoder.encode(text);
    const initialize = Uint8Array.from([0x1b, 0x40]);
    const cut = options.cut === false
      ? new Uint8Array(0)
      : Uint8Array.from([0x1d, 0x56, 0x42, 0x00]);
    const payload = new Uint8Array(
      initialize.length + body.length + cut.length
    );
    payload.set(initialize, 0);
    payload.set(body, initialize.length);
    payload.set(cut, initialize.length + body.length);
    return bytesToBase64(payload);
  }

  function isMissingRoute(error) {
    return Number(error?.status) === 404
      || /not found|http 404/i.test(String(error?.message || ''));
  }

  async function testPrinter(options = {}) {
    const settings = getSettings();
    const endpoint = await resolveEndpoint('PRINT');
    if (endpoint.type === 'BROWSER') {
      return {
        ok: true,
        skipped: true,
        transport: 'BROWSER',
        message: 'Browser print test required'
      };
    }

    const requestBody = {
      printer_name: options.printer_name || settings.printer_name,
      paper_width_mm: options.paper_width_mm || settings.paper_width_mm,
      cut: options.cut !== false
    };

    try {
      const result = await request(endpoint.base_url, '/print/test', {
        method: 'POST',
        body: requestBody,
        timeout: 12000
      });
      return {
        ...result,
        transport: endpoint.type,
        test_method: 'PRINT_TEST_ENDPOINT'
      };
    } catch (error) {
      // Hardware Service v1.0 has /print/raw but no /print/test.
      // Use the existing RAW route so the installed service does not need
      // to be reinstalled just to perform a driver test.
      if (isMissingRoute(error)) {
        try {
          const rawResult = await request(endpoint.base_url, '/print/raw', {
            method: 'POST',
            body: {
              data_base64: buildPrinterTestPayload(requestBody),
              printer_name: requestBody.printer_name,
              paper_width_mm: requestBody.paper_width_mm,
              job_name: 'TKN DRIVER TEST'
            },
            timeout: 12000
          });
          return {
            ...rawResult,
            ok: true,
            transport: endpoint.type,
            compatibility_mode: true,
            test_method: 'RAW_COMPATIBILITY'
          };
        } catch (rawError) {
          if (
            isMissingRoute(rawError)
            && settings.browser_print_fallback
          ) {
            return {
              ok: true,
              skipped: true,
              transport: 'BROWSER',
              compatibility_mode: true,
              message: 'Bridge does not support print routes; use Browser Print'
            };
          }
          throw rawError;
        }
      }
      throw error;
    }
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


  function openJobDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(
            STORE_NAME,
            {keyPath: 'idempotency_key'}
          );
          store.createIndex('status', 'status', {unique: false});
          store.createIndex('updated_at', 'updated_at', {unique: false});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putJob(job) {
    const value = {
      ...job,
      updated_at: new Date().toISOString()
    };

    try {
      const db = await openJobDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('Hardware job persistence unavailable:', error);
      localStorage.setItem(
        `tkn_hardware_job:${value.idempotency_key}`,
        JSON.stringify(value)
      );
    }

    return value;
  }

  async function getJob(idempotencyKey) {
    if (!idempotencyKey) return null;

    try {
      const db = await openJobDb();
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(idempotencyKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return result;
    } catch {
      try {
        return JSON.parse(
          localStorage.getItem(`tkn_hardware_job:${idempotencyKey}`)
          || 'null'
        );
      } catch {
        return null;
      }
    }
  }

  async function listJobs(statusFilter = null) {
    try {
      const db = await openJobDb();
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return rows
        .filter(row => !statusFilter || row.status === statusFilter)
        .sort((a, b) =>
          String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
        );
    } catch {
      return [];
    }
  }

  function getCircuit() {
    try {
      return JSON.parse(localStorage.getItem(CIRCUIT_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveCircuit(value) {
    localStorage.setItem(CIRCUIT_KEY, JSON.stringify(value));
  }

  function circuitState() {
    const current = getCircuit();
    const openUntil = Number(current.open_until || 0);
    if (openUntil && Date.now() < openUntil) {
      return {
        open: true,
        retry_after_ms: openUntil - Date.now(),
        failures: Number(current.failures || 0)
      };
    }
    return {open: false, retry_after_ms: 0, failures: 0};
  }

  function recordHardwareSuccess() {
    saveCircuit({
      failures: 0,
      open_until: 0,
      last_success_at: new Date().toISOString()
    });
  }

  function recordHardwareFailure(error) {
    const current = getCircuit();
    const failures = Number(current.failures || 0) + 1;
    const openUntil = failures >= 3 ? Date.now() + 30000 : 0;

    saveCircuit({
      failures,
      open_until: openUntil,
      last_error: String(error?.message || error || ''),
      last_failure_at: new Date().toISOString()
    });

    return circuitState();
  }

  function makeIdempotencyKey(meta = {}) {
    if (meta.idempotency_key) return String(meta.idempotency_key);
    const source = String(meta.source || meta.reason || 'DRAWER');
    const entity = String(
      meta.return_id
      || meta.return_no
      || meta.sale_id
      || meta.sale_no
      || Date.now()
    );
    return `${source}:${entity}:OPEN_DRAWER`;
  }

  async function openDrawerReliable(meta = {}) {
    const idempotencyKey = makeIdempotencyKey(meta);
    const existing = await getJob(idempotencyKey);

    if (existing?.status === 'DONE') {
      return {
        ok: true,
        duplicate: true,
        skipped: true,
        status: 'DONE',
        idempotency_key: idempotencyKey,
        transport: existing.transport || null
      };
    }

    const circuit = circuitState();
    if (circuit.open) {
      const job = await putJob({
        idempotency_key: idempotencyKey,
        type: 'OPEN_DRAWER',
        status: 'PENDING_MANUAL',
        payload: meta,
        attempts: Number(existing?.attempts || 0),
        last_error: 'Hardware circuit is temporarily open',
        created_at: existing?.created_at || new Date().toISOString()
      });
      return {
        ok: false,
        status: job.status,
        idempotency_key: idempotencyKey,
        retry_after_ms: circuit.retry_after_ms,
        error: job.last_error
      };
    }

    await putJob({
      idempotency_key: idempotencyKey,
      type: 'OPEN_DRAWER',
      status: 'RUNNING',
      payload: meta,
      attempts: Number(existing?.attempts || 0) + 1,
      created_at: existing?.created_at || new Date().toISOString()
    });

    try {
      const healthResult = await status();
      if (!healthResult.ok) {
        throw new Error(
          'Hardware Service and PowerShell Bridge are unavailable'
        );
      }

      const result = await openDrawer({
        ...meta,
        idempotency_key: idempotencyKey
      });

      recordHardwareSuccess();
      await putJob({
        idempotency_key: idempotencyKey,
        type: 'OPEN_DRAWER',
        status: 'DONE',
        payload: meta,
        attempts: Number(existing?.attempts || 0) + 1,
        transport: result?.transport || null,
        result,
        completed_at: new Date().toISOString(),
        created_at: existing?.created_at || new Date().toISOString()
      });

      return {
        ...result,
        ok: true,
        status: 'DONE',
        idempotency_key: idempotencyKey
      };
    } catch (error) {
      const state = recordHardwareFailure(error);
      const uncertain = (
        error?.name === 'AbortError'
        || /timeout|network|fetch/i.test(String(error?.message || ''))
      );

      const job = await putJob({
        idempotency_key: idempotencyKey,
        type: 'OPEN_DRAWER',
        status: uncertain ? 'UNKNOWN' : 'PENDING_MANUAL',
        payload: meta,
        attempts: Number(existing?.attempts || 0) + 1,
        last_error: String(error?.message || error),
        created_at: existing?.created_at || new Date().toISOString()
      });

      return {
        ok: false,
        status: job.status,
        idempotency_key: idempotencyKey,
        circuit_open: state.open,
        error: job.last_error
      };
    }
  }

  async function retryDrawerJob(idempotencyKey, confirmed = false) {
    if (!confirmed) {
      throw new Error(
        'Manual confirmation is required before retrying the drawer'
      );
    }

    const job = await getJob(idempotencyKey);
    if (!job) throw new Error('Hardware job not found');
    if (job.status === 'DONE') {
      return {
        ok: true,
        skipped: true,
        duplicate: true,
        status: 'DONE',
        idempotency_key: idempotencyKey
      };
    }

    return openDrawerReliable({
      ...(job.payload || {}),
      idempotency_key: idempotencyKey,
      manual_retry: true
    });
  }

  async function resolveDrawerJob(idempotencyKey, resolution) {
    const job = await getJob(idempotencyKey);
    if (!job) throw new Error('Hardware job not found');

    return putJob({
      ...job,
      status: resolution === 'OPENED' ? 'DONE' : 'CANCELLED',
      manual_resolution: resolution,
      completed_at: new Date().toISOString()
    });
  }

  window.TKNHardware = Object.freeze({
    version: CLIENT_VERSION,
    defaults: DEFAULTS,
    getSettings,
    saveSettings,
    getSessionToken,
    setSessionToken,
    status,
    health: status,
    printers,
    openDrawer,
    openDrawerReliable,
    getJob,
    listJobs,
    retryDrawerJob,
    resolveDrawerJob,
    circuitState,
    printRaw,
    testPrinter,
    printReceipt
  });
})();
