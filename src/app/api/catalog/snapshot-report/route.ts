import type { Database } from "@lumina/supabase-client";
import { createLuminaServerClient } from "@lumina/supabase-client/server";
import { NextResponse } from "next/server";

import { assertJsonViewWriteAuth, isJsonViewSupabaseConfigured } from "@/lib/auth-guard";
import type { CatalogSourceSnapshot } from "@/lib/catalog-snapshot";
import { persistCatalogSnapshot } from "@/lib/catalog-snapshot";

type SourcePick = Pick<
  Database["public"]["Tables"]["catalog_sources"]["Row"],
  "id" | "slug" | "last_row_count" | "alert_min_abs_diff" | "alert_min_pct_diff"
>;

/**
 * POST `{ "sourceSlug": "rasakatha", "rowCount": 1200, "error"?: "..." }`
 * After a CLI scrape, report counts for diff / alerts (Phase 3).
 */
export async function POST(request: Request) {
  const auth = await assertJsonViewWriteAuth();
  if (auth) {
    return auth;
  }

  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured; nothing to record." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceSlug = (body as { sourceSlug?: unknown }).sourceSlug;
  const rowCountRaw = (body as { rowCount?: unknown }).rowCount;
  const err = (body as { error?: unknown }).error;

  if (typeof sourceSlug !== "string" || !sourceSlug.trim()) {
    return NextResponse.json({ error: "sourceSlug (string) is required." }, { status: 400 });
  }

  const hasCount = typeof rowCountRaw === "number" && Number.isFinite(rowCountRaw);
  const errorMessage =
    typeof err === "string" && err.trim() ? err.trim() : null;

  if (!hasCount && !errorMessage) {
    return NextResponse.json(
      { error: "Provide rowCount (number) and/or error (string)." },
      { status: 400 },
    );
  }

  const supabase = await createLuminaServerClient();
  const { data: rawSrc, error: findErr } = await supabase
    .from("catalog_sources")
    .select(
      "id, slug, last_row_count, alert_min_abs_diff, alert_min_pct_diff",
    )
    .eq("slug", sourceSlug.trim())
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  const src = rawSrc as SourcePick | null;
  if (!src) {
    return NextResponse.json(
      { error: `Unknown catalog source slug: ${sourceSlug}` },
      { status: 404 },
    );
  }

  const snap: CatalogSourceSnapshot = {
    id: src.id,
    slug: src.slug,
    last_row_count: src.last_row_count,
    alert_min_abs_diff: src.alert_min_abs_diff,
    alert_min_pct_diff: src.alert_min_pct_diff,
  };

  try {
    const out = await persistCatalogSnapshot(supabase, snap, {
      status: errorMessage ? "error" : "success",
      rowCount: hasCount ? (rowCountRaw as number) : 0,
      errorMessage,
    });
    return NextResponse.json({
      ok: true,
      runId: out.runId,
      alert: out.alertTriggered,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "persist failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}