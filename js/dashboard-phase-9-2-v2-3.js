"use strict";

const DASHBOARD_SUPABASE_URL =
  "https://wkozeuxyhqcmiatssviq.supabase.co";
const DASHBOARD_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_NENuHV7DiTHuYcQ6Sle6Xg_mhUfd5SZ";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  throw new Error("Supabase JavaScript library is not loaded");
}

const supabaseClient = window.supabase.createClient(
  DASHBOARD_SUPABASE_URL,
  DASHBOARD_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "tkn-dashboard-phase-9-2-v2-3-auth"
    }
  }
);

const E = {
  loginCard: document.getElementById("loginCard"),
  appArea: document.getElementById("appArea"),
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginMessage: document.getElementById("loginMessage"),
  logoutBtn: document.getElementById("logoutBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  configWarning: document.getElementById("configWarning"),
  welcomeText: document.getElementById("welcomeText"),
  branchFilter: document.getElementById("branchFilter"),
  totalProducts: document.getElementById("totalProducts"),
  totalCategories: document.getElementById("totalCategories"),
  outStock: document.getElementById("outStock"),
  lowStock: document.getElementById("lowStock"),
  salesToday: document.getElementById("salesToday"),
  billsToday: document.getElementById("billsToday"),
  salesMonth: document.getElementById("salesMonth"),
  pendingTransfers: document.getElementById("pendingTransfers"),
  stockCostValue: document.getElementById("stockCostValue"),
  stockSaleValue: document.getElementById("stockSaleValue"),
  recentProducts: document.getElementById("recentProducts"),
  recentSales: document.getElementById("recentSales"),
  topProducts: document.getElementById("topProducts"),
  dashboardMessage: document.getElementById("dashboardMessage"),
  salesChart: document.getElementById("salesChart"),
};

let chart = null;
let currentProfile = null;
let isRenderingSession = false;
let isLoadingDashboard = false;
let branchesLoaded = false;

function msg(element, text, type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function num(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 3,
  });
}

function money(value) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function configReady() {
  return (
    DASHBOARD_SUPABASE_URL.startsWith("https://") &&
    DASHBOARD_SUPABASE_PUBLISHABLE_KEY.length > 20
  );
}

function showLogin() {
  E.loginCard.classList.remove("hidden");
  E.appArea.classList.add("hidden");
  E.logoutBtn.classList.add("hidden");
  E.branchFilter.classList.add("hidden");
  E.refreshBtn.classList.add("hidden");
}

function showApp() {
  E.loginCard.classList.add("hidden");
  E.appArea.classList.remove("hidden");
  E.logoutBtn.classList.remove("hidden");
  E.branchFilter.classList.remove("hidden");
  E.refreshBtn.classList.remove("hidden");
}

async function init() {
  if (!configReady()) {
    E.configWarning.textContent =
      "กรุณาตรวจสอบ Supabase URL และ Publishable Key";
    E.configWarning.classList.remove("hidden");
    showLogin();
    return;
  }

  try {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    if (error) {
      showLogin();
      msg(E.loginMessage, error.message, "error");
      return;
    }

    await renderSession(session);

    supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        currentProfile = null;
        branchesLoaded = false;
        showLogin();
        E.welcomeText.textContent =
          "กรุณาเข้าสู่ระบบภายในองค์กร";
        return;
      }

      /*
       * เรียก renderSession เฉพาะตอนเข้าสู่ระบบจริง
       * ไม่โหลด Dashboard ซ้ำตอน TOKEN_REFRESHED
       */
      if (event === "SIGNED_IN" && nextSession && !currentProfile) {
        setTimeout(() => {
          renderSession(nextSession);
        }, 0);
      }
    });
  } catch (error) {
    console.error("Initialization error:", error);
    showLogin();
    msg(E.loginMessage, `เริ่มต้นระบบไม่สำเร็จ: ${error.message}`, "error");
  }
}

