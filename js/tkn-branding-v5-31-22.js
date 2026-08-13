(() => {
  'use strict';

  const VERSION = '5.31.22';
  const CACHE_KEY = 'tkn_public_branding_v53122';
  const CACHE_TTL = 5 * 60_000;
  const DEFAULTS = Object.freeze({
    company_name: 'เถ้าแก่น้อย ชลบุรี',
    company_legal_name: 'บริษัท เถ้าแก่น้อย ชลบุรี จำกัด',
    company_short_name: 'เถ้าแก่น้อย ชลบุรี',
    tax_id: '',
    phone: '',
    email: '',
    address: '',
    receipt_footer: 'ขอบคุณที่ใช้บริการ',
    app_name: 'ระบบบริหารร้านเถ้าแก่น้อย ชลบุรี',
    app_short_name: 'เถ้าแก่น้อย ชลบุรี',
    theme_color: '#c8101e',
    logo_url: './assets/tkn-company-logo.png',
    install_message: 'ติดตั้งระบบไว้บนหน้าจอหลักเพื่อเปิดใช้งานได้รวดเร็วขึ้น'
  });

  let current = { ...DEFAULTS };
  let loadingPromise = null;

  function normalize(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const next = { ...DEFAULTS };
    for (const key of Object.keys(next)) {
      const candidate = raw[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim() !== '') {
        next[key] = String(candidate).trim();
      }
    }
    if (!/^#[0-9a-f]{6}$/i.test(next.theme_color)) next.theme_color = DEFAULTS.theme_color;
    return next;
  }

  function readCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!saved?.savedAt || Date.now() - Number(saved.savedAt) > CACHE_TTL) return null;
      return normalize(saved.data);
    } catch (_) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_) {}
  }

  function apply(data) {
    current = normalize(data);
    const root = document.documentElement;
    root.style.setProperty('--tkn-brand-theme', current.theme_color);
    root.dataset.tknCompany = current.company_name;
    root.dataset.tknAppName = current.app_name;

    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.name = 'theme-color';
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = current.theme_color;

    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!appleTitle) {
      appleTitle = document.createElement('meta');
      appleTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appleTitle);
    }
    appleTitle.content = current.app_short_name;

    document.querySelectorAll('[data-tkn-company-name]').forEach((el) => {
      el.textContent = current.company_name;
    });
    document.querySelectorAll('[data-tkn-company-legal-name]').forEach((el) => {
      el.textContent = current.company_legal_name;
    });
    document.querySelectorAll('[data-tkn-company-logo]').forEach((img) => {
      if ('src' in img) img.src = current.logo_url;
      if ('alt' in img) img.alt = current.company_name;
    });

    window.dispatchEvent(new CustomEvent('tkn:branding-ready', { detail: { ...current } }));
    return current;
  }

  async function waitForClient(timeoutMs = 2600) {
    const startedAt = Date.now();
    while (!window.supabaseClient && !window.tknSupabaseClient && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return window.supabaseClient || window.tknSupabaseClient || null;
  }

  async function fetchRemote() {
    const client = await waitForClient();
    if (!client?.rpc) return null;
    const { data, error } = await client.rpc('tkn_public_app_settings');
    if (error) throw error;
    return normalize(data);
  }

  async function load({ force = false } = {}) {
    if (loadingPromise && !force) return loadingPromise;

    loadingPromise = (async () => {
      const cached = force ? null : readCache();
      if (cached) apply(cached);
      else apply(current);

      try {
        const remote = await fetchRemote();
        if (remote) {
          writeCache(remote);
          return apply(remote);
        }
      } catch (error) {
        console.warn('TKN branding load failed; using cached/default branding:', error);
      }
      return current;
    })();

    try {
      return await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
  }

  window.TKNBranding = Object.freeze({
    version: VERSION,
    defaults: DEFAULTS,
    get: () => ({ ...current }),
    load,
    apply,
    clearCache
  });

  const cached = readCache();
  if (cached) apply(cached);
})();
