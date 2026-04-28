"use client";

import type { ScrapedBook } from "@lumina/shared-types";
import { partitionScrapedBooks } from "@lumina/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type JobRow = {
  id: string;
  catalog_source: string;
  label: string | null;
  status: string;
  rows_scraped: number | null;
  parts_total: number | null;
  updated_at: string;
};

type PartMeta = {
  part_index: number;
  status: string;
  row_count: number | null;
};

type Props = {
  enabled: boolean;
  onCatalogPreviewActiveChange?: (active: boolean) => void;
  onImportBooks: (
    items: ScrapedBook[],
    meta: { source: string; jobId: string; partIndex: number | null },
  ) => void;
  onNotify: (msg: string, type: "success" | "error" | "info" | "warning") => void;
};

function groupBySource(jobs: JobRow[]): Map<string, JobRow[]> {
  const m = new Map<string, JobRow[]>();
  for (const j of jobs) {
    const k = j.catalog_source || "unknown";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(j);
  }
  for (const arr of m.values()) {
    arr.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }
  return m;
}

async function fetchIngestJobsList(): Promise<{
  ok: boolean;
  jobs: JobRow[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/catalog/ingest-jobs?limit=80");
    const data = (await res.json()) as { jobs?: JobRow[]; error?: string };
    if (!res.ok) {
      return { ok: false, jobs: [], error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, jobs: data.jobs ?? [] };
  } catch {
    return { ok: false, jobs: [], error: "Could not load jobs." };
  }
}

async function fetchJobPartsMeta(jobId: string): Promise<{
  ok: boolean;
  parts: PartMeta[];
  error?: string;
}> {
  try {
    const res = await fetch(`/api/catalog/ingest-jobs/${jobId}`);
    const data = (await res.json()) as {
      parts?: PartMeta[];
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, parts: [], error: data.error ?? `HTTP ${res.status}` };
    }
    const parts = [...(data.parts ?? [])].sort(
      (a, b) => a.part_index - b.part_index,
    );
    return { ok: true, parts };
  } catch {
    return { ok: false, parts: [], error: "Could not load parts." };
  }
}

