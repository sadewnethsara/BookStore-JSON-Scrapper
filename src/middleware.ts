import { createLuminaSupabaseMiddleware } from "@lumina/supabase-client/middleware";
import { type NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}

function mergeCookies(from: NextResponse, into: NextResponse): NextResponse {
  for (const c of from.cookies.getAll()) {
    into.cookies.set(c.name, c.value);
  }
  return into;
}

/**
 * Refresh Supabase cookies on API routes (no redirect — worker/cron use Bearer;
 * write APIs return JSON 401/403).
 * When public Supabase env is set, page routes require a signed-in session.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api")) {
    const { supabase, response } = createLuminaSupabaseMiddleware(request);
    await supabase.auth.getUser();
    return response;
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  const { supabase, response } = createLuminaSupabaseMiddleware(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  if (isLogin) {
    if (user) {
      const next = request.nextUrl.searchParams.get("next");
      const safe =
        next?.startsWith("/") && !next.startsWith("//") ? next : "/";
      const r = NextResponse.redirect(new URL(safe, request.url));
      return mergeCookies(response, r);
    }
    return response;
  }

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname || "/");
    const r = NextResponse.redirect(login);
    return mergeCookies(response, r);
  }

  return response;
}
