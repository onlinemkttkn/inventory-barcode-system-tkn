'use strict';

const $ = (id) => document.getElementById(id);
const els = {
  loginSection: $('loginSection'),
  generatorSection: $('generatorSection'),
  loginForm: $('loginForm'),
  email: $('email'),
  password: $('password'),
  loginMessage: $('loginMessage'),
  logoutBtn: $('logoutBtn'),
  configWarning: $('configWarning'),
  productSearchForm: $('productSearchForm'),
  searchInput: $('searchInput'),
  searchResults: $('searchResults'),
  searchMessage: $('searchMessage'),
  codeType: $('codeType'),
  barcodeSource: $('barcodeSource'),
  qrSource: $('qrSource'),
  customQrField: $('customQrField'),
  customQrText: $('customQrText'),
  labelSize: $('labelSize'),
  showName: $('showName'),
  showPrice: $('showPrice'),
  showProductCode: $('showProductCode'),
  showBarcodeText: $('showBarcodeText'),
  generateBtn: $('generateBtn'),
  downloadBarcodeBtn: $('downloadBarcodeBtn'),
  downloadQrBtn: $('downloadQrBtn'),
  printBtn: $('printBtn'),
  generatorMessage: $('generatorMessage'),
  selectedProductText: $('selectedProductText'),
  printArea: $('printArea'),
  labelName: $('labelName'),
  labelPrice: $('labelPrice'),
  labelProductCode: $('labelProductCode'),
  barcodeBlock: $('barcodeBlock'),
  barcodeSvg: $('barcodeSvg'),
  qrBlock: $('qrBlock'),
  qrCanvas: $('qrCanvas')
};

let selectedProduct = null;
let printInProgress = false;

function msg(element, text, kind = '') {
  element.textContent = text;
  element.className = `message ${kind}`.trim();
}

function ready() {
  return !SUPABASE_URL.includes('ใส่_') && !SUPABASE_PUBLISHABLE_KEY.includes('ใส่_');
}

async function init() {
  if (!ready()) {
    els.configWarning.textContent = 'ยังไม่ได้ตั้งค่า Supabase ใน js/supabase-config.js';
    els.configWarning.classList.remove('hidden');
    window.TKNAuthGuard?.fail(new Error('ยังไม่ได้ตั้งค่า Supabase'), () => location.reload());
    return;
  }

  try {
    const access = await window.TKNAuthGuard.requireAccess('inventory.view', {
      loadingText: 'กำลังตรวจสอบสิทธิ์สร้างบาร์โค้ด...'
    });
    if (!access) return;

    els.loginSection.classList.add('hidden');
    els.generatorSection.classList.remove('hidden');
    els.searchInput.focus();

    supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession) return;
      window.TKNAuthGuard.clearAccessCache();
      location.replace('./dashboard.html');
    });

    window.TKNAuthGuard.ready();
  } catch (error) {
    if (error?.code === 'INVENTORY_PERMISSION_DENIED') return;
    window.TKNAuthGuard?.fail(error, () => location.reload());
  }
}

els.productSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = els.searchInput.value.trim();
  if (!query) {
    msg(els.searchMessage, 'กรุณากรอกคำค้นหา', 'error');
    return;
  }

  msg(els.searchMessage, 'กำลังค้นหา...');
  els.searchResults.innerHTML = '';
  const safe = query.replace(/[%_,()]/g, '');
  const { data, error } = await supabaseClient
    .from('product_management_list')
    .select('id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active')
    .or(`name.ilike.%${safe}%,product_code.ilike.%${safe}%,barcode.eq.${safe}`)
    .eq('is_active', true)
    .order('name')
    .limit(20);

  if (error) {
    msg(els.searchMessage, `ค้นหาไม่สำเร็จ: ${error.message}`, 'error');
    return;
  }
  if (!data?.length) {
    msg(els.searchMessage, 'ไม่พบสินค้า', 'error');
    return;
  }

  msg(els.searchMessage, `พบ ${data.length} รายการ`, 'success');
  data.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'result-item';

    const info = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = product.name;
    const small = document.createElement('small');
    small.textContent = `${product.product_code || '-'} • ${product.barcode || 'ไม่มีบาร์โค้ด'} • คงเหลือ ${product.total_branch_quantity ?? 0}`;
    info.append(strong, small);

    const button = document.createElement('button');
    button.className = 'button primary';
    button.type = 'button';
    button.textContent = 'เลือก';
    button.onclick = () => {
      selectedProduct = product;
      els.selectedProductText.textContent = `${product.name} • ${product.product_code || '-'} • ${product.barcode || 'ไม่มีบาร์โค้ด'}`;
      generate();
    };

    row.append(info, button);
    els.searchResults.appendChild(row);
  });
});

function barVal() {
  if (!selectedProduct) return '';
  return els.barcodeSource.value === 'product_code'
    ? selectedProduct.product_code || ''
    : selectedProduct.barcode || '';
}

function qrVal() {
  if (!selectedProduct) return '';
  if (els.qrSource.value === 'product_code') return selectedProduct.product_code || '';
  if (els.qrSource.value === 'product_json') {
    return JSON.stringify({
      product_code: selectedProduct.product_code,
      barcode: selectedProduct.barcode,
      name: selectedProduct.name,
      selling_price: selectedProduct.selling_price
    });
  }
  if (els.qrSource.value === 'custom') return els.customQrText.value.trim();
  return selectedProduct.barcode || '';
}

