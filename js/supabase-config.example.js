const SUPABASE_URL =
  "https://YOUR_PROJECT.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "YOUR_PUBLISHABLE_KEY";

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
  }
);
