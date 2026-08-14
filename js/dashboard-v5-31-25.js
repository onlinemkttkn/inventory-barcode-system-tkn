const E = {
  loginCard: document.getElementById('loginCard'),
  appArea: document.getElementById('appArea'),
  loginForm: document.getElementById('loginForm'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  loginMessage: document.getElementById('loginMessage'),
  logoutBtn: document.getElementById('logoutBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  configWarning: document.getElementById('configWarning'),
  welcomeText: document.getElementById('welcomeText'),
  branchFilter: document.getElementById('branchFilter'),
  rangePreset: document.getElementById('dashboardRangePreset'),
  startDate: document.getElementById('dashboardStartDate'),
  endDate: document.getElementById('dashboardEndDate'),
  applyRange: document.getElementById('applyDashboardRange'),
  resetRange: document.getElementById('resetDashboardRange'),
  rangeText: document.getElementById('dashboardRangeText'),
  rangeMessage: document.getElementById('dashboardRangeMessage'),
  salesRangeLabel: document.getElementById('salesRangeLabel'),
  billsRangeLabel: document.getElementById('billsRangeLabel'),
  returnsRangeLabel: document.getElementById('returnsRangeLabel'),
  topProductsRange: document.getElementById('topProductsRange'),
  dailySalesRange: document.getElementById('dailySalesRange'),
  totalProducts: document.getElementById('totalProducts'),
  totalCategories: document.getElementById('totalCategories'),
  outStock: document.getElementById('outStock'),
  lowStock: document.getElementById('lowStock'),
  salesToday: document.getElementById('salesToday'),
  billsToday: document.getElementById('billsToday'),
  salesMonth: document.getElementById('salesMonth'),
  pendingTransfers: document.getElementById('pendingTransfers'),
  stockCostValue: document.getElementById('stockCostValue'),
  stockSaleValue: document.getElementById('stockSaleValue'),
  recentProducts: document.getElementById('recentProducts'),
  recentSales: document.getElementById('recentSales'),
  topProducts: document.getElementById('topProducts'),
  dashboardMessage: document.getElementById('dashboardMessage'),
  salesChart: document.getElementById('salesChart'),
  receivingSessionCount: document.getElementById('receivingSessionCount'),
  receivingActualQty: document.getElementById('receivingActualQty'),
  receivingGoodQty: document.getElementById('receivingGoodQty'),
  problemQty: document.getElementById('problemQty'),
  closedBoxCount: document.getElementById('closedBoxCountDashboard'),
  boxedQuantity: document.getElementById('boxedQuantityDashboard'),
  pendingPrint: document.getElementById('pendingPrintDashboard'),
  shopeePendingPrice: document.getElementById('shopeePendingPrice'),
  lazadaPendingPrice: document.getElementById('lazadaPendingPrice'),
};

const RANGE_KEY = 'tkn_dashboard_range_latest_v5_13_1';
const EMPLOYEE_LOGIN_DOMAIN = 'staff.tkn.local';
let chart = null;
let currentProfile = null;
let isRenderingSession = false;
let isLoadingDashboard = false;
let branchesLoaded = false;
let lastDashboardData = null;

function msg(element, text, type = '') {
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);
}

function num(value) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 3 });
}

function money(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function paymentLabel(value) {
  return ({ CASH: 'เงินสด', TRANSFER: 'เงินโอน', QR: 'QR', CARD: 'บัตร', VOUCHER: 'คูปอง', OTHER: 'อื่น ๆ' })[String(value || '').toUpperCase()] || String(value || '-');
}

function dashboardBranchLabel(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return ({ BR001: 'สำนักงานใหญ่ / คลังหลัก', BR002: 'สาขา 2', ONLINE: 'คลังสินค้าออนไลน์' })[normalized] || String(code || '-');
}

function setLiveNumber(element, value, type = 'number', options = {}) {
  if (window.TKNLiveNumber?.set) {
    window.TKNLiveNumber.set(element, value, { type, ...options });
    return;
  }
  if (!element) return;
  element.textContent = type === 'money' ? money(value) : num(value);
}

function localDateValue(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthStart(date) { return new Date(date.getFullYear(), date.getMonth(), 1, 12); }
function monthEnd(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12); }
function yearStart(date) { return new Date(date.getFullYear(), 0, 1, 12); }

function presetRange(preset) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  switch (preset) {
    case 'TODAY': return [today, today];
    case 'YESTERDAY': { const d = addDays(today, -1); return [d, d]; }
    case 'LAST_7': return [addDays(today, -6), today];
    case 'LAST_30': return [addDays(today, -29), today];
    case 'LAST_MONTH': {
      const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
      return [monthStart(previous), monthEnd(previous)];
    }
    case 'THIS_YEAR': return [yearStart(today), today];
    case 'THIS_MONTH':
    default: return [monthStart(today), today];
  }
}

