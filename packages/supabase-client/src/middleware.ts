import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "./database.types";
import { getLuminaSupabaseEnv } from "./env";

export type LuminaMiddlewareResult = {
  supabase: ReturnType<typeof createServerClient<Database>>;
  response: NextResponse;
};

/** Next.js middleware: refresh session cookies on each request. */
export function createLuminaSupabaseMiddleware(
  request: NextRequest,
): LuminaMiddlewareResult {
  const { url, anonKey } = getLuminaSupabaseEnv();
  let response = NextResponse.next({ request });

  const setAll: SetAllCookies = (cookiesToSet) => {
    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
    response = NextResponse.next({ request });
    cookiesToSet.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
  };

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll,
    },
  });

  return { supabase, response };
}
