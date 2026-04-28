import { NextResponse } from "next/server";

import {
  getJsonViewWorkerSecret,
  isJsonViewWorkerRequestAuthorized,
} from "@/lib/jsonview-worker-auth";
import { jsonViewAdminDb } from "@/lib/jsonview-admin-db";
import { isJsonViewSupabaseConfigured } from "@/lib/auth-guard";

/**
 * GET /api/catalog/pending-job
 *
 * Used by the VM daemon worker to claim the next pending ingest job.
 * Auth: Authorization: Bearer JSONVIEW_WORKER_SECRET
 *
 * Returns:
 *   { ok: true, job: null }          — no pending jobs
 *   { ok: true, job: { id, catalog_source, config, ... } }  — job claimed (status → running)
 *   401 / 503                        — auth or config error
 */
export async function GET(request: Request) {
  if (!getJsonViewWorkerSecret()) {
    return NextResponse.json(
      { error: "JSONVIEW_WORKER_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!isJsonViewWorkerRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isJsonViewSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = await jsonViewAdminDb();

  // Pick the oldest pending job that has no recent heartbeat (avoids double-pick).
  // A running job with no heartbeat for > 90 min is considered stale/crashed.
  // (scraping 700+ products takes ~20 min; heartbeats fire every 90s from the daemon)
  const { data: jobs, error } = await supabase
    .from("catalog_ingest_jobs")
    .select("id, catalog_source, label, config, rows_total_est, parts_total, created_at")
    .or(
      "status.eq.pending," +
      "and(status.eq.running,last_heartbeat_at.lt." +
        new Date(Date.now() - 90 * 60 * 1000).toISOString() +
      ")",
    )
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("pending-job query:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ ok: true, job: null });
  }

  const job = jobs[0];
  const now = new Date().toISOString();

  // Claim the job: set status=running, started_at, last_heartbeat_at
  const { error: claimErr } = await supabase
    .from("catalog_ingest_jobs")
    .update({
      status: "running",
      started_at: now,
      last_heartbeat_at: now,
      updated_at: now,
    })
    .eq("id", job.id);

  if (claimErr) {
    console.error("pending-job claim:", claimErr);
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job });
}
