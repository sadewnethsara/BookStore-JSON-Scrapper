import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lumina/supabase-client";
import { createLuminaServiceRoleClient } from "@lumina/supabase-client/server";

/**
 * Service-role Supabase client for admin API routes.
 * Uses SUPABASE_SERVICE_ROLE_KEY — bypasses RLS so catalog_ingest_jobs
 * INSERT/UPDATE/SELECT work regardless of table RLS policies.
 * All callers must gate access with assertJsonViewWriteAuth() first.
 */
export async function jsonViewAdminDb(): Promise<SupabaseClient<Database>> {
  return createLuminaServiceRoleClient() as unknown as SupabaseClient<Database>;
}
