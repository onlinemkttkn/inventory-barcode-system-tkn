(function attachTknBoxCode(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TKNBoxCode = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function tknBoxCodeFactory() {
  'use strict';

  const VERSION = '5.25.5';
  const PREFIX = 'TKN-B-';
  const LOCAL_SEQUENCE_KEY = 'tkn_box_category_zone_sequence_v5255';

  const CATEGORY_DEFINITIONS = Object.freeze([
    { code: 'IT', label: 'ไอทีและอิเล็กทรอนิกส์', aliases: ['ไอที', 'อุปกรณ์ไอที', 'คอมพิวเตอร์', 'อิเล็กทรอนิกส์', 'มือถือ', 'แท็บเล็ต', 'กล้อง', 'gaming', 'computer', 'electronics', 'mobile', 'gadget'] },
    { code: 'AUD', label: 'ออดิโอ', aliases: ['ออดิโอ', 'เครื่องเสียง', 'อุปกรณ์เสียง', 'ไมโครโฟน', 'ไมค์', 'ลำโพง', 'หูฟัง', 'audio', 'sound', 'microphone', 'speaker', 'headphone'] },
    { code: 'SHO', label: 'รองเท้า', aliases: ['รองเท้า', 'รองเท้าแตะ', 'สนีกเกอร์', 'บูท', 'ผ้าใบ', 'shoe', 'shoes', 'footwear', 'sneaker'] },
    { code: 'JEW', label: 'เครื่องประดับ', aliases: ['เครื่องประดับ', 'จิวเวลรี่', 'แหวน', 'สร้อย', 'กำไล', 'ต่างหู', 'jewelry', 'jewellery', 'accessories'] },
    { code: 'HOM', label: 'ของใช้ในบ้าน', aliases: ['ของใช้ในบ้าน', 'เครื่องครัว', 'ของใช้ครัว', 'แก้วน้ำ', 'แก้วน้ํา', 'home', 'household', 'kitchen', 'drinkware'] },
    { code: 'TOY', label: 'ของเล่นและโมเดล', aliases: ['ของเล่นและโมเดล', 'ของเล่น', 'โมเดล', 'ของสะสม', 'ฟิกเกอร์', 'ตุ๊กตา', 'รถเหล็ก', 'ตัวต่อ', 'toy', 'toys', 'model', 'collectibles'] },
    { code: 'FAS', label: 'เสื้อผ้า', aliases: ['เสื้อผ้า', 'แฟชั่น', 'เสื้อ', 'กางเกง', 'เดรส', 'กระโปรง', 'แจ็กเก็ต', 'หมวก', 'clothing', 'apparel', 'fashion'] },
    { code: 'BAG', label: 'กระเป๋า', aliases: ['กระเป๋า', 'กระเป๋าสตางค์', 'เป้', 'bag', 'bags', 'backpack', 'wallet', 'luggage'] },
    { code: 'BEA', label: 'เครื่องสำอาง', aliases: ['เครื่องสำอาง', 'ความงาม', 'สกินแคร์', 'ลิป', 'รองพื้น', 'แป้ง', 'เซรั่ม', 'ครีม', 'น้ำหอม', 'beauty', 'cosmetics', 'skincare', 'makeup'] },
    { code: 'GEN', label: 'อื่น ๆ', aliases: ['อื่น ๆ', 'อื่นๆ', 'อื่น', 'other', 'others', 'general'] },
    { code: 'MIX', label: 'คละประเภท', aliases: ['คละประเภท', 'mixed', 'mix'] },
  ]);

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[&/|>,;:_()[\]{}]+/g, ' ')
      .replace(/[\-–—]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function categoryOptions() {
    return CATEGORY_DEFINITIONS.filter((row) => row.code !== 'MIX').map((row) => ({ code: row.code, label: row.label }));
  }

  function resolveCategory(value) {
    const text = normalize(value);
    if (!text) return { code: 'GEN', label: 'อื่น ๆ', matched: false };
    const byCode = CATEGORY_DEFINITIONS.find((row) => row.code.toLowerCase() === text);
    if (byCode) return { code: byCode.code, label: byCode.label, matched: true };
    for (const row of CATEGORY_DEFINITIONS) {
      if (normalize(row.label) === text) return { code: row.code, label: row.label, matched: true };
      if (row.aliases.some((alias) => text.includes(normalize(alias)) || normalize(alias).includes(text))) {
        return { code: row.code, label: row.label, matched: true };
      }
    }
    return { code: 'GEN', label: String(value || 'อื่น ๆ').trim() || 'อื่น ๆ', matched: false };
  }

  function detectCategoryFromItem(item) {
    const candidates = [
      item?.category,
      item?.category_name,
      item?.categoryName,
      item?.product_type_th,
      item?.productType,
      item?.subCategory,
      item?.sourceCategory,
      item?.name,
    ].filter(Boolean);
    for (const candidate of candidates) {
      const resolved = resolveCategory(candidate);
      if (resolved.matched && resolved.code !== 'GEN') return resolved;
    }
    const fallback = candidates[0] || 'อื่น ๆ';
    return resolveCategory(fallback);
  }

  function categoriesFromItems(items) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const resolved = detectCategoryFromItem(item);
      if (!map.has(resolved.code)) map.set(resolved.code, resolved);
    }
    return [...map.values()];
  }

  function normalizeZone(value, fallback = 'A') {
    const raw = String(value || '').normalize('NFKC').toUpperCase().trim();
    const explicit = raw.match(/(?:โซน|ZONE|Z)\s*([A-Z])/i);
    if (explicit) return explicit[1].toUpperCase();
    const single = raw.match(/^[A-Z]$/);
    if (single) return single[0];
    const any = raw.match(/[A-Z]/);
    return (any?.[0] || fallback || 'A').toUpperCase();
  }

  function shortCode(value) {
    return String(value || '').replace(/^TKN-B-/i, '');
  }

  function canonicalCode(value) {
    const clean = shortCode(value).toUpperCase();
    return clean ? `${PREFIX}${clean}` : '';
  }

  function parse(value) {
    const canonical = canonicalCode(value);
    const match = canonical.match(/^TKN-B-([A-Z]{2,3})-([A-Z])(\d{2})$/i);
    if (!match) return null;
    const category = CATEGORY_DEFINITIONS.find((row) => row.code === match[1].toUpperCase());
    return {
      canonical,
      short: shortCode(canonical),
      categoryCode: match[1].toUpperCase(),
      categoryLabel: category?.label || match[1].toUpperCase(),
      zone: match[2].toUpperCase(),
      sequence: Number(match[3]),
    };
  }

  function preview(category, zone) {
    const resolved = resolveCategory(category);
    return `${resolved.code}-${normalizeZone(zone)}##`;
  }

  function readLocalSequences() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_SEQUENCE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function writeLocalSequence(key, value) {
    try {
      const rows = readLocalSequences();
      rows[key] = Math.max(Number(rows[key] || 0), Number(value || 0));
      localStorage.setItem(LOCAL_SEQUENCE_KEY, JSON.stringify(rows));
    } catch (_) {}
  }

  async function nextIdentity(options = {}) {
    const category = resolveCategory(options.category);
    const zone = normalizeZone(options.zone);
    const parsedCurrent = parse(options.currentCode);
    if (parsedCurrent && parsedCurrent.categoryCode === category.code && parsedCurrent.zone === zone) {
      return { ...parsedCurrent, categoryLabel: category.label };
    }

    const prefix = `${PREFIX}${category.code}-${zone}`;
    const sequenceKey = `${category.code}-${zone}`;
    let maxSequence = Number(readLocalSequences()[sequenceKey] || 0);
    const client = options.client || (typeof window !== 'undefined' ? window.supabaseClient : null);

    if (client?.from) {
      try {
        const { data, error } = await client.from('stock_boxes')
          .select('box_code')
          .ilike('box_code', `${prefix}%`)
          .limit(500);
        if (error) throw error;
        for (const row of data || []) {
          const parsed = parse(row?.box_code);
          if (parsed && parsed.categoryCode === category.code && parsed.zone === zone) {
            maxSequence = Math.max(maxSequence, parsed.sequence);
          }
        }
      } catch (error) {
        console.warn('[TKN Box Code] ใช้เลขลำดับจากเครื่องนี้แทน:', error);
      }
    }

    const sequence = maxSequence + 1;
    if (sequence > 99) throw new Error(`โซน ${zone} ของประเภท ${category.label} ใช้รหัสครบ 99 กล่องแล้ว กรุณาเปลี่ยนโซน`);
    writeLocalSequence(sequenceKey, sequence);
    const short = `${category.code}-${zone}${String(sequence).padStart(2, '0')}`;
    return {
      canonical: `${PREFIX}${short}`,
      short,
      categoryCode: category.code,
      categoryLabel: category.label,
      zone,
      sequence,
    };
  }

  return Object.freeze({
    version: VERSION,
    prefix: PREFIX,
    categoryOptions,
    resolveCategory,
    detectCategoryFromItem,
    categoriesFromItems,
    normalizeZone,
    shortCode,
    canonicalCode,
    parse,
    preview,
    nextIdentity,
  });
});
