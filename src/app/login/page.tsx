"use client";

import { createLuminaBrowserClient } from "@lumina/supabase-client/browser";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam?.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      router.push(safeNext);
      router.refresh();
      return;
    }

    setLoading(true);
    try {
      const supabase = createLuminaBrowserClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(signError.message);
        return;
      }
      router.push(safeNext);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const offline = !isSupabaseConfigured();

  return (
    <div className="w-full max-w-md glass rounded-3xl border border-white/10 p-8 md:p-10 shadow-2xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-black tracking-tight text-white">
          Lumina JSON View
        </h1>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Sign in (admin required for Save / Merge)
        </p>
      </div>

      {offline ? (
        <p className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-200">
          Supabase URL and anon key are not set — use{" "}
          <span className="font-mono">.env.local</span> for hosted mode, or run
          without them for local file-only mode.
        </p>
      ) : null}

      <form onSubmit={(e) => void handleLogin(e)} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-white/50">
            Email
          </label>
          <input
            type="email"
            required={!offline}
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            autoComplete="email"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-white/50">
            Password
          </label>
          <input
            type="password"
            required={!offline}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-primary"
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="premium-button mt-2 w-full rounded-xl py-4 text-xs font-black uppercase tracking-widest disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#070712] p-6">
      <Suspense
        fallback={
          <div className="glass rounded-3xl px-12 py-16 text-xs font-black uppercase tracking-widest text-white/40">
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
