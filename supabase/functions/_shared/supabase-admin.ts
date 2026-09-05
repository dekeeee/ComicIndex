import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireEnv } from "./config.ts";

export type { SupabaseClient };

/**
 * service role クライアント。書き込みは全てこれで行う（anon で insert しない）。
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Supabase の Edge Runtime が自動で注入する。
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
