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
      return {
        ok: false,
        jobs: [],
        error: data.error ?? `HTTP ${res.status}`,
      };
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

  useEffect(() => {
    partsByJobRef.current = partsByJob;
  }, [partsByJob]);

  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  /** `null` = merged payload for the whole job; otherwise one JSON chunk */
  const [previewPartIndex, setPreviewPartIndex] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSample, setPreviewSample] = useState<{
    status: string;
    rows: number;
    titles: string[];
    source: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    onCatalogPreviewActiveChange?.(previewJobId !== null);
  }, [previewJobId, onCatalogPreviewActiveChange]);

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

  const applyPayloadPreview = (
    mergedForPartition: unknown[],
    job: JobRow,
    partLabel: string,
    jobStatus?: string,
  ) => {
    const { valid } = partitionScrapedBooks(mergedForPartition);
    const titles = valid.slice(0, 5).map((b) => b.name || b.sku || "—");
    setPreviewSample({
      status: jobStatus ?? job.status,
      rows: valid.length,
      titles,
      source: job.catalog_source,
      label: partLabel,
    });
  };

  const fetchJobWithPayload = async (jobId: string) => {
    const res = await fetch(
      `/api/catalog/ingest-jobs/${jobId}?include_payload=1`,
    );
    const data = (await res.json()) as {
      ok?: boolean;
      parts?: Array<{
        part_index: number;
        payload_json?: unknown;
        row_count?: number;
      }>;
      job?: { status?: string };
      error?: string;
    };
    if (!res.ok) {
      return { ok: false as const, error: data.error ?? "Request failed" };
    }
    return { ok: true as const, data };
  };

  const openPreviewFullJob = async (job: JobRow) => {
    setPreviewJobId(job.id);
    setPreviewPartIndex(null);
    setPreviewLoading(true);
    setPreviewSample(null);
    try {
      const result = await fetchJobWithPayload(job.id);
      if (!result.ok) {
        onNotify(result.error ?? "Preview failed", "error");
        setPreviewJobId(null);
        return;
      }
      const parts = result.data.parts ?? [];
      const merged: unknown[] = [];
      [...parts]
        .sort((a, b) => a.part_index - b.part_index)
        .forEach((p) => {
          if (Array.isArray(p.payload_json)) {
            merged.push(...p.payload_json);
          }
        });
      const n = parts.filter(
        (p) => Array.isArray(p.payload_json) && p.payload_json.length > 0,
      ).length;
      applyPayloadPreview(
        merged,
        job,
        n > 1 ? `All parts merged (${n} JSON files)` : "Full job",
        result.data.job?.status,
      );
    } catch {
      onNotify("Preview failed", "error");
      setPreviewJobId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreviewPart = async (job: JobRow, partIndex: number) => {
    setPreviewJobId(job.id);
    setPreviewPartIndex(partIndex);
    setPreviewLoading(true);
    setPreviewSample(null);
    try {
      const result = await fetchJobWithPayload(job.id);
      if (!result.ok) {
        onNotify(result.error ?? "Preview failed", "error");
        setPreviewJobId(null);
        return;
      }
      const parts = result.data.parts ?? [];
      const part = parts.find((p) => p.part_index === partIndex);
      const raw = part?.payload_json;
      const arr = Array.isArray(raw) ? raw : [];
      applyPayloadPreview(
        arr,
        job,
        `JSON part ${partIndex} (${arr.length} rows in file)`,
        result.data.job?.status,
      );
    } catch {
      onNotify("Preview failed", "error");
      setPreviewJobId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const clearPreview = () => {
    setPreviewJobId(null);
    setPreviewPartIndex(null);
    setPreviewSample(null);
    setPreviewLoading(false);
  };

  const importPreviewJob = async () => {
    if (!previewJobId) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/catalog/ingest-jobs/${previewJobId}?include_payload=1`,
      );
      const data = (await res.json()) as {
        parts?: Array<{ part_index: number; payload_json?: unknown }>;
        job?: { catalog_source?: string };
        error?: string;
      };
      if (!res.ok) {
        onNotify(data.error ?? "Import failed", "error");
        return;
      }
      const parts = data.parts ?? [];
      let merged: unknown[] = [];

      if (previewPartIndex != null) {
        const part = parts.find((p) => p.part_index === previewPartIndex);
        if (Array.isArray(part?.payload_json)) {
          merged = [...part.payload_json];
        }
      } else {
        [...parts]
          .sort((a, b) => a.part_index - b.part_index)
          .forEach((p) => {
            if (Array.isArray(p.payload_json)) merged.push(...p.payload_json);
          });
      }

      const { valid, errors } = partitionScrapedBooks(merged);
      if (valid.length === 0) {
        onNotify("No valid rows in this payload.", "warning");
        return;
      }
      const src = data.job?.catalog_source ?? previewSample?.source ?? "";
      // Pass partIndex so the reviewer can mark it as imported after Save Batches
      onImportBooks(valid, { source: src, jobId: previewJobId, partIndex: previewPartIndex });
      onNotify(
        `Loaded ${valid.length} rows into reviewer${errors.length ? ` (${errors.length} skipped)` : ""}.`,
        "success",
      );
    } catch {
      onNotify("Import failed", "error");
    } finally {
      setPreviewLoading(false);
    }
  };

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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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
                              ) : (
                                <>
                                  {(metaParts ?? []).map((p) => (
                                    <button
                                      key={p.part_index}
                                      type="button"
                                      onClick={() =>
                                        void openPreviewPart(job, p.part_index)
                                      }
                                      className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-[11px] transition-colors ${
                                        previewJobId === job.id &&
                                        previewPartIndex === p.part_index
                                          ? "bg-violet-500/20 text-white"
                                          : "text-white/75 hover:bg-white/10"
                                      }`}
                                    >
                                      <span className="font-mono font-bold text-primary/95">
                                        JSON #{p.part_index}
                                      </span>
                                      <span className="text-white/50"> · </span>
                                      <span>
                                        {p.row_count ?? "—"} items
                                      </span>
                                      <span className="text-white/40"> · </span>
                                      <span className="uppercase">{p.status}</span>
                                    </button>
                                  ))}
                                </>
                              )}
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

      {/* Preview */}
      <div className="shrink-0 rounded-2xl border border-violet-500/25 bg-violet-950/25 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-violet-200/80">
            Preview
          </h3>
          {previewJobId ? (
            <button
              type="button"
              onClick={clearPreview}
              className="text-[10px] font-bold uppercase tracking-wider text-white/50 hover:text-white"
            >
              Close
            </button>
          ) : null}
        </div>
        {!previewJobId && !previewLoading ? (
          <p className="mt-2 text-xs text-white/45">
            Expand a job and choose a JSON part (or merged full job).
          </p>
        ) : previewLoading && !previewSample ? (
          <p className="mt-2 text-xs text-white/45">Loading preview…</p>
        ) : previewSample ? (
          <>
            <p className="mt-2 text-[11px] font-medium text-violet-200/90">
              {previewSample.label}
            </p>
            <p className="mt-1 text-xs text-white/70">
              <span className="font-mono text-primary">{previewSample.source}</span>{" "}
              · {previewSample.rows} valid rows · {previewSample.status}
            </p>
            {previewSample.titles.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-[11px] text-white/55">
                {previewSample.titles.map((t, i) => (
                  <li key={i} className="truncate">
                    {t}
                  </li>
                ))}
                {previewSample.rows > previewSample.titles.length ? (
                  <li className="text-white/35">…</li>
                ) : null}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={previewLoading}
                onClick={() => void importPreviewJob()}
                className="premium-button rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
              >
                Open in reviewer
              </button>
              {previewJobId ? (
                <Link
                  href={`/ingest-jobs/${previewJobId}`}
                  className="rounded-lg border border-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white/80 hover:bg-white/10"
                >
                  Full job
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
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