async function renderSession(session) {
  if (isRenderingSession) return;
  isRenderingSession = true;

  try {
    if (!session?.user?.id) {
      showLogin();
      E.welcomeText.textContent =
        "กรุณาเข้าสู่ระบบภายในองค์กร";
      return;
    }

    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("id,email,full_name,role,is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("Profile query error:", error);
      showLogin();
      msg(
        E.loginMessage,
        `อ่านข้อมูลผู้ใช้ไม่สำเร็จ: ${error.message}`,
        "error"
      );
      return;
    }

    if (!profile) {
      showLogin();
      msg(
        E.loginMessage,
        "ไม่พบข้อมูลผู้ใช้ในตาราง profiles",
        "error"
      );
      return;
    }

    if (profile.is_active !== true) {
      await supabaseClient.auth.signOut();
      showLogin();
      msg(
        E.loginMessage,
        "บัญชีไม่มีสิทธิ์หรือถูกปิดใช้งาน",
        "error"
      );
      return;
    }

    currentProfile = profile;
    showApp();

    E.welcomeText.textContent =
      `${profile.full_name || profile.email} • ${
        profile.role === "admin" ? "ผู้ดูแลระบบ" : "พนักงาน"
      }`;

    if (!branchesLoaded) {
      await loadBranches();
      branchesLoaded = true;
    }

    await loadDashboard();
  } catch (error) {
    console.error("Render session error:", error);
    showLogin();
    msg(
      E.loginMessage,
      `ตรวจสอบผู้ใช้งานไม่สำเร็จ: ${error.message}`,
      "error"
    );
  } finally {
    isRenderingSession = false;
  }
}

E.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = E.email.value.trim();
  const password = E.password.value;
  const submitButton =
    E.loginForm.querySelector('button[type="submit"]');

  if (!email || !password) {
    msg(E.loginMessage, "กรุณากรอกอีเมลและรหัสผ่าน", "error");
    return;
  }

  try {
    if (submitButton) submitButton.disabled = true;
    msg(E.loginMessage, "กำลังเข้าสู่ระบบ...");

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      msg(E.loginMessage, error.message, "error");
      return;
    }

    E.password.value = "";
    msg(E.loginMessage, "");

    /*
     * เรียกตรงนี้ครั้งเดียว
     * Auth callback จะไม่เรียกซ้ำ เพราะ currentProfile จะถูกตั้งค่า
     */
    await renderSession(data.session);
  } catch (error) {
    console.error("Login error:", error);
    msg(
      E.loginMessage,
      `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`,
      "error"
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

E.logoutBtn?.addEventListener("click", async () => {
  E.logoutBtn.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      msg(E.dashboardMessage, error.message, "error");
      return;
    }

    currentProfile = null;
    branchesLoaded = false;
    showLogin();
  } finally {
    E.logoutBtn.disabled = false;
  }
});

E.refreshBtn?.addEventListener("click", loadDashboard);
E.branchFilter?.addEventListener("change", loadDashboard);

async function loadBranches() {
  const selected = E.branchFilter.value;

  const { data, error } = await supabaseClient
    .from("branches")
    .select("id,code,name")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    msg(E.dashboardMessage, error.message, "error");
    return;
  }

  E.branchFilter.innerHTML =
    '<option value="">ทุกสาขา</option>' +
    (data || [])
      .map(
        (branch) =>
          `<option value="${branch.id}">${esc(branch.code)} — ${esc(
            branch.name
          )}</option>`
      )
      .join("");

  if (selected) {
    E.branchFilter.value = selected;
  }
}

async function loadDashboard() {
  if (isLoadingDashboard) return;
  isLoadingDashboard = true;

  E.refreshBtn.disabled = true;
  msg(E.dashboardMessage, "กำลังโหลดข้อมูล...");

  try {
    const branchId = E.branchFilter.value || null;

    let inventoryQuery = supabaseClient
      .from("dashboard_recent_inventory")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(12);

    let salesQuery = supabaseClient
      .from("dashboard_recent_sales")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (branchId) {
      inventoryQuery = inventoryQuery.eq("branch_id", branchId);
      salesQuery = salesQuery.eq("branch_id", branchId);
    }

    const [
      summary,
      inventory,
      sales,
      topProducts,
      dailySales,
    ] = await Promise.all([
      supabaseClient
        .from("dashboard_v2_summary")
        .select("*")
        .single(),

      inventoryQuery,

      salesQuery,

      supabaseClient
        .from("dashboard_top_products_month")
        .select("*")
        .order("total_quantity", { ascending: false })
        .limit(10),

      supabaseClient
        .from("dashboard_sales_daily")
        .select("*")
        .order("sale_date", { ascending: true }),
    ]);

    const error = [
      summary.error,
      inventory.error,
      sales.error,
      topProducts.error,
      dailySales.error,
    ].find(Boolean);

    if (error) {
      console.error("Dashboard query error:", error);
      msg(E.dashboardMessage, error.message, "error");
      return;
    }

    renderSummary(summary.data || {});
    renderInventory(inventory.data || []);
    renderSales(sales.data || []);
    renderTopProducts(topProducts.data || []);
    renderChart(dailySales.data || []);

    msg(E.dashboardMessage, "อัปเดตข้อมูลแล้ว", "success");
  } catch (error) {
    console.error("Load dashboard error:", error);
    msg(
      E.dashboardMessage,
      `โหลด Dashboard ไม่สำเร็จ: ${error.message}`,
      "error"
    );
  } finally {
    isLoadingDashboard = false;
    E.refreshBtn.disabled = false;
  }
}

