import { env } from "@lumina/supabase-client/env";
import { createLuminaServerClient } from "@lumina/supabase-client/server";
import { NextResponse } from "next/server";

/** True when URL + anon key are set — save/merge target Supabase instead of local files. */
export function isJsonViewSupabaseConfigured(): boolean {
  return (
    Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim())
  );
}

/**
 * When Supabase public env is set, write APIs require a signed-in user with
 * `app_metadata.role === "admin"` (same convention as book-store-brain).
 * Leave URL + anon key empty for unrestricted local tooling.
 */
export async function assertJsonViewWriteAuth(): Promise<NextResponse | null> {
  const configured = isJsonViewSupabaseConfigured();
  if (!configured) {
    return null;
  }

  const supabase = await createLuminaServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Unauthorized: sign in with an admin account, or unset Supabase URL/anon key for local-only mode.",
      },
      { status: 401 },
    );
  }

  const appRole = (user.app_metadata as Record<string, unknown> | undefined)
    ?.role;
  if (appRole !== "admin" && appRole !== "super_admin") {
    return NextResponse.json(
      {
        error:
          "Forbidden: app_metadata.role must be admin or super_admin for json-view writes.",
      },
      { status: 403 },
    );
  }

  return null;
}

export async function assertJsonViewSuperAdminAuth(): Promise<NextResponse | null> {
  const configured = isJsonViewSupabaseConfigured();
  if (!configured) {
    return NextResponse.json(
      { error: "Supabase auth is required for this action." },
      { status: 400 },
    );
  }

  const supabase = await createLuminaServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: sign in with a super admin account." },
      { status: 401 },
    );
  }

  const appRole = (user.app_metadata as Record<string, unknown> | undefined)
    ?.role;
  if (appRole !== "super_admin") {
    return NextResponse.json(
      {
        error:
          "Forbidden: app_metadata.role must be super_admin for publish actions.",
      },
      { status: 403 },
    );
  }

  return null;
}