function selectedRange() {
  return { startDate: E.startDate?.value, endDate: E.endDate?.value };
}

function rangeLabel(startValue, endValue) {
  const formatter = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const start = parseLocalDate(startValue);
  const end = parseLocalDate(endValue);
  return startValue === endValue ? formatter.format(start) : `${formatter.format(start)} – ${formatter.format(end)}`;
}

function setRangeInputs(preset, persist = true) {
  if (!E.rangePreset || !E.startDate || !E.endDate) return;
  if (preset !== 'CUSTOM') {
    const [start, end] = presetRange(preset);
    E.startDate.value = localDateValue(start);
    E.endDate.value = localDateValue(end);
  }
  const custom = preset === 'CUSTOM';
  E.startDate.disabled = !custom;
  E.endDate.disabled = !custom;
  updateRangeLabels();
  if (persist) saveRange();
}

function saveRange() {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify({ preset: E.rangePreset.value, ...selectedRange() }));
  } catch (_) { /* storage is optional */ }
}

function restoreRange() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null'); } catch (_) { saved = null; }
  const preset = saved?.preset || 'THIS_MONTH';
  E.rangePreset.value = preset;
  if (preset === 'CUSTOM' && saved?.startDate && saved?.endDate) {
    E.startDate.value = saved.startDate;
    E.endDate.value = saved.endDate;
    setRangeInputs('CUSTOM', false);
  } else {
    setRangeInputs(preset, false);
  }
}

function validateRange() {
  const { startDate, endDate } = selectedRange();
  if (!startDate || !endDate) throw new Error('กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด');
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (end < start) throw new Error('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น');
  const days = Math.round((end - start) / 86400000) + 1;
  if (days > 367) throw new Error('เลือกช่วงข้อมูลได้สูงสุด 367 วัน');
  return { startDate, endDate, days };
}

function updateRangeLabels() {
  if (!E.startDate?.value || !E.endDate?.value) return;
  const text = rangeLabel(E.startDate.value, E.endDate.value);
  if (E.rangeText) E.rangeText.textContent = text;
  if (E.salesRangeLabel) E.salesRangeLabel.textContent = 'ยอดขายตามช่วง';
  if (E.billsRangeLabel) E.billsRangeLabel.textContent = 'บิลตามช่วง';
  if (E.returnsRangeLabel) E.returnsRangeLabel.textContent = 'ยอดคืนตามช่วง';
  if (E.topProductsRange) E.topProductsRange.textContent = `เรียงตามจำนวนขาย · ${text}`;
  if (E.dailySalesRange) E.dailySalesRange.textContent = `สรุปยอดขายรายวัน · ${text}`;
}

function configReady() {
  return typeof SUPABASE_URL === 'string' && typeof SUPABASE_PUBLISHABLE_KEY === 'string'
    && SUPABASE_URL.startsWith('https://') && SUPABASE_PUBLISHABLE_KEY.length > 20
    && !SUPABASE_URL.includes('ใส่_') && !SUPABASE_PUBLISHABLE_KEY.includes('ใส่_');
}

function showLogin() {
  document.body.classList.add('tkn-login-view');
  E.loginCard?.classList.remove('hidden');
  E.appArea?.classList.add('hidden');
  E.logoutBtn?.classList.add('hidden');
  E.branchFilter?.classList.add('hidden');
  E.refreshBtn?.classList.add('hidden');
  window.TKNAuthGuard?.ready();
}

