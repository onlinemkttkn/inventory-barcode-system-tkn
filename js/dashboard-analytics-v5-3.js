(() => {
  'use strict';

  const categoryCanvas = document.getElementById('categorySalesChart');
  const trendCanvas = document.getElementById('salesTrendChart');
  if (!categoryCanvas || !trendCanvas) return;

  const legend = document.getElementById('categorySalesLegend');
  const message = document.getElementById('dashboardAnalyticsMessage');
  const modeButtons = [...document.querySelectorAll('[data-analytics-mode]')];
  const branchFilter = document.getElementById('branchFilter');

  const palette = [
    '#d10a2c', '#ffbd20', '#167244', '#7c3aed', '#0f6f9f',
    '#d97706', '#db2777', '#4b5563', '#14b8a6', '#8b5e34',
  ];

  let categoryChart = null;
  let trendChart = null;
  let mode = 'MONTH';
  let state = { category_sales: [], monthly_sales: [], quarterly_sales: [] };
  let loadSequence = 0;

  const money = (value) => new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[char]);

  function chartAvailable() {
    return typeof window.Chart === 'function';
  }

  function formatMonth(row) {
    const date = new Date(Number(row.year), Number(row.month) - 1, 1);
    return date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
  }

  function formatQuarter(row) {
    return `ไตรมาส ${Number(row.quarter)} / ${Number(row.year) + 543}`;
  }

  function renderCategory(rows) {
    const cleanRows = (rows || []).filter((row) => Number(row.total_sales || 0) > 0);

    if (!chartAvailable()) {
      if (legend) legend.innerHTML = '<p class="analytics-empty">ไม่สามารถโหลด Chart.js ได้</p>';
      return;
    }

    if (categoryChart) {
      categoryChart.destroy();
      categoryChart = null;
    }

    if (!cleanRows.length) {
      if (legend) legend.innerHTML = '<p class="analytics-empty">ยังไม่มีข้อมูลยอดขายในเดือนนี้</p>';
      return;
    }

    const colors = cleanRows.map((_, index) => palette[index % palette.length]);

    categoryChart = new Chart(categoryCanvas, {
      type: 'doughnut',
      data: {
        labels: cleanRows.map((row) => row.category_name || 'ไม่ระบุหมวดหมู่'),
        datasets: [{
          data: cleanRows.map((row) => Number(row.total_sales || 0)),
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 650 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const row = cleanRows[context.dataIndex];
                return `${row.category_name}: ${money(row.total_sales)} (${Number(row.percent || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}%)`;
              },
            },
          },
        },
      },
    });

    if (legend) {
      legend.innerHTML = cleanRows.map((row, index) => `
        <div class="analytics-legend-item">
          <span class="analytics-legend-dot" style="--legend-color:${colors[index]}"></span>
          <span class="analytics-legend-name">${esc(row.category_name || 'ไม่ระบุหมวดหมู่')}</span>
          <strong>${Number(row.percent || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}%</strong>
          <small>${money(row.total_sales)}</small>
        </div>
      `).join('');
    }
  }

  function renderTrend() {
    if (!chartAvailable()) {
      if (message) message.textContent = 'ไม่สามารถโหลด Chart.js ได้';
      return;
    }

    const rows = mode === 'QUARTER' ? state.quarterly_sales : state.monthly_sales;
    const labels = rows.map((row) => mode === 'QUARTER' ? formatQuarter(row) : formatMonth(row));
    const values = rows.map((row) => Number(row.total_sales || 0));

    if (trendChart) {
      trendChart.data.labels = labels;
      trendChart.data.datasets[0].data = values;
      trendChart.data.datasets[0].label = mode === 'QUARTER' ? 'ยอดขายรายไตรมาส' : 'ยอดขายรายเดือน';
      trendChart.update();
      return;
    }

    trendChart = new Chart(trendCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'ยอดขายรายเดือน',
          data: values,
          borderRadius: 8,
          borderSkipped: false,
          backgroundColor: '#d10a2c',
          hoverBackgroundColor: '#a90825',
          maxBarThickness: 46,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 650 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${money(context.raw)}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return Number(value).toLocaleString('th-TH');
              },
            },
          },
        },
      },
    });
  }

  async function loadAnalytics() {
    const client = window.supabaseClient;
    if (!client) {
      if (message) message.textContent = 'ไม่พบ Supabase Client กลาง';
      return;
    }

    const sequence = ++loadSequence;
    if (message) message.textContent = 'กำลังอัปเดตกราฟ...';

    const { data, error } = await client.rpc('get_dashboard_analytics_v5_3', {
      p_branch_id: branchFilter?.value || null,
    });

    if (sequence !== loadSequence) return;

    if (error) {
      console.error('Dashboard analytics error:', error);
      if (message) message.textContent = `โหลดกราฟไม่สำเร็จ: ${error.message}`;
      if (legend) legend.innerHTML = '<p class="analytics-empty">กรุณารัน SQL ของ Patch v5.3.0</p>';
      return;
    }

    state = {
      category_sales: data?.category_sales || [],
      monthly_sales: data?.monthly_sales || [],
      quarterly_sales: data?.quarterly_sales || [],
    };

    renderCategory(state.category_sales);
    renderTrend();
    if (message) message.textContent = `อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      mode = button.dataset.analyticsMode === 'QUARTER' ? 'QUARTER' : 'MONTH';
      modeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      renderTrend();
    });
  });

  window.addEventListener('tkn-dashboard-loaded', loadAnalytics);
  window.TKNDashboardAnalytics = Object.freeze({ reload: loadAnalytics });

  if (!document.getElementById('appArea')?.classList.contains('hidden')) {
    loadAnalytics();
  }
})();
