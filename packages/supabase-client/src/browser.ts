"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { getLuminaSupabaseEnv } from "./env";

/** Browser / Client Component Supabase client (anon key only). */
export function createLuminaBrowserClient(): ReturnType<
  typeof createBrowserClient<Database>
> {
  const { url, anonKey } = getLuminaSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
