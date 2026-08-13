import { supabaseClient } from './supabase-client.js';
import { loadAccessContext, guardPage } from './access-control.js';

const E = {
  companyName: document.getElementById('companyName'),
  companyLegalName: document.getElementById('companyLegalName'),
  companyShortName: document.getElementById('companyShortName'),
  taxId: document.getElementById('taxId'),
  phone: document.getElementById('phone'),
  companyEmail: document.getElementById('companyEmail'),
  address: document.getElementById('address'),
  receiptFooter: document.getElementById('receiptFooter'),
  appName: document.getElementById('appName'),
  appShortName: document.getElementById('appShortName'),
  themeColor: document.getElementById('themeColor'),
  themeColorPicker: document.getElementById('themeColorPicker'),
  installMessage: document.getElementById('installMessage'),
  logoFile: document.getElementById('logoFile'),
  logoUrl: document.getElementById('logoUrl'),
  logoPreview: document.getElementById('logoPreview'),
  installLogoPreview: document.getElementById('installLogoPreview'),
  previewCompany: document.getElementById('previewCompany'),
  previewAppName: document.getElementById('previewAppName'),
  installAppPreview: document.getElementById('installAppPreview'),
  installTextPreview: document.getElementById('installTextPreview'),
  themePreview: document.getElementById('themePreview'),
  saveBtn: document.getElementById('saveBtn'),
  reloadBtn: document.getElementById('reloadBtn'),
  defaultLogoBtn: document.getElementById('defaultLogoBtn'),
  message: document.getElementById('message'),
  actorBadge: document.getElementById('actorBadge')
};

let access = null;
let busy = false;
let objectUrl = null;

function setMessage(text, type = '') {
  E.message.textContent = text || '';
  E.message.className = type ? `is-${type}` : '';
}

function setBusy(value) {
  busy = Boolean(value);
  E.saveBtn.disabled = busy;
  E.reloadBtn.disabled = busy;
  E.logoFile.disabled = busy;
}

function value(element) {
  return String(element?.value || '').trim();
}

function formData() {
  return {
    company_name: value(E.companyName),
    company_legal_name: value(E.companyLegalName),
    company_short_name: value(E.companyShortName),
    tax_id: value(E.taxId),
    phone: value(E.phone),
    email: value(E.companyEmail),
    address: value(E.address),
    receipt_footer: value(E.receiptFooter),
    app_name: value(E.appName),
    app_short_name: value(E.appShortName),
    theme_color: value(E.themeColor).toLowerCase(),
    logo_url: value(E.logoUrl),
    install_message: value(E.installMessage)
  };
}

function validate(data) {
  if (!data.company_name || !data.company_legal_name || !data.app_name || !data.app_short_name) {
    throw new Error('กรุณากรอกชื่อบริษัทและชื่อแอปให้ครบ');
  }
  if (!/^#[0-9a-f]{6}$/i.test(data.theme_color)) {
    throw new Error('Theme color ต้องเป็นรูปแบบ #RRGGBB');
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error('รูปแบบอีเมลบริษัทไม่ถูกต้อง');
  }
}

function fill(data = {}) {
  E.companyName.value = data.company_name || 'เถ้าแก่น้อย ชลบุรี';
  E.companyLegalName.value = data.company_legal_name || 'บริษัท เถ้าแก่น้อย ชลบุรี จำกัด';
  E.companyShortName.value = data.company_short_name || 'เถ้าแก่น้อย ชลบุรี';
  E.taxId.value = data.tax_id || '';
  E.phone.value = data.phone || '';
  E.companyEmail.value = data.email || '';
  E.address.value = data.address || '';
  E.receiptFooter.value = data.receipt_footer || 'ขอบคุณที่ใช้บริการ';
  E.appName.value = data.app_name || 'ระบบบริหารร้านเถ้าแก่น้อย ชลบุรี';
  E.appShortName.value = data.app_short_name || 'เถ้าแก่น้อย ชลบุรี';
  E.themeColor.value = data.theme_color || '#c8101e';
  E.themeColorPicker.value = E.themeColor.value;
  E.logoUrl.value = data.logo_url || './assets/tkn-company-logo.png';
  E.installMessage.value = data.install_message || 'ติดตั้งระบบไว้บนหน้าจอหลักเพื่อเปิดใช้งานได้รวดเร็วขึ้น';
  updatePreview();
}

function previewLogo() {
  return objectUrl || value(E.logoUrl) || './assets/tkn-company-logo.png';
}

