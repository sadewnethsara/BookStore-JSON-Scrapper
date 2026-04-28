"use client";

import { createLuminaBrowserClient } from "@lumina/supabase-client/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  email: string | null;
};

export function ProfileMenu({ email }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const initial =
    email && email.length > 0 ? email[0]?.toUpperCase() ?? "?" : "?";

  async function signOut() {
    const supabase = createLuminaBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!email) {
    return (
      <Link
        href="/login"
        className="rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-widest text-white/80 hover:bg-white/10"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-2 py-1.5 hover:bg-white/10 transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/80 to-indigo-600/90 text-sm font-black text-white shadow-inner">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate text-left text-xs font-semibold text-white/85 sm:inline">
          {email}
        </span>
        <ChevronIcon className={`h-4 w-4 text-white/50 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-xl border border-white/10 bg-[#12121c] py-2 shadow-2xl shadow-black/50"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-white/40">
              Signed in as
            </p>
            <p className="mt-1 break-all text-sm font-medium text-white/90">{email}</p>
          </div>
          <Link
            href="/publish"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-violet-200 hover:bg-white/5"
          >
            Publish reviewed JSON
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-300 hover:bg-white/5"
          >
            <LogoutIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