function showApp() {
  document.body.classList.remove('tkn-login-view');
  E.loginCard?.classList.add('hidden');
  E.appArea?.classList.remove('hidden');
  E.logoutBtn?.classList.remove('hidden');
  E.branchFilter?.classList.remove('hidden');
  E.refreshBtn?.classList.remove('hidden');
  window.TKNAuthGuard?.ready();
}

async function init() {
  restoreRange();
  window.TKNAuthGuard?.start('กำลังตรวจสอบผู้ใช้งาน...');
  if (!configReady()) {
    E.configWarning.textContent = 'กรุณาตรวจสอบ Supabase URL และ Publishable Key';
    E.configWarning.classList.remove('hidden');
    showLogin();
    return;
  }
  try {
    const session = window.TKNAuthGuard
      ? await window.TKNAuthGuard.getSession({ retries: 1 })
      : (await supabaseClient.auth.getSession()).data.session;
    await renderSession(session);
    supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        currentProfile = null; branchesLoaded = false;
        window.TKNAuthGuard?.clearAccessCache();
        showLogin();
        E.welcomeText.textContent = 'กรุณาเข้าสู่ระบบภายในองค์กร';
      } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && nextSession && !currentProfile) {
        setTimeout(() => renderSession(nextSession), 0);
      }
    });
  } catch (error) {
    console.error('Initialization error:', error);
    window.TKNAuthGuard?.fail(error, init);
  }
}