export function CatalogSourcesPanel({
  enabled,
  onCatalogPreviewActiveChange,
  onImportBooks,
  onNotify,
}: Props) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());
  const [partsByJob, setPartsByJob] = useState<Record<string, PartMeta[]>>({});
  const partsByJobRef = useRef(partsByJob);
  const [partsLoading, setPartsLoading] = useState<Record<string, boolean>>({});

  // key = `${jobId}:${partIndex}` — which part is currently being fetched & loaded
  const [loadingPartKey, setLoadingPartKey] = useState<string | null>(null);
  // summary of what's currently shown in the reviewer
  const [loadedInfo, setLoadedInfo] = useState<{
    jobId: string;
    partIndex: number;
    source: string;
    label: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    partsByJobRef.current = partsByJob;
  }, [partsByJob]);

  // Never activate a full-screen preview overlay (kept for compat)
  useEffect(() => {
    onCatalogPreviewActiveChange?.(false);
  }, [onCatalogPreviewActiveChange]);

  const refresh = () => {
    if (!enabled) return;
    setLoading(true);
    setLoadErr(null);
    void fetchIngestJobsList().then((result) => {
      if (!result.ok) {
        setLoadErr(result.error ?? "Could not load jobs.");
        setJobs([]);
      } else {
        setJobs(result.jobs);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchIngestJobsList().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadErr(result.error ?? "Could not load jobs.");
        setJobs([]);
      } else {
        setLoadErr(null);
        setJobs(result.jobs);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const bySource = useMemo(() => groupBySource(jobs), [jobs]);
  const sources = useMemo(
    () => [...bySource.keys()].sort((a, b) => a.localeCompare(b)),
    [bySource],
  );

  const toggleSource = (s: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleJobExpand = useCallback(
    (job: JobRow) => {
      let opening = false;
      setExpandedJobIds((prev) => {
        opening = !prev.has(job.id);
        const next = new Set(prev);
        if (opening) next.add(job.id);
        else next.delete(job.id);
        return next;
      });

      if (!opening) return;
      if (partsByJobRef.current[job.id]) return;

      void (async () => {
        if (partsByJobRef.current[job.id]) return;
        setPartsLoading((p) => ({ ...p, [job.id]: true }));
        const result = await fetchJobPartsMeta(job.id);
        setPartsLoading((p) => ({ ...p, [job.id]: false }));
        if (!result.ok) {
          onNotify(result.error ?? "Could not load JSON parts", "error");
          return;
        }
        setPartsByJob((prev) =>
          prev[job.id] ? prev : { ...prev, [job.id]: result.parts },
        );
      })();
    },
    [onNotify],
  );

  /** One-click: fetch payload for a single part and send it directly to the reviewer. */
  const loadPartIntoReviewer = useCallback(
    async (job: JobRow, partIndex: number) => {
      const key = `${job.id}:${partIndex}`;
      if (loadingPartKey === key) return; // already loading
      setLoadingPartKey(key);
      try {
        const res = await fetch(
          `/api/catalog/ingest-jobs/${job.id}?include_payload=1`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          parts?: Array<{ part_index: number; payload_json?: unknown }>;
          job?: { catalog_source?: string; label?: string | null };
          error?: string;
        };
        if (!res.ok) {
          onNotify(data.error ?? "Failed to load part", "error");
          return;
        }
        const parts = data.parts ?? [];
        const part = parts.find((p) => p.part_index === partIndex);
        const raw = Array.isArray(part?.payload_json) ? part.payload_json : [];
        const { valid, errors } = partitionScrapedBooks(raw);
        if (valid.length === 0) {
          onNotify(
            errors.length
              ? `Part ${partIndex}: no valid rows (${errors.length} invalid).`
              : `Part ${partIndex} is empty.`,
            "warning",
          );
          return;
        }
        const src = data.job?.catalog_source ?? job.catalog_source;
        const lbl = data.job?.label ?? job.label ?? src;
        onImportBooks(valid, { source: src, jobId: job.id, partIndex });
        setLoadedInfo({ jobId: job.id, partIndex, source: src, label: lbl, count: valid.length });
        onNotify(
          `JSON #${partIndex} loaded — ${valid.length} book${valid.length !== 1 ? "s" : ""}${errors.length ? ` (${errors.length} skipped)` : ""} ready to review.`,
          "success",
        );
      } catch {
        onNotify("Failed to load part", "error");
      } finally {
        setLoadingPartKey(null);
      }
    },
    [loadingPartKey, onImportBooks, onNotify],
  );

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-950/30 p-4 text-xs text-amber-100/90">
        Connect Supabase in{" "}
        <code className="rounded bg-black/40 px-1">.env.local</code> to list ingest
        jobs by catalog source.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-white/45">
          Catalog sources
        </h2>
        <button
          type="button"
          onClick={refresh}
          className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
        >
          Refresh
        </button>
      </div>

      {loadErr ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {loadErr}
        </p>
      ) : null}

      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loading && jobs.length === 0 ? (
          <p className="text-xs text-white/40">Loading jobs…</p>
        ) : sources.length === 0 ? (
          <p className="text-xs text-white/45">
            No ingest jobs yet.{" "}
            <Link href="/ingest-jobs" className="text-primary underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          sources.map((source) => {
            const list = bySource.get(source) ?? [];
            const isOpen = expanded.has(source);
            return (
              <div
                key={source}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
              >
                <button
                  type="button"
                  onClick={() => toggleSource(source)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/[0.06]"
                >
                  <span className="font-mono text-sm font-bold text-white/90">
                    {source}
                  </span>
                  <span className="flex items-center gap-2 text-[10px] text-white/45">
                    {list.length} job{list.length === 1 ? "" : "s"}
                    <Chevron className={isOpen ? "rotate-180" : ""} />
                  </span>
                </button>
                {isOpen ? (
                  <div className="border-t border-white/10 px-2 py-2">
                    {list.map((job) => {
                      const jobExpanded = expandedJobIds.has(job.id);
                      const metaParts = partsByJob[job.id];
                      const loadingMeta = partsLoading[job.id];
                      const chunkCount = metaParts?.length ?? job.parts_total;
                      const chunkHint =
                        chunkCount != null
                          ? `${chunkCount} JSON chunk${Number(chunkCount) !== 1 ? "s" : ""}`
                          : "chunks —";
                      return (
                        <div
                          key={job.id}
                          className="mb-2 overflow-hidden rounded-xl border border-white/5 bg-black/20"
                        >
                          <button
                            type="button"
                            onClick={() => void toggleJobExpand(job)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs hover:bg-white/10"
                          >
                            <span className="truncate font-semibold text-white/90">
                              {job.label ?? "(no label)"}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                  job.status === "completed"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : job.status === "failed"
                                      ? "bg-red-500/20 text-red-300"
                                      : "bg-white/10 text-white/70"
                                }`}
                              >
                                {job.status}
                              </span>
                              <Chevron
                                className={`shrink-0 transition-transform ${jobExpanded ? "rotate-180" : ""}`}
                              />
                            </span>
                          </button>
                          <div className="border-t border-white/5 px-3 py-2 text-[10px] text-white/40">
                            {new Date(job.updated_at).toLocaleString()} · rows{" "}
                            {job.rows_scraped ?? "—"} · {chunkHint}
                          </div>
                          {jobExpanded ? (
                            <div className="border-t border-white/5 px-2 py-2">
                              {loadingMeta ? (
                                <p className="px-2 py-2 text-[11px] text-white/45">
                                  Loading JSON parts…
                                </p>
                              ) : (metaParts ?? []).length === 0 ? (
                                <p className="px-2 py-2 text-[11px] text-white/35">
                                  No parts yet.
                                </p>
                              ) : (
                                (metaParts ?? []).map((p) => {
                                  const pk = `${job.id}:${p.part_index}`;
                                  const isActive =
                                    loadedInfo?.jobId === job.id &&
                                    loadedInfo.partIndex === p.part_index;
                                  const isLoading = loadingPartKey === pk;
                                  return (
                                    <button
                                      key={p.part_index}
                                      type="button"
                                      disabled={isLoading || !!loadingPartKey}
                                      onClick={() =>
                                        void loadPartIntoReviewer(job, p.part_index)
                                      }
                                      className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] transition-colors disabled:opacity-50 ${
                                        isActive
                                          ? "bg-violet-500/20 text-white ring-1 ring-violet-500/40"
                                          : "text-white/75 hover:bg-white/10"
                                      }`}
                                    >
                                      <span className="flex items-center gap-2">
                                        {isLoading ? (
                                          <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white/80" />
                                        ) : isActive ? (
                                          <span className="text-violet-400">▶</span>
                                        ) : null}
                                        <span className="font-mono font-bold text-primary/95">
                                          JSON #{p.part_index}
                                        </span>
                                        <span className="text-white/45">
                                          {p.row_count ?? "—"} items
                                        </span>
                                      </span>
                                      <span
                                        className={`text-[9px] uppercase font-bold ${
                                          p.status === "imported"
                                            ? "text-emerald-400/80"
                                            : p.status === "skipped"
                                              ? "text-white/30"
                                              : "text-amber-400/70"
                                        }`}
                                      >
                                        {p.status === "imported"
                                          ? "✓ done"
                                          : p.status === "skipped"
                                            ? "skipped"
                                            : isLoading
                                              ? "loading…"
                                              : "load →"}
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                              <div className="mt-1 px-2">
                                <Link
                                  href={`/ingest-jobs/${job.id}`}
                                  className="text-[10px] font-bold text-white/35 hover:text-white/60"
                                >
                                  Open full job page →
                                </Link>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Currently loaded indicator */}
      {loadedInfo ? (
        <div className="shrink-0 rounded-xl border border-violet-500/20 bg-violet-950/20 px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-violet-300/60">
            Loaded in reviewer
          </p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-white/80">
            {loadedInfo.label} · JSON #{loadedInfo.partIndex}
          </p>
          <p className="text-[10px] text-white/45">
            {loadedInfo.count} books · {loadedInfo.source}
          </p>
        </div>
      ) : (
        <div className="shrink-0 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
          <p className="text-[10px] text-white/35">
            Expand a completed job and click a JSON part to load it.
          </p>
        </div>
      )}
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-white/50 transition-transform ${className ?? ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}
