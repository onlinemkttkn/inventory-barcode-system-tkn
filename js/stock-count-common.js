function scMsg(element, text, cssClass = '') {
  element.textContent = text;
  element.className = `msg ${cssClass}`.trim();
}

function scEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);
}

function scNum(value) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 3 });
}

async function scAuth() {
  if (!window.TKNAuthGuard) throw new Error('ไม่พบระบบตรวจสอบ Session รุ่นใหม่');
  return window.TKNAuthGuard.getSession({ retries: 1 });
}

async function scAccess(requiredPermission = 'inventory.count') {
  if (!window.TKNAuthGuard) throw new Error('ไม่พบระบบตรวจสอบ Session รุ่นใหม่');
  const data = await window.TKNAuthGuard.requireAccess(requiredPermission, {
    loadingText: 'กำลังตรวจสอบสิทธิ์ตรวจนับสต็อก...'
  });
  if (!data) return null;
  return { ...data, permissions: new Set(data.permissions || []) };
}

async function scBranches() {
  const { data, error } = await supabaseClient
    .from('branches')
    .select('id,code,name,sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('code');
  if (error) throw error;
  return data || [];
}
