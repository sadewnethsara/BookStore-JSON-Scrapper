import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { getLuminaSupabaseEnv } from "./env";

/** Server Components / Route Handlers — uses Next cookies. */
export async function createLuminaServerClient(): Promise<
  ReturnType<typeof createServerClient<Database>>
> {
  const cookieStore = await cookies();
  const { url, anonKey } = getLuminaSupabaseEnv();

  const setAll: SetAllCookies = (cookiesToSet) => {
    try {
      cookiesToSet.forEach(({ name, value, options }) =>
        cookieStore.set(name, value, options),
      );
    } catch {
      /* ignore when called from a context that forbids setting cookies */
    }
  };

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll,
    },
  });
}

/** Service role — bypasses RLS (cron ingest, maintenance). Requires SUPABASE_SERVICE_ROLE_KEY. */
export function createLuminaServiceRoleClient(): ReturnType<
  typeof createClient<Database>
> {
  const { url } = getLuminaSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url.trim() || !key) {
    throw new Error(
      "createLuminaServiceRoleClient: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, key);
}
