"use client";

import { DashboardNav } from "@/components/dashboard-nav";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

type SitePreset = {
  id: string;
  name: string;
  platform: string;
  language: string;
  specialty: string;
  shopUrl: string;
  fragments: string;
  active: boolean;
  notes: string;
};

/** Full registry — mirrors universal-version/sites.py */
const SITE_PRESETS: SitePreset[] = [
  // ── WooCommerce ────────────────────────────────────────────────────────────
  {
    id: "rasakatha",
    name: "Rasakatha.lk",
    platform: "woocommerce",
    language: "Sinhala",
    specialty: "Largest Sinhala book store — 1400+ books",
    shopUrl: "https://rasakatha.lk/shop/",
    fragments: "/books/",
    active: true,
    notes: "Pagination via ?page=N",
  },
  {
    id: "books_lk",
    name: "Books.lk",
    platform: "woocommerce",
    language: "English, Sinhala, Tamil",
    specialty: "English & Sinhala books, second-hand, CDs",
    shopUrl: "https://books.lk/product-category/books/",
    fragments: "/product/",
    active: true,
    notes: "Also sells magazines and Blu-Ray.",
  },
  {
    id: "pothak",
    name: "Pothak.lk",
    platform: "woocommerce",
    language: "Sinhala, English",
    specialty: "Sinhala books, children's books, Soviet Russian reprints",
    shopUrl: "https://pothak.lk/shop/",
    fragments: "/product/",
    active: true,
    notes: "Good collection of children's books.",
  },
  {
    id: "viyathbooks",
    name: "ViyathBooks.lk",
    platform: "woocommerce",
    language: "English, Sinhala",
    specialty: "International and local books, up to 20% discounts",
    shopUrl: "https://www.viyathbooks.lk/shop/",
    fragments: "/product/",
    active: true,
    notes: "Standard WooCommerce setup.",
  },
  {
    id: "bargainbooks",
    name: "BargainBooks.lk",
    platform: "woocommerce",
    language: "English",
    specialty: "Discounted fiction, non-fiction, thriller, self-help",
    shopUrl: "https://bargainbooks.lk/shop/",
    fragments: "/product/",
    active: true,
    notes: "Focus on discounted/clearance books.",
  },
  {
    id: "bookshop_lk",
    name: "BookShop.lk",
    platform: "woocommerce",
    language: "Sinhala",
    specialty: "School books, past papers, Sinhala novels",
    shopUrl: "https://bookshop.lk/shop/",
    fragments: "/product/",
    active: true,
    notes: "Strong in educational books and school stationery.",
  },
  {
    id: "jeyabook",
    name: "JeyaBook Centre",
    platform: "woocommerce",
    language: "English, Tamil, Sinhala",
    specialty: "Medical, academic, fiction, multi-language",
    shopUrl: "https://jeyabookcentre.com/shop/",
    fragments: "/product/",
    active: true,
    notes: "Known for medical and academic books.",
  },
  {
    id: "mdgunasena",
    name: "MD Gunasena",
    platform: "woocommerce",
    language: "Sinhala, English",
    specialty: "Sri Lanka's oldest bookstore (est. 1913)",
    shopUrl: "https://mdgunasena.com/shop/",
    fragments: "/product/",
    active: true,
    notes: "110+ year old institution. 16 physical stores island-wide.",
  },
  {
    id: "bookrack",
    name: "BookRack.lk",
    platform: "woocommerce",
    language: "Sinhala, English",
    specialty: "General books online store",
    shopUrl: "https://bookrack.lk/shop/",
    fragments: "/product/",
    active: true,
    notes: "",
  },
  {
    id: "bookstore_lk2",
    name: "BookStore.lk",
    platform: "woocommerce",
    language: "Sinhala, English",
    specialty: "Buy one get one 50% off, general books",
    shopUrl: "https://bookstore.lk/shop/",
    fragments: "/product/",
    active: true,
    notes: "Frequent BOGO promotions.",
  },
  {
    id: "vijithayapa",
    name: "Vijitha Yapa",
    platform: "woocommerce",
    language: "Sinhala, English",
    specialty: "Major chain — fiction, non-fiction, stationery",
    shopUrl: "https://www.vijithayapa.com/shop/",
    fragments: "/product/",
    active: false,
    notes: "Returns 403 for automated requests.",
  },
  {
    id: "bookmania",
    name: "BookMania.lk",
    platform: "woocommerce",
    language: "Sinhala, English, Tamil",
    specialty: "Sinhala, English, Tamil books + stationery",
    shopUrl: "https://bookmania.lk/shop/",
    fragments: "/product/",
    active: false,
    notes: "Returns 403. May require browser-based scraping.",
  },
  // ── OpenCart ──────────────────────────────────────────────────────────────
  {
    id: "kbooks",
    name: "KBooks.lk",
    platform: "opencart",
    language: "Sinhala, English, Tamil",
    specialty: "Largest Sinhala translation collection, multi-language",
    shopUrl: "https://www.kbooks.lk/novels",
    fragments: "product_id=",
    active: true,
    notes: "URLs use ?route=product/product&product_id=NNN",
  },
  {
    id: "booksbay",
    name: "BooksBay.lk",
    platform: "opencart",
    language: "Sinhala",
    specialty: "Sinhala novels, translations, educational, religious",
    shopUrl: "https://www.booksbay.lk/index.php?route=product/category&path=20",
    fragments: "route=product/product",
    active: true,
    notes: "Also has 2025 award-nominated books.",
  },
  // ── Magento ───────────────────────────────────────────────────────────────
  {
    id: "grantha",
    name: "Grantha.lk",
    platform: "magento",
    language: "Sinhala",
    specialty: "Largest Sinhala book catalogue — novels, educational, religious",
    shopUrl: "https://grantha.lk/all-categories.html",
    fragments: ".html",
    active: true,
    notes: "Magento 2. JavaScript-heavy.",
  },
  // ── Shopify ───────────────────────────────────────────────────────────────
  {
    id: "booxworm",
    name: "BooxWorm.lk",
    platform: "shopify",
    language: "English",
    specialty: "Bestsellers, self-help, biography, business",
    shopUrl: "https://booxworm.lk/collections/all",
    fragments: "/products/",
    active: true,
    notes: "Also writes book buying guides on their blog.",
  },
  {
    id: "jumpbooks",
    name: "JumpBooks.lk",
    platform: "shopify",
    language: "English, Sinhala",
    specialty: "Fiction, non-fiction, children's, free delivery over Rs 6500",
    shopUrl: "https://jumpbooks.lk/collections/all",
    fragments: "/products/",
    active: false,
    notes: "Returns 403 for automated requests.",
  },
  // ── Custom ────────────────────────────────────────────────────────────────
  {
    id: "bookolog",
    name: "Bookolog.lk",
    platform: "custom",
    language: "English",
    specialty: "English books — fiction, self-help, business (277 books)",
    shopUrl: "https://bookolog.lk/books",
    fragments: "/books/",
    active: true,
    notes: "Custom Laravel/PHP stack. Pagination via ?page=N.",
  },
  {
    id: "slbooks",
    name: "SLBooks.lk",
    platform: "custom",
    language: "English, Sinhala",
    specialty: "Academic, Cambridge, award-winning literary works",
    shopUrl: "https://slbooks.lk/books/",
    fragments: "/book/",
    active: true,
    notes: "Focuses on Cambridge University Press and academic titles.",
  },
  {
    id: "sarasavi",
    name: "Sarasavi.lk",
    platform: "custom",
    language: "Sinhala, English",
    specialty: "Major chain bookstore — fiction, educational, religious",
    shopUrl: "https://www.sarasavi.lk/books/",
    fragments: "/product/",
    active: true,
    notes: "Leading physical + online chain.",
  },
  {
    id: "makeenbooks",
    name: "Makeen Books",
    platform: "custom",
    language: "English, Sinhala",
    specialty: "Millions of books — physical + online delivery",
    shopUrl: "https://makeenbooks.com/books/",
    fragments: "/product/",
    active: true,
    notes: "Large catalogue. Platform to be confirmed on first run.",
  },
  {
    id: "samudrabooks",
    name: "Samudra Book Shop",
    platform: "custom",
    language: "Sinhala",
    specialty: "Educational, novels, historical, psychological books",
    shopUrl: "https://samudrabooks.com/shop/",
    fragments: "/product/",
    active: true,
    notes: "Physical stores + online.",
  },
];