async function routeSessionToLandingIfNeeded(session) {
  if (!session?.user?.id) return null;
  try {
    const { data, error } = await supabaseClient.rpc('current_access_context');
    if (error || !data?.user_id || String(data.user_id) !== String(session.user.id)) return null;
    if (data.is_active === false) {
      await supabaseClient.auth.signOut().catch(() => null);
      showLogin();
      msg(E.loginMessage, 'บัญชีนี้ถูกปิดใช้งาน', 'error');
      return { redirected: true };
    }
    const permissions = new Set(Array.isArray(data.permissions) ? data.permissions.map(String) : []);
    if (!permissions.has('dashboard.view')) {
      const landing = String(data.landing_page || './pos.html').trim() || './pos.html';
      if (!/dashboard\.html(?:$|[?#])/i.test(landing)) {
        window.location.replace(landing);
        return { redirected: true };
      }
    }
    return { redirected: false, access: data };
  } catch (error) {
    console.warn('Landing page routing fallback:', error);
    return null;
  }
}

async function decorateDashboardEmployeeAccess(access) {
  if (!access?.user_id) return access;
  const identity = String(access.full_name || access.email || '').toLowerCase();
  if (!identity.endsWith(`@${EMPLOYEE_LOGIN_DOMAIN}`)) return access;
  try {
    const { data, error } = await supabaseClient
      .from('cashier_profiles')
      .select('display_name,employee_code,branch_id')
      .eq('user_id', access.user_id)
      .maybeSingle();
    if (!error && data) {
      return {
        ...access,
        full_name: data.display_name || data.employee_code || access.full_name,
        employee_code: data.employee_code || '',
        branch_id: access.branch_id || data.branch_id || null
      };
    }
  } catch (error) {
    console.warn('Dashboard employee identity fallback failed:', error);
  }
  return access;
}

async function renderSession(session) {
  if (isRenderingSession) return;
  isRenderingSession = true;
  try {
    if (!session?.user?.id) {
      showLogin();
      E.welcomeText.textContent = 'กรุณาเข้าสู่ระบบภายในองค์กร';
      return;
    }
    const landingCheck = await routeSessionToLandingIfNeeded(session);
    if (landingCheck?.redirected) return;
    let access = window.TKNAuthGuard
      ? await window.TKNAuthGuard.requireAccess('dashboard.view', { session, loadingText: 'กำลังโหลด Dashboard...' })
      : { user_id: session.user.id, email: session.user.email, permissions: ['dashboard.view'] };
    if (!access) return;
    access = await decorateDashboardEmployeeAccess(access);
    const permissions = new Set(access.permissions || []);
    document.querySelectorAll('[data-permission]').forEach((element) => {
      element.hidden = !permissions.has(element.getAttribute('data-permission'));
    });
    currentProfile = { id: access.user_id, email: access.email, role: access.role, full_name: access.full_name, is_active: access.is_active };
    showApp();
    E.welcomeText.textContent = `${access.full_name || access.email} • ${{ owner: 'เจ้าของกิจการ', admin: 'ผู้ดูแลระบบ', secretary: 'เลขานุการ' }[access.role] || access.role || 'ผู้ใช้งาน'}`;
    if (!branchesLoaded) { await loadBranches(); branchesLoaded = true; }
    await loadDashboard();
  } catch (error) {
    console.error('Render session error:', error);
    if (error.code !== 'INVENTORY_PERMISSION_DENIED') window.TKNAuthGuard?.fail(error, () => renderSession(session));
  } finally { isRenderingSession = false; }
}

function resolveLoginEmail(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) throw new Error('กรุณากรอกอีเมลหรือรหัสพนักงาน');
  if (raw.includes('@')) return raw.toLowerCase();
  const code = raw.toUpperCase();
  if (!/^[A-Z0-9._-]{2,32}$/.test(code)) {
    throw new Error('รหัสพนักงานใช้ A-Z, 0-9, จุด, ขีดกลาง หรือ _ ความยาว 2–32 ตัว');
  }
  return `${code.toLowerCase()}@${EMPLOYEE_LOGIN_DOMAIN}`;
}

E.loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const identifier = E.email.value.trim();
  const password = E.password.value;
  const submitButton = E.loginForm.querySelector('button[type="submit"]');
  if (!identifier || !password) return msg(E.loginMessage, 'กรุณากรอกอีเมล/รหัสพนักงาน และรหัสผ่าน', 'error');
  try {
    if (submitButton) submitButton.disabled = true;
    msg(E.loginMessage, 'กำลังเข้าสู่ระบบ...');
    const email = resolveLoginEmail(identifier);
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      const hint = !identifier.includes('@') ? ' หากเป็นบัญชีเดิมที่สร้างด้วยอีเมล ให้ใช้อีเมลเดิมในการเข้าสู่ระบบ' : '';
      return msg(E.loginMessage, `${error.message}${hint}`, 'error');
    }
    E.password.value = '';
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const landingCheck = await routeSessionToLandingIfNeeded(sessionData?.session);
    if (!landingCheck?.redirected) window.location.replace('./dashboard.html?view=latest&v=5.31.22');
  } catch (error) {
    msg(E.loginMessage, `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`, 'error');
  } finally { if (submitButton) submitButton.disabled = false; }
});

E.logoutBtn?.addEventListener('click', async () => {
  E.logoutBtn.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) return msg(E.dashboardMessage, error.message, 'error');
    currentProfile = null; branchesLoaded = false;
    window.TKNAuthGuard?.clearAccessCache();
    showLogin();
  } finally { E.logoutBtn.disabled = false; }
});

E.refreshBtn?.addEventListener('click', loadDashboard);
E.branchFilter?.addEventListener('change', loadDashboard);
E.rangePreset?.addEventListener('change', () => {
  setRangeInputs(E.rangePreset.value);
  if (E.rangePreset.value !== 'CUSTOM') loadDashboard();
});
E.startDate?.addEventListener('change', () => { E.rangePreset.value = 'CUSTOM'; updateRangeLabels(); saveRange(); });
E.endDate?.addEventListener('change', () => { E.rangePreset.value = 'CUSTOM'; updateRangeLabels(); saveRange(); });
E.applyRange?.addEventListener('click', loadDashboard);
E.resetRange?.addEventListener('click', () => {
  E.rangePreset.value = 'THIS_MONTH';
  setRangeInputs('THIS_MONTH');
  loadDashboard();
});

