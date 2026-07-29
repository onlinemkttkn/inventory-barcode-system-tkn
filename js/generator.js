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
let qrInstance = null;

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
  qrInstance = null;
}

function qrPixels() {
  switch (els.labelSize.value) {
    case '58mm': return 280;
    case '80mm': return 360;
    case 'a4': return 420;
    default: return 320;
  }
}

function buildQrSvg(qrCode) {
  const model = qrCode?._oQRCode;
  if (!model || typeof model.getModuleCount !== 'function') {
    throw new Error('ไม่สามารถสร้าง QR Code แบบ SVG สำหรับเครื่องพิมพ์ได้');
  }

  const moduleCount = model.getModuleCount();
  const quietZone = 4;
  const viewSize = moduleCount + (quietZone * 2);
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.classList.add('tkn-qr-print-svg');
  svg.setAttribute('viewBox', `0 0 ${viewSize} ${viewSize}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR Code');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const background = document.createElementNS(namespace, 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(viewSize));
  background.setAttribute('height', String(viewSize));
  background.setAttribute('fill', '#ffffff');
  svg.appendChild(background);

  let pathData = '';
  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (model.isDark(row, column)) {
        const x = column + quietZone;
        const y = row + quietZone;
        pathData += `M${x} ${y}h1v1h-1z`;
      }
    }
  }

  const modules = document.createElementNS(namespace, 'path');
  modules.setAttribute('d', pathData);
  modules.setAttribute('fill', '#000000');
  svg.appendChild(modules);
  return svg;
}

function ensurePrintableQrSvg() {
  const svg = els.qrCanvas.querySelector('svg.tkn-qr-print-svg');
  if (!svg) throw new Error('ไม่พบ QR Code แบบ SVG สำหรับพิมพ์');
  return svg;
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
  els.printArea.className = `label-preview size-${els.labelSize.value} code-type-${type}`;

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
    qrInstance = new QRCode(els.qrCanvas, {
      text: qrValue,
      width: pixels,
      height: pixels,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
    els.qrCanvas.appendChild(buildQrSvg(qrInstance));
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

function updateDynamicPageSize(pageWidthMm, pageHeightMm) {
  let style = document.getElementById('tknDynamicPrintPage');
  if (!style) {
    style = document.createElement('style');
    style.id = 'tknDynamicPrintPage';
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }`;
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function canvasFont(size, weight = 700) {
  return `${weight} ${size}px Prompt, Tahoma, Arial, sans-serif`;
}

function fitTextSize(context, text, maxWidth, preferred, minimum) {
  let size = preferred;
  while (size > minimum) {
    context.font = canvasFont(size, 900);
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return minimum;
}

function wrapText(context, text, maxWidth) {
  const chars = Array.from(String(text || '-'));
  const lines = [];
  let line = '';

  chars.forEach((char) => {
    const candidate = line + char;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function svgToImage(svgElement) {
  return new Promise((resolve, reject) => {
    if (!svgElement) {
      reject(new Error('ไม่พบ Barcode สำหรับจัดทำไฟล์พิมพ์'));
      return;
    }

    const clone = svgElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('แปลง Barcode เป็นภาพสำหรับพิมพ์ไม่สำเร็จ'));
    };
    image.src = url;
  });
}

function drawQrModel(context, model, x, y, requestedSize) {
  if (!model || typeof model.getModuleCount !== 'function') {
    throw new Error('ไม่พบข้อมูล QR Code สำหรับจัดทำไฟล์พิมพ์');
  }

  const moduleCount = model.getModuleCount();
  const quietZone = 4;
  const totalModules = moduleCount + (quietZone * 2);
  const modulePixels = Math.max(1, Math.floor(requestedSize / totalModules));
  const actualSize = totalModules * modulePixels;
  const offsetX = Math.round(x + ((requestedSize - actualSize) / 2));
  const offsetY = Math.round(y + ((requestedSize - actualSize) / 2));

  context.imageSmoothingEnabled = false;
  context.fillStyle = '#ffffff';
  context.fillRect(offsetX, offsetY, actualSize, actualSize);
  context.fillStyle = '#000000';

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!model.isDark(row, column)) continue;
      context.fillRect(
        offsetX + ((column + quietZone) * modulePixels),
        offsetY + ((row + quietZone) * modulePixels),
        modulePixels,
        modulePixels
      );
    }
  }

  return actualSize;
}

function thermalCanvasConfig() {
  const size = els.labelSize.value;
  if (size === '58mm') {
    return {
      canvasWidth: 384,
      printableWidthMm: 48,
      pageWidthMm: 58,
      padding: 12,
      nameSize: 24,
      priceSize: 31,
      codeSize: 16,
      barcodeHeight: 100,
      qrSize: 220,
      bothQrSize: 0,
      gap: 10
    };
  }
  if (size === 'a4') {
    return {
      canvasWidth: 1500,
      printableWidthMm: 190,
      pageWidthMm: 210,
      padding: 70,
      nameSize: 62,
      priceSize: 78,
      codeSize: 40,
      barcodeHeight: 300,
      qrSize: 720,
      bothQrSize: 0,
      gap: 36
    };
  }
  return {
    // Rongta 80 mm at 203 dpi has a 576-dot / 72 mm printable head.
    canvasWidth: 576,
    printableWidthMm: 72,
    pageWidthMm: 80,
    padding: 10,
    nameSize: 32,
    priceSize: 44,
    codeSize: 18,
    barcodeHeight: 122,
    qrSize: 360,
    bothQrSize: 208,
    gap: 10
  };
}

async function buildThermalPrintCanvas() {
  const type = els.codeType.value;
  const size = els.labelSize.value;
  const cfg = thermalCanvasConfig();
  const contentWidth = cfg.canvasWidth - (cfg.padding * 2);
  const name = selectedProduct?.name || '-';
  const productCode = `รหัสสินค้า ${selectedProduct?.product_code || '-'}`;
  const includeName = els.showName.checked;
  const includePrice = els.showPrice.checked;
  const includeProductCode = els.showProductCode.checked;
  const includeBarcode = type === 'barcode' || type === 'both';
  const includeQr = type === 'qr' || type === 'both';
  const compactBoth = type === 'both' && (size === '80mm' || size === 'screen');
  const bothRowHeight = compactBoth ? Math.max(cfg.barcodeHeight, cfg.bothQrSize) : 0;

  const measure = document.createElement('canvas').getContext('2d');
  const nameFontSize = fitTextSize(measure, name, contentWidth, cfg.nameSize, Math.max(16, cfg.nameSize - 12));
  measure.font = canvasFont(nameFontSize, 900);
  const nameLines = includeName ? wrapText(measure, name, contentWidth) : [];
  const nameLineHeight = Math.round(nameFontSize * 1.15);

  let canvasHeight = cfg.padding;
  if (includeName) canvasHeight += (nameLines.length * nameLineHeight) + cfg.gap;
  if (includePrice) canvasHeight += Math.round(cfg.priceSize * 1.15) + cfg.gap;
  if (compactBoth) {
    canvasHeight += bothRowHeight + cfg.gap;
  } else {
    if (includeBarcode) canvasHeight += cfg.barcodeHeight + cfg.gap;
    if (includeQr) canvasHeight += cfg.qrSize + cfg.gap;
  }
  if (includeProductCode) canvasHeight += Math.round(cfg.codeSize * 1.25) + cfg.gap;
  canvasHeight += cfg.padding;

  const canvas = document.createElement('canvas');
  canvas.width = cfg.canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('เบราว์เซอร์ไม่สามารถสร้างภาพสำหรับพิมพ์ได้');

  context.imageSmoothingEnabled = false;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  context.textAlign = 'center';
  context.textBaseline = 'top';

  let y = cfg.padding;

  if (includeName) {
    context.font = canvasFont(nameFontSize, 900);
    nameLines.forEach((line) => {
      context.fillText(line, canvas.width / 2, y);
      y += nameLineHeight;
    });
    y += cfg.gap;
  }

  if (includePrice) {
    context.font = canvasFont(cfg.priceSize, 900);
    context.fillText(money(selectedProduct?.selling_price), canvas.width / 2, y);
    y += Math.round(cfg.priceSize * 1.15) + cfg.gap;
  }

  if (compactBoth) {
    const qrSize = cfg.bothQrSize;
    const barcodeRegionWidth = contentWidth - qrSize - cfg.gap;
    if (barcodeRegionWidth < 180) {
      throw new Error('พื้นที่ป้ายไม่พอสำหรับ Barcode และ QR Code');
    }

    const barcodeImage = await svgToImage(els.barcodeSvg);
    const sourceWidth = Math.max(1, barcodeImage.naturalWidth || barcodeImage.width || 1);
    const sourceHeight = Math.max(1, barcodeImage.naturalHeight || barcodeImage.height || 1);
    const scale = Math.min(barcodeRegionWidth / sourceWidth, cfg.barcodeHeight / sourceHeight);
    const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
    const barcodeCenterX = cfg.padding + (barcodeRegionWidth / 2);
    const drawX = Math.round(barcodeCenterX - (drawWidth / 2));
    const drawY = y + Math.round((bothRowHeight - drawHeight) / 2);
    context.drawImage(barcodeImage, drawX, drawY, drawWidth, drawHeight);

    const model = qrInstance?._oQRCode;
    const qrX = cfg.padding + barcodeRegionWidth + cfg.gap;
    const qrY = y + Math.round((bothRowHeight - qrSize) / 2);
    drawQrModel(context, model, qrX, qrY, qrSize);
    y += bothRowHeight + cfg.gap;
  } else {
    if (includeBarcode) {
      const barcodeImage = await svgToImage(els.barcodeSvg);
      const sourceWidth = Math.max(1, barcodeImage.naturalWidth || barcodeImage.width || 1);
      const sourceHeight = Math.max(1, barcodeImage.naturalHeight || barcodeImage.height || 1);
      const scale = Math.min(contentWidth / sourceWidth, cfg.barcodeHeight / sourceHeight);
      const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
      const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
      const drawX = Math.round((canvas.width - drawWidth) / 2);
      const drawY = y + Math.round((cfg.barcodeHeight - drawHeight) / 2);
      context.drawImage(barcodeImage, drawX, drawY, drawWidth, drawHeight);
      y += cfg.barcodeHeight + cfg.gap;
    }

    if (includeQr) {
      const model = qrInstance?._oQRCode;
      const qrX = Math.round((canvas.width - cfg.qrSize) / 2);
      drawQrModel(context, model, qrX, y, cfg.qrSize);
      y += cfg.qrSize + cfg.gap;
    }
  }

  if (includeProductCode) {
    context.font = canvasFont(cfg.codeSize, 800);
    context.fillText(productCode, canvas.width / 2, y);
  }

  return { canvas, cfg };
}

function printRasterLabel(canvas, cfg) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'TKN thermal print frame');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const heightMm = Math.max(
      30,
      Math.ceil((canvas.height / canvas.width) * cfg.printableWidthMm) + 1
    );
    updateDynamicPageSize(cfg.pageWidthMm, heightMm);

    const dataUrl = canvas.toDataURL('image/png');
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      reject(new Error('ไม่สามารถเปิดหน้าพิมพ์ภายในได้'));
      return;
    }

    doc.open();
    doc.write(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>TKN QR / Barcode</title>
<style>
  @page { size: ${cfg.pageWidthMm}mm ${heightMm}mm; margin: 0; }
  html,body { margin:0; padding:0; width:${cfg.pageWidthMm}mm; min-height:${heightMm}mm; background:#fff; overflow:hidden; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { display:flex; align-items:flex-start; justify-content:center; }
  img { display:block; width:${cfg.printableWidthMm}mm; height:auto; margin:0 auto; image-rendering:auto; }
</style>
</head>
<body><img id="tknLabelImage" alt="QR Barcode label"></body>
</html>`);
    doc.close();

    const image = doc.getElementById('tknLabelImage');
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      setTimeout(() => frame.remove(), 500);
      resolve();
    };

    frame.contentWindow?.addEventListener('afterprint', cleanup, { once: true });
    image.onload = async () => {
      try {
        await new Promise((next) => setTimeout(next, 250));
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(cleanup, 60000);
      } catch (error) {
        frame.remove();
        reject(error);
      }
    };
    image.onerror = () => {
      frame.remove();
      reject(new Error('โหลดไฟล์ภาพสำหรับพิมพ์ไม่สำเร็จ'));
    };
    image.src = dataUrl;
  });
}

async function printLabel() {
  if (printInProgress) return;
  if (!generate()) return;

  printInProgress = true;
  els.printBtn.disabled = true;
  msg(els.generatorMessage, 'กำลังจัดป้ายให้พอดีกับกระดาษ Rongta 80 มม....', 'success');

  try {
    if (els.codeType.value !== 'barcode') ensurePrintableQrSvg();
    await waitForPaint();
    const { canvas, cfg } = await buildThermalPrintCanvas();
    await printRasterLabel(canvas, cfg);
    msg(els.generatorMessage, 'ส่งงานพิมพ์ขนาดพอดีกระดาษเรียบร้อย', 'success');
  } catch (error) {
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
