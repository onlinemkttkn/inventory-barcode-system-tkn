const el = {
  loginCard: document.getElementById("loginCard"),
  appArea: document.getElementById("appArea"),
  loginForm: document.getElementById("loginForm"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginMessage: document.getElementById("loginMessage"),
  logoutBtn: document.getElementById("logoutBtn"),
  configWarning: document.getElementById("configWarning"),
  welcomeText: document.getElementById("welcomeText"),
  totalProducts: document.getElementById("totalProducts"),
  lowStock: document.getElementById("lowStock"),
  outStock: document.getElementById("outStock"),
  totalCategories: document.getElementById("totalCategories"),
  recentProducts: document.getElementById("recentProducts"),
  dashboardMessage: document.getElementById("dashboardMessage"),
  refreshBtn: document.getElementById("refreshBtn"),
};

let isRenderingSession = false;

/* =========================================================
   MESSAGE
========================================================= */

function msg(node, text, type = "") {
  if (!node) return;

  node.textContent = text;
  node.className = `message ${type}`.trim();
}

/* =========================================================
   CHECK CONFIG
========================================================= */

function configReady() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_PUBLISHABLE_KEY === "string" &&
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("ใส่_") &&
    !SUPABASE_PUBLISHABLE_KEY.includes("ใส่_") &&
    SUPABASE_PUBLISHABLE_KEY.length > 20
  );
}

/* =========================================================
   INITIALIZE
========================================================= */

async function init() {
  if (!configReady()) {
    el.configWarning.textContent =
      "กรุณาตรวจสอบ Project URL และ Publishable Key ใน supabase-config.js";

    el.configWarning.classList.remove("hidden");
    return;
  }

  try {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("Get session error:", error);

      showLoginScreen();

      msg(
        el.loginMessage,
        `ตรวจสอบ Session ไม่สำเร็จ: ${error.message}`,
        "error"
      );

      return;
    }

    await renderSession(session);
  } catch (error) {
    console.error("Initialization error:", error);

    showLoginScreen();

    msg(
      el.loginMessage,
      `เริ่มต้นระบบไม่สำเร็จ: ${error.message}`,
      "error"
    );
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);

    // ป้องกัน callback ซ้อนกัน
    setTimeout(() => {
      renderSession(session);
    }, 0);
  });
}

/* =========================================================
   SCREEN CONTROL
========================================================= */

function showLoginScreen() {
  el.loginCard.classList.remove("hidden");
  el.appArea.classList.add("hidden");
  el.logoutBtn.classList.add("hidden");

  el.welcomeText.textContent =
    "กรุณาเข้าสู่ระบบภายในองค์กร";
}

function showDashboardScreen() {
  el.loginCard.classList.add("hidden");
  el.appArea.classList.remove("hidden");
  el.logoutBtn.classList.remove("hidden");
}

/* =========================================================
   SESSION
========================================================= */

async function renderSession(session) {
  if (isRenderingSession) return;

  isRenderingSession = true;

  try {
    if (!session?.user?.id) {
      showLoginScreen();
      return;
    }

    msg(el.loginMessage, "");

    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    /*
      ห้าม signOut เมื่อเกิด Error จาก API
      เพราะอาจเป็นปัญหา Key, Network หรือ RLS ชั่วคราว
    */
    if (error) {
      console.error("Profile query error:", error);

      showLoginScreen();

      msg(
        el.loginMessage,
        `อ่านข้อมูลผู้ใช้ไม่สำเร็จ: ${error.message}`,
        "error"
      );

      return;
    }

    if (!profile) {
      showLoginScreen();

      msg(
        el.loginMessage,
        "ไม่พบข้อมูลผู้ใช้ในตาราง profiles กรุณาติดต่อผู้ดูแลระบบ",
        "error"
      );

      return;
    }

    if (profile.is_active !== true) {
      await supabaseClient.auth.signOut();

      showLoginScreen();

      msg(
        el.loginMessage,
        "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
        "error"
      );

      return;
    }

    showDashboardScreen();

    const displayName =
      profile.full_name ||
      profile.email ||
      session.user.email ||
      "ผู้ใช้งาน";

    const roleName =
      profile.role === "admin"
        ? "ผู้ดูแลระบบ"
        : "พนักงาน";

    el.welcomeText.textContent =
      `${displayName} • ${roleName}`;

    await loadDashboard();
  } catch (error) {
    console.error("Render session error:", error);

    showLoginScreen();

    msg(
      el.loginMessage,
      `ตรวจสอบผู้ใช้งานไม่สำเร็จ: ${error.message}`,
      "error"
    );
  } finally {
    isRenderingSession = false;
  }
}

/* =========================================================
   LOGIN
========================================================= */

