(function initTknProductPattern(global) {
  'use strict';

  const VERSION = '5.31.31';
  const PRODUCT_QR_PREFIX = 'TKN-P-';
  const BOX_QR_PREFIX = 'TKN-B-';
  const THAI_AUDIO_TYPES = Object.freeze([
    'ไมโครโฟน', 'ไมค์ไร้สาย', 'หูฟัง', 'ลำโพง', 'มิกเซอร์',
    'อินเทอร์เฟซเสียง', 'เครื่องบันทึกเสียง', 'อุปกรณ์ไลฟ์สด',
    'สายสัญญาณ', 'อะแดปเตอร์และตัวแปลง', 'อุปกรณ์เสริมออดิโอ'
  ]);

  const TYPE_RULES = Object.freeze([
    ['ไมค์ไร้สาย', /(?:ไมค์|ไมโครโฟน).*(?:ไร้สาย|wireless)|(?:wireless).*(?:mic|microphone)/i],
    ['ไมโครโฟน', /ไมโครโฟน|ไมค์|microphone|\bmic\b/i],
    ['หูฟัง', /หูฟัง|headphone|headset|earphone|earbud/i],
    ['ลำโพง', /ลำโพง|speaker|soundbar/i],
    ['มิกเซอร์', /มิกเซอร์|mixer|mixing console/i],
    ['อินเทอร์เฟซเสียง', /อินเทอร์เฟซเสียง|audio interface|sound card/i],
    ['เครื่องบันทึกเสียง', /เครื่องบันทึกเสียง|audio recorder|voice recorder|field recorder/i],
    ['อุปกรณ์ไลฟ์สด', /ไลฟ์สด|live stream|streaming|podcast console/i],
    ['สายสัญญาณ', /สายสัญญาณ|audio cable|xlr|trs|rca|aux/i],
    ['อะแดปเตอร์และตัวแปลง', /อะแดปเตอร์|adapter|converter|ตัวแปลง/i]
  ]);

  // รองรับ SKU แบบ BASE-A120, BASE-A120.50 และ collision suffix แบบ BASE-A120-ab12
  const LOT_SUFFIX = /-([A-Z])(\d+(?:\.\d{1,2})?)(?:-([0-9A-F]{4}))?$/i;

  function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizeSku(value) {
    return String(value ?? '').trim().replace(/^TKN-P-/i, '').trim();
  }

  function compactCost(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount < 0) return '0';
    return Number.isInteger(amount)
      ? String(amount)
      : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  function randomLetter() {
    return String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }

  function stableLetter(seed) {
    const text = cleanText(seed) || 'TKN';
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return String.fromCharCode(65 + (Math.abs(hash >>> 0) % 26));
  }

  function stripLotSuffix(sku) {
    return normalizeSku(sku).replace(LOT_SUFFIX, '');
  }

  function parseLotSku(sku) {
    const normalized = normalizeSku(sku);
    const match = normalized.match(LOT_SUFFIX);
    return {
      sku: normalized,
      baseSku: match ? normalized.slice(0, -match[0].length) : normalized,
      costLetter: match ? match[1].toUpperCase() : '',
      embeddedCost: match ? Number(match[2]) : null,
      collisionToken: match?.[3] || '',
      hasEmbeddedCost: Boolean(match)
    };
  }

  function sanitizeBaseSku(baseSku) {
    return stripLotSuffix(baseSku)
      .replace(/\s+/g, '-')
      .replace(/[^0-9A-Za-zก-๙._-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function buildLotSku(baseSku, cost, letter) {
    const base = sanitizeBaseSku(baseSku);
    if (!base) throw new Error('กรุณาระบุ SKU หลัก');
    const costPart = compactCost(cost);
    const costLetter = cleanText(letter || randomLetter()).slice(0, 1).toUpperCase();
    if (!/^[A-Z]$/.test(costLetter)) throw new Error('รหัสต้นทุนต้องเป็นตัวอักษร A ถึง Z');
    return `${base}-${costLetter}${costPart}`;
  }

  function valueFromProduct(product) {
    if (typeof product === 'string' || typeof product === 'number') return normalizeSku(product);
    if (!product || typeof product !== 'object') return '';
    return normalizeSku(product.product_code || product.sku || product.lot_sku || product.barcode || '');
  }

  function costFromProduct(product) {
    if (!product || typeof product !== 'object') return null;
    const candidates = [product.cost_price, product.unitCost, product.unit_cost, product.cost, product.embedded_cost];
    for (const value of candidates) {
      if (value === '' || value === null || value === undefined) continue;
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0) return number;
    }
    return null;
  }

  // Labels always use the persisted identity. buildLotSku is only for explicit lot creation.
  function resolveLotSku(product) {
    return valueFromProduct(product);
  }

  function barcodeValue(productOrSku) {
    return typeof productOrSku === 'object'
      ? resolveLotSku(productOrSku)
      : normalizeSku(productOrSku);
  }

  function qrValue(productOrSku) {
    const sku = barcodeValue(productOrSku);
    return sku ? `${PRODUCT_QR_PREFIX}${sku}` : '';
  }

  function extractScanValue(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    try {
      const url = new URL(value);
      for (const key of ['scan', 'code', 'barcode', 'sku', 'tracking', 'tracking_number', 'id']) {
        const found = url.searchParams.get(key);
        if (found && found.trim()) return found.trim();
      }
    } catch (_) {}
    return value;
  }

  function scanCandidates(raw) {
    const extracted = extractScanValue(raw);
    if (!extracted) return [];
    if (new RegExp(`^${BOX_QR_PREFIX}`, 'i').test(extracted)) return [extracted];

    const sku = normalizeSku(extracted);
    const values = [sku];
    return [...new Set(values.filter(Boolean))];
  }

  function parseScan(raw) {
    const extracted = extractScanValue(raw);
    if (!extracted) return { kind: 'EMPTY', raw: '', value: '', candidates: [] };
    if (/^TKN-B-/i.test(extracted)) {
      return { kind: 'BOX', raw: extracted, value: extracted, candidates: [extracted] };
    }
    const candidates = scanCandidates(extracted);
    return {
      kind: /^TKN-P-/i.test(extracted) ? 'PRODUCT_QR' : 'PRODUCT_BARCODE',
      raw: extracted,
      value: candidates[0] || '',
      candidates
    };
  }

  function buildProductFilter(raw, fields = ['product_code', 'barcode', 'base_sku', 'source_barcode']) {
    const candidates = scanCandidates(raw).map((value) => JSON.stringify(value));
    const clauses = [];
    for (const field of fields) {
      for (const value of candidates) clauses.push(`${field}.eq.${value}`);
    }
    return [...new Set(clauses)].join(',');
  }

  async function findProduct(client, raw) {
    const value = extractScanValue(raw);
    if (!value || /^TKN-B-/i.test(value)) return null;
    const { data, error } = await client.rpc('find_product_by_barcode', { p_barcode: value });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (rows.length > 1) throw new Error('AMBIGUOUS_PRODUCT_CODE: ' + value);
    return rows[0] || null;
  }

  async function findBranchRows(client, branchId, raw) {
    if (!branchId) throw new Error('กรุณาเลือกสาขา');
    const value = extractScanValue(raw);
    if (!value) return [];
    const product = await findProduct(client, value);
    if (!product && /^TKN-[PB]-/i.test(value)) return [];
    let query = client.from('branch_inventory_list').select('*').eq('branch_id', branchId);
    query = product ? query.eq('product_id', product.id) : query.ilike('product_name', `%${value}%`);
    const { data, error } = await query.limit(20);
    if (error) throw error;
    return data || [];
  }

  async function requireBoxProduct(client, raw, expectedId = null) {
    const value = extractScanValue(raw);
    if (!value) throw new Error('กรุณาสแกน QR หรือ Barcode สินค้าก่อนนำลงกล่อง');
    if (/^TKN-B-/i.test(value)) throw new Error('QR นี้เป็นรหัสกล่อง กรุณาสแกนรหัสสินค้า');
    const product = await findProduct(client, value);
    if (!product) throw new Error('ไม่พบรหัสสินค้าในระบบ: ' + value);
    if (product.is_active !== true) throw new Error('สินค้านี้ปิดใช้งาน ไม่สามารถนำลงกล่องได้');
    if (expectedId && product.id !== expectedId) throw new Error('รหัสสินค้าไม่ตรงกับรายการที่จะนำลงกล่อง');
    if (!product.product_code || !String(product.product_code).trim()) throw new Error('สินค้าไม่มีรหัสมาตรฐาน');
    return product;
  }

  function roundPrice(value, mode = 'BAHT') {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    if (mode === 'NONE') return Math.round(n * 100) / 100;
    if (mode === 'FIVE') return Math.ceil(n / 5) * 5;
    if (mode === 'TEN') return Math.ceil(n / 10) * 10;
    return Math.ceil(n);
  }

  function calculateSellingPrice(cost, markupPercent = 0, vatRate = 0, vatMode = 'EXCLUDED', rounding = 'BAHT') {
    const base = Math.max(0, Number(cost || 0));
    const markup = Math.max(0, Number(markupPercent || 0));
    const vat = Math.max(0, Number(vatRate || 0));
    let result = base * (1 + (markup / 100));
    if (String(vatMode).toUpperCase() === 'EXCLUDED') result *= 1 + (vat / 100);
    return roundPrice(result, rounding);
  }

  function detectType(name, explicitType = '') {
    const provided = cleanText(explicitType);
    if (provided) return provided;
    const source = cleanText(name);
    const found = TYPE_RULES.find(([, pattern]) => pattern.test(source));
    return found ? found[0] : '';
  }

  function normalizeBrand(value) {
    const brand = cleanText(value);
    if (!brand || /^(ไม่ระบุ|ไม่มี|no brand|n\/a)$/i.test(brand)) return '';
    return brand;
  }

  function inferModel(name, brand = '', type = '') {
    let source = cleanText(name);
    [brand, type].filter(Boolean).forEach((token) => {
      source = source.replace(new RegExp(cleanText(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
    });
    source = source
      .replace(/\b(?:bluetooth|wireless|usb|type[- ]?c|สำหรับ|พร้อม|รุ่น|model)\b/ig, ' ')
      .replace(/[|/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const tokens = source.split(' ').filter(Boolean);
    return tokens.find((token) => /(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._-]{2,}/.test(token)) || '';
  }

  function conciseLabel(product = {}, options = {}) {
    const maxChars = Number(options.maxChars || 46);
    const maxLines = Number(options.maxLines || 2);
    const fullName = cleanText(product.name || product.product_name || '');
    const type = detectType(fullName, product.product_type_th || product.product_type || '');
    const brand = normalizeBrand(product.brand_name || product.brand || '');
    const model = cleanText(product.model_name || product.model || inferModel(fullName, brand, type));

    let result = cleanText([type, brand, model].filter(Boolean).join(' '));
    if (!result) result = fullName;
    if (!result) result = resolveLotSku(product) || 'สินค้า';

    const words = result.split(' ');
    const lines = [''];
    words.forEach((word) => {
      const current = lines[lines.length - 1];
      const candidate = cleanText(`${current} ${word}`);
      if (candidate.length <= Math.ceil(maxChars / maxLines) || lines.length >= maxLines) {
        lines[lines.length - 1] = candidate;
      } else {
        lines.push(word);
      }
    });
    let compact = lines.slice(0, maxLines).join('\n');
    if (compact.replace(/\n/g, ' ').length > maxChars) {
      const flat = compact.replace(/\n/g, ' ');
      compact = `${flat.slice(0, Math.max(1, maxChars - 1)).trim()}…`;
    }
    return compact;
  }

  global.TKNProductPattern = Object.freeze({
    VERSION,
    PRODUCT_QR_PREFIX,
    BOX_QR_PREFIX,
    THAI_AUDIO_TYPES,
    cleanText,
    normalizeSku,
    compactCost,
    randomLetter,
    stableLetter,
    stripLotSuffix,
    parseLotSku,
    buildLotSku,
    resolveLotSku,
    canonicalSku: resolveLotSku,
    qrValue,
    barcodeValue,
    extractScanValue,
    scanCandidates,
    parseScan,
    buildProductFilter,
    findProduct,
    findBranchRows,
    requireBoxProduct,
    calculateSellingPrice,
    detectType,
    conciseLabel
  });
})(typeof window !== 'undefined' ? window : globalThis);
