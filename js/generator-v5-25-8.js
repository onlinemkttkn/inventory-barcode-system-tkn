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
const REQUIRED_PERMISSION = document.body?.dataset.requiredPermission || 'inventory.view';
let selectedProduct = null;
let authSubscription = null;

function msg(node, text, type = '') {
  if (!node) return;
  node.textContent = text;
  node.className = `message ${type}`.trim();
}

function configured() {
  return typeof window.SUPABASE_URL === 'string'
    && typeof window.SUPABASE_PUBLISHABLE_KEY === 'string'
    && !window.SUPABASE_URL.includes('ใส่_')
    && !window.SUPABASE_PUBLISHABLE_KEY.includes('ใส่_');
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

function renderAuth(signedIn) {
  els.loginSection?.classList.toggle('hidden', signedIn);
  els.generatorSection?.classList.toggle('hidden', !signedIn);
  els.logoutBtn?.classList.toggle('hidden', !signedIn);
  if (signedIn) requestAnimationFrame(() => els.searchInput?.focus({ preventScroll: true }));
}

function lockUnifiedPattern() {
  if (els.barcodeSource) els.barcodeSource.value = 'product_code';
  if (els.qrSource) els.qrSource.value = 'product_code';
  els.customQrField?.classList.add('hidden');
}

async function requirePageAccess() {
  if (window.TKNAuthGuard?.requireAccess) {
    return window.TKNAuthGuard.requireAccess(REQUIRED_PERMISSION, {
      loadingText: 'กำลังตรวจสอบสิทธิ์สร้าง Barcode และ QR Code...'
    });
  }

  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error) throw error;
  const session = data?.session;
  if (!session?.user?.id) {
    renderAuth(false);
    return null;
  }
  return { user_id: session.user.id, permissions: [] };
}

async function init() {
  try {
    if (!configured() || !window.supabaseClient) {
      if (els.configWarning) {
        els.configWarning.textContent = 'ยังไม่ได้ตั้งค่า Supabase ใน js/supabase-config.js';
        els.configWarning.classList.remove('hidden');
      }
      renderAuth(false);
      window.TKNAuthGuard?.ready?.();
      return;
    }

    const access = await requirePageAccess();
    if (!access) {
      window.TKNAuthGuard?.ready?.();
      return;
    }

    renderAuth(true);
    lockUnifiedPattern();

    // จุดแก้หลัก v5.25.8: ปลดหน้ากำลังตรวจสอบสิทธิ์ทันทีหลังยืนยันสิทธิ์สำเร็จ
    window.TKNAuthGuard?.ready?.();

    const { data: listener } = window.supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      renderAuth(Boolean(nextSession));
    });
    authSubscription = listener?.subscription || null;

    await loadLinkedProductFromQuery();
  } catch (error) {
    console.error('[TKN Generator v5.25.8] init failed:', error);
    if (error?.code === 'INVENTORY_PERMISSION_DENIED' || error?.redirectTo) return;

    if (window.TKNAuthGuard?.fail) {
      window.TKNAuthGuard.fail(error, init);
      return;
    }

    document.body?.classList.remove('tkn-auth-loading', 'tkn-page-leaving');
    document.body?.classList.add('tkn-auth-ready');
    if (els.configWarning) {
      els.configWarning.textContent = `เปิดหน้าสร้าง Barcode ไม่สำเร็จ: ${error?.message || error}`;
      els.configWarning.classList.remove('hidden');
    }
  }
}

els.loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  msg(els.loginMessage, 'กำลังเข้าสู่ระบบ...');
  const { error } = await window.supabaseClient.auth.signInWithPassword({
    email: els.email.value.trim(),
    password: els.password.value
  });
  if (error) return msg(els.loginMessage, error.message, 'error');
  els.password.value = '';
  msg(els.loginMessage, 'เข้าสู่ระบบแล้ว', 'success');
});

els.logoutBtn?.addEventListener('click', () => window.supabaseClient.auth.signOut());

async function searchProducts(query) {
  const safe = String(query || '')
    .replace(/^TKN-P-/i, '')
    .replace(/[,%()]/g, '')
    .trim();

  if (!safe) return { data: [], error: null };

  const fields = 'id,product_code,barcode,source_barcode,base_sku,lot_cost_letter,lot_code,name,label_name,product_type_th,model_name,brand_name,cost_price,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active';
  let result = await window.supabaseClient
    .from('product_management_list_v5250')
    .select(fields)
    .or(`name.ilike.%${safe}%,product_code.ilike.%${safe}%,barcode.eq.${safe},source_barcode.eq.${safe},base_sku.ilike.%${safe}%`)
    .eq('is_active', true)
    .order('name')
    .limit(30);

  if (result.error) {
    result = await window.supabaseClient
      .from('product_management_list')
      .select('id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active,cost_price')
      .or(`name.ilike.%${safe}%,product_code.ilike.%${safe}%,barcode.eq.${safe}`)
      .eq('is_active', true)
      .order('name')
      .limit(30);
  }
  return result;
}

