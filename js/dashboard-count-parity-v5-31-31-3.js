(function initDashboardCountParity(global) {
  'use strict';

  const number = (value) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 3 });
  const money = (value) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(Number(value || 0));
  const set = (id, value, type = 'number') => {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = type === 'money' ? money(value) : number(value);
  };
  const stockState = (product) => {
    const quantity = Number(product.total_branch_quantity || product.quantity || 0);
    const minimum = Number(product.minimum_stock || 0);
    if (quantity <= 0) return 'out';
    if (minimum > 0 && quantity <= minimum) return 'low';
    return 'ready';
  };

  let requestId = 0;
  async function refresh() {
    if (!global.supabaseClient) return;
    if (document.getElementById('appArea')?.classList.contains('hidden')) return;
    const currentRequest = ++requestId;
    const categoryId = document.getElementById('dashboardProductTypeFilter')?.value || '';
    let query = global.supabaseClient.from('product_management_list_v5250').select('*').order('updated_at', { ascending: false }).limit(1000);
    if (categoryId) query = query.eq('category_id', categoryId);
    let result = await query;
    if (result.error) {
      let fallback = global.supabaseClient.from('product_management_list').select('*').order('updated_at', { ascending: false }).limit(1000);
      if (categoryId) fallback = fallback.eq('category_id', categoryId);
      result = await fallback;
    }
    if (result.error || currentRequest !== requestId) {
      if (result.error) console.warn('[TKN Dashboard count parity]', result.error);
      return;
    }
    const products = result.data || [];
    set('totalProducts', products.length);
    set('outStock', products.filter((product) => stockState(product) === 'out').length);
    set('lowStock', products.filter((product) => stockState(product) === 'low').length);
    set('stockCostValue', products.reduce((sum, product) => sum + Number(product.total_branch_quantity || product.quantity || 0) * Number(product.cost_price || 0), 0), 'money');
    set('stockSaleValue', products.reduce((sum, product) => sum + Number(product.total_branch_quantity || product.quantity || 0) * Number(product.selling_price || 0), 0), 'money');
    if (categoryId) set('totalCategories', products.length ? 1 : 0);
    document.documentElement.dataset.dashboardCountParity = '5.31.31.3';
  }

  global.addEventListener('tkn-dashboard-loaded', () => void refresh());
  document.getElementById('dashboardProductTypeFilter')?.addEventListener('change', () => void refresh());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(refresh, 0), { once: true });
  else setTimeout(refresh, 0);
})(window);
