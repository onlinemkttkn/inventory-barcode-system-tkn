// ============================================================
// SUPABASE CONFIG — PHASE 8.5
// ร้านเถ้าแก่น้อยชลบุรี
// ใช้ไฟล์นี้ร่วมกันทั้งระบบ
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
    errors.push("Publishable Key ไม่ถูกต้องหรือยังไม่ได้ตั้งค่า");
  }

  if (SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")) {
    errors.push("ห้ามใช้ Secret Key ในหน้าเว็บ");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const configStatus = validateSupabaseConfig();

if (!configStatus.valid) {
  console.error(
    "Supabase configuration error:",
    configStatus.errors.join(", ")
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
      storageKey: "tkn-inventory-auth",
    },

    global: {
      headers: {
        "X-Application-Name": "TKN-Inventory",
      },
    },
  }
);

window.TKN_SUPABASE_CONFIG = {
  ready: configStatus.valid,
  errors: configStatus.errors,
  url: SUPABASE_URL,
};
