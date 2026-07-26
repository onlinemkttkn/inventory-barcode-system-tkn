const INVENTORY_BRANCH_STORAGE_KEY = 'tkn_inventory_branch_id';

function safeSearchText(value) {
  return String(value || '')
    .trim()
    .replace(/[%_,()\\]/g, '');
}

export async function loadInventoryAccess(requiredPermission) {
  const {
    data: { session },
    error: sessionError,
  } = await supabaseClient.auth.getSession();

  if (sessionError) throw sessionError;

  if (!session?.user?.id) {
    location.replace('./dashboard.html');
    return null;
  }

  const { data: access, error: accessError } =
    await supabaseClient.rpc('current_access_context');

  if (accessError) throw accessError;

  if (!access?.user_id || access.is_active !== true) {
    await supabaseClient.auth.signOut();
    location.replace('./dashboard.html');
    return null;
  }

  const permissions = Array.isArray(access.permissions)
    ? access.permissions
    : [];

  sessionStorage.setItem('tkn_user_role', access.role || 'staff');
  sessionStorage.setItem('tkn_permissions', JSON.stringify(permissions));

  if (requiredPermission && !permissions.includes(requiredPermission)) {
    const error = new Error('บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้');
    error.code = 'INVENTORY_PERMISSION_DENIED';
    error.redirectTo = access.landing_page || './dashboard.html';
    throw error;
  }

  return access;
}

export async function loadActiveBranches() {
  const { data, error } = await supabaseClient
    .from('branches')
    .select('id,code,name,sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('code');

  if (error) throw error;
  return data || [];
}

export function populateBranchSelect(selectElement, branches, accessContext) {
  if (!selectElement) return null;

  selectElement.innerHTML = branches.map((branch) => (
    `<option value="${branch.id}">${escapeHtml(branch.code)} — ${escapeHtml(branch.name)}</option>`
  )).join('');

  const validIds = new Set(branches.map((branch) => branch.id));
  const storedBranchId = sessionStorage.getItem(INVENTORY_BRANCH_STORAGE_KEY);
  const preferredBranchId = [
    accessContext?.branch_id,
    storedBranchId,
    branches.find((branch) => branch.code === 'BR001')?.id,
    branches[0]?.id,
  ].find((branchId) => branchId && validIds.has(branchId));

  if (preferredBranchId) {
    selectElement.value = preferredBranchId;
    sessionStorage.setItem(INVENTORY_BRANCH_STORAGE_KEY, preferredBranchId);
  }

  return preferredBranchId || null;
}

export function rememberInventoryBranch(branchId) {
  if (branchId) {
    sessionStorage.setItem(INVENTORY_BRANCH_STORAGE_KEY, branchId);
  }
}

export function selectedBranchLabel(selectElement) {
  return selectElement?.selectedOptions?.[0]?.textContent?.trim() || 'สาขาที่เลือก';
}

export async function findBranchProducts(
  branchId,
  searchText,
  { inStockOnly = false } = {}
) {
  const q = safeSearchText(searchText);
  if (!branchId) throw new Error('กรุณาเลือกสาขา');
  if (!q) return [];

  let query = supabaseClient
    .from('branch_inventory_list')
    .select(`
      branch_id,
      branch_code,
      branch_name,
      product_id,
      product_code,
      barcode,
      product_name,
      category_name,
      unit_name,
      quantity,
      minimum_stock,
      stock_status
    `)
    .eq('branch_id', branchId)
    .or(
      `product_name.ilike.%${q}%,`
      + `product_code.ilike.%${q}%,`
      + `barcode.eq.${q}`
    )
    .order('product_name')
    .limit(20);

  if (inStockOnly) query = query.gt('quantity', 0);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.product_id,
    product_code: row.product_code,
    barcode: row.barcode,
    name: row.product_name,
    category_name: row.category_name,
    unit_name: row.unit_name,
    quantity: Number(row.quantity || 0),
    minimum_stock: Number(row.minimum_stock || 0),
    stock_status: row.stock_status,
    branch_id: row.branch_id,
    branch_code: row.branch_code,
    branch_name: row.branch_name,
  }));
}

export function createIdempotencyKey(prefix = 'inventory') {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${suffix}`;
}
