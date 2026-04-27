import { enrichCatalogRow } from "@/lib/ai-enrich";
import { assertJsonViewWriteAuth } from "@/lib/auth-guard";
import type { ScrapedBook } from "@lumina/shared-types";
import { NextResponse } from "next/server";

/** GET: whether AI enrichment is configured (no key exposure). */
export async function GET() {
  const enabled = Boolean(process.env.OPENAI_API_KEY?.trim());
  return NextResponse.json({ enabled });
}

/**
 * POST `{ "book": Partial<ScrapedBook> }` — returns suggested category + summary.
 * Auth matches other write routes when Supabase env is set.
 */
export async function POST(request: Request) {
  const auth = await assertJsonViewWriteAuth();
  if (auth) {
    return auth;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const book = (body as { book?: unknown }).book;
  if (typeof book !== "object" || book === null) {
    return NextResponse.json(
      { error: 'Expected JSON: { "book": { ... } }' },
      { status: 400 },
    );
  }

  const b = book as Partial<ScrapedBook>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "book.name is required for AI enrichment." },
      { status: 400 },
    );
  }

  try {
    const out = await enrichCatalogRow({
      name,
      author: typeof b.author === "string" ? b.author : undefined,
      publisher: typeof b.publisher === "string" ? b.publisher : undefined,
      description:
        typeof b.description === "string" ? b.description : undefined,
      category: typeof b.category === "string" ? b.category : undefined,
      language: typeof b.language === "string" ? b.language : undefined,
    });
    return NextResponse.json(out);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    console.error("enrichCatalogRow:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
