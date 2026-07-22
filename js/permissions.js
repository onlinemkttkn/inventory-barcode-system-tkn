export const DASHBOARD_ROLES = new Set([
  'owner', 'admin', 'secretary'
]);

export const VOID_ROLES = new Set([
  'owner', 'admin', 'manager', 'supervisor'
]);

export const STOCK_ADJUST_ROLES = new Set([
  'owner', 'admin', 'warehouse'
]);

export const PRODUCT_ADMIN_ROLES = new Set([
  'owner', 'admin'
]);

export function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  const aliases = {
    administrator: 'admin',
    employee: 'staff',
    employee_staff: 'staff',
    store_manager: 'manager'
  };
  return aliases[role] || role || 'staff';
}

export function roleHome(role) {
  const normalized = normalizeRole(role);
  if (DASHBOARD_ROLES.has(normalized)) return './dashboard.html';
  if (normalized === 'warehouse') return './product-stock-admin.html';
  if (normalized === 'accounting') return './phase-9-2-bill-search.html';
  return './pos.html';
}

export async function getActiveProfile(supabaseClient) {
  const { data: { session }, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session?.user?.id) return { session: null, profile: null };

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('id,email,full_name,role,is_active')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;

  if (!profile || profile.is_active !== true) {
    await supabaseClient.auth.signOut();
    return { session: null, profile: null };
  }

  profile.role = normalizeRole(profile.role);
  sessionStorage.setItem('tkn_user_role', profile.role);
  return { session, profile };
}
