import { createLuminaServiceRoleClient } from "@lumina/supabase-client/server";
import { partitionScrapedBooks } from "@lumina/shared-types";
import { NextResponse } from "next/server";

import type { CatalogSourceSnapshot } from "@/lib/catalog-snapshot";
import { persistCatalogSnapshot } from "@/lib/catalog-snapshot";

/** Scheduled HTTP JSON catalogue snapshots (pg_cron POST with JSONVIEW_CRON_SECRET). */
export async function POST(request: Request) {
  const expected = process.env.JSONVIEW_CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "JSONVIEW_CRON_SECRET is not configured on this deployment." },
      { status: 503 },
    );
  }

  const bearer =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ??
    "";
  const alt = request.headers.get("x-jsonview-cron")?.trim() ?? "";
  const got = bearer || alt;
  if (!got || got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createLuminaServiceRoleClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "service client";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: sources, error: listErr } = await supabase
    .from("catalog_sources")
    .select(
      "id, slug, source_kind, fetch_url, fetch_headers, enabled, last_row_count, alert_min_abs_diff, alert_min_pct_diff",
    )
    .eq("enabled", true)
    .eq("source_kind", "http_json_array");

  if (listErr) {
    console.error("cron-ingest catalog_sources:", listErr);
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const rows = sources ?? [];
  const results: {
    slug: string;
    ok: boolean;
    validCount?: number;
    runId?: string;
    alert?: boolean;
    error?: string;
  }[] = [];

  for (const src of rows) {
    if (!src.fetch_url?.trim()) {
      results.push({
        slug: src.slug,
        ok: false,
        error: "fetch_url is empty",
      });
      continue;
    }

    const snap: CatalogSourceSnapshot = {
      id: src.id,
      slug: src.slug,
      last_row_count: src.last_row_count,
      alert_min_abs_diff: src.alert_min_abs_diff,
      alert_min_pct_diff: src.alert_min_pct_diff,
    };

    try {
      const hdrs: Record<string, string> = { Accept: "application/json" };
      const raw = src.fetch_headers as Record<string, unknown> | null;
      if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === "string" && v.length > 0) hdrs[k] = v;
        }
      }

      const res = await fetch(src.fetch_url, {
        headers: hdrs,
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        await persistCatalogSnapshot(supabase, snap, {
          status: "error",
          rowCount: 0,
          errorMessage: `HTTP ${res.status} ${res.statusText}`,
        });
        results.push({
          slug: src.slug,
          ok: false,
          error: `HTTP ${res.status}`,
        });
        continue;
      }

      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        await persistCatalogSnapshot(supabase, snap, {
          status: "error",
          rowCount: 0,
          errorMessage: "Response is not JSON",
        });
        results.push({ slug: src.slug, ok: false, error: "invalid JSON" });
        continue;
      }

      const { valid } = partitionScrapedBooks(
        Array.isArray(parsed) ? parsed : [parsed],
      );
      const out = await persistCatalogSnapshot(supabase, snap, {
        status: "success",
        rowCount: valid.length,
      });
      results.push({
        slug: src.slug,
        ok: true,
        validCount: valid.length,
        runId: out.runId,
        alert: out.alertTriggered,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      try {
        await persistCatalogSnapshot(supabase, snap, {
          status: "error",
          rowCount: 0,
          errorMessage: msg,
        });
      } catch (ie: unknown) {
        console.error("persistCatalogSnapshot:", ie);
      }
      results.push({ slug: src.slug, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    sources: results,
  });
}
