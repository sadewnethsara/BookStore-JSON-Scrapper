"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";

type ReviewedPart = {
  job_id: string;
  part_index: number;
  status: string;
  row_count: number;
  updated_at: string;
  catalog_ingest_jobs: { catalog_source: string; label: string | null } | null;
};

export default function PublishPage() {
  const [rows, setRows] = useState<ReviewedPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishingJob, setPublishingJob] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalog/reviewed")
      .then((r) => r.json().then((d) => ({ r, d })))
      .then(({ r, d }) => {
        if (!r.ok) {
          setError((d as { error?: string }).error ?? `HTTP ${r.status}`);
          setRows([]);
          return;
        }
        setRows(((d as { reviewedParts?: ReviewedPart[] }).reviewedParts ?? []));
      })
      .catch(() => setError("Failed to load reviewed list"))
      .finally(() => setLoading(false));
  }, []);

  const jobs = useMemo(() => {
    const map = new Map<string, ReviewedPart[]>();
    for (const row of rows) {
      const list = map.get(row.job_id) ?? [];
      list.push(row);
      map.set(row.job_id, list);
    }
    return [...map.entries()];
  }, [rows]);

  async function publishJob(jobId: string) {
    setPublishingJob(jobId);
    setError(null);
    try {
      const res = await fetch("/api/catalog/reviewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = (await res.json()) as { error?: string; staged?: number };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setError(`Published ${data.staged ?? 0} rows to staging queue.`);
    } catch {
      setError("Publish failed.");
    } finally {
      setPublishingJob(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#070712] text-white">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-4">
          <Link href="/" className="text-xs font-bold uppercase tracking-widest text-primary hover:underline">
            ← Back to reviewer
          </Link>
        </div>
        <h1 className="text-2xl font-black">Publish reviewed JSON</h1>
        <p className="mt-2 text-sm text-white/55">
          Super admin queue: reviewed parts are staged first, then final promote can run.
        </p>
        {error ? (
          <div className="mt-4 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm">{error}</div>
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-white/50">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="mt-6 text-sm text-white/50">No reviewed parts yet.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {jobs.map(([jobId, list]) => {
              const total = list.reduce((n, r) => n + (r.row_count ?? 0), 0);
              const src = list[0]?.catalog_ingest_jobs?.catalog_source ?? "unknown";
              const label = list[0]?.catalog_ingest_jobs?.label ?? "(no label)";
              return (
                <div key={jobId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{label}</p>
                      <p className="text-xs text-white/45">{src} · {list.length} JSON part(s) · {total} rows</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void publishJob(jobId)}
                      disabled={publishingJob === jobId}
                      className="premium-button rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                    >
                      {publishingJob === jobId ? "Publishing…" : "Publish to staging"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

