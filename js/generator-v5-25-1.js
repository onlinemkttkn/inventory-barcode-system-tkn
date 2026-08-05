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
  layoutMode: $('layoutMode'),
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

const PATTERN = window.TKNProductPattern;
let selectedProduct = null;
let qrInstance = null;

function msg(node, text, type = '') {
  if (!node) return;
  node.textContent = text;
  node.className = `message ${type}`.trim();
}

function configured() {
  return !SUPABASE_URL.includes('ใส่_') && !SUPABASE_PUBLISHABLE_KEY.includes('ใส่_');
}

function canonicalSku(product) {
  return PATTERN?.resolveLotSku?.(product)
    || PATTERN?.barcodeValue?.(product?.product_code)
    || String(product?.product_code || '').trim();
}

function barcodeValue(product) {
  return canonicalSku(product);
}

function qrValue(product) {
  return PATTERN?.qrValue?.(product)
    || (canonicalSku(product) ? `TKN-P-${canonicalSku(product)}` : '');
}

function conciseName(product) {
  return PATTERN?.conciseLabel?.(product, { maxChars: 52, maxLines: 2 })
    || product?.label_name
    || product?.name
    || '-';
}

function money(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

async function init() {
  if (!configured()) {
    els.configWarning.textContent = 'ยังไม่ได้ตั้งค่า Supabase ใน js/supabase-config.js';
    els.configWarning.classList.remove('hidden');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  renderAuth(Boolean(session));
  supabaseClient.auth.onAuthStateChange((_event, nextSession) => renderAuth(Boolean(nextSession)));

  // ล็อกมาตรฐานเดียวทั้งระบบ แม้ localStorage/HTML เก่าจะเคยเลือกค่าอื่นไว้
  if (els.barcodeSource) els.barcodeSource.value = 'product_code';
  if (els.qrSource) els.qrSource.value = 'product_code';
  els.customQrField?.classList.add('hidden');
}

function renderAuth(signedIn) {
  els.loginSection.classList.toggle('hidden', signedIn);
  els.generatorSection.classList.toggle('hidden', !signedIn);
  els.logoutBtn?.classList.toggle('hidden', !signedIn);
  if (signedIn) els.searchInput?.focus();
}

els.loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  msg(els.loginMessage, 'กำลังเข้าสู่ระบบ...');
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: els.email.value.trim(),
    password: els.password.value
  });
  if (error) return msg(els.loginMessage, error.message, 'error');
  els.password.value = '';
  msg(els.loginMessage, '');
});

els.logoutBtn?.addEventListener('click', () => supabaseClient.auth.signOut());

async function searchProducts(query) {
  const safe = String(query || '').replace(/^TKN-P-/i, '').replace(/[,%()]/g, '').trim();
  const fields = 'id,product_code,barcode,source_barcode,base_sku,lot_cost_letter,lot_code,name,label_name,product_type_th,model_name,brand_name,cost_price,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active';
  let result = await supabaseClient
    .from('product_management_list_v5250')
    .select(fields)
    .or(`name.ilike.%${safe}%,product_code.ilike.%${safe}%,barcode.eq.${safe},source_barcode.eq.${safe},base_sku.ilike.%${safe}%`)
    .eq('is_active', true)
    .order('name')
    .limit(30);

  if (result.error) {
    result = await supabaseClient
      .from('product_management_list')
      .select('id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active,cost_price')
      .or(`name.ilike.%${safe}%,product_code.ilike.%${safe}%,barcode.eq.${safe}`)
      .eq('is_active', true)
      .order('name')
      .limit(30);
  }
  return result;
}

els.productSearchForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = els.searchInput.value.trim();
  if (!query) return msg(els.searchMessage, 'กรุณากรอกคำค้นหา', 'error');

  msg(els.searchMessage, 'กำลังค้นหา...');
  els.searchResults.innerHTML = '';
  const { data, error } = await searchProducts(query);
  if (error) return msg(els.searchMessage, `ค้นหาไม่สำเร็จ: ${error.message}`, 'error');
  if (!data?.length) return msg(els.searchMessage, 'ไม่พบสินค้า', 'error');

  msg(els.searchMessage, `พบ ${data.length} รายการ`, 'success');
  data.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'result-item';
    const info = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = conciseName(product);
    const small = document.createElement('small');
    small.textContent = `${canonicalSku(product) || '-'} • ต้นทุนแฝงใน SKU • คงเหลือ ${Number(product.total_branch_quantity || 0).toLocaleString('th-TH')}`;
    info.append(strong, small);

    const button = document.createElement('button');
    button.className = 'button primary';
    button.type = 'button';
    button.textContent = 'เลือก';
    button.addEventListener('click', () => selectProduct(product));
    row.append(info, button);
    els.searchResults.appendChild(row);
  });
});

