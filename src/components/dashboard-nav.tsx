"use client";

import Link from "next/link";

type Props = {
  /** detail page highlights "detail" */
  variant?: "list" | "detail";
};

export function DashboardNav({ variant = "list" }: Props) {
  return (
    <nav className="flex flex-wrap items-center gap-3 border-b border-white/10 px-6 py-4 glass shrink-0">
      <Link
        href="/"
        className="text-[11px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-colors"
      >
        ← Review queue
      </Link>
      <span className="text-white/25">/</span>
      <Link
        href="/ingest-jobs"
        className={`text-[11px] font-black uppercase tracking-widest ${
          variant === "list"
            ? "text-primary"
            : "text-white/70 hover:text-white"
        }`}
      >
        Ingest jobs
      </Link>
      {variant === "detail" ? (
        <>
          <span className="text-white/25">/</span>
          <span className="text-[11px] font-black uppercase tracking-widest text-white/90">
            Job detail
          </span>
        </>
      ) : null}
    </nav>
  );
}
