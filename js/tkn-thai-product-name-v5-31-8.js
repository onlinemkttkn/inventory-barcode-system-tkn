(() => {
  'use strict';

  const VERSION = '5.31.8';
  const THAI_RE = /[\u0E00-\u0E7F]/;
  const LATIN_RE = /[A-Za-z]/;

  const PHRASES = [
    [/wireless\s+bluetooth\s+(?:earbuds?|earphones?|headphones?)/gi, 'หูฟังบลูทูธไร้สาย'],
    [/bluetooth\s+(?:earbuds?|earphones?|headphones?)/gi, 'หูฟังบลูทูธ'],
    [/(?:remote\s+control|radio\s+control|rc)\s+(?:model\s+)?car/gi, 'รถบังคับ'],
    [/model\s+car/gi, 'โมเดลรถ'],
    [/plush\s+keychain/gi, 'พวงกุญแจตุ๊กตาผ้า'],
    [/plush\s+toy/gi, 'ตุ๊กตาผ้า'],
    [/lunch\s+box/gi, 'กล่องข้าว'],
    [/hair\s+clipper/gi, 'ปัตตาเลี่ยน'],
    [/hair\s+clip/gi, 'กิ๊บติดผม'],
    [/(?:mini\s+)?portable\s+fan/gi, 'พัดลมพกพา'],
    [/(?:mini\s+)?fan/gi, 'พัดลม'],
    [/ice\s+cube\s+tray/gi, 'ถาดทำน้ำแข็ง'],
    [/(?:crossbody\s+)?shoulder\s+bag/gi, 'กระเป๋าสะพายข้าง'],
    [/backpack/gi, 'กระเป๋าเป้'],
    [/phone\s+holder/gi, 'ที่วางโทรศัพท์'],
    [/ceramic\s+mug/gi, 'แก้วมัคเซรามิก'],
    [/(?:anime\s+)?figure/gi, 'ฟิกเกอร์'],
    [/laptop\s+stand/gi, 'ขาตั้งโน้ตบุ๊ก'],
    [/sewing\s+machine/gi, 'จักรเย็บผ้า'],
    [/storage\s+(?:box|container)/gi, 'กล่องจัดเก็บ'],
    [/storage\s+organizer/gi, 'อุปกรณ์จัดเก็บ'],
    [/phone\s+case/gi, 'เคสโทรศัพท์'],
    [/screen\s+protector/gi, 'ฟิล์มกันรอย'],
    [/power\s+bank/gi, 'พาวเวอร์แบงก์'],
    [/car\s+charger/gi, 'ที่ชาร์จในรถยนต์'],
    [/wall\s+charger/gi, 'หัวชาร์จ'],
    [/charging\s+cable/gi, 'สายชาร์จ'],
    [/data\s+cable/gi, 'สายดาต้า'],
    [/desk\s+lamp/gi, 'โคมไฟตั้งโต๊ะ'],
    [/led\s+light/gi, 'ไฟ LED'],
    [/pet\s+(?:house|bed)/gi, 'ที่นอนและบ้านสัตว์เลี้ยง'],
    [/dog\s+toy/gi, 'ของเล่นสุนัข'],
    [/cat\s+toy/gi, 'ของเล่นแมว'],
    [/fishing\s+rod/gi, 'คันเบ็ดตกปลา'],
    [/fishing\s+reel/gi, 'รอกตกปลา'],
    [/kitchen\s+knife/gi, 'มีดทำครัว'],
    [/frying\s+pan/gi, 'กระทะ'],
    [/water\s+bottle/gi, 'ขวดน้ำ'],
    [/vacuum\s+flask/gi, 'กระติกเก็บอุณหภูมิ'],
    [/car\s+accessor(?:y|ies)/gi, 'อุปกรณ์รถยนต์'],
    [/motorcycle\s+accessor(?:y|ies)/gi, 'อุปกรณ์รถจักรยานยนต์'],
    [/skin\s*care/gi, 'ผลิตภัณฑ์ดูแลผิว'],
    [/make\s*up/gi, 'เครื่องสำอาง'],
    [/women(?:'s)?\s+shoes?/gi, 'รองเท้าผู้หญิง'],
    [/men(?:'s)?\s+shoes?/gi, 'รองเท้าผู้ชาย'],
    [/baby\s+toy/gi, 'ของเล่นเด็ก'],
    [/building\s+blocks?/gi, 'ตัวต่อของเล่น'],
    [/action\s+figure/gi, 'ฟิกเกอร์']
  ];

  const WORDS = new Map(Object.entries({
    wireless:'ไร้สาย', bluetooth:'บลูทูธ', earbuds:'หูฟัง', earbud:'หูฟัง', earphone:'หูฟัง', earphones:'หูฟัง', headphone:'หูฟัง', headphones:'หูฟัง',
    charger:'ที่ชาร์จ', charging:'ชาร์จ', adapter:'อะแดปเตอร์', cable:'สาย', fast:'เร็ว', rechargeable:'ชาร์จซ้ำได้', battery:'แบตเตอรี่', electric:'ไฟฟ้า',
    case:'เคส', cover:'ฝาครอบ', holder:'ที่วาง', stand:'ขาตั้ง', mount:'ตัวยึด', protector:'อุปกรณ์ป้องกัน', keychain:'พวงกุญแจ', clip:'กิ๊บ',
    toy:'ของเล่น', toys:'ของเล่น', model:'โมเดล', figure:'ฟิกเกอร์', doll:'ตุ๊กตา', plush:'ตุ๊กตาผ้า', robot:'หุ่นยนต์', car:'รถ', truck:'รถบรรทุก', motorcycle:'รถจักรยานยนต์', bike:'จักรยาน', dinosaur:'ไดโนเสาร์',
    light:'ไฟ', lamp:'โคมไฟ', bulb:'หลอดไฟ', desk:'ตั้งโต๊ะ', solar:'พลังงานแสงอาทิตย์', fan:'พัดลม',
    storage:'จัดเก็บ', box:'กล่อง', organizer:'อุปกรณ์จัดเก็บ', rack:'ชั้นวาง', shelf:'ชั้นวาง', basket:'ตะกร้า', bag:'กระเป๋า', backpack:'กระเป๋าเป้',
    kitchen:'ครัว', knife:'มีด', spoon:'ช้อน', fork:'ส้อม', bowl:'ชาม', plate:'จาน', cup:'แก้ว', glass:'แก้ว', mug:'แก้วมัค', bottle:'ขวด', pan:'กระทะ', pot:'หม้อ', tray:'ถาด', ice:'น้ำแข็ง', lunch:'อาหารกลางวัน',
    pet:'สัตว์เลี้ยง', dog:'สุนัข', cat:'แมว', collar:'ปลอกคอ', leash:'สายจูง', bed:'ที่นอน', house:'บ้าน',
    fishing:'ตกปลา', rod:'คันเบ็ด', reel:'รอก', hook:'ตะขอ', lure:'เหยื่อตกปลา',
    tool:'เครื่องมือ', tools:'เครื่องมือ', drill:'สว่าน', screwdriver:'ไขควง', wrench:'ประแจ', hammer:'ค้อน', sewing:'เย็บผ้า', machine:'เครื่อง',
    beauty:'ความงาม', cosmetic:'เครื่องสำอาง', cosmetics:'เครื่องสำอาง', cream:'ครีม', serum:'เซรั่ม', mask:'มาสก์', lipstick:'ลิปสติก', hair:'ผม', clipper:'ปัตตาเลี่ยน',
    shirt:'เสื้อ', tshirt:'เสื้อยืด', pants:'กางเกง', dress:'เดรส', skirt:'กระโปรง', shoes:'รองเท้า', shoe:'รองเท้า', sneaker:'รองเท้าผ้าใบ', sneakers:'รองเท้าผ้าใบ', sandal:'รองเท้าแตะ', sandals:'รองเท้าแตะ',
    men:'ผู้ชาย', mens:'ผู้ชาย', women:'ผู้หญิง', womens:'ผู้หญิง', kids:'เด็ก', kid:'เด็ก', baby:'เด็กเล็ก',
    plastic:'พลาสติก', metal:'โลหะ', stainless:'สเตนเลส', steel:'เหล็ก', wood:'ไม้', wooden:'ไม้', silicone:'ซิลิโคน', ceramic:'เซรามิก', aluminum:'อะลูมิเนียม', aluminium:'อะลูมิเนียม', magnetic:'แม่เหล็ก',
    mini:'ขนาดเล็ก', small:'ขนาดเล็ก', large:'ขนาดใหญ่', big:'ขนาดใหญ่', portable:'พกพา', foldable:'พับได้', adjustable:'ปรับได้', automatic:'อัตโนมัติ', manual:'แบบมือ',
    black:'สีดำ', white:'สีขาว', red:'สีแดง', blue:'สีน้ำเงิน', green:'สีเขียว', pink:'สีชมพู', yellow:'สีเหลือง', gray:'สีเทา', grey:'สีเทา', brown:'สีน้ำตาล', purple:'สีม่วง', orange:'สีส้ม',
    new:'', original:'', genuine:'', premium:'', quality:'', high:'', hot:'', sale:'', best:'', latest:'', fashion:'', universal:'', cute:'', set:'ชุด', multifunction:'อเนกประสงค์', multifunctional:'อเนกประสงค์'
  }));

  const CATEGORY_RULES = [
    [/(toy|hobbies|collection|model|figure|ของเล่น|ของสะสม)/i, 'ของเล่นและของสะสม'],
    [/(mobile|gadget|phone|electronic|computer|โทรศัพท์|อิเล็กทรอนิกส์|คอมพิวเตอร์)/i, 'อุปกรณ์อิเล็กทรอนิกส์'],
    [/(home|living|storage|household|บ้าน|ของใช้|จัดเก็บ)/i, 'ของใช้ในบ้าน'],
    [/(kitchen|ครัว)/i, 'เครื่องครัว'],
    [/(pet|สัตว์เลี้ยง)/i, 'อุปกรณ์สัตว์เลี้ยง'],
    [/(beauty|cosmetic|skin|hair|personal care|ความงาม)/i, 'สินค้าเพื่อความงาม'],
    [/(shoe|fashion|clothes|apparel|bag|แฟชั่น|เสื้อผ้า|รองเท้า|กระเป๋า)/i, 'สินค้าแฟชั่น'],
    [/(auto|car|automobile|รถยนต์)/i, 'อุปกรณ์รถยนต์'],
    [/(motorcycle|motorbike|จักรยานยนต์)/i, 'อุปกรณ์รถจักรยานยนต์'],
    [/(fishing|sport|outdoor|ตกปลา|กีฬา)/i, 'อุปกรณ์กีฬาและกิจกรรมกลางแจ้ง'],
    [/(tool|hardware|เครื่องมือ)/i, 'เครื่องมือและอุปกรณ์'],
    [/(light|lighting|lamp|ไฟ|โคม)/i, 'ไฟและอุปกรณ์ส่องสว่าง']
  ];

  const TECH = new Set(['USB','USB-C','TYPE-C','TYPEC','TWS','LED','RGB','RC','DIY','HD','FHD','UHD','4K','2K','5G','4G','WIFI','WI-FI','BT','QC','PD','GAN','IOS','ANDROID']);
  const DROP = new Set(['THE','A','AN','AND','OR','FOR','WITH','OF','TO','IN','ON','BY','FROM','NEW','HOT','SALE','BEST','HIGH','QUALITY','PREMIUM','ORIGINAL','GENUINE','FASHION','PRODUCT','ITEM','PCS','PC']);
  const PRODUCT_NOUN_RE = /(หูฟัง|รถบังคับ|โมเดลรถ|พวงกุญแจ|ตุ๊กตา|กล่องข้าว|กล่องจัดเก็บ|กล่อง|กิ๊บ|พัดลม|ถาด|กระเป๋า|ที่วางโทรศัพท์|แก้วมัค|แก้ว|ฟิกเกอร์|ขาตั้งโน้ตบุ๊ก|ปัตตาเลี่ยน|จักรเย็บผ้า|เคส|ฟิล์ม|พาวเวอร์แบงก์|ที่ชาร์จ|หัวชาร์จ|สายชาร์จ|สายดาต้า|สาย|โคมไฟ|หลอดไฟ|ของเล่น|คันเบ็ด|รอก|มีด|กระทะ|ขวด|กระติก|รองเท้า|เสื้อ|กางเกง|เดรส|กระโปรง|หุ่นยนต์|รถบรรทุก|รถจักรยานยนต์|จักรยาน|ชั้นวาง|ตะกร้า|หม้อ|ชาม|จาน|ครีม|เซรั่ม|มาสก์|ลิปสติก|แบตเตอรี่|อะแดปเตอร์|เครื่องมือ|อุปกรณ์รถยนต์|อุปกรณ์รถจักรยานยนต์|อุปกรณ์สัตว์เลี้ยง|เครื่องสำอาง|ผลิตภัณฑ์ดูแลผิว|ตัวต่อ)/;

  const clean = (value) => String(value ?? '').replace(/[\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim();
  const hasThai = (value) => THAI_RE.test(clean(value));
  const hasLatin = (value) => LATIN_RE.test(clean(value));
  const isThaiOnly = (value) => hasThai(value) && !hasLatin(value);
  const thaiCount = (value) => (clean(value).match(/[\u0E00-\u0E7F]/g) || []).length;

  function thaiCategory(mainCategory, subCategory, originalName) {
    const sub = clean(subCategory);
    const main = clean(mainCategory);
    if (thaiCount(sub) >= 2 && !/ยังไม่|ทั่วไป$/.test(sub)) return sub;
    if (thaiCount(main) >= 2 && !/ยังไม่/.test(main)) return main;
    const hay = `${sub} ${main} ${clean(originalName)}`;
    for (const [re, label] of CATEGORY_RULES) if (re.test(hay)) return label;
    return 'สินค้าทั่วไป';
  }

  function modelTokens(original) {
    const text = clean(original);
    const found = [];
    const re = /\b(?:[A-Za-z]{1,10}[-_/]?[A-Za-z0-9]*\d+[A-Za-z0-9._+:/-]*|\d+(?:\.\d+)?(?:CM|MM|M|ML|L|W|V|A|AH|MAH|INCH|IN)?|XXXL|XXL|XL|TWS|USB-C|TYPE-C|LED|RGB|RC|DIY|FHD|UHD|4K|2K|5G|4G|WIFI|WI-FI|BT|QC|PD|GAN|IOS|ANDROID)\b/gi;
    for (const match of text.matchAll(re)) {
      const token = match[0].toUpperCase();
      if (!DROP.has(token) && !found.includes(token)) found.push(token);
      if (found.length >= 5) break;
    }
    return found;
  }

  function translateKnown(original) {
    let text = clean(original);
    for (const [re, replacement] of PHRASES) text = text.replace(re, ` ${replacement} `);
    const parts = text.replace(/[|·•,;()[\]{}<>]+/g, ' ').split(/\s+/).filter(Boolean);
    const out = [];
    const unknown = [];
    for (const raw of parts) {
      if (hasThai(raw)) { out.push(raw); continue; }
      const key = raw.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
      if (WORDS.has(key)) {
        const val = WORDS.get(key);
        if (val) out.push(val);
        continue;
      }
      const upper = raw.toUpperCase();
      if (TECH.has(upper) || /^\d/.test(raw) || /^[A-Z]{1,6}[-_/]?\d/i.test(raw)) {
        out.push(upper);
        continue;
      }
      if (key && !DROP.has(upper)) unknown.push(raw);
    }
    const dedup = [];
    for (const token of out) if (token && !dedup.includes(token)) dedup.push(token);
    return { text: clean(dedup.join(' ')), unknown };
  }

  function make(input = {}) {
    const originalName = clean(input.originalName || input.productName || input.name);
    const sku = clean(input.sku || input.productCode || input.sourceSku);
    if (isThaiOnly(originalName) && thaiCount(originalName) >= 2) {
      return { name: originalName, originalName, status: 'SOURCE_THAI', changed: false, version: VERSION };
    }

    const translated = translateKnown(originalName);
    const category = thaiCategory(input.mainCategory, input.subCategory, originalName);
    let candidate = translated.text;
    let status = thaiCount(candidate) >= 2 ? 'AUTO_KEYWORD' : 'AUTO_CATEGORY';
    const hadProductNoun = PRODUCT_NOUN_RE.test(candidate);

    if (thaiCount(candidate) < 2) {
      candidate = category;
    } else if (!hadProductNoun) {
      candidate = clean(`${category} ${candidate}`);
      status = category === 'สินค้าทั่วไป' ? 'AUTO_CATEGORY' : 'AUTO_KEYWORD_CATEGORY';
    }

    const models = modelTokens(originalName).filter((token) => !candidate.toUpperCase().includes(token));
    if (models.length) candidate = clean(`${candidate} ${models.join(' ')}`);

    const needsSku = Boolean(
      sku && (
        status === 'AUTO_CATEGORY' ||
        translated.unknown.length > 0 ||
        !PRODUCT_NOUN_RE.test(candidate)
      )
    );
    if (needsSku && !candidate.includes(sku)) candidate = clean(`${candidate} รหัส ${sku}`);

    if (thaiCount(candidate) < 2) candidate = sku ? `สินค้าทั่วไป รหัส ${sku}` : 'สินค้าทั่วไป';
    return {
      name: candidate,
      originalName,
      status,
      changed: candidate !== originalName,
      unknownTokens: translated.unknown.slice(0, 8),
      version: VERSION
    };
  }

  function sourceNote(existing, originalName, thaiName, prefix = 'ชื่อเดิมต้นทาง') {
    const base = clean(existing);
    const original = clean(originalName);
    const thai = clean(thaiName);
    if (!original || original === thai || isThaiOnly(original)) return base || null;
    const line = `${prefix}: ${original}`;
    if (base.includes(line)) return base;
    return clean(base ? `${base} | ${line}` : line);
  }

  window.TKNThaiProductName = Object.freeze({ VERSION, make, hasThai, hasLatin, isThaiOnly, sourceNote });
})();
