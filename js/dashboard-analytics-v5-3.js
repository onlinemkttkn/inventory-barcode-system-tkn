(() => {
  'use strict';

  const categoryCanvas = document.getElementById('categorySalesChart');
  const trendCanvas = document.getElementById('salesTrendChart');
  if (!categoryCanvas || !trendCanvas) return;

  const legend = document.getElementById('categorySalesLegend');
  const message = document.getElementById('dashboardAnalyticsMessage');
  const categoryRange = document.getElementById('categoryAnalyticsRange');
  const trendRange = document.getElementById('trendAnalyticsRange');
  const modeButtons = [...document.querySelectorAll('[data-analytics-mode]')];
  const palette = ['#d10a2c','#ffbd20','#167244','#7c3aed','#0f6f9f','#d97706','#db2777','#4b5563','#14b8a6','#8b5e34'];

  let categoryChart = null;
  let trendChart = null;
  let mode = 'DAY';
  let state = { category_sales: [], daily_sales: [], monthly_sales: [], range: null };

  const money = (value) => new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(value || 0));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;',
  })[char]);

  function chartAvailable() { return typeof window.Chart === 'function'; }
  function localDate(value) {
    const [y,m,d] = String(value || '').slice(0,10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12);
  }
  function rangeText() {
    const start = state.range?.startDate || state.range?.start_date;
    const end = state.range?.endDate || state.range?.end_date;
    if (!start || !end) return 'ช่วงวันที่ที่เลือก';
    const f = new Intl.DateTimeFormat('th-TH', { day:'numeric', month:'short', year:'numeric' });
    return start === end ? f.format(localDate(start)) : `${f.format(localDate(start))} – ${f.format(localDate(end))}`;
  }

  function renderCategory(rows) {
    const cleanRows = (rows || []).filter((row) => Number(row.total_sales || 0) > 0);
    if (!chartAvailable()) {
      if (legend) legend.innerHTML = '<p class="analytics-empty">ไม่สามารถโหลด Chart.js ได้</p>';
      return;
    }
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    if (!cleanRows.length) {
      if (legend) legend.innerHTML = '<p class="analytics-empty">ไม่พบยอดขายในช่วงนี้</p>';
      return;
    }
    const colors = cleanRows.map((_, index) => palette[index % palette.length]);
    categoryChart = new Chart(categoryCanvas, {
      type: 'doughnut',
      data: { labels: cleanRows.map((row) => row.category_name || 'ไม่ระบุหมวดหมู่'), datasets: [{ data: cleanRows.map((row) => Number(row.total_sales || 0)), backgroundColor: colors, borderColor: '#fff', borderWidth: 3, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', animation: { duration: 500 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label(context) { const row = cleanRows[context.dataIndex]; return `${row.category_name}: ${money(row.total_sales)} (${Number(row.percent || 0).toLocaleString('th-TH',{maximumFractionDigits:2})}%)`; } } } } },
    });
    if (legend) legend.innerHTML = cleanRows.map((row,index) => `<div class="analytics-legend-item"><span class="analytics-legend-dot" style="--legend-color:${colors[index]}"></span><span class="analytics-legend-name">${esc(row.category_name || 'ไม่ระบุหมวดหมู่')}</span><strong>${Number(row.percent || 0).toLocaleString('th-TH',{maximumFractionDigits:2})}%</strong><small>${money(row.total_sales)}</small></div>`).join('');
  }

  function monthLabel(row) {
    return new Date(Number(row.year), Number(row.month)-1, 1).toLocaleDateString('th-TH', { month:'short', year:'2-digit' });
  }
  function dayLabel(row) {
    return localDate(row.sale_date).toLocaleDateString('th-TH', { day:'2-digit', month:'short' });
  }

  function renderTrend() {
    if (!chartAvailable()) return;
    const rows = mode === 'MONTH' ? state.monthly_sales : state.daily_sales;
    const labels = rows.map((row) => mode === 'MONTH' ? monthLabel(row) : dayLabel(row));
    const values = rows.map((row) => Number(row.total_sales || 0));
    const datasetLabel = mode === 'MONTH' ? 'ยอดขายรายเดือน' : 'ยอดขายรายวัน';
    if (trendChart) {
      trendChart.data.labels = labels;
      trendChart.data.datasets[0].data = values;
      trendChart.data.datasets[0].label = datasetLabel;
      trendChart.update();
      return;
    }
    trendChart = new Chart(trendCanvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: datasetLabel, data: values, borderRadius: 8, borderSkipped: false, backgroundColor: '#d10a2c', hoverBackgroundColor: '#a90825', maxBarThickness: 46 }] },
      options: { responsive:true, maintainAspectRatio:false, animation:{duration:500}, interaction:{intersect:false,mode:'index'}, plugins:{legend:{display:false},tooltip:{callbacks:{label(context){return `${context.dataset.label}: ${money(context.raw)}`;}}}}, scales:{x:{grid:{display:false},ticks:{maxTicksLimit:16}},y:{beginAtZero:true,ticks:{callback(value){return Number(value).toLocaleString('th-TH');}}}} },
    });
  }

  function consume(detail) {
    const data = detail?.data || window.TKNDashboardRange?.getData?.() || {};
    state = {
      category_sales: data.category_sales || [],
      daily_sales: data.daily_sales || [],
      monthly_sales: data.monthly_sales || [],
      range: detail?.range || data.period || null,
    };
    const text = rangeText();
    if (categoryRange) categoryRange.textContent = `สัดส่วนยอดขาย · ${text}`;
    if (trendRange) trendRange.textContent = `แนวโน้มภายในช่วง ${text}`;
    renderCategory(state.category_sales);
    renderTrend();
    if (message) message.textContent = `อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.analyticsMode === 'MONTH' ? 'MONTH' : 'DAY';
    modeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    renderTrend();
  }));

  window.addEventListener('tkn-dashboard-loaded', (event) => consume(event.detail));
  window.TKNDashboardAnalytics = Object.freeze({ reload: () => consume({}) });
  const initial = window.TKNDashboardRange?.getData?.();
  if (initial) consume({ data: initial, range: window.TKNDashboardRange.getRange?.() });
})();
