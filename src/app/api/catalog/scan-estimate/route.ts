import { NextResponse } from "next/server";

import { assertJsonViewWriteAuth } from "@/lib/auth-guard";

type Body = {
  shop_url?: string;
  product_path_fragments?: string;
  max_pages?: number;
};

function listingPageUrl(base: URL, page: number): string {
  const path = base.pathname.endsWith("/")
    ? base.pathname.slice(0, -1)
    : base.pathname;
  if (page <= 1) return `${base.origin}${path || "/"}/`;
  return `${base.origin}${path || ""}/page/${page}/`;
}

export async function POST(request: Request) {
  const auth = await assertJsonViewWriteAuth();
  if (auth) return auth;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const shopRaw = body.shop_url?.trim();
  if (!shopRaw) {
    return NextResponse.json({ error: "shop_url is required" }, { status: 400 });
  }

  let shop: URL;
  try {
    shop = new URL(shopRaw);
  } catch {
    return NextResponse.json({ error: "Invalid shop_url" }, { status: 400 });
  }
  const fragments = (body.product_path_fragments ?? "/books/")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const maxPages = Math.min(Math.max(body.max_pages ?? 40, 1), 120);

  const productUrls = new Set<string>();
  let pagesScanned = 0;
  let lastPageHit = 1;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = listingPageUrl(shop, page);
    let html = "";
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    pagesScanned += 1;
    const hrefs = [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
      .map((m) => m[1])
      .filter(Boolean);
    let newOnPage = 0;
    for (const href of hrefs) {
      const absolute = new URL(href, shop.origin).toString();
      const u = new URL(absolute);
      const path = `${u.pathname}${u.search}`.toLowerCase();
      if (!fragments.some((f) => path.includes(f.toLowerCase()))) continue;
      if (!absolute.startsWith(shop.origin)) continue;
      if (!productUrls.has(absolute)) {
        productUrls.add(absolute);
        newOnPage += 1;
      }
    }
    if (newOnPage === 0 && page > 1) {
      lastPageHit = page;
      break;
    }
    lastPageHit = page;
  }

  return NextResponse.json({
    ok: true,
    estimate: productUrls.size,
    pagesScanned,
    lastPageHit,
  });
}

