"use client";

import { useSyncExternalStore, useState } from "react";

type Props = {
  jobId: string;
  catalogSource: string;
  /** Full shop listing URL, e.g. https://bookolog.lk/shop/ */
  shopUrl: string;
  /** Comma-separated path fragments, e.g. /product/,/books/ */
  productPathFragments: string;
};

function ingestJobsBaseUrl(): string {
  return typeof window !== "undefined"
    ? window.location.origin
    : "https://bookstore-json.vercel.app";
}

export function WorkerEnvSnippet({
  jobId,
  catalogSource,
  shopUrl,
  productPathFragments,
}: Props) {
  const baseUrl = useSyncExternalStore(
    () => () => {},
    ingestJobsBaseUrl,
    () => "https://bookstore-json.vercel.app",
  );
  const [copied, setCopied] = useState(false);

  const shop = shopUrl || "https://rasakatha.lk/shop/";
  const frags = productPathFragments || "/books/";

  const script = `# On the VM (after: cd .../rasakatha-scraper && source .venv/bin/activate)
export SCRAPER_SHOP_URL='${shop}'
export SCRAPER_PRODUCT_PATH_FRAGMENTS='${frags}'
export CATALOG_SOURCE='${catalogSource}'
export JSONVIEW_BASE_URL='${baseUrl}'
export JSONVIEW_WORKER_SECRET='(same as Vercel JSONVIEW_WORKER_SECRET)'
export JSONVIEW_JOB_ID='${jobId}'
export JSONVIEW_SCRAPE_FIRST=1
python3 jsonview_worker.py`;

  return (
    <div className="mt-6 rounded-2xl border border-cyan-500/25 bg-cyan-950/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-cyan-200/90">
          Worker (OCI) — environment
        </h3>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(script).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/20"
        >
          {copied ? "Copied" : "Copy script"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/50">
        <code className="text-white/70">SCRAPER_SHOP_URL</code> must be the
        product <strong>listing</strong> first page (same host you use in the
        form). For sites that use <code className="text-white/70">/product/</code>{" "}
        instead of <code className="text-white/70">/books/</code>, set path
        fragments (comma-separated). Product <strong>detail</strong> pages must
        still look like WooCommerce (this scraper{"'"}s selectors are
        store-specific; you may need a fork for some shops).
      </p>
      <pre className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/50 p-4 text-[10px] leading-relaxed text-cyan-100/90 font-mono whitespace-pre-wrap break-all">
        {script}
      </pre>
    </div>
  );
}
