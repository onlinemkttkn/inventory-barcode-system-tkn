// TKN POS / ERP - Supabase Config
// Compatible with classic <script> loading (non-module).

(function () {
  'use strict';

  const SUPABASE_URL = 'https://wkozeuxyhqcmiatssviq.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_NENuHV7DiTHuYcQ6Sle6Xg_mhUfd5SZ';

  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;
  window.SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error(
      'Supabase library is not loaded. Load @supabase/supabase-js before supabase-config.js'
    );
    return;
  }

  window.supabaseClient = window.supabase.createClient(
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

  window.tknSupabaseClient = window.supabaseClient;
})();
