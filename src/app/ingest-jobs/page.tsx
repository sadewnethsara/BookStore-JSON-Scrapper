"use client";

import { DashboardNav } from "@/components/dashboard-nav";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type JobRow = {
  id: string;
  catalog_source: string;
  label: string | null;
  status: string;
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

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export default function IngestJobsListPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSource, setNewSource] = useState("rasakatha");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/catalog/ingest-jobs?limit=50", {
          signal: ac.signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          jobs?: JobRow[];
          error?: string;
        };
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
          setJobs([]);
          return;
        }
        setJobs(data.jobs ?? []);
      } catch {
        if (!ac.signal.aborted) {
          setError("Failed to load jobs.");
          setJobs([]);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/catalog/ingest-jobs?limit=50")
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        const payload = data as {
          ok?: boolean;
          jobs?: JobRow[];
          error?: string;
        };
        if (!res.ok) {
          setError(payload.error ?? `HTTP ${res.status}`);
          setJobs([]);
          return;
        }
        setJobs(payload.jobs ?? []);
      })
      .catch(() => {
        setError("Failed to load jobs.");
        setJobs([]);
      })
      .finally(() => setLoading(false));
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const catalog_source = newSource.trim();
    if (!catalog_source) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/ingest-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog_source,
          label: newLabel.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        job?: { id: string };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (data.job?.id) {
        router.push(`/ingest-jobs/${data.job.id}`);
      } else {
        void load();
      }
    } catch {
      setError("Failed to create job.");
    } finally {
      setCreating(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen overflow-y-auto bg-[#070712] text-white">
        <DashboardNav />
        <main className="mx-auto max-w-3xl px-6 py-12">
          <div className="glass rounded-2xl border border-amber-500/30 p-6 text-sm text-amber-100">
            Set <code className="rounded bg-black/40 px-1">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and <code className="rounded bg-black/40 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            to use ingest jobs (local file mode only otherwise).
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[#070712] text-white">
      <DashboardNav variant="list" />

      <main className="mx-auto max-w-6xl px-6 py-8 pb-24">
        <header className="mb-8">
          <h1 className="text-2xl font-black tracking-tight">
            Catalog ingest jobs
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Worker uploads land here (Phase 5). Open a job to preview{" "}
            <code className="rounded bg-white/10 px-1 text-xs">payload_json</code>{" "}
            per part, download JSON, then use the{" "}
            <Link href="/" className="text-primary underline">
              review queue
            </Link>{" "}
            to push approved rows to staging.
          </p>
        </header>

        <section className="glass mb-10 rounded-2xl border border-white/10 p-6">
          <h2 className="text-xs font-black uppercase tracking-widest text-white/50">
            New job
          </h2>
          <form
            onSubmit={(e) => void handleCreateJob(e)}
            className="mt-4 flex flex-wrap items-end gap-4"
          >
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                catalog_source
              </label>
              <input
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="rasakatha"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                Label (optional)
              </label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="OCI full run"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newSource.trim()}
              className="premium-button rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            >
              {creating ? "Creating…" : "Create job"}
            </button>
          </form>
        </section>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/50">
              Jobs ({jobs.length})
            </h2>
            <button
              type="button"
              onClick={() => void load()}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-white/45">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-white/45">
              No jobs yet. Create one above or run the VM worker with{" "}
              <code className="rounded bg-white/10 px-1 text-xs">JSONVIEW_JOB_ID</code>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-white/40">
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Rows</th>
                    <th className="px-4 py-3">Parts</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr
                      key={j.id}
                      className="border-b border-white/5 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{j.catalog_source}</td>
                      <td className="px-4 py-3 text-white/80">
                        {j.label ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                            j.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : j.status === "failed"
                                ? "bg-red-500/20 text-red-300"
                                : j.status === "running"
                                  ? "bg-sky-500/20 text-sky-300"
                                  : "bg-white/10 text-white/70"
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {j.rows_scraped ?? "—"}
                        {j.rows_total_est != null ? (
                          <span className="text-white/35">
                            {" "}
                            / est {j.rows_total_est}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {j.parts_total ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-white/45">
                        {new Date(j.updated_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/ingest-jobs/${j.id}`}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