async function fetchLinkedProduct(productId, code) {
  const fields = 'id,product_code,barcode,source_barcode,base_sku,lot_cost_letter,lot_code,name,label_name,product_type_th,model_name,brand_name,cost_price,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active';
  let result = null;

  if (productId) {
    result = await window.supabaseClient
      .from('product_management_list_v5250')
      .select(fields)
      .eq('id', productId)
      .maybeSingle();
  }

  if ((!result || result.error || !result.data) && code) {
    const safeCode = String(code).replace(/^TKN-P-/i, '').replace(/[,%()]/g, '').trim();
    result = await window.supabaseClient
      .from('product_management_list_v5250')
      .select(fields)
      .or(`product_code.eq.${safeCode},barcode.eq.${safeCode},source_barcode.eq.${safeCode},base_sku.eq.${safeCode}`)
      .limit(1)
      .maybeSingle();
  }

  if (!result || result.error) {
    let fallback = window.supabaseClient
      .from('product_management_list')
      .select('id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active,cost_price');

    if (productId) fallback = fallback.eq('id', productId);
    else if (code) fallback = fallback.or(`product_code.eq.${code},barcode.eq.${code}`);
    else return { data: null, error: null };

    result = await fallback.maybeSingle();
  }

  return result;
}

async function loadLinkedProductFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('product')?.trim() || '';
  const linkedName = params.get('name')?.trim() || 'สินค้า';
  const linkedCode = params.get('code')?.trim() || '';
  if (!productId && !linkedCode) return false;

  if (els.selectedProductText) {
    els.selectedProductText.textContent = `${linkedName} • SKU ${linkedCode || '-'} • กำลังโหลดข้อมูล`;
  }
  msg(els.searchMessage, 'กำลังโหลดสินค้าที่เลือก...');

  const { data, error } = await fetchLinkedProduct(productId, linkedCode);
  if (error || !data) {
    if (els.selectedProductText) els.selectedProductText.textContent = `${linkedName} • SKU ${linkedCode || '-'}`;
    msg(
      els.searchMessage,
      error ? `โหลดสินค้าที่เลือกไม่สำเร็จ: ${error.message}` : 'ไม่พบสินค้าที่เลือก กรุณาค้นหาอีกครั้ง',
      'error'
    );
    if (els.searchInput) els.searchInput.value = linkedCode || linkedName;
    return false;
  }

  selectProduct(data);
  if (els.searchInput) els.searchInput.value = data.name || data.product_code || linkedCode;
  msg(els.searchMessage, 'โหลดสินค้าที่เลือกเรียบร้อย', 'success');
  return true;
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

function ensureRenderer(type) {
  if (type !== 'qr' && typeof window.JsBarcode !== 'function') {
    msg(els.generatorMessage, 'โหลดตัวสร้าง Barcode ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า', 'error');
    return false;
  }
  if (type !== 'barcode' && typeof window.QRCode !== 'function') {
    msg(els.generatorMessage, 'โหลดตัวสร้าง QR Code ไม่สำเร็จ กรุณารีเฟรชหน้า', 'error');
    return false;
  }
  return true;
}

function generate() {
  if (!selectedProduct) {
    msg(els.generatorMessage, 'กรุณาเลือกสินค้าก่อน', 'error');
    return false;
  }

  const type = els.codeType.value;
  if (!ensureRenderer(type)) return false;

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
  els.printArea.className = `label-preview size-${els.labelSize.value} layout-${els.layoutMode?.value || 'portrait'} code-type-${type}`;

  if (type !== 'qr') {
    window.JsBarcode('#barcodeSvg', bv, {
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
    new window.QRCode(els.qrCanvas, {
      text: qv,
      width: 210,
      height: 210,
      correctLevel: window.QRCode.CorrectLevel.M
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
  if (!selectedProduct) return msg(els.generatorMessage, 'กรุณาเลือกสินค้าก่อน', 'error');
  const previousType = els.codeType.value;
  els.codeType.value = 'barcode';
  const ok = generate();
  els.codeType.value = previousType;
  if (!ok) return;

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
    els.codeType.value = previousType;
    generate();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    msg(els.generatorMessage, 'สร้างไฟล์ Barcode PNG ไม่สำเร็จ', 'error');
  };
  image.src = url;
}

function downloadQr() {
  if (!selectedProduct) return msg(els.generatorMessage, 'กรุณาเลือกสินค้าก่อน', 'error');
  const previousType = els.codeType.value;
  els.codeType.value = 'qr';
  const ok = generate();
  els.codeType.value = previousType;
  if (!ok) return;

  const canvas = els.qrCanvas.querySelector('canvas');
  const image = els.qrCanvas.querySelector('img');
  const url = canvas?.toDataURL('image/png') || image?.src;
  if (!url) return msg(els.generatorMessage, 'ยังไม่มี QR Code สำหรับดาวน์โหลด', 'error');
  downloadDataUrl(url, `${canonicalSku(selectedProduct)}-qr.png`);
  els.codeType.value = previousType;
  generate();
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

window.addEventListener('pagehide', () => authSubscription?.unsubscribe?.(), { once: true });

init();
