import { NextResponse } from "next/server";

import { assertJsonViewWriteAuth, isJsonViewSupabaseConfigured } from "@/lib/auth-guard";
import { jsonViewAdminDb } from "@/lib/jsonview-admin-db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ jobId: string; partIndex: string }> };

type PatchBody = { status?: string };

/** Admin: mark a part imported/skipped after you have pushed rows to staging elsewhere (Phase 7 can automate). */
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

  const { jobId, partIndex: partIndexRaw } = await ctx.params;
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const partIndex = Number.parseInt(partIndexRaw, 10);
  if (!Number.isFinite(partIndex) || partIndex < 1) {
    return NextResponse.json({ error: "Invalid part index" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status !== "imported" && body.status !== "skipped") {
    return NextResponse.json(
      { error: 'status must be "imported" or "skipped"' },
      { status: 400 },
    );
  }

  const supabase = await jsonViewAdminDb();
  const { data: part, error: readErr } = await supabase
    .from("catalog_ingest_job_parts")
    .select("id, status")
    .eq("job_id", jobId)
    .eq("part_index", partIndex)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!part) {
    return NextResponse.json({ error: "Part not found" }, { status: 404 });
  }
  if (part.status !== "ready") {
    return NextResponse.json(
      { error: "Only parts in ready status can be marked imported/skipped" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("catalog_ingest_job_parts")
    .update({ status: body.status, updated_at: now })
    .eq("job_id", jobId)
    .eq("part_index", partIndex)
    .select("*")
    .single();

  if (error) {
    console.error("part status update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, part: updated });
}