async function loadBranches() {
  const selected = E.branchFilter.value;
  const { data, error } = await supabaseClient.from('branches').select('id,code,name').eq('is_active', true).order('sort_order');
  if (error) return msg(E.dashboardMessage, error.message, 'error');
  E.branchFilter.innerHTML = '<option value="">ทุกสาขา</option>' + (data || []).map((branch) => `<option value="${branch.id}">${esc(dashboardBranchLabel(branch.code))}</option>`).join('');
  if (selected) E.branchFilter.value = selected;
}

async function loadLegacyDashboard(branchId) {
  let inventoryQuery = supabaseClient.from('dashboard_recent_inventory').select('*').order('updated_at', { ascending: false }).limit(12);
  let salesQuery = supabaseClient.from('dashboard_recent_sales').select('*').order('created_at', { ascending: false }).limit(10);
  if (branchId) { inventoryQuery = inventoryQuery.eq('branch_id', branchId); salesQuery = salesQuery.eq('branch_id', branchId); }
  const [summary, inventory, sales, topProducts, dailySales] = await Promise.all([
    supabaseClient.from('dashboard_v2_summary').select('*').single(), inventoryQuery, salesQuery,
    supabaseClient.from('dashboard_top_products_month').select('*').order('total_quantity', { ascending: false }).limit(10),
    supabaseClient.from('dashboard_sales_daily').select('*').order('sale_date', { ascending: true }),
  ]);
  const error = [summary.error, inventory.error, sales.error, topProducts.error, dailySales.error].find(Boolean);
  if (error) throw error;
  return {
    period: { start_date: E.startDate.value, end_date: E.endDate.value },
    summary: { ...summary.data, sales_range: summary.data.sales_month, bills_range: summary.data.bills_today, returns_range: 0 },
    recent_inventory: inventory.data || [], recent_sales: sales.data || [], top_products: topProducts.data || [],
    daily_sales: dailySales.data || [], monthly_sales: [], category_sales: [], operations: {},
    report: { summary: { bill_count: summary.data.bills_today, gross_revenue: summary.data.sales_today }, bills: sales.data || [], items: [], returns: {}, voids: {} },
    legacy: true,
  };
}

async function loadDashboard() {
  if (isLoadingDashboard || E.appArea?.classList.contains('hidden')) return;
  let range;
  try { range = validateRange(); } catch (error) { return msg(E.rangeMessage, error.message, 'error'); }
  saveRange(); updateRangeLabels();
  isLoadingDashboard = true;
  E.refreshBtn.disabled = true;
  E.applyRange.disabled = true;
  msg(E.rangeMessage, 'กำลังโหลดข้อมูลตามช่วงวันที่...');
  msg(E.dashboardMessage, 'กำลังโหลดข้อมูล...');
  try {
    const branchId = E.branchFilter.value || null;
    let { data, error } = await supabaseClient.rpc('get_dashboard_range_v5_13', {
      p_start_date: range.startDate, p_end_date: range.endDate, p_branch_id: branchId, p_limit: 10,
    });
    if (error) {
      console.warn('Dashboard v5.13 RPC unavailable, using legacy views:', error);
      data = await loadLegacyDashboard(branchId);
      msg(E.rangeMessage, 'กำลังใช้โหมดเดิม กรุณารัน SQL Dashboard v5.13 เพื่อเปิดช่วงวันที่เต็มรูปแบบ', 'warning');
    } else {
      msg(E.rangeMessage, `โหลดข้อมูล ${range.days.toLocaleString('th-TH')} วันแล้ว`, 'success');
    }
    lastDashboardData = data || {};
    renderSummary(lastDashboardData.summary || {});
    renderInventory(lastDashboardData.recent_inventory || []);
    renderSales(lastDashboardData.recent_sales || []);
    renderTopProducts(lastDashboardData.top_products || []);
    renderChart(lastDashboardData.daily_sales || []);
    await renderOperations(lastDashboardData.operations || {});
    msg(E.dashboardMessage, `อัปเดตข้อมูลแล้ว · ${rangeLabel(range.startDate, range.endDate)}`, 'success');
    window.dispatchEvent(new CustomEvent('tkn-dashboard-loaded', { detail: {
      branchId, range, data: lastDashboardData, loadedAt: new Date().toISOString(),
    } }));
  } catch (error) {
    console.error('Load dashboard error:', error);
    msg(E.dashboardMessage, `โหลด Dashboard ไม่สำเร็จ: ${error.message}`, 'error');
    msg(E.rangeMessage, error.message, 'error');
  } finally {
    isLoadingDashboard = false;
    E.refreshBtn.disabled = false;
    E.applyRange.disabled = false;
  }
}

