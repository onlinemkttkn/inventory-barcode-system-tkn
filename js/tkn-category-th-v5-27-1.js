(() => {
  'use strict';
  const MAP = new Map([
    ['Home & Living', 'บ้านและของใช้'],
    ['Tools & Home Improvement', 'เครื่องมือและอุปกรณ์บ้าน'],
    ['Mobile & Gadgets', 'โทรศัพท์และอุปกรณ์'],
    ['Accessories', 'อุปกรณ์เสริม'],
    ['Men Shoes', 'รองเท้าผู้ชาย'],
    ['Women Shoes', 'รองเท้าผู้หญิง'],
    ['Sneakers', 'รองเท้าผ้าใบ'],
    ['Boots', 'รองเท้าบูท'],
    ['Lightings', 'ไฟและอุปกรณ์ส่องสว่าง'],
    ['Fishing Tackles', 'ตกปลาและอุปกรณ์'],
    ['Kitchenware', 'เครื่องครัว'],
    ['Pets', 'สัตว์เลี้ยงและอุปกรณ์'],
    ['Beauty', 'ความงามและของใช้ส่วนตัว'],
    ['Automobiles', 'รถยนต์และอุปกรณ์'],
    ['Motorcycles', 'รถจักรยานยนต์และอุปกรณ์']
  ]);
  const SELECTORS = [
    '[data-category]', '[data-main-category]', '[data-subcategory]',
    '.category-name', '.category-label', '.product-category', '.subcategory-name',
    'td[data-field="category"]', 'td[data-field="main_category"]', 'td[data-field="sub_category"]',
    'select[name*="category" i] option', 'select[id*="category" i] option',
    'select[data-field="category_code"] option'
  ].join(',');

  function translateElement(element) {
    if (!(element instanceof Element) || element.children.length) return;
    const original = (element.textContent || '').trim();
    if (!MAP.has(original)) return;
    element.dataset.tknOriginalCategory = original;
    element.textContent = MAP.get(original);
    element.title = `หมวดหมู่ต้นทาง: ${original}`;
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches(SELECTORS)) translateElement(root);
    root.querySelectorAll?.(SELECTORS).forEach(translateElement);
  }

  document.addEventListener('DOMContentLoaded', () => {
    scan();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) if (node instanceof Element) scan(node);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