function money(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function clearStaleCodes() {
  els.barcodeSvg.innerHTML = '';
  els.qrCanvas.innerHTML = '';
}

function qrPixels() {
  switch (els.labelSize.value) {
    case '58mm': return 280;
    case '80mm': return 360;
    case 'a4': return 420;
    default: return 320;
  }
}

function generate() {
  clearStaleCodes();

  if (!selectedProduct) {
    msg(els.generatorMessage, 'กรุณาเลือกสินค้าก่อน', 'error');
    return false;
  }

  const type = els.codeType.value;
  const barcodeValue = barVal();
  const qrValue = qrVal();

  if ((type === 'barcode' || type === 'both') && !barcodeValue) {
    msg(els.generatorMessage, 'สินค้านี้ไม่มีค่าที่ใช้สร้าง Barcode', 'error');
    return false;
  }
  if ((type === 'qr' || type === 'both') && !qrValue) {
    msg(els.generatorMessage, 'ไม่มีข้อมูลสำหรับสร้าง QR Code', 'error');
    return false;
  }

  els.labelName.textContent = selectedProduct.name || '-';
  els.labelPrice.textContent = money(selectedProduct.selling_price);
  els.labelProductCode.textContent = `รหัสสินค้า ${selectedProduct.product_code || '-'}`;
  els.labelName.classList.toggle('hidden', !els.showName.checked);
  els.labelPrice.classList.toggle('hidden', !els.showPrice.checked);
  els.labelProductCode.classList.toggle('hidden', !els.showProductCode.checked);
  els.barcodeBlock.classList.toggle('hidden', type === 'qr');
  els.qrBlock.classList.toggle('hidden', type === 'barcode');
  els.printArea.className = `label-preview size-${els.labelSize.value}`;

  if (type !== 'qr') {
    JsBarcode('#barcodeSvg', barcodeValue, {
      format: 'CODE128',
      displayValue: els.showBarcodeText.checked,
      width: 2,
      height: 72,
      margin: 8,
      fontSize: 16,
      background: '#fff',
      lineColor: '#000'
    });
  }

  if (type !== 'barcode') {
    const pixels = qrPixels();
    new QRCode(els.qrCanvas, {
      text: qrValue,
      width: pixels,
      height: pixels,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  msg(els.generatorMessage, 'สร้างตัวอย่างเรียบร้อย', 'success');
  return true;
}

function dl(url, name) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadBarcode() {
  if (!generate()) return;
  const xml = new XMLSerializer().serializeToString(els.barcodeSvg);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(image.width, 600);
    canvas.height = Math.max(image.height, 220);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    dl(canvas.toDataURL('image/png'), `${selectedProduct.product_code}-barcode.png`);
  };
  image.src = url;
}

function getQrCanvas() {
  return els.qrCanvas.querySelector('canvas');
}

async function createPrintSafeQrImage() {
  const canvas = getQrCanvas();
  if (!canvas) throw new Error('ไม่พบภาพ QR Code สำหรับพิมพ์');

  let image = els.qrCanvas.querySelector('img.tkn-qr-print-image');
  if (!image) {
    image = document.createElement('img');
    image.className = 'tkn-qr-print-image';
    image.alt = 'QR Code';
    els.qrCanvas.appendChild(image);
  }

  const loaded = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('แปลง QR Code เป็นภาพสำหรับพิมพ์ไม่สำเร็จ'));
  });
  image.src = canvas.toDataURL('image/png');
  if (image.complete && image.naturalWidth > 0) return image;
  await loaded;
  return image;
}

function downloadQr() {
  if (!generate()) return;
  const canvas = getQrCanvas();
  const image = els.qrCanvas.querySelector('img:not(.tkn-qr-print-image)');
  const url = canvas?.toDataURL('image/png') || image?.src;
  if (!url) {
    msg(els.generatorMessage, 'ยังไม่มี QR Code สำหรับดาวน์โหลด', 'error');
    return;
  }
  dl(url, `${selectedProduct.product_code}-qr.png`);
}

function updateDynamicPageSize() {
  let style = document.getElementById('tknDynamicPrintPage');
  if (!style) {
    style = document.createElement('style');
    style.id = 'tknDynamicPrintPage';
    document.head.appendChild(style);
  }

  const size = els.labelSize.value;
  if (size === '58mm') {
    style.textContent = '@page { size: 58mm 95mm; margin: 0; }';
  } else if (size === 'a4') {
    style.textContent = '@page { size: A4 portrait; margin: 0; }';
  } else {
    style.textContent = '@page { size: 80mm 110mm; margin: 0; }';
  }
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function printLabel() {
  if (printInProgress) return;
  if (!generate()) return;

  printInProgress = true;
  els.printBtn.disabled = true;
  msg(els.generatorMessage, 'กำลังเตรียมภาพสำหรับเครื่องพิมพ์ Rongta...', 'success');

  try {
    const type = els.codeType.value;
    if (type !== 'barcode') await createPrintSafeQrImage();
    updateDynamicPageSize();
    document.body.classList.add('tkn-printing');
    await waitForPaint();
    window.print();
  } catch (error) {
    document.body.classList.remove('tkn-printing');
    msg(els.generatorMessage, error?.message || 'เตรียมงานพิมพ์ไม่สำเร็จ', 'error');
  } finally {
    printInProgress = false;
    els.printBtn.disabled = false;
  }
}

els.generateBtn.onclick = generate;
els.downloadBarcodeBtn.onclick = downloadBarcode;
els.downloadQrBtn.onclick = downloadQr;
els.printBtn.onclick = printLabel;
els.qrSource.onchange = () => {
  els.customQrField.classList.toggle('hidden', els.qrSource.value !== 'custom');
};

[
  els.codeType,
  els.barcodeSource,
  els.qrSource,
  els.labelSize,
  els.showName,
  els.showPrice,
  els.showProductCode,
  els.showBarcodeText
].forEach((element) => element.addEventListener('change', () => selectedProduct && generate()));

window.addEventListener('afterprint', () => {
  document.body.classList.remove('tkn-printing');
});

init();
