(function attachCategoryEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TKNCategoryEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function categoryEngineFactory() {
  'use strict';

  const VERSION = '5.25.0';
  const MEMORY_KEY = 'tkn_sku_category_rules_v1';
  const CATEGORIES = Object.freeze([
    'ไอทีและอิเล็กทรอนิกส์',
    'ออดิโอ',
    'รองเท้า',
    'เครื่องประดับ',
    'ของใช้ในบ้าน',
    'ของเล่นและโมเดล',
    'เสื้อผ้า',
    'กระเป๋า',
    'เครื่องสำอาง',
    'อื่น ๆ',
  ]);

  const CATEGORY_RULES = Object.freeze([
    {
      category: 'ไอทีและอิเล็กทรอนิกส์',
      aliases: [
        'it', 'electronics', 'electronic', 'mobile', 'mobile & gadgets', 'mobile and gadgets',
        'computer', 'computers', 'laptop', 'tablet', 'phone', 'smartphone', 'gadget', 'gadgets',
        'camera', 'gaming', 'เครื่องใช้ไฟฟ้า', 'อิเล็กทรอนิกส์', 'มือถือ', 'คอมพิวเตอร์',
        'อุปกรณ์ไอที', 'อุปกรณ์อิเล็กทรอนิกส์', 'สมาร์ทโฟน',
      ],
      keywords: [
        'usb', 'type c', 'type-c', 'charger', 'adapter', 'cable', 'สายชาร์จ', 'หัวชาร์จ', 'อะแดปเตอร์',
        'power bank', 'พาวเวอร์แบงค์',
        'keyboard', 'mouse', 'เมาส์', 'คีย์บอร์ด', 'memory card', 'flash drive', 'แฟลชไดรฟ์',
        'smart watch', 'smartwatch', 'สมาร์ทวอทช์', 'phone case', 'เคสมือถือ', 'screen protector', 'ฟิล์ม',
      ],
    },
    {
      category: 'ออดิโอ',
      aliases: [
        'audio', 'sound', 'recording', 'podcast', 'studio audio', 'ออดิโอ', 'ระบบเสียง',
        'เครื่องเสียง', 'อุปกรณ์เสียง', 'อุปกรณ์บันทึกเสียง'
      ],
      keywords: [
        'ไมโครโฟน', 'ไมค์', 'microphone', 'wireless mic', 'ไมค์ไร้สาย',
        'หูฟัง', 'headphone', 'headset', 'earphone', 'earbud',
        'ลำโพง', 'speaker', 'soundbar', 'มิกเซอร์', 'mixer',
        'audio interface', 'อินเทอร์เฟซเสียง', 'sound card',
        'เครื่องบันทึกเสียง', 'audio recorder', 'voice recorder',
        'ไลฟ์สด', 'live stream', 'streaming', 'podcast console',
        'xlr', 'trs', 'rca', 'aux', 'สายสัญญาณ', 'audio cable'
      ],
    },
    {
      category: 'รองเท้า',
      aliases: ['shoe', 'shoes', 'footwear', 'sneaker', 'sneakers', 'sandals', 'slippers', 'boots', 'รองเท้า'],
      keywords: ['รองเท้า', 'สนีกเกอร์', 'แตะ', 'รองเท้าแตะ', 'บูท', 'ส้นสูง', 'ผ้าใบ', 'loafer'],
    },
    {
      category: 'เครื่องประดับ',
      aliases: [
        'jewelry', 'jewellery', 'fashion accessories', 'accessories', 'fine jewelry',
        'เครื่องประดับ', 'จิวเวลรี่', 'แฟชั่นแอคเซสซอรี่',
      ],
      keywords: [
        'ring', 'necklace', 'bracelet', 'earring', 'pendant', 'anklet', 'brooch',
        'แหวน', 'สร้อย', 'กำไล', 'ต่างหู', 'จี้', 'เข็มกลัด', 'เครื่องประดับ',
      ],
    },
    {
      category: 'ของใช้ในบ้าน',
      aliases: [
        'home & living', 'home and living', 'home', 'household', 'kitchen', 'dining', 'drinkware',
        'home appliances', 'ของใช้ในบ้าน', 'เครื่องครัว', 'ของใช้ครัว', 'เครื่องใช้ภายในบ้าน',
      ],
      keywords: [
        'แก้วน้ำ', 'แก้วน้ํา', 'แก้วกาแฟ', 'tumbler', 'cup', 'mug', 'bottle', 'ขวดน้ำ', 'กระติก',
        'จาน', 'ชาม', 'ช้อน', 'ส้อม', 'หม้อ', 'กระทะ', 'กล่องอาหาร', 'storage box', 'ไม้แขวน',
        'ผ้าปู', 'หมอน', 'ผ้าห่ม', 'โคมไฟ', 'เครื่องดูดฝุ่น',
      ],
    },
    {
      category: 'ของเล่นและโมเดล',
      aliases: [
        'toys', 'toys & games', 'toys and games', 'games', 'collectibles', 'hobbies', 'model', 'models',
        'ของเล่น', 'โมเดล', 'ของสะสม', 'งานอดิเรก',
      ],
      keywords: [
        'toy', 'figure', 'figurine', 'doll', 'plush', 'lego', 'block', 'puzzle', 'board game',
        'hot wheels', 'hotwheels', 'tomica', 'โมเดล', 'ฟิกเกอร์', 'ตุ๊กตา', 'รถเหล็ก', 'ตัวต่อ', 'ของเล่น',
      ],
    },
    {
      category: 'เสื้อผ้า',
      aliases: [
        'clothing', 'apparel', 'fashion', 'men clothes', 'women clothes', 'kids clothes',
        'เสื้อผ้า', 'แฟชั่นผู้ชาย', 'แฟชั่นผู้หญิง', 'เสื้อผ้าเด็ก',
      ],
      keywords: [
        'shirt', 't-shirt', 'tee', 'pants', 'jeans', 'dress', 'skirt', 'jacket', 'hoodie', 'underwear',
        'เสื้อ', 'กางเกง', 'ยีนส์', 'เดรส', 'กระโปรง', 'แจ็กเก็ต', 'ชุดนอน', 'ถุงเท้า', 'หมวก',
      ],
    },
    {
      category: 'กระเป๋า',
      aliases: ['bags', 'bag', 'luggage', 'backpack', 'wallet', 'กระเป๋า', 'กระเป๋าเดินทาง'],
      keywords: ['กระเป๋า', 'backpack', 'handbag', 'shoulder bag', 'crossbody', 'wallet', 'กระเป๋าสตางค์', 'เป้', 'luggage'],
    },
    {
      category: 'เครื่องสำอาง',
      aliases: [
        'beauty', 'beauty & personal care', 'beauty and personal care', 'cosmetics', 'skincare', 'makeup',
        'personal care', 'hair care', 'perfume', 'เครื่องสำอาง', 'ความงาม', 'ดูแลผิว', 'ของใช้ส่วนตัว',
      ],
      keywords: [
        'lipstick', 'ลิป', 'foundation', 'รองพื้น', 'powder', 'แป้ง', 'serum', 'เซรั่ม', 'cream', 'ครีม',
        'shampoo', 'แชมพู', 'conditioner', 'ครีมนวด', 'perfume', 'น้ำหอม', 'mask', 'มาสก์', 'sunscreen', 'กันแดด',
      ],
    },
  ]);

  const UNHELPFUL_SOURCE_CATEGORIES = new Set([
    '', '-', 'n/a', 'na', 'none', 'null', 'unknown', 'uncategorized', 'other', 'others',
    'lazada', 'shopee', 'ยังไม่จัดหมวด', 'ไม่ระบุหมวดหมู่', 'ไม่ระบุหมวด', 'อื่น ๆ',
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

  function normalizeSku(value) {
    return String(value ?? '').normalize('NFKC').trim().toUpperCase();
  }

  const CATEGORY_COMPATIBILITY = Object.freeze({
    it: 'ไอทีและอิเล็กทรอนิกส์',
    'ไอที': 'ไอทีและอิเล็กทรอนิกส์',
    'จิวเวลรี่': 'เครื่องประดับ',
    'ของเล่น โมเดล': 'ของเล่นและโมเดล',
    'ของเล่น/โมเดล': 'ของเล่นและโมเดล'
  });

  function isKnownCategory(value) {
    const target = normalize(value);
    const direct = CATEGORIES.find((category) => normalize(category) === target);
    if (direct) return direct;
    return CATEGORY_COMPATIBILITY[target] || '';
  }

  function containsTerm(text, term) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return false;
    if (/^[a-z0-9]+$/.test(normalizedTerm) && normalizedTerm.length <= 3) {
      return new RegExp(`(^|\\s)${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i').test(text);
    }
    return text.includes(normalizedTerm);
  }

  function scoreRules(text, fieldWeight) {
    const scores = new Map();
    for (const rule of CATEGORY_RULES) {
      let score = 0;
      let matched = [];
      for (const alias of rule.aliases) {
        if (containsTerm(text, alias)) {
          score += fieldWeight.alias;
          matched.push(alias);
        }
      }
      for (const keyword of rule.keywords) {
        if (containsTerm(text, keyword)) {
          score += fieldWeight.keyword;
          matched.push(keyword);
        }
      }
      if (score > 0) scores.set(rule.category, { score, matched });
    }
    return scores;
  }

  function mergeScores(...maps) {
    const merged = new Map();
    for (const map of maps) {
      for (const [category, data] of map.entries()) {
        const current = merged.get(category) || { score: 0, matched: [] };
        current.score += data.score;
        current.matched.push(...data.matched);
        merged.set(category, current);
      }
    }
    return merged;
  }

  function classify(input, rememberedCategory = '') {
    const exactRemembered = isKnownCategory(rememberedCategory);
    if (exactRemembered) {
      return {
        category: exactRemembered,
        confidence: 0.99,
        origin: 'SKU_MEMORY',
        reason: 'จำหมวดจาก SKU ที่เคยยืนยัน',
        autoConfirm: true,
      };
    }

    const exactSource = isKnownCategory(input.category || input.sourceCategory);
    if (exactSource) {
      return {
        category: exactSource,
        confidence: 0.98,
        origin: 'EXACT_SOURCE',
        reason: 'หมวดในไฟล์ตรงกับหมวด TKN',
        autoConfirm: true,
      };
    }

    const categoryText = normalize([
      input.mainCategory,
      input.subCategory,
      input.sourceCategory,
      input.category,
    ].filter(Boolean).join(' '));
    const usefulCategoryText = UNHELPFUL_SOURCE_CATEGORIES.has(categoryText) ? '' : categoryText;
    const nameText = normalize([input.name, input.sourceSku, input.sku].filter(Boolean).join(' '));

    const sourceScores = usefulCategoryText
      ? scoreRules(usefulCategoryText, { alias: 5, keyword: 2.5 })
      : new Map();
    const nameScores = scoreRules(nameText, { alias: 2.2, keyword: 2.8 });
    const merged = mergeScores(sourceScores, nameScores);
    const ranking = [...merged.entries()].sort((a, b) => b[1].score - a[1].score);

    if (!ranking.length) {
      return {
        category: '',
        confidence: 0,
        origin: 'NONE',
        reason: 'ยังไม่มีข้อมูลพอสำหรับแนะนำหมวด',
        autoConfirm: false,
      };
    }

    const [bestCategory, bestData] = ranking[0];
    const runnerUpScore = ranking[1]?.[1]?.score || 0;
    const sourceContribution = sourceScores.get(bestCategory)?.score || 0;
    const margin = bestData.score - runnerUpScore;
    const confidence = Math.min(0.96, 0.52 + bestData.score * 0.045 + Math.max(0, margin) * 0.025);
    const sourceBased = sourceContribution >= 5;

    return {
      category: bestCategory,
      confidence: Number(confidence.toFixed(2)),
      origin: sourceBased ? 'MARKETPLACE_CATEGORY' : 'NAME_KEYWORD',
      reason: sourceBased
        ? `แปลงจากหมวด Marketplace: ${bestData.matched.slice(0, 3).join(', ')}`
        : `แนะนำจากชื่อสินค้า: ${bestData.matched.slice(0, 3).join(', ')}`,
      autoConfirm: sourceBased && confidence >= 0.78 && margin >= 1.5,
    };
  }

  function loadLocalMemory(storage) {
    const targetStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!targetStorage) return {};
    try {
      const raw = JSON.parse(targetStorage.getItem(MEMORY_KEY) || '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
      return {};
    }
  }

  function saveLocalMemory(memory, storage) {
    const targetStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!targetStorage) return;
    targetStorage.setItem(MEMORY_KEY, JSON.stringify(memory || {}));
  }

  function rememberSku(sku, category, storage) {
    const normalizedSku = normalizeSku(sku);
    const knownCategory = isKnownCategory(category);
    if (!normalizedSku || !knownCategory) return false;
    const memory = loadLocalMemory(storage);
    memory[normalizedSku] = {
      category: knownCategory,
      updatedAt: new Date().toISOString(),
    };
    saveLocalMemory(memory, storage);
    return true;
  }

  function getRememberedCategory(memory, sku, sourceSku) {
    const first = normalizeSku(sku);
    const second = normalizeSku(sourceSku);
    return memory?.[first]?.category || memory?.[second]?.category || '';
  }

  return Object.freeze({
    VERSION,
    MEMORY_KEY,
    CATEGORIES,
    CATEGORY_RULES,
    normalize,
    normalizeSku,
    isKnownCategory,
    classify,
    loadLocalMemory,
    saveLocalMemory,
    rememberSku,
    getRememberedCategory,
  });
});