function renderSummary(summary) {
  E.totalProducts.textContent = num(summary.total_products);
  E.totalCategories.textContent = num(summary.total_categories);
  E.outStock.textContent = num(summary.out_of_stock_count);
  E.lowStock.textContent = num(summary.low_stock_count);
  E.salesToday.textContent = money(summary.sales_today);
  E.billsToday.textContent = num(summary.bills_today);
  E.salesMonth.textContent = money(summary.sales_month);
  E.pendingTransfers.textContent = num(summary.pending_transfers);
  E.stockCostValue.textContent = money(summary.stock_cost_value);
  E.stockSaleValue.textContent = money(summary.stock_sale_value);
}

function renderInventory(rows) {
  E.recentProducts.innerHTML = "";

  if (!rows.length) {
    E.recentProducts.innerHTML =
      '<tr><td colspan="6">ยังไม่มีข้อมูลสต๊อก</td></tr>';
    return;
  }

  rows.forEach((item) => {
    const statusMap = {
      IN_STOCK: ["มีสินค้า", "ok"],
      LOW_STOCK: ["ใกล้หมด", "low"],
      OUT_OF_STOCK: ["หมด", "out"],
    };

    const [label, cssClass] =
      statusMap[item.stock_status] || ["-", ""];

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(item.branch_code)}</td>
      <td>${esc(item.product_code)}</td>
      <td>${esc(item.product_name)}</td>
      <td>${esc(item.barcode || "-")}</td>
      <td>${num(item.quantity)}</td>
      <td><span class="badge ${cssClass}">${label}</span></td>
    `;

    E.recentProducts.appendChild(tr);
  });
}

function renderSales(rows) {
  E.recentSales.innerHTML = "";

  if (!rows.length) {
    E.recentSales.innerHTML =
      '<tr><td colspan="5">ยังไม่มีข้อมูลการขาย</td></tr>';
    return;
  }

  rows.forEach((sale) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(sale.created_at).toLocaleString("th-TH")}</td>
      <td>${esc(sale.sale_no)}</td>
      <td>${esc(sale.branch_code)}</td>
      <td>${money(sale.net_total)}</td>
      <td>${esc(sale.payment_method)}</td>
    `;

    E.recentSales.appendChild(tr);
  });
}

function renderTopProducts(rows) {
  E.topProducts.innerHTML = "";

  if (!rows.length) {
    E.topProducts.innerHTML =
      '<tr><td colspan="5">ยังไม่มีข้อมูลยอดขายเดือนนี้</td></tr>';
    return;
  }

  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${esc(item.product_code)}</td>
      <td>${esc(item.product_name)}</td>
      <td>${num(item.total_quantity)}</td>
      <td>${money(item.total_sales)}</td>
    `;

    E.topProducts.appendChild(tr);
  });
}

function renderChart(rows) {
  const labels = [];
  const values = [];

  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - index);

    /*
     * ใช้วันที่ local แทน toISOString()
     * ป้องกันวันที่เลื่อนเพราะ timezone
     */
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    const found = rows.find(
      (row) => String(row.sale_date).slice(0, 10) === key
    );

    labels.push(
      date.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
      })
    );

    values.push(Number(found?.total_sales || 0));
  }

  if (chart) {
    chart.destroy();
    chart = null;
  }

  chart = new Chart(E.salesChart, {
    type: "line",

    data: {
      labels,
      datasets: [
        {
          label: "ยอดขาย",
          data: values,
          tension: 0.25,
          fill: false,
          pointRadius: 3,
          pointHoverRadius: 4,
        },
      ],
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      resizeDelay: 300,

      interaction: {
        intersect: false,
        mode: "index",
      },

      plugins: {
        legend: {
          display: false,
        },
      },

      scales: {
        x: {
          grid: {
            display: false,
          },
        },

        y: {
          beginAtZero: true,

          ticks: {
            callback(value) {
              return Number(value).toLocaleString("th-TH");
            },
          },
        },
      },
    },
  });
}

init();
