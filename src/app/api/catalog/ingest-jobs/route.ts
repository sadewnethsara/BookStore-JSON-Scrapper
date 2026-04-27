import type { Database, Json } from "@lumina/supabase-client";
import { NextResponse } from "next/server";

import { assertJsonViewWriteAuth, isJsonViewSupabaseConfigured } from "@/lib/auth-guard";
import { jsonViewAdminDb } from "@/lib/jsonview-admin-db";

type CatalogIngestJobInsert =
  Database["public"]["Tables"]["catalog_ingest_jobs"]["Insert"];

const JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

function parseLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "50", 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 200);
}

/** Admin: list ingest jobs (newest first). Requires Supabase + admin session. */
export async function GET(request: Request) {
  const auth = await assertJsonViewWriteAuth();
  if (auth) {
    return auth;
  }
  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured; ingest jobs require the database." },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim();
  const limit = parseLimit(searchParams.get("limit"));

  const supabase = await jsonViewAdminDb();
  let q = supabase
    .from("catalog_ingest_jobs")
    .select(
      "id, catalog_source, label, status, rows_total_est, rows_scraped, parts_total, error_message, created_at, updated_at, started_at, finished_at, last_heartbeat_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])) {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) {
    console.error("catalog_ingest_jobs list:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jobs: data ?? [] });
}

type CreateBody = {
  catalog_source?: string;
  label?: string | null;
  config?: Record<string, unknown>;
  rows_total_est?: number | null;
  parts_total?: number;
  status?: string;
};

/** Admin: create a job row for a worker to claim and fill (Phase 5 contract). */
export async function POST(request: Request) {
  const auth = await assertJsonViewWriteAuth();
  if (auth) {
    return auth;
  }
  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured; ingest jobs require the database." },
      { status: 400 },
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const catalog_source = body.catalog_source?.trim();
  if (!catalog_source) {
    return NextResponse.json({ error: "catalog_source is required" }, { status: 400 });
  }

  const status =
    body.status?.trim() === "running" ? "running" : ("pending" as const);
  if (body.status && !JOB_STATUSES.includes(body.status as (typeof JOB_STATUSES)[number])) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const parts_total =
    typeof body.parts_total === "number" && body.parts_total >= 0
      ? Math.floor(body.parts_total)
      : 0;

  const rows_total_est =
    typeof body.rows_total_est === "number" && body.rows_total_est >= 0
      ? Math.floor(body.rows_total_est)
      : null;

  const config = (body.config ?? {}) as Json;
  const label = body.label?.trim() || null;

  const supabase = await jsonViewAdminDb();
  const insertRow = {
    catalog_source,
    label,
    config,
    rows_total_est,
    parts_total,
    status,
    started_at: status === "running" ? new Date().toISOString() : null,
    last_heartbeat_at: status === "running" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("catalog_ingest_jobs")
    .insert(insertRow satisfies CatalogIngestJobInsert)
    .select(
      "id, catalog_source, label, status, config, rows_total_est, rows_scraped, parts_total, created_at",
    )
    .single();

  if (error) {
    console.error("catalog_ingest_jobs insert:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job: data }, { status: 201 });
}
