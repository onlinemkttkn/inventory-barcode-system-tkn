function msg(element, text, cssClass = '') {
  element.textContent = text;
  element.className = `msg ${cssClass}`.trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;'
  })[char]);
}

async function auth() {
  if (!window.TKNAuthGuard) throw new Error('ไม่พบระบบตรวจสอบ Session รุ่นใหม่');
  return window.TKNAuthGuard.getSession({ retries: 1 });
}

async function inventoryAccess(requiredPermission) {
  if (!window.TKNAuthGuard) throw new Error('ไม่พบระบบตรวจสอบ Session รุ่นใหม่');
  const data = await window.TKNAuthGuard.requireAccess(requiredPermission, {
    loadingText: 'กำลังตรวจสอบสิทธิ์การโอนสินค้า...'
  });
  if (!data) return null;
  return { ...data, permissions: new Set(data.permissions || []) };
}

async function branches() {
  const { data, error } = await supabaseClient
    .from('branches')
    .select('id,code,name,branch_type,sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('code');

  if (error) throw error;
  return data || [];
}

function makeIdempotencyKey(prefix = 'inventory') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
