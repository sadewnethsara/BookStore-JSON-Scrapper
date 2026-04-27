import type { Database, Json } from "@lumina/supabase-client";
import { createLuminaServiceRoleClient } from "@lumina/supabase-client/server";
import { partitionScrapedBooks } from "@lumina/shared-types";
import { NextResponse } from "next/server";

import { dedupeBySku } from "@/lib/dedupe-by-sku";
import {
  getJsonViewWorkerSecret,
  isJsonViewWorkerRequestAuthorized,
} from "@/lib/jsonview-worker-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

type JobStatus = (typeof JOB_STATUSES)[number];

type WorkerBody =
  | {
      type: "heartbeat";
      status?: JobStatus;
      rows_scraped?: number;
      rows_total_est?: number | null;
      parts_total?: number;
    }
  | { type: "part"; partIndex: number; items: unknown[] }
  | { type: "complete" }
  | { type: "fail"; error_message: string };

function parseWorkerBody(raw: unknown): WorkerBody | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (type === "heartbeat") {
    const status = o.status as JobStatus | undefined;
    if (
      status !== undefined &&
      !JOB_STATUSES.includes(status as JobStatus)
    ) {
      return null;
    }
    return {
      type: "heartbeat",
      status,
      rows_scraped:
        typeof o.rows_scraped === "number" && o.rows_scraped >= 0
          ? Math.floor(o.rows_scraped)
          : undefined,
      rows_total_est:
        o.rows_total_est === null
          ? null
          : typeof o.rows_total_est === "number" && o.rows_total_est >= 0
            ? Math.floor(o.rows_total_est)
            : undefined,
      parts_total:
        typeof o.parts_total === "number" && o.parts_total >= 0
          ? Math.floor(o.parts_total)
          : undefined,
    };
  }
  if (type === "part") {
    if (!Array.isArray(o.items)) {
      return null;
    }
    const partIndex =
      typeof o.partIndex === "number" && o.partIndex >= 1
        ? Math.floor(o.partIndex)
        : typeof o.partIndex === "string" && /^\d+$/.test(o.partIndex)
          ? Number.parseInt(o.partIndex, 10)
          : NaN;
    if (!Number.isFinite(partIndex) || partIndex < 1) {
      return null;
    }
    return { type: "part", partIndex, items: o.items };
  }
  if (type === "complete") {
    return { type: "complete" };
  }
  if (type === "fail") {
    const msg = o.error_message;
    if (typeof msg !== "string" || !msg.trim()) {
      return null;
    }
    return { type: "fail", error_message: msg.trim() };
  }
  return null;
}

type RouteCtx = { params: Promise<{ jobId: string }> };

type CatalogIngestJobUpdate =
  Database["public"]["Tables"]["catalog_ingest_jobs"]["Update"];

/**
 * Worker (OCI VM, etc.): POST JSON body with `type` heartbeat | part | complete | fail.
 * Auth: Authorization: Bearer JSONVIEW_WORKER_SECRET or X-Jsonview-Worker.
 */
