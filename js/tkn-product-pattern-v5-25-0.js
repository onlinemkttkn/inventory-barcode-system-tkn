(function initTknProductPattern(global) {
  'use strict';

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

  const LOT_SUFFIX = /-([A-Z])(\d+(?:\.\d{1,2})?)$/i;

  function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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

  function stripLotSuffix(sku) {
    return cleanText(sku).replace(LOT_SUFFIX, '');
  }

  function parseLotSku(sku) {
    const normalized = cleanText(sku);
    const match = normalized.match(LOT_SUFFIX);
    return {
      sku: normalized,
      baseSku: match ? normalized.slice(0, -match[0].length) : normalized,
      costLetter: match ? match[1].toUpperCase() : '',
      embeddedCost: match ? Number(match[2]) : null,
      hasEmbeddedCost: Boolean(match)
    };
  }

  function buildLotSku(baseSku, cost, letter) {
    const base = stripLotSuffix(baseSku).replace(/\s+/g, '-').replace(/[^0-9A-Za-zก-๙._-]/g, '');
    if (!base) throw new Error('กรุณาระบุ SKU หลัก');
    const costPart = compactCost(cost);
    return `${base}-${cleanText(letter || randomLetter()).slice(0, 1).toUpperCase()}${costPart}`;
  }

  function qrValue(sku) {
    const value = cleanText(sku).replace(/^TKN-P-/i, '');
    return value ? `TKN-P-${value}` : '';
  }

  function barcodeValue(sku) {
    return cleanText(sku).replace(/^TKN-P-/i, '');
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
    const modelToken = tokens.find((token) => /(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._-]{2,}/.test(token));
    return modelToken || '';
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
    if (!result) result = cleanText(product.product_code || product.sku || 'สินค้า');

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
    THAI_AUDIO_TYPES,
    cleanText,
    compactCost,
    randomLetter,
    stripLotSuffix,
    parseLotSku,
    buildLotSku,
    qrValue,
    barcodeValue,
    calculateSellingPrice,
    detectType,
    conciseLabel
  });
})(typeof window !== 'undefined' ? window : globalThis);