function updatePreview() {
  const logo = previewLogo();
  E.logoPreview.src = logo;
  E.installLogoPreview.src = logo;
  E.previewCompany.textContent = value(E.companyName) || 'ชื่อบริษัท';
  E.previewAppName.textContent = value(E.appName) || 'ชื่อแอป';
  E.installAppPreview.textContent = value(E.appName) || 'ชื่อแอป';
  E.installTextPreview.textContent = value(E.installMessage) || 'ข้อความติดตั้งแอป';
  const color = /^#[0-9a-f]{6}$/i.test(value(E.themeColor)) ? value(E.themeColor) : '#c8101e';
  E.themePreview.style.background = color;
  document.documentElement.style.setProperty('--settings-accent', color);
}

async function uploadLogoIfNeeded() {
  const file = E.logoFile.files?.[0];
  if (!file) return value(E.logoUrl) || './assets/tkn-company-logo.png';

  const allowed = new Set(['image/png','image/jpeg','image/webp']);
  if (!allowed.has(file.type)) throw new Error('รองรับโลโก้ PNG, JPG หรือ WEBP เท่านั้น');
  if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์โลโก้ต้องไม่เกิน 5 MB');

  const result = await supabaseClient.storage
    .from('tkn-branding')
    .upload('company/company-logo', file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true
    });
  if (result.error) throw result.error;

  const { data } = supabaseClient.storage
    .from('tkn-branding')
    .getPublicUrl('company/company-logo');

  if (!data?.publicUrl) throw new Error('สร้าง Public URL ของโลโก้ไม่สำเร็จ');
  return `${data.publicUrl}?v=${Date.now()}`;
}

async function loadSettings() {
  if (busy) return;
  setBusy(true);
  setMessage('กำลังโหลดการตั้งค่า...');
  try {
    const { data, error } = await supabaseClient.rpc('tkn_admin_get_system_settings');
    if (error) throw error;
    fill(data || {});
    setMessage('โหลดการตั้งค่าแล้ว', 'success');
  } catch (error) {
    console.error('System settings load error:', error);
    setMessage(error.message || 'โหลดการตั้งค่าไม่สำเร็จ', 'error');
  } finally {
    setBusy(false);
  }
}

async function saveSettings() {
  if (busy) return;
  setBusy(true);
  setMessage('กำลังบันทึกการตั้งค่า...');
  try {
    const data = formData();
    validate(data);
    data.logo_url = await uploadLogoIfNeeded();

    const { data: saved, error } = await supabaseClient.rpc(
      'tkn_admin_save_system_settings',
      { p_settings: data }
    );
    if (error) throw error;

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    E.logoFile.value = '';
    fill(saved || data);
    try { window.TKNBranding?.clearCache?.(); } catch (_) {}
    try { localStorage.removeItem('tkn_public_branding_v53122'); } catch (_) {}
    setMessage('บันทึกการตั้งค่าเรียบร้อย — รีเฟรชหน้าอื่นเพื่อใช้ Branding ใหม่', 'success');
  } catch (error) {
    console.error('System settings save error:', error);
    setMessage(error.message || 'บันทึกไม่สำเร็จ', 'error');
  } finally {
    setBusy(false);
  }
}

async function init() {
  try {
    access = await loadAccessContext(supabaseClient);
    if (!guardPage(access, 'user.manage')) return;
    E.actorBadge.textContent = `${access.role_name_th || access.role} · ${access.full_name || access.email || '-'}`;
    await loadSettings();
  } catch (error) {
    console.error('System settings init error:', error);
    setMessage(error.message || 'เปิดหน้าตั้งค่าระบบไม่สำเร็จ', 'error');
  }
}

[
  E.companyName,E.companyLegalName,E.companyShortName,E.appName,E.appShortName,
  E.themeColor,E.logoUrl,E.installMessage
].forEach((element) => element?.addEventListener('input', updatePreview));

E.themeColorPicker.addEventListener('input', () => {
  E.themeColor.value = E.themeColorPicker.value.toLowerCase();
  updatePreview();
});
E.themeColor.addEventListener('input', () => {
  if (/^#[0-9a-f]{6}$/i.test(E.themeColor.value)) E.themeColorPicker.value = E.themeColor.value;
});
E.logoFile.addEventListener('change', () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  const file = E.logoFile.files?.[0];
  objectUrl = file ? URL.createObjectURL(file) : null;
  updatePreview();
});
E.defaultLogoBtn.addEventListener('click', () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  E.logoFile.value = '';
  E.logoUrl.value = './assets/tkn-company-logo.png';
  updatePreview();
});
E.saveBtn.addEventListener('click', saveSettings);
E.reloadBtn.addEventListener('click', loadSettings);

init();