el.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = el.email.value.trim();
  const password = el.password.value;

  if (!email || !password) {
    msg(
      el.loginMessage,
      "กรุณากรอกอีเมลและรหัสผ่าน",
      "error"
    );
    return;
  }

  const submitButton =
    el.loginForm.querySelector('button[type="submit"]');

  try {
    if (submitButton) submitButton.disabled = true;

    msg(
      el.loginMessage,
      "กำลังเข้าสู่ระบบ..."
    );

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      console.error("Login error:", error);

      msg(
        el.loginMessage,
        translateAuthError(error.message),
        "error"
      );

      return;
    }

    if (!data.session) {
      msg(
        el.loginMessage,
        "เข้าสู่ระบบสำเร็จ แต่ไม่พบ Session",
        "error"
      );

      return;
    }

    el.password.value = "";

    msg(el.loginMessage, "");

    await renderSession(data.session);
  } catch (error) {
    console.error("Unexpected login error:", error);

    msg(
      el.loginMessage,
      `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`,
      "error"
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

/* =========================================================
   LOGOUT
========================================================= */

el.logoutBtn?.addEventListener("click", async () => {
  try {
    el.logoutBtn.disabled = true;

    const { error } =
      await supabaseClient.auth.signOut();

    if (error) {
      console.error("Logout error:", error);

      msg(
        el.dashboardMessage,
        `ออกจากระบบไม่สำเร็จ: ${error.message}`,
        "error"
      );
      return;
    }

    showLoginScreen();
  } finally {
    el.logoutBtn.disabled = false;
  }
});

/* =========================================================
   DASHBOARD
========================================================= */

el.refreshBtn?.addEventListener(
  "click",
  loadDashboard
);

async function loadDashboard() {
  msg(
    el.dashboardMessage,
    "กำลังโหลดข้อมูล..."
  );

  if (el.refreshBtn) {
    el.refreshBtn.disabled = true;
  }

  try {
    const [
      products,
      categories,
      lowStock,
      outOfStock,
      recent,
    ] = await Promise.all([
      supabaseClient
        .from("products")
        .select("id", {
          count: "exact",
          head: true,
        }),

      supabaseClient
        .from("categories")
        .select("id", {
          count: "exact",
          head: true,
        }),

      supabaseClient
        .from("products")
        .select("id", {
          count: "exact",
          head: true,
        })
        .gt("quantity", 0)
        .lte("quantity", 5),

      supabaseClient
        .from("products")
        .select("id", {
          count: "exact",
          head: true,
        })
        .lte("quantity", 0),

      supabaseClient
        .from("product_list")
        .select(
          `
          product_code,
          barcode,
          name,
          quantity,
          stock_status,
          created_at
          `
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(10),
    ]);

    const responses = [
      products,
      categories,
      lowStock,
      outOfStock,
      recent,
    ];

    const firstError =
      responses
        .map((response) => response.error)
        .find(Boolean);

    if (firstError) {
      console.error(
        "Dashboard query error:",
        firstError
      );

      msg(
        el.dashboardMessage,
        `โหลด Dashboard ไม่สำเร็จ: ${firstError.message}`,
        "error"
      );

      return;
    }

    el.totalProducts.textContent =
      Number(products.count || 0)
        .toLocaleString("th-TH");

    el.totalCategories.textContent =
      Number(categories.count || 0)
        .toLocaleString("th-TH");

    el.lowStock.textContent =
      Number(lowStock.count || 0)
        .toLocaleString("th-TH");

    el.outStock.textContent =
      Number(outOfStock.count || 0)
        .toLocaleString("th-TH");

    renderRecentProducts(recent.data || []);

    msg(
      el.dashboardMessage,
      "อัปเดตข้อมูลแล้ว",
      "success"
    );
  } catch (error) {
    console.error(
      "Unexpected dashboard error:",
      error
    );

    msg(
      el.dashboardMessage,
      `เกิดข้อผิดพลาด: ${error.message}`,
      "error"
    );
  } finally {
    if (el.refreshBtn) {
      el.refreshBtn.disabled = false;
    }
  }
}

/* =========================================================
   RECENT PRODUCTS
========================================================= */

function renderRecentProducts(products) {
  el.recentProducts.innerHTML = "";

  if (!products.length) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td colspan="5">
        ยังไม่มีข้อมูลสินค้า
      </td>
    `;

    el.recentProducts.appendChild(tr);
    return;
  }

  products.forEach((product) => {
    const statusMap = {
      IN_STOCK: ["มีสินค้า", "ok"],
      LOW_STOCK: ["ใกล้หมด", "low"],
      OUT_OF_STOCK: ["หมด", "out"],
    };

    const status =
      statusMap[product.stock_status] ||
      ["ไม่ทราบสถานะ", ""];

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        ${escapeHtml(product.product_code || "-")}
      </td>

      <td>
        ${escapeHtml(product.name || "-")}
      </td>

      <td>
        ${escapeHtml(product.barcode || "-")}
      </td>

      <td>
        ${Number(product.quantity || 0)
          .toLocaleString("th-TH")}
      </td>

      <td>
        <span class="badge ${status[1]}">
          ${status[0]}
        </span>
      </td>
    `;

    el.recentProducts.appendChild(tr);
  });
}

/* =========================================================
   ERROR TRANSLATION
========================================================= */

function translateAuthError(message) {
  const text = String(message || "");

  if (
    text.toLowerCase().includes(
      "invalid login credentials"
    )
  ) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }

  if (
    text.toLowerCase().includes(
      "email not confirmed"
    )
  ) {
    return "บัญชียังไม่ได้ยืนยันอีเมล";
  }

  if (
    text.toLowerCase().includes(
      "invalid api key"
    )
  ) {
    return "Publishable Key ไม่ถูกต้อง กรุณาตรวจสอบ supabase-config.js";
  }

  return text;
}

/* =========================================================
   SECURITY
========================================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]
  );
}

/* =========================================================
   START
========================================================= */

init();