export async function POST(request: Request, ctx: RouteCtx) {
  if (!getJsonViewWorkerSecret()) {
    return NextResponse.json(
      { error: "JSONVIEW_WORKER_SECRET is not configured on this deployment." },
      { status: 503 },
    );
  }
  if (!isJsonViewWorkerRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await ctx.params;
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = parseWorkerBody(raw);
  if (!body) {
    return NextResponse.json(
      {
        error:
          "Invalid body: expected { type: heartbeat|part|complete|fail, ... }",
      },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createLuminaServiceRoleClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "service client";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const { data: job, error: jobErr } = await supabase
    .from("catalog_ingest_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) {
    console.error("worker job fetch:", jobErr);
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const terminal = job.status === "completed" || job.status === "failed" || job.status === "cancelled";
  if (terminal && body.type !== "heartbeat") {
    return NextResponse.json(
      { error: "Job is already completed, failed, or cancelled." },
      { status: 409 },
    );
  }
  if (terminal && body.type === "heartbeat") {
    return NextResponse.json({ ok: true, ignored: true, job });
  }

  const now = new Date().toISOString();

  if (body.type === "heartbeat") {
    const patch: CatalogIngestJobUpdate = {
      last_heartbeat_at: now,
      updated_at: now,
    };
    if (body.rows_scraped !== undefined) {
      patch.rows_scraped = body.rows_scraped;
    }
    if (body.rows_total_est !== undefined) {
      patch.rows_total_est = body.rows_total_est;
    }
    if (body.parts_total !== undefined) {
      patch.parts_total = body.parts_total;
    }
    let nextStatus = body.status;
    if (nextStatus === "cancelled") {
      return NextResponse.json(
        { error: "Workers cannot set cancelled status" },
        { status: 403 },
      );
    }
    if (nextStatus === undefined && job.status === "pending") {
      nextStatus = "running";
    }
    if (nextStatus !== undefined) {
      patch.status = nextStatus;
    }
    const effectiveStatus = patch.status ?? job.status;
    if (effectiveStatus === "running" && !job.started_at) {
      patch.started_at = now;
    }

    const { data: updated, error } = await supabase
      .from("catalog_ingest_jobs")
      .update(patch)
      .eq("id", jobId)
      .select("*")
      .single();

    if (error) {
      console.error("worker heartbeat:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, job: updated });
  }

  if (body.type === "fail") {
    const { data: updated, error } = await supabase
      .from("catalog_ingest_jobs")
      .update({
        status: "failed",
        error_message: body.error_message,
        finished_at: now,
        updated_at: now,
        last_heartbeat_at: now,
      })
      .eq("id", jobId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, job: updated });
  }

  if (body.type === "complete") {
    const { data: updated, error } = await supabase
      .from("catalog_ingest_jobs")
      .update({
        status: "completed",
        finished_at: now,
        updated_at: now,
        last_heartbeat_at: now,
      })
      .eq("id", jobId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, job: updated });
  }

  // part
  if (job.status === "cancelled") {
    return NextResponse.json({ error: "Job was cancelled" }, { status: 409 });
  }

  const { valid, errors } = partitionScrapedBooks(body.items);
  if (valid.length === 0) {
    return NextResponse.json(
      {
        error: "No valid ScrapedBook rows in items",
        rowErrors: errors.slice(0, 30),
        rowErrorCount: errors.length,
      },
      { status: 400 },
    );
  }

  const source = job.catalog_source as string;
  const withSource = valid.map((item) => ({
    ...item,
    catalog_source: source,
  }));
  const deduped = dedupeBySku(withSource);
  const payload = deduped as unknown as Json;

  const partRow = {
    job_id: jobId,
    part_index: body.partIndex,
    status: "ready" as const,
    row_count: deduped.length,
    payload_json: payload,
    updated_at: now,
  };

  const { error: partErr } = await supabase
    .from("catalog_ingest_job_parts")
    .upsert(partRow, { onConflict: "job_id,part_index" });

  if (partErr) {
    console.error("worker part upsert:", partErr);
    return NextResponse.json({ error: partErr.message }, { status: 500 });
  }

  const jobPatch: CatalogIngestJobUpdate = {
    last_heartbeat_at: now,
    updated_at: now,
  };
  if (job.status === "pending") {
    jobPatch.status = "running";
    jobPatch.started_at = now;
  }

  const { data: updatedJob, error: jobUpErr } = await supabase
    .from("catalog_ingest_jobs")
    .update(jobPatch)
    .eq("id", jobId)
    .select("*")
    .single();

  if (jobUpErr) {
    console.error("worker job touch:", jobUpErr);
    return NextResponse.json({ error: jobUpErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    job: updatedJob,
    partIndex: body.partIndex,
    rowCount: deduped.length,
    skippedInvalid: errors.length,
  });
}
