import { NextResponse } from "next/server";

import { assertJsonViewWriteAuth, isJsonViewSupabaseConfigured } from "@/lib/auth-guard";
import { jsonViewAdminDb } from "@/lib/jsonview-admin-db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badId(): NextResponse {
  return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
}

type RouteCtx = { params: Promise<{ jobId: string }> };

/** Admin: job + parts (1-based part_index order). Use `?include_payload=1` to return part JSON bodies. */
export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await assertJsonViewWriteAuth();
  if (auth) {
    return auth;
  }
  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 400 },
    );
  }

  const { jobId } = await ctx.params;
  if (!UUID_RE.test(jobId)) {
    return badId();
  }

  const supabase = await jsonViewAdminDb();
  const { data: job, error: jobErr } = await supabase
    .from("catalog_ingest_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) {
    console.error("catalog_ingest_jobs get:", jobErr);
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const includePayload =
    searchParams.get("include_payload") === "1" ||
    searchParams.get("include_payload") === "true";

  const { data: parts, error: partsErr } = includePayload
    ? await supabase
        .from("catalog_ingest_job_parts")
        .select(
          "id, job_id, part_index, status, row_count, payload_json, storage_path, created_at, updated_at",
        )
        .eq("job_id", jobId)
        .order("part_index", { ascending: true })
    : await supabase
        .from("catalog_ingest_job_parts")
        .select(
          "id, job_id, part_index, status, row_count, storage_path, created_at, updated_at",
        )
        .eq("job_id", jobId)
        .order("part_index", { ascending: true });

  if (partsErr) {
    console.error("catalog_ingest_job_parts list:", partsErr);
    return NextResponse.json({ error: partsErr.message }, { status: 500 });
  }

  const partSummary = {
    pending: 0,
    ready: 0,
    imported: 0,
    skipped: 0,
  };
  for (const p of parts ?? []) {
    const s = p.status as keyof typeof partSummary;
    if (s in partSummary) {
      partSummary[s] += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    job,
    parts: parts ?? [],
    partSummary,
  });
}

type PatchBody = { status?: string };

/** Admin: cancel a pending or running job. */
export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await assertJsonViewWriteAuth();
  if (auth) {
    return auth;
  }
  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 400 },
    );
  }

  const { jobId } = await ctx.params;
  if (!UUID_RE.test(jobId)) {
    return badId();
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "cancelled") {
    return NextResponse.json(
      { error: 'Only { "status": "cancelled" } is supported' },
      { status: 400 },
    );
  }

  const supabase = await jsonViewAdminDb();
  const { data: current, error: readErr } = await supabase
    .from("catalog_ingest_jobs")
    .select("id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (current.status !== "pending" && current.status !== "running") {
    return NextResponse.json(
      { error: "Only pending or running jobs can be cancelled" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: job, error } = await supabase
    .from("catalog_ingest_jobs")
    .update({
      status: "cancelled",
      finished_at: now,
      updated_at: now,
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (error) {
    console.error("catalog_ingest_jobs cancel:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job });
}
