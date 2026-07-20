import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/+esm';
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from './supabase-config.js';

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

// Temporary compatibility for pages that still expect a global client.
window.supabaseClient = supabaseClient;
