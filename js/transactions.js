import {
  loadActiveBranches,
  loadInventoryAccess,
} from './inventory-branch-common.js?v=5.0.0';

const PAGE_SIZE = 200;

const MOVEMENT_LABELS = {
  RECEIVE_IN: 'รับสินค้าเข้า',
  ISSUE_OUT: 'เบิก/จ่ายสินค้า',
  SALE_OUT: 'ขายสินค้า',
  RETURN_IN: 'คืนสินค้า',
  SALE_RETURN_IN: 'คืนสินค้า',
  SALE_VOID_IN: 'ยกเลิกการขาย',
  TRANSFER_OUT: 'โอนออก',
  TRANSFER_IN: 'รับโอนเข้า',
  ADJUST_IN: 'ปรับเพิ่ม',
  ADJUST_OUT: 'ปรับลด',
  DIRECT_ADJUST: 'ปรับยอดโดยตรง',
  STOCK_COUNT: 'ตรวจนับสต็อก',
  COUNT_ADJUST_IN: 'ตรวจนับปรับเพิ่ม',
  COUNT_ADJUST_OUT: 'ตรวจนับปรับลด',
  RESET_TO_ZERO: 'รีเซ็ตเป็นศูนย์',
  DATABASE_CHANGE: 'เปลี่ยนแปลงจากฐานข้อมูล',
};

const SOURCE_LABELS = {
  STOCK_RECEIVE: 'รับสินค้า',
  STOCK_ISSUE: 'เบิกสินค้า',
  SALE: 'การขาย',
  SALE_RETURN: 'คืนสินค้า',
  VOID_SALE: 'ยกเลิกการขาย',
  TRANSFER: 'โอนสินค้า',
  STOCK_ADJUST: 'ปรับสต็อก',
  STOCK_COUNT: 'ตรวจนับ',
  DATABASE_CHANGE: 'ฐานข้อมูล',
};