function renderSummary(summary) {
  setLiveNumber(E.totalProducts, summary.total_products, 'number');
  setLiveNumber(E.totalCategories, summary.total_categories, 'number');
  setLiveNumber(E.outStock, summary.out_of_stock_count, 'number');
  setLiveNumber(E.lowStock, summary.low_stock_count, 'number');
  setLiveNumber(E.salesToday, summary.sales_range ?? summary.sales_today, 'money');
  setLiveNumber(E.billsToday, summary.bills_range ?? summary.bills_today, 'number');
  setLiveNumber(E.salesMonth, summary.returns_range, 'money');
  setLiveNumber(E.pendingTransfers, summary.pending_transfers, 'number');
  setLiveNumber(E.stockCostValue, summary.stock_cost_value, 'money');
  setLiveNumber(E.stockSaleValue, summary.stock_sale_value, 'money');
}

function renderInventory(rows) {
  E.recentProducts.innerHTML = '';
  if (!rows.length) { E.recentProducts.innerHTML = '<tr><td colspan="6">ยังไม่มีข้อมูลสต๊อก</td></tr>'; return; }
  rows.forEach((item) => {
    const statusMap = { IN_STOCK: ['มีสินค้า', 'ok'], LOW_STOCK: ['ใกล้หมด', 'low'], OUT_OF_STOCK: ['หมด', 'out'] };
    const [label, cssClass] = statusMap[item.stock_status] || ['-', ''];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(dashboardBranchLabel(item.branch_code))}</td><td>${esc(item.product_code)}</td><td>${esc(item.product_name)}</td><td>${esc(item.barcode || '-')}</td><td>${num(item.quantity)}</td><td><span class="badge ${cssClass}">${label}</span></td>`;
    E.recentProducts.appendChild(tr);
  });
}

function renderSales(rows) {
  E.recentSales.innerHTML = '';
  if (!rows.length) { E.recentSales.innerHTML = '<tr><td colspan="5">ไม่พบข้อมูลการขายในช่วงนี้</td></tr>'; return; }
  rows.forEach((sale) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(sale.created_at).toLocaleString('th-TH')}</td><td>${esc(sale.sale_no)}</td><td>${esc(dashboardBranchLabel(sale.branch_code))}</td><td>${money(sale.net_total)}</td><td><span class="payment-badge payment-${esc(String(sale.payment_method || 'OTHER').toLowerCase())}">${esc(paymentLabel(sale.payment_method))}</span></td>`;
    E.recentSales.appendChild(tr);
  });
}

