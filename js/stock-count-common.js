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
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session?.user?.id) {
    location.replace('./dashboard.html');
    return null;
  }
  return session;
}

async function scAccess(requiredPermission = 'inventory.count') {
  const session = await scAuth();
  if (!session) return null;

  const { data, error } = await supabaseClient.rpc('current_access_context');
  if (error || !data?.user_id || data.is_active !== true) {
    await supabaseClient.auth.signOut();
    location.replace('./dashboard.html');
    return null;
  }

  const permissions = new Set(data.permissions || []);
  if (!permissions.has(requiredPermission)) {
    location.replace(data.landing_page || './pos.html');
    return null;
  }

  sessionStorage.setItem('tkn_user_role', data.role || 'staff');
  sessionStorage.setItem('tkn_permissions', JSON.stringify([...permissions]));
  return { ...data, permissions };
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
