"use client";

import { DashboardNav } from "@/components/dashboard-nav";
import { WorkerEnvSnippet } from "@/components/worker-env-snippet";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type JobFull = Record<string, unknown> & {
  id: string;
  catalog_source: string;
  label: string | null;
  status: string;
  config?: Record<string, unknown>;
  rows_total_est: number | null;
  rows_scraped: number | null;
  parts_total: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_heartbeat_at: string | null;
};

type PartRow = {
  id: string;
  job_id: string;
  part_index: number;
  status: string;
  row_count: number;
  payload_json?: unknown;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const REVIEW_QUEUE_KEY = "review_queue_preload";

export default function IngestJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = typeof params.jobId === "string" ? params.jobId : "";

  const [job, setJob] = useState<JobFull | null>(null);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [partSummary, setPartSummary] = useState<Record<string, number> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => jobId.length > 0);

  useEffect(() => {
    if (!jobId) return;
    const ac = new AbortController();
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/catalog/ingest-jobs/${jobId}?include_payload=1`,
          { signal: ac.signal },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          job?: JobFull;
          parts?: PartRow[];
          partSummary?: Record<string, number>;
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
          setJob(null);
          setParts([]);
          setPartSummary(null);
          return;
        }
        setJob(data.job ?? null);
        setParts(data.parts ?? []);
        setPartSummary(data.partSummary ?? null);
      } catch {
        if (!ac.signal.aborted) {
          setError("Failed to load job.");
          setJob(null);
          setParts([]);
          setPartSummary(null);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [jobId]);

  const jobConfig = useMemo(() => {
    const c = job?.config;
    if (c && typeof c === "object" && !Array.isArray(c)) {
      return c as Record<string, unknown>;
    }
    return {};
  }, [job]);

  const shopUrlCfg =
    typeof jobConfig.shop_url === "string" ? jobConfig.shop_url : "";
  const fragmentsCfg =
    typeof jobConfig.product_path_fragments === "string"
      ? jobConfig.product_path_fragments
      : "";

  const openInReviewQueue = (p: PartRow) => {
    if (!p.payload_json) return;
    try {
      sessionStorage.setItem(
        REVIEW_QUEUE_KEY,
        JSON.stringify({
          items: p.payload_json,
          label: `Part ${p.part_index} — ${job?.catalog_source ?? jobId.slice(0, 8)}`,
          jobId,
          partIndex: p.part_index,
        }),
      );
      router.push("/");
    } catch {
      alert("Could not store part data — payload may be too large for sessionStorage.");
    }
  };

  const payloadSize = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of parts) {
      if (p.payload_json == null) {
        m.set(p.part_index, 0);
        continue;
      }
      try {
        m.set(
          p.part_index,
          new Blob([JSON.stringify(p.payload_json)]).size,
        );
      } catch {
        m.set(p.part_index, 0);
      }
    }
    return m;
  }, [parts]);

  if (!jobId) {
    return (
      <div className="min-h-screen overflow-y-auto bg-[#070712] text-white">
        <DashboardNav variant="detail" />
        <main className="mx-auto max-w-5xl px-6 py-8 pb-24">
          <p className="text-sm text-red-200/90">Missing or invalid job id.</p>
          <Link
            href="/ingest-jobs"
            className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-primary hover:underline"
          >
            ← All jobs
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[#070712] text-white">
      <DashboardNav variant="detail" />

      <main className="mx-auto max-w-5xl px-6 py-8 pb-24">
        <div className="mb-6">
          <Link
            href="/ingest-jobs"
            className="text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
          >
            ← All jobs
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-white/45">Loading…</p>
        ) : error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : !job ? (
          <p className="text-sm text-white/45">Job not found.</p>
        ) : (
          <>
            <header className="mb-8 glass rounded-2xl border border-white/10 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                    Job id
                  </p>
                  <p className="font-mono text-xs text-white/90 break-all">
                    {job.id}
                  </p>
                  <h1 className="mt-4 text-xl font-black">
                    {job.label ?? "(no label)"}{" "}
                    <span className="text-white/45 font-mono text-sm font-normal">
                      · {job.catalog_source}
                    </span>
                  </h1>
                </div>
                <span
                  className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase ${
                    job.status === "completed"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : job.status === "failed"
                        ? "bg-red-500/20 text-red-300"
                        : job.status === "running"
                          ? "bg-sky-500/20 text-sky-300"
                          : "bg-white/10 text-white/80"
                  }`}
                >
                  {job.status}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div>
                  <dt className="text-[10px] font-black uppercase text-white/35">
                    Rows scraped
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {job.rows_scraped ?? "—"}
                    {job.rows_total_est != null ? (
                      <span className="text-white/40 font-normal">
                        {" "}
                        (est {job.rows_total_est})
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase text-white/35">
                    Parts total
                  </dt>
                  <dd className="mt-1 font-semibold">{job.parts_total ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase text-white/35">
                    Last heartbeat
                  </dt>
                  <dd className="mt-1 text-white/70">
                    {job.last_heartbeat_at
                      ? new Date(job.last_heartbeat_at).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-black uppercase text-white/35">
                    Finished
                  </dt>
                  <dd className="mt-1 text-white/70">
                    {job.finished_at
                      ? new Date(job.finished_at).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-black uppercase text-white/35">
                    Shop listing URL
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-white/75">
                    {shopUrlCfg || (
                      <span className="text-white/35">(default rasakatha)</span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-black uppercase text-white/35">
                    Product path fragments
                  </dt>
                  <dd className="mt-1 font-mono text-xs text-white/75">
                    {fragmentsCfg || (
                      <span className="text-white/35">/books/</span>
                    )}
                  </dd>
                </div>
              </dl>

              <WorkerEnvSnippet
                jobId={job.id}
                catalogSource={job.catalog_source}
                shopUrl={shopUrlCfg}
                productPathFragments={fragmentsCfg}
              />

              <details className="mt-6 rounded-xl border border-white/10 bg-black/20">
                <summary className="cursor-pointer px-4 py-3 text-[11px] font-bold text-white/55">
                  Raw job.config JSON
                </summary>
                <pre className="max-h-40 overflow-y-auto border-t border-white/10 px-4 py-3 font-mono text-[10px] text-white/45">
                  {JSON.stringify(job.config ?? {}, null, 2)}
                </pre>
              </details>

              {job.error_message ? (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {String(job.error_message)}
                </div>
              ) : null}

              {partSummary ? (
                <p className="mt-4 text-xs text-white/45">
                  Part counts: pending {partSummary.pending ?? 0}, ready{" "}
                  {partSummary.ready ?? 0}, imported {partSummary.imported ?? 0},
                  skipped {partSummary.skipped ?? 0}
                </p>
              ) : null}
            </header>

            <section>
              <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-white/50">
                Parts & JSON payloads
              </h2>

              <div className="space-y-6">
                {parts.length === 0 ? (
                  <p className="text-sm text-white/45">
                    No parts yet — worker has not uploaded chunks for this job.
                  </p>
                ) : (
                  parts.map((p) => (
                    <article
                      key={p.id}
                      className="glass rounded-2xl border border-white/10 overflow-hidden"
                    >
                      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 ${p.status === "imported" ? "bg-emerald-500/5" : p.status === "skipped" ? "opacity-50" : ""}`}>
                        <div>
                          <span className="text-[10px] font-black uppercase text-white/40">
                            Part index
                          </span>
                          <p className="font-mono text-lg font-black text-primary">
                            {p.part_index}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Status badge */}
                          {p.status === "imported" ? (
                            <span className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-black uppercase text-emerald-400">
                              ✓ Reviewed
                            </span>
                          ) : p.status === "skipped" ? (
                            <span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/40">
                              Skipped
                            </span>
                          ) : (
                            <span className="rounded-lg bg-amber-500/20 px-2 py-1 text-[10px] font-black uppercase text-amber-400">
                              Ready
                            </span>
                          )}
                          <span className="text-xs text-white/55">
                            {p.row_count} rows · ~
                            {Math.ceil((payloadSize.get(p.part_index) ?? 0) / 1024)}{" "}
                            KB JSON
                          </span>
                          {/* Review Queue button — disabled if already reviewed */}
                          {p.status === "imported" ? (
                            <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500/60">
                              Already reviewed
                            </span>
                          ) : p.status === "skipped" ? (
                            <span className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/30">
                              Skipped
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={p.payload_json == null}
                              onClick={() => openInReviewQueue(p)}
                              className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-30"
                            >
                              Review Queue →
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={p.payload_json == null}
                            onClick={() =>
                              downloadJson(
                                `job-${job.id.slice(0, 8)}-part-${p.part_index}.json`,
                                p.payload_json,
                              )
                            }
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/90 hover:bg-white/10 disabled:opacity-30"
                          >
                            Download JSON
                          </button>
                        </div>
                      </div>

                      <details className="group">
                        <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-primary hover:bg-white/[0.03]">
                          Show / hide payload preview
                        </summary>
                        <div className="max-h-[min(560px,70vh)] overflow-y-auto border-t border-white/10 bg-black/50 px-4 py-3">
                          <pre className="text-[11px] leading-relaxed text-emerald-200/90 whitespace-pre-wrap break-all font-mono">
                            {p.payload_json == null
                              ? "(no payload_json)"
                              : JSON.stringify(p.payload_json, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </article>
                  ))
                )}
              </div>

              <p className="mt-8 text-xs text-white/45">
                Next: merge parts into one array or review each file —{" "}
                <Link href="/" className="text-primary underline">
                  open review queue
                </Link>{" "}
                → upload JSON → Save batches → Merge.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
