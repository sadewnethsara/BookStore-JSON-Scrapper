import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lumina/supabase-client";
import { createLuminaServerClient } from "@lumina/supabase-client/server";

/**
 * Cookie-backed Supabase client with `Database` typing for `.from()`.
 * The raw SSR client’s inferred generics lag new tables; cast keeps Phase 5 routes type-safe.
 */
export async function jsonViewAdminDb(): Promise<SupabaseClient<Database>> {
  return (await createLuminaServerClient()) as unknown as SupabaseClient<Database>;
}
