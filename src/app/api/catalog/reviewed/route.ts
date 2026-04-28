import type { Json } from "@lumina/supabase-client";
import { NextResponse } from "next/server";

import {
  assertJsonViewSuperAdminAuth,
  assertJsonViewWriteAuth,
  isJsonViewSupabaseConfigured,
} from "@/lib/auth-guard";
import { jsonViewAdminDb } from "@/lib/jsonview-admin-db";

type PublishBody = { jobId?: string; partIndexes?: number[] };

/** Admin view: list imported/reviewed parts to publish. */
export async function GET() {
  const auth = await assertJsonViewWriteAuth();
  if (auth) return auth;
  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  }

  const supabase = await jsonViewAdminDb();
  const { data, error } = await supabase
    .from("catalog_ingest_job_parts")
    .select("job_id, part_index, status, row_count, updated_at, catalog_ingest_jobs!inner(catalog_source, label)")
    .eq("status", "imported")
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reviewedParts: data ?? [] });
}

/** Super admin: publish reviewed parts into staging.books (temporary queue before final catalog promote). */
export async function POST(request: Request) {
  const auth = await assertJsonViewSuperAdminAuth();
  if (auth) return auth;
  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  }

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const jobId = body.jobId?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const supabase = await jsonViewAdminDb();
  let q = supabase
    .from("catalog_ingest_job_parts")
    .select("part_index, payload_json")
    .eq("job_id", jobId)
    .eq("status", "imported")
    .order("part_index", { ascending: true });

  if (Array.isArray(body.partIndexes) && body.partIndexes.length > 0) {
    q = q.in("part_index", body.partIndexes);
  }
  const { data: parts, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: Array<{ catalog_source: string; source_sku: string; payload: Json }> = [];
  for (const p of parts ?? []) {
    if (!Array.isArray(p.payload_json)) continue;
    for (const item of p.payload_json) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const source = typeof o.catalog_source === "string" ? o.catalog_source.trim() : "";
      const sku = typeof o.sku === "string" ? o.sku.trim() : "";
      if (!source || !sku) continue;
      rows.push({ catalog_source: source, source_sku: sku, payload: item as Json });
    }
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows in reviewed parts" }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .schema("staging")
    .from("books")
    .upsert(rows, { onConflict: "catalog_source,source_sku" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, staged: rows.length, parts: (parts ?? []).length });
}

