import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@lumina/supabase-client";

function asDb(supabase: unknown): SupabaseClient<Database> {
  return supabase as SupabaseClient<Database>;
}

/** Diff evaluation for Phase 3 scrape observability (cron + CLI reports). */
export function evaluateCatalogDiffAlert(opts: {
  previousRowCount: number | null;
  rowCount: number;
  alertMinAbsDiff: number | null;
  alertMinPctDiff: number | null;
}): {
  diffAbs: number | null;
  diffPct: number | null;
  alertTriggered: boolean;
  alertReason: string | null;
} {
  const prev = opts.previousRowCount;
  if (prev === null) {
    return {
      diffAbs: null,
      diffPct: null,
      alertTriggered: false,
      alertReason: null,
    };
  }

  const diffAbs = Math.abs(opts.rowCount - prev);
  const signed = opts.rowCount - prev;
  const diffPct =
    prev !== 0 ? Math.round((10000 * signed) / prev) / 100 : null;

  let alertTriggered = false;
  const reasons: string[] = [];

  const minAbs = opts.alertMinAbsDiff;
  if (minAbs != null && diffAbs >= minAbs) {
    alertTriggered = true;
    reasons.push(`|d|=${diffAbs} >= ${minAbs}`);
  }

  const minPct = opts.alertMinPctDiff;
  if (
    minPct != null &&
    prev > 0 &&
    diffPct !== null &&
    Math.abs(diffPct) >= Number(minPct)
  ) {
    alertTriggered = true;
    reasons.push(`|d%|=${Math.abs(diffPct)} >= ${minPct}`);
  }

  return {
    diffAbs,
    diffPct,
    alertTriggered,
    alertReason: alertTriggered ? reasons.join("; ") : null,
  };
}

/** Subset of `catalog_sources` used when recording a run. */
export interface CatalogSourceSnapshot {
  id: string;
  slug: string;
  last_row_count: number | null;
  alert_min_abs_diff: number | null;
  alert_min_pct_diff: number | string | null;
}

/** Insert run row, optional alert, refresh catalog_sources counters. */
export async function persistCatalogSnapshot(
  supabase: unknown,
  source: CatalogSourceSnapshot,
  outcome: {
    status: "success" | "error";
    rowCount: number;
    errorMessage?: string | null;
  },
): Promise<{ runId: string; alertTriggered: boolean }> {
  const sb = asDb(supabase);
  const prev = source.last_row_count;
  const rowForEval = outcome.status === "success" ? outcome.rowCount : 0;
  const diff = evaluateCatalogDiffAlert({
    previousRowCount: prev,
    rowCount: rowForEval,
    alertMinAbsDiff: source.alert_min_abs_diff,
    alertMinPctDiff:
      source.alert_min_pct_diff != null && source.alert_min_pct_diff !== ""
        ? Number(source.alert_min_pct_diff)
        : null,
  });

  const finishedAt = new Date().toISOString();

  const { data: run, error: runErr } = await sb
    .from("catalog_scrape_runs")
    .insert({
      source_id: source.id,
      status: outcome.status,
      row_count: outcome.status === "success" ? outcome.rowCount : 0,
      previous_row_count: prev,
      diff_abs: diff.diffAbs,
      diff_pct: diff.diffPct != null ? String(diff.diffPct) : null,
      alert_triggered: diff.alertTriggered,
      alert_reason: diff.alertReason,
      error_message: outcome.errorMessage ?? null,
      finished_at: finishedAt,
    })
    .select("id")
    .single();

  if (runErr || !run) {
    throw new Error(runErr?.message ?? "catalog_scrape_runs insert failed");
  }

  if (diff.alertTriggered && diff.alertReason) {
    await sb.from("catalog_diff_alerts").insert({
      source_id: source.id,
      run_id: run.id,
      message: diff.alertReason,
    });
  }

  const updateLast =
    outcome.status === "success"
      ? { last_row_count: outcome.rowCount, last_run_at: finishedAt }
      : { last_run_at: finishedAt };

  await sb.from("catalog_sources").update(updateLast).eq("id", source.id);

  return { runId: run.id, alertTriggered: diff.alertTriggered };
}