const el = {
  branchFilter: document.getElementById('branchFilter'),
  typeFilter: document.getElementById('typeFilter'),
  dateFrom: document.getElementById('dateFrom'),
  dateTo: document.getElementById('dateTo'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  clearBtn: document.getElementById('clearBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  loadMoreBtn: document.getElementById('loadMoreBtn'),
  tableBody: document.getElementById('tableBody'),
  emptyState: document.getElementById('emptyState'),
  message: document.getElementById('message'),
  summaryRows: document.getElementById('summaryRows'),
  summaryIn: document.getElementById('summaryIn'),
  summaryOut: document.getElementById('summaryOut'),
  summaryNet: document.getElementById('summaryNet'),
};

let rows = [];
let currentPage = 0;
let hasMore = false;
let loading = false;

function sanitizeSearch(value) {
  return String(value || '')
    .trim()
    .replace(/[%_,()\\]/g, ' ')
    .replace(/\s+/g, ' ');
}

function toStartIso(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toExclusiveEndIso(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function movementLabel(value) {
  return MOVEMENT_LABELS[value] || value || '-';
}

function movementClass(row) {
  const type = String(row.movement_type || '');
  if (type.includes('TRANSFER')) return 'movement-transfer';
  if (type.includes('ADJUST') || type.includes('COUNT')) return 'movement-adjust';
  if (type.includes('DATABASE') || type.includes('RESET')) return 'movement-system';
  return Number(row.quantity_change) >= 0 ? 'movement-in' : 'movement-out';
}

function sourceLabel(value) {
  return SOURCE_LABELS[value] || value || '-';
}

function signedNumber(value) {
  const amount = Number(value || 0);
  const formatted = formatNumber(Math.abs(amount));
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return formatted;
}

function updateSummary() {
  const incoming = rows.reduce((sum, row) => {
    const value = Number(row.quantity_change || 0);
    return value > 0 ? sum + value : sum;
  }, 0);
  const outgoing = rows.reduce((sum, row) => {
    const value = Number(row.quantity_change || 0);
    return value < 0 ? sum + Math.abs(value) : sum;
  }, 0);

  el.summaryRows.textContent = formatNumber(rows.length);
  el.summaryIn.textContent = formatNumber(incoming);
  el.summaryOut.textContent = formatNumber(outgoing);
  el.summaryNet.textContent = signedNumber(incoming - outgoing);
}

function renderRows() {
  el.tableBody.innerHTML = '';

  for (const row of rows) {
    const change = Number(row.quantity_change || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(row.created_at).toLocaleString('th-TH')}</td>
      <td><span class="branch-pill">${escapeHtml(row.branch_code || '-')}</span><small>${escapeHtml(row.branch_name || '')}</small></td>
      <td class="source-cell"><strong>${escapeHtml(row.source_no || '-')}</strong><small>${escapeHtml(sourceLabel(row.source_type))}</small></td>
      <td><span class="movement-badge ${movementClass(row)}">${escapeHtml(movementLabel(row.movement_type))}</span></td>
      <td class="product-cell"><strong>${escapeHtml(row.product_name || '-')}</strong><small>${escapeHtml(row.product_code || '-')}${row.barcode ? ` • ${escapeHtml(row.barcode)}` : ''}</small></td>
      <td class="number-cell">${formatNumber(row.quantity_before)}</td>
      <td class="number-cell ${change >= 0 ? 'change-positive' : 'change-negative'}">${signedNumber(change)}</td>
      <td class="number-cell">${formatNumber(row.quantity_after)}</td>
      <td class="note-cell"><strong>${escapeHtml(row.reference_no || '-')}</strong><small>${escapeHtml(row.notes || '')}</small></td>
      <td>${escapeHtml(row.actor_name || '-')}</td>`;
    el.tableBody.appendChild(tr);
  }

  el.emptyState.classList.toggle('hidden', rows.length > 0);
  el.loadMoreBtn.classList.toggle('hidden', !hasMore);
  updateSummary();
}

function buildQuery(page) {
  const start = page * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  let query = supabaseClient
    .from('inventory_movement_history_v3_6')
    .select(`
      id,
      created_at,
      branch_id,
      branch_code,
      branch_name,
      product_id,
      product_code,
      barcode,
      product_name,
      movement_type,
      quantity_before,
      quantity_change,
      quantity_after,
      source_type,
      source_id,
      source_no,
      reference_no,
      notes,
      actor_name
    `)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (el.branchFilter.value) {
    query = query.eq('branch_id', el.branchFilter.value);
  }

  if (el.typeFilter.value) {
    query = query.eq('movement_type', el.typeFilter.value);
  }

  const dateFromIso = toStartIso(el.dateFrom.value);
  const dateToIso = toExclusiveEndIso(el.dateTo.value);
  if (dateFromIso) query = query.gte('created_at', dateFromIso);
  if (dateToIso) query = query.lt('created_at', dateToIso);

  const search = sanitizeSearch(el.searchInput.value);
  if (search) {
    query = query.or([
      `source_no.ilike.%${search}%`,
      `reference_no.ilike.%${search}%`,
      `product_code.ilike.%${search}%`,
      `barcode.ilike.%${search}%`,
      `product_name.ilike.%${search}%`,
      `branch_code.ilike.%${search}%`,
      `branch_name.ilike.%${search}%`,
      `actor_name.ilike.%${search}%`,
    ].join(','));
  }

  return query;
}

async function loadHistory({ append = false } = {}) {
  if (loading) return;
  loading = true;
  el.refreshBtn.disabled = true;
  el.searchBtn.disabled = true;
  el.loadMoreBtn.disabled = true;
  showMessage(el.message, append ? 'กำลังโหลดเพิ่ม...' : 'กำลังโหลดประวัติ...');

  if (!append) {
    currentPage = 0;
    rows = [];
    renderRows();
  }

  try {
    const { data, error } = await buildQuery(currentPage);
    if (error) throw error;

    const pageRows = data || [];
    hasMore = pageRows.length > PAGE_SIZE;
    rows = append
      ? rows.concat(pageRows.slice(0, PAGE_SIZE))
      : pageRows.slice(0, PAGE_SIZE);

    renderRows();
    showMessage(
      el.message,
      rows.length
        ? `แสดง ${formatNumber(rows.length)} รายการ${hasMore ? ' • ยังมีข้อมูลเพิ่มเติม' : ''}`
        : 'ไม่พบประวัติที่ตรงกับตัวกรอง'
    );
  } catch (error) {
    showMessage(el.message, error.message, 'error');
    hasMore = false;
    renderRows();
  } finally {
    loading = false;
    el.refreshBtn.disabled = false;
    el.searchBtn.disabled = false;
    el.loadMoreBtn.disabled = false;
  }
}

async function loadBranches(access) {
  const branches = await loadActiveBranches();
  el.branchFilter.innerHTML = '<option value="">ทุกสาขา</option>'
    + branches.map((branch) => (
      `<option value="${branch.id}">${escapeHtml(branch.name)}</option>`
    )).join('');

  if (access?.branch_id && branches.some((branch) => branch.id === access.branch_id)) {
    el.branchFilter.value = access.branch_id;
  }
  window.TKNInventoryWorkspace?.setBranch(
    el.branchFilter.selectedOptions[0]?.textContent || 'ทุกสาขา'
  );
}

function clearFilters() {
  el.branchFilter.value = '';
  el.typeFilter.value = '';
  el.dateFrom.value = '';
  el.dateTo.value = '';
  el.searchInput.value = '';
  loadHistory();
}

el.refreshBtn.addEventListener('click', () => loadHistory());
el.searchBtn.addEventListener('click', () => loadHistory());
el.clearBtn.addEventListener('click', clearFilters);
el.branchFilter.addEventListener('change', () => {
  window.TKNInventoryWorkspace?.setBranch(el.branchFilter.selectedOptions[0]?.textContent || 'ทุกสาขา');
  loadHistory();
});
el.typeFilter.addEventListener('change', () => loadHistory());
el.dateFrom.addEventListener('change', () => loadHistory());
el.dateTo.addEventListener('change', () => loadHistory());
el.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadHistory();
});
el.loadMoreBtn.addEventListener('click', async () => {
  currentPage += 1;
  await loadHistory({ append: true });
});

async function init() {
  try {
    const access = await loadInventoryAccess('inventory.view');
    if (!access) return;
    await loadBranches(access);
    await loadHistory();
    window.TKNAuthGuard?.ready();
  } catch (error) {
    showMessage(el.message, error.message, 'error');
    if (error.code !== 'INVENTORY_PERMISSION_DENIED') {
      window.TKNAuthGuard?.fail(error, () => location.reload());
    }
  }
}

init();
