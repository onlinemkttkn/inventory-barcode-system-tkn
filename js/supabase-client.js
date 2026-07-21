import { createClient } from
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL =
  window.SUPABASE_URL ||
  'https://wkozeuxyhqcmiatssviq.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  window.SUPABASE_PUBLISHABLE_KEY ||
  window.SUPABASE_ANON_KEY ||
  'sb_publishable_NENuHV7DiTHuYcQ6Sle6Xg_mhUfd5SZ';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Supabase URL หรือ Publishable Key ไม่ถูกกำหนด'
  );
}

export const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

window.supabaseClient = supabaseClient;
window.tknSupabaseClient = supabaseClient;