function renderTopProducts(rows) {
  E.topProducts.innerHTML = '';
  if (!rows.length) { E.topProducts.innerHTML = '<tr><td colspan="5">ไม่พบยอดขายสินค้าในช่วงนี้</td></tr>'; return; }
  rows.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${index + 1}</td><td>${esc(item.product_code)}</td><td>${esc(item.product_name)}</td><td>${num(item.total_quantity)}</td><td>${money(item.total_sales)}</td>`;
    E.topProducts.appendChild(tr);
  });
}

function renderChart(rows) {
  if (typeof Chart !== 'function' || !E.salesChart) return;
  const { startDate, endDate } = selectedRange();
  const byDate = new Map((rows || []).map((row) => [String(row.sale_date).slice(0, 10), Number(row.total_sales || 0)]));
  const labels = [], values = [];
  let cursor = parseLocalDate(startDate); const end = parseLocalDate(endDate);
  while (cursor <= end) {
    const key = localDateValue(cursor);
    labels.push(cursor.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: startDate.slice(0,4) !== endDate.slice(0,4) ? '2-digit' : undefined }));
    values.push(byDate.get(key) || 0);
    cursor = addDays(cursor, 1);
  }
  if (chart) { chart.data.labels = labels; chart.data.datasets[0].data = values; chart.update(); return; }
  chart = new Chart(E.salesChart, {
    type: 'line', data: { labels, datasets: [{ label: 'ยอดขาย', data: values, tension: .25, fill: false, pointRadius: labels.length > 60 ? 0 : 3, pointHoverRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 450 }, resizeDelay: 250, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 16 } }, y: { beginAtZero: true, ticks: { callback(value) { return Number(value).toLocaleString('th-TH'); } } } } },
  });
}

function boxLocalMetrics() {
  try {
    const state = JSON.parse(localStorage.getItem('tkn_box_qr_v512') || 'null');
    if (!state) return {};
    const receipts = Array.isArray(state.receipts) ? state.receipts : [];
    const items = Array.isArray(state.boxItems) ? state.boxItems : [];
    const queue = Array.isArray(state.queue) ? state.queue : [];
    return {
      receiving_sessions: state.session ? 1 : 0,
      receiving_actual_qty: receipts.reduce((sum, item) => sum + Number(item.actual || 0), 0),
      receiving_good_qty: receipts.reduce((sum, item) => sum + Number(item.good || 0), 0),
      problem_qty: receipts.filter((item) => String(item.condition || '').toUpperCase() !== 'GOOD').reduce((sum, item) => sum + Number(item.actual || 0), 0),
      closed_boxes: String(state.box?.status || '').toUpperCase() === 'CLOSED' ? 1 : 0,
      boxed_quantity: items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      pending_print_labels: queue.reduce((sum, item) => sum + Number(item.qty || 1), 0),
    };
  } catch (_) { return {}; }
}

async function indexedDbPending(dbName) {
  if (!window.indexedDB) return 0;
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      if (!dbs.some((db) => db.name === dbName)) return 0;
    }
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!db.objectStoreNames.contains('records')) { db.close(); return 0; }
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const request = tx.objectStore('records').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const status = new Map();
    rows.forEach((row) => {
      const sku = String(row.sku_id || '').trim();
      if (!sku) return;
      const cost = String(row.cost_price ?? '').trim();
      const selling = String(row.selling_price ?? '').trim();
      const synced = Boolean(row.last_synced_at)
        && Number(row.synced_cost_price) === Number(cost)
        && Number(row.synced_selling_price) === Number(selling);
      if (!status.has(sku) || !synced) status.set(sku, synced);
    });
    return [...status.values()].filter((synced) => !synced).length;
  } catch (error) {
    console.warn(`Cannot read ${dbName}:`, error);
    return 0;
  }
}

async function renderOperations(serverOperations) {
  const local = boxLocalMetrics();
  const combined = {};
  ['receiving_sessions','receiving_actual_qty','receiving_good_qty','problem_qty','closed_boxes','boxed_quantity','pending_print_labels'].forEach((key) => {
    combined[key] = Math.max(Number(serverOperations?.[key] || 0), Number(local?.[key] || 0));
  });
  const [shopeePending, lazadaPending] = await Promise.all([
    indexedDbPending('tkn_marketplace_import_v1'), indexedDbPending('tkn_marketplace_import_lazada_v1'),
  ]);
  setLiveNumber(E.receivingSessionCount, combined.receiving_sessions, 'number');
  setLiveNumber(E.receivingActualQty, combined.receiving_actual_qty, 'decimal');
  setLiveNumber(E.receivingGoodQty, combined.receiving_good_qty, 'decimal');
  setLiveNumber(E.problemQty, combined.problem_qty, 'decimal');
  setLiveNumber(E.closedBoxCount, combined.closed_boxes, 'number');
  setLiveNumber(E.boxedQuantity, combined.boxed_quantity, 'decimal');
  setLiveNumber(E.pendingPrint, combined.pending_print_labels, 'number');
  setLiveNumber(E.shopeePendingPrice, shopeePending, 'number');
  setLiveNumber(E.lazadaPendingPrice, lazadaPending, 'number');
}

window.TKNDashboardRange = Object.freeze({
  reload: loadDashboard,
  getRange: selectedRange,
  getData: () => lastDashboardData,
});

init();