const PLATFORM_COLORS: Record<string, string> = {
  woocommerce: "bg-purple-500/20 text-purple-300",
  opencart:    "bg-blue-500/20 text-blue-300",
  magento:     "bg-orange-500/20 text-orange-300",
  shopify:     "bg-green-500/20 text-green-300",
  custom:      "bg-white/10 text-white/60",
};

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

function statusClass(s: string) {
  if (s === "completed") return "bg-emerald-500/20 text-emerald-300";
  if (s === "failed")    return "bg-red-500/20 text-red-300";
  if (s === "running")   return "bg-sky-500/20 text-sky-300";
  if (s === "cancelled") return "bg-white/10 text-white/40";
  return "bg-amber-500/20 text-amber-300"; // pending
}

export default function IngestJobsListPage() {
  const router = useRouter();
  const [jobs, setJobs]       = useState<JobRow[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [selectedPreset, setSelectedPreset] = useState<SitePreset>(SITE_PRESETS[0]);
  const [newSource, setNewSource] = useState(SITE_PRESETS[0].id);
  const [newLabel, setNewLabel]   = useState("");
  const [shopUrl, setShopUrl]     = useState(SITE_PRESETS[0].shopUrl);
  const [productFragments, setProductFragments] = useState(SITE_PRESETS[0].fragments);
  const [chunkSize, setChunkSize] = useState(50);
  const [scanEstimate, setScanEstimate]   = useState<number | null>(null);
  const [scanLoading, setScanLoading]     = useState(false);
  const [showAllSites, setShowAllSites]   = useState(false);

  // Live polling for running jobs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSites   = SITE_PRESETS.filter((s) => s.active);
  const blockedSites  = SITE_PRESETS.filter((s) => !s.active);
  const visibleSites  = showAllSites ? SITE_PRESETS : activeSites;

  const fetchJobs = async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/catalog/ingest-jobs?limit=50", { signal });
      const data = (await res.json()) as { ok?: boolean; jobs?: JobRow[]; error?: string };
      if (signal?.aborted) return;
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); setJobs([]); return; }
      setJobs(data.jobs ?? []);
      setError(null);
    } catch {
      if (!signal?.aborted) { setError("Failed to load jobs."); setJobs([]); }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    void fetchJobs(ac.signal);
    return () => ac.abort();
  }, []);

  // Auto-refresh every 8s when any job is running
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running");
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(() => void fetchJobs(), 8000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [jobs]);

  const load = () => { setLoading(true); void fetchJobs(); };

  const applyPreset = (preset: SitePreset) => {
    setSelectedPreset(preset);
    setNewSource(preset.id);
    setShopUrl(preset.shopUrl);
    setProductFragments(preset.fragments);
    setScanEstimate(null);
  };

  const handleScan = async () => {
    const su = shopUrl.trim();
    if (!su) { setError("Enter Shop listing URL first."); return; }
    setScanLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/scan-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_url: su, product_path_fragments: productFragments.trim() || "/books/" }),
      });
      const data = (await res.json()) as { estimate?: number; error?: string };
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      setScanEstimate(data.estimate ?? 0);
    } catch {
      setError("Scan failed.");
    } finally {
      setScanLoading(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const catalog_source = newSource.trim();
    if (!catalog_source) return;
    setCreating(true);
    setError(null);
    try {
      const config: Record<string, string | number> = {};
      const su = shopUrl.trim();
      if (su) config.shop_url = su.endsWith("/") ? su : `${su}/`;
      const pf = productFragments.trim();
      if (pf) config.product_path_fragments = pf;
      config.chunk_size = chunkSize;
      const partsTotalEstimate = scanEstimate && chunkSize > 0 ? Math.ceil(scanEstimate / chunkSize) : 0;

      const res = await fetch("/api/catalog/ingest-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog_source,
          label: newLabel.trim() || null,
          rows_total_est: scanEstimate,
          parts_total: partsTotalEstimate,
          ...(Object.keys(config).length > 0 ? { config } : {}),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; job?: { id: string }; error?: string };
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      if (data.job?.id) {
        router.push(`/ingest-jobs/${data.job.id}`);
      } else {
        load();
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
            to use ingest jobs.
          </div>
        </main>
      </div>
    );
  }

  const partsEst = scanEstimate != null ? Math.ceil(scanEstimate / Math.max(1, chunkSize)) : null;

  return (
    <div className="min-h-screen overflow-y-auto bg-[#070712] text-white">
      <DashboardNav variant="list" />

      <main className="mx-auto max-w-6xl px-6 py-8 pb-24">
        <header className="mb-8">
          <h1 className="text-2xl font-black tracking-tight">Catalog ingest jobs</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Select a website, scan how many products it has, set the chunk size, then create a job.
            The cloud worker on the VM picks it up automatically — no SSH required.
            Open a job to preview parts, then push to{" "}
            <Link href="/" className="text-primary underline">review queue</Link>.
          </p>
        </header>

        {/* ── Site selector grid ─────────────────────────────────────────────── */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/50">
              Select website
            </h2>
            <button
              type="button"
              onClick={() => setShowAllSites((v) => !v)}
              className="rounded-lg border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/45 hover:border-white/20"
            >
              {showAllSites
                ? `Hide blocked (${blockedSites.length})`
                : `Show blocked (${blockedSites.length})`}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {visibleSites.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => applyPreset(site)}
                className={`group relative rounded-xl border p-3 text-left transition-all ${
                  selectedPreset.id === site.id
                    ? "border-primary bg-primary/10"
                    : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]"
                } ${!site.active ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-xs font-bold leading-tight text-white">
                    {site.name}
                  </span>
                  {!site.active && (
                    <span className="mt-0.5 shrink-0 rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-black uppercase text-red-400">
                      403
                    </span>
                  )}
                </div>
                <span
                  className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${PLATFORM_COLORS[site.platform] ?? "bg-white/10 text-white/50"}`}
                >
                  {site.platform}
                </span>
                <p className="mt-1 text-[10px] leading-snug text-white/40">
                  {site.language}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* ── New job form ───────────────────────────────────────────────────── */}
        <section className="glass mb-10 rounded-2xl border border-white/10 p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-white/50">
                New job — {selectedPreset.name}
              </h2>
              {selectedPreset.notes && (
                <p className="mt-1 text-[11px] text-white/35">{selectedPreset.notes}</p>
              )}
            </div>
            {selectedPreset.active ? (
              <span className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-black uppercase text-emerald-400">
                Active
              </span>
            ) : (
              <span className="rounded-lg bg-red-500/20 px-2 py-1 text-[10px] font-black uppercase text-red-400">
                Bot-blocked
              </span>
            )}
          </div>

          <form onSubmit={(e) => void handleCreateJob(e)} className="flex flex-col gap-4">
            {/* Row 1: shop URL + scan button */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Shop listing URL (first page)
                </label>
                <input
                  value={shopUrl}
                  onChange={(e) => setShopUrl(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="https://rasakatha.lk/shop/"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={scanLoading || !shopUrl.trim()}
                className="shrink-0 rounded-xl border border-primary/40 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-primary transition hover:bg-primary/10 disabled:opacity-40"
              >
                {scanLoading ? "Scanning…" : "① Fetch count"}
              </button>
            </div>

            {/* Scan result banner */}
            {scanEstimate != null && (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Products found</p>
                  <p className="text-2xl font-black text-emerald-300">{scanEstimate.toLocaleString()}</p>
                </div>
                {partsEst != null && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">JSON parts @ {chunkSize}/chunk</p>
                    <p className="text-2xl font-black text-emerald-300">{partsEst}</p>
                  </div>
                )}
              </div>
            )}

            {/* Row 2: fragment + chunk + label */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[160px] flex-1">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Product URL fragments
                </label>
                <input
                  value={productFragments}
                  onChange={(e) => setProductFragments(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-sm outline-none focus:border-primary"
                  placeholder="/books/,/product/"
                />
                <p className="mt-1 text-[10px] text-white/30">
                  Comma-separated path substrings that identify product links (e.g.{" "}
                  <code>/product/</code> for WooCommerce)
                </p>
              </div>
              <div className="w-[8rem]">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  ② Divide per JSON
                </label>
                <input
                  type="number"
                  min={1}
                  value={chunkSize}
                  onChange={(e) => {
                    setChunkSize(Math.max(1, Number(e.target.value || "50")));
                    setScanEstimate((v) => v); // keep scan result visible
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Label (optional)
                </label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder={`${selectedPreset.name} full run`}
                />
              </div>
            </div>

            {/* catalog_source override */}
            <div className="flex items-end gap-3">
              <div className="w-[200px]">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/45">
                  catalog_source slug
                </label>
                <input
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-sm outline-none focus:border-primary"
                  placeholder="rasakatha"
                />
                <p className="mt-1 text-[10px] text-white/30">Auto-set from preset. Override if needed.</p>
              </div>
              <button
                type="submit"
                disabled={creating || !newSource.trim()}
                className="premium-button rounded-xl px-8 py-2.5 text-xs font-black uppercase tracking-widest disabled:opacity-40"
              >
                {creating ? "Creating…" : "③ Create job"}
              </button>
            </div>

            <p className="text-[11px] text-white/35">
              After creating, the VM worker daemon will pick up this job automatically
              within ~30 s and start scraping. Refresh the jobs table below to see progress.
            </p>
          </form>
        </section>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {/* ── Jobs table ────────────────────────────────────────────────────── */}
        <section className="glass overflow-hidden rounded-2xl border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/50">
              Jobs ({jobs.length})
              {jobs.some((j) => j.status === "running") && (
                <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
              )}
            </h2>
            <button
              type="button"
              onClick={() => load()}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-white/45">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-white/45">
              No jobs yet. Select a site above, scan count, then create a job.
              <br />
              <span className="mt-1 block text-[11px] text-white/30">
                The OCI VM worker daemon auto-picks up any pending job within ~30 s.
              </span>
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
                    <th className="px-4 py-3">Heartbeat</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => {
                    const pct =
                      j.rows_scraped != null && j.rows_total_est
                        ? Math.min(100, Math.round((j.rows_scraped / j.rows_total_est) * 100))
                        : null;
                    return (
                      <tr key={j.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                        <td className="px-4 py-3 font-mono text-xs text-white/80">{j.catalog_source}</td>
                        <td className="px-4 py-3 text-white/70">{j.label ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${statusClass(j.status)}`}>
                            {j.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          <div>
                            {j.rows_scraped ?? "—"}
                            {j.rows_total_est != null && (
                              <span className="text-white/35"> / {j.rows_total_est}</span>
                            )}
                          </div>
                          {pct != null && j.status === "running" && (
                            <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">{j.parts_total ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-white/40">
                          {j.last_heartbeat_at
                            ? new Date(j.last_heartbeat_at).toLocaleTimeString()
                            : "—"}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
