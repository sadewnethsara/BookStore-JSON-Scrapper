import "server-only";

type LuminaServerSupabase = Awaited<
  ReturnType<
    typeof import("@lumina/supabase-client/server").createLuminaServerClient
  >
>;

/** PostgREST 2.104 expects generated `Database` tables to extend `GenericTable`; hand-written rows collapse to `never`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
type Loosen = any;

interface ImageRow {
  id: string;
  book_id: string;
  url: string | null;
  storage_path: string | null;
}

interface BookSkuRow {
  id: string;
  source_sku: string | null;
}

function extFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").pop() ?? "";
    const m = /\.([a-zA-Z0-9]{1,8})$/.exec(seg);
    if (m) return m[1].toLowerCase();
  } catch {
    /* ignore */
  }
  return "jpg";
}

function safeSku(sku: string | null | undefined): string {
  if (!sku) return "unknown";
  return sku.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 120);
}

/** Download http(s) cover URLs written by promote RPC and upload to book-covers. */
export async function rehostExternalBookCovers(
  supabase: LuminaServerSupabase,
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;
  const sb = supabase as Loosen;

  const { data: rows, error } = await sb
    .from("book_images")
    .select("id, book_id, url, storage_path")
    .like("url", "http%")
    .is("storage_path", null)
    .limit(2000);

  if (error) {
    console.error("rehostExternalBookCovers select:", error);
    return { uploaded: 0, failed: 0 };
  }
  if (!rows?.length) {
    return { uploaded: 0, failed: 0 };
  }

  const imageRows = rows as ImageRow[];
  const bookIds = [...new Set(imageRows.map((r) => r.book_id))];
  const { data: books, error: booksErr } = await sb
    .from("books")
    .select("id, source_sku")
    .in("id", bookIds);

  if (booksErr) {
    console.error("rehostExternalBookCovers books:", booksErr);
    return { uploaded: 0, failed: 0 };
  }

  const skuByBookId = new Map<string, string | null>(
    ((books ?? []) as BookSkuRow[]).map((b) => [b.id, b.source_sku]),
  );

  for (const row of imageRows) {
    const url = row.url;
    if (!url?.startsWith("http")) continue;

    const sku = skuByBookId.get(row.book_id) ?? undefined;
    const ext = extFromUrl(url);
    const objectPath = `jsonview/${safeSku(sku)}-${row.id.slice(0, 8)}.${ext}`;

    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        failed += 1;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType =
        res.headers.get("content-type")?.split(";")[0]?.trim() || `image/${ext}`;

      const { error: upErr } = await sb.storage
        .from("book-covers")
        .upload(objectPath, buf, { contentType, upsert: true });

      if (upErr) {
        console.error("storage upload", upErr);
        failed += 1;
        continue;
      }

      const { data: pub } = sb.storage
        .from("book-covers")
        .getPublicUrl(objectPath);

      const { error: dbErr } = await sb
        .from("book_images")
        .update({
          storage_path: objectPath,
          url: pub.publicUrl,
        })
        .eq("id", row.id);

      if (dbErr) {
        console.error("book_images update", dbErr);
        failed += 1;
        continue;
      }
      uploaded += 1;
    } catch (e) {
      console.error("rehost row", e);
      failed += 1;
    }
  }

  return { uploaded, failed };
}
