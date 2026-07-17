// ============================================================
// TKN POS / ERP — Supabase Config v1.0.0
// ใช้ร่วมกันทั้งระบบ
// ============================================================

const SUPABASE_URL =
  "https://wkozeuxyhqcmiatssviq.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_NENuHV7DiTHuYcQ6Sle6Xg_mhUfd5SZ";

function validateSupabaseConfig() {
  const errors = [];

  if (
    typeof SUPABASE_URL !== "string" ||
    !SUPABASE_URL.startsWith("https://") ||
    !SUPABASE_URL.includes(".supabase.co")
  ) {
    errors.push("Project URL ไม่ถูกต้อง");
  }

  if (
    typeof SUPABASE_PUBLISHABLE_KEY !== "string" ||
    SUPABASE_PUBLISHABLE_KEY.length < 20 ||
    SUPABASE_PUBLISHABLE_KEY.includes("ใส่_")
  ) {
    errors.push("Publishable Key ไม่ถูกต้อง");
  }

  if (SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")) {
    errors.push("ห้ามใช้ Secret Key ในหน้าเว็บ");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

const TKN_CONFIG_STATUS = validateSupabaseConfig();

if (!TKN_CONFIG_STATUS.valid) {
  console.error(
    "Supabase configuration error:",
    TKN_CONFIG_STATUS.errors.join(", ")
  );
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "tkn-pos-auth-v1"
    },
    global: {
      headers: {
        "X-Application-Name": "TKN-POS-v1.0.0"
      }
    }
  }
);

window.TKN_APP_CONFIG = {
  version: "1.0.0",
  ready: TKN_CONFIG_STATUS.valid,
  errors: TKN_CONFIG_STATUS.errors
};