function selectProduct(product) {
  selectedProduct = product;
  const sku = canonicalSku(product);
  els.selectedProductText.textContent = `${conciseName(product)} • SKU ${sku || '-'} • QR ${qrValue(product) || '-'}`;
  generate();
}

function generate() {
  if (!selectedProduct) {
    msg(els.generatorMessage, 'กรุณาเลือกสินค้าก่อน', 'error');
    return false;
  }

  const type = els.codeType.value;
  const bv = barcodeValue(selectedProduct);
  const qv = qrValue(selectedProduct);
  if ((type === 'barcode' || type === 'both') && !bv) {
    msg(els.generatorMessage, 'สินค้านี้ไม่มี SKU มาตรฐานสำหรับสร้าง Barcode', 'error');
    return false;
  }
  if ((type === 'qr' || type === 'both') && !qv) {
    msg(els.generatorMessage, 'สินค้านี้ไม่มี SKU มาตรฐานสำหรับสร้าง QR Code', 'error');
    return false;
  }

  els.labelName.textContent = conciseName(selectedProduct);
  els.labelPrice.textContent = money(selectedProduct.selling_price);
  els.labelProductCode.textContent = bv;
  els.labelName.classList.toggle('hidden', !els.showName.checked);
  els.labelPrice.classList.toggle('hidden', !els.showPrice.checked);
  els.labelProductCode.classList.toggle('hidden', !els.showProductCode.checked);
  els.barcodeBlock.classList.toggle('hidden', type === 'qr');
  els.qrBlock.classList.toggle('hidden', type === 'barcode');
  els.printArea.className = `label-preview size-${els.labelSize.value} layout-${els.layoutMode?.value || 'portrait'}`;

  if (type !== 'qr') {
    JsBarcode('#barcodeSvg', bv, {
      format: 'CODE128',
      displayValue: els.showBarcodeText.checked,
      width: bv.length > 24 ? 1.15 : 1.6,
      height: 72,
      margin: 8,
      fontSize: 16,
      background: '#fff',
      lineColor: '#000'
    });
  }

  if (type !== 'barcode') {
    els.qrCanvas.innerHTML = '';
    qrInstance = new QRCode(els.qrCanvas, {
      text: qv,
      width: 210,
      height: 210,
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  msg(els.generatorMessage, `สร้างรหัสมาตรฐานเดียวแล้ว: Barcode ${bv} • QR ${qv}`, 'success');
  return true;
}

function downloadDataUrl(url, name) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
    downloadDataUrl(canvas.toDataURL('image/png'), `${canonicalSku(selectedProduct)}-barcode.png`);
  };
  image.src = url;
}

function downloadQr() {
  if (!generate()) return;
  const canvas = els.qrCanvas.querySelector('canvas');
  const image = els.qrCanvas.querySelector('img');
  const url = canvas?.toDataURL('image/png') || image?.src;
  if (!url) return msg(els.generatorMessage, 'ยังไม่มี QR Code สำหรับดาวน์โหลด', 'error');
  downloadDataUrl(url, `${canonicalSku(selectedProduct)}-qr.png`);
}

els.generateBtn?.addEventListener('click', generate);
els.downloadBarcodeBtn?.addEventListener('click', downloadBarcode);
els.downloadQrBtn?.addEventListener('click', downloadQr);
els.printBtn?.addEventListener('click', () => {
  if (generate()) window.print();
});

[
  els.codeType,
  els.labelSize,
  els.layoutMode,
  els.showName,
  els.showPrice,
  els.showProductCode,
  els.showBarcodeText
].filter(Boolean).forEach((node) => node.addEventListener('change', () => selectedProduct && generate()));

init();
