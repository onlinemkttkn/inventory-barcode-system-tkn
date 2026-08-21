import { supabaseClient } from './supabase-client.js';

const els = {
  dateFrom: document.querySelector('#dateFrom'), dateTo: document.querySelector('#dateTo'),
  loadButton: document.querySelector('#loadButton'), thisMonthButton: document.querySelector('#thisMonthButton'),
  returnCount: document.querySelector('#returnCount'), refundTotal: document.querySelector('#refundTotal'),
  affectedSales: document.querySelector('#affectedSales'), topProducts: document.querySelector('#topProducts'),
  dailyRows: document.querySelector('#dailyRows'), message: document.querySelector('#message'),
};
const money = (value) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(value || 0));
const date = (value) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
const formatDate = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

function applyDashboardRange() {
  const params = new URLSearchParams(location.search);
  const start = String(params.get('start') || ''), end = String(params.get('end') || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  els.dateFrom.value = start; els.dateTo.value = end; return true;
}

async function loadReport() {
  els.loadButton.disabled = true; els.message.textContent = 'กำลังโหลด...';
  const { data, error } = await supabaseClient.rpc('get_sales_return_report_phase_9_2', { p_date_from: els.dateFrom.value || null, p_date_to: els.dateTo.value || null });
  els.loadButton.disabled = false;
  if (error) { console.error(error); els.message.textContent = `โหลดไม่สำเร็จ: ${error.message}`; return; }
  const summary = data?.summary || {}, products = data?.top_products || [], daily = data?.daily || [];
  els.returnCount.textContent = String(summary.return_count || 0); els.refundTotal.textContent = money(summary.refund_total); els.affectedSales.textContent = String(summary.affected_sales || 0);
  els.topProducts.innerHTML = products.length ? products.map((row, index) => `<tr><td>${index + 1}</td><td>${row.product_code || '-'}</td><td>${row.product_name || '-'}</td><td>${Number(row.returned_quantity || 0)}</td><td>${money(row.refund_amount)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-row">ยังไม่มีข้อมูล</td></tr>';
  els.dailyRows.innerHTML = daily.length ? daily.map((row) => `<tr><td>${date(row.return_date)}</td><td>${Number(row.return_count || 0)}</td><td>${money(row.refund_amount)}</td></tr>`).join('') : '<tr><td colspan="3" class="empty-row">ยังไม่มีข้อมูล</td></tr>';
  els.message.textContent = 'อัปเดตรายงานแล้ว';
}

els.thisMonthButton.addEventListener('click', () => { const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1); els.dateFrom.value = formatDate(first); els.dateTo.value = formatDate(now); loadReport(); });
els.loadButton.addEventListener('click', loadReport);
applyDashboardRange();
loadReport();
