// Supabase → Project Settings → API
const SUPABASE_URL = "https://wkozeuxyhqcmiatssviq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NENuHV7DiTHuYcQ6Sle6Xg_mhUfd5SZ";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
