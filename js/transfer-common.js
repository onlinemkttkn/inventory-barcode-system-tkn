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
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session?.user?.id) {
    location.replace('./dashboard.html');
    return null;
  }
  return session;
}

async function inventoryAccess(requiredPermission) {
  const session = await auth();
  if (!session) return null;

  const { data, error } = await supabaseClient.rpc('current_access_context');
  if (error || !data?.user_id || data.is_active !== true) {
    await supabaseClient.auth.signOut();
    location.replace('./dashboard.html');
    return null;
  }

  const permissions = new Set(data.permissions || []);
  sessionStorage.setItem('tkn_user_role', data.role || 'staff');
  sessionStorage.setItem('tkn_permissions', JSON.stringify([...permissions]));

  if (requiredPermission && !permissions.has(requiredPermission)) {
    location.replace(data.landing_page || './pos.html');
    return null;
  }

  return { ...data, permissions };
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
