import type { Json } from "@lumina/supabase-client";
import { partitionScrapedBooks } from "@lumina/shared-types";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { assertJsonViewWriteAuth, isJsonViewSupabaseConfigured } from "@/lib/auth-guard";
import { dedupeBySku } from "@/lib/dedupe-by-sku";
import { jsonViewAdminDb } from "@/lib/jsonview-admin-db";

export async function POST(request: Request) {
  try {
    const auth = await assertJsonViewWriteAuth();
    if (auth) {
      return auth;
    }

    const { items } = await request.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "Invalid items data" }, { status: 400 });
    }

    const { valid, errors } = partitionScrapedBooks(items);
    if (valid.length === 0) {
      return NextResponse.json(
        {
          error: "No valid catalog rows",
          rowErrors: errors.slice(0, 50),
          rowErrorCount: errors.length,
        },
        { status: 400 },
      );
    }

    const deduped = dedupeBySku(valid);

    if (isJsonViewSupabaseConfigured()) {
      const supabase = await jsonViewAdminDb();
      const rows = deduped.map((item) => ({
        catalog_source: item.catalog_source.trim(),
        source_sku: item.sku.trim(),
        payload: item as unknown as Json,
      }));

      const { error } = await supabase.rpc("jsonview_upsert_staging_books", {
        p_rows: rows,
      });

      if (error) {
        console.error("jsonview_upsert_staging_books:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        target: "supabase",
        count: deduped.length,
        chunks: 1,
        skippedInvalid: errors.length,
        dedupedFrom: valid.length,
      });
    }

    const saveDir = path.join(process.cwd(), "assets", "save");

    // Ensure dir exists
    await fs.mkdir(saveDir, { recursive: true });

    const chunkSizeRaw = process.env.JSONVIEW_SAVE_CHUNK_SIZE;
    const chunkSize = Math.max(
      1,
      Number.parseInt(chunkSizeRaw ?? "50", 10) || 50,
    );

    const chunks = [];
    for (let i = 0; i < deduped.length; i += chunkSize) {
      chunks.push(deduped.slice(i, i + chunkSize));
    }

    // Save each chunk
    for (let i = 0; i < chunks.length; i++) {
      const fileName = `${i + 1}.json`;
      const filePath = path.join(saveDir, fileName);
      await fs.writeFile(filePath, JSON.stringify(chunks[i], null, 2));
    }

    return NextResponse.json({
      success: true,
      target: "local",
      count: deduped.length,
      chunks: chunks.length,
      skippedInvalid: errors.length,
      dedupedFrom: valid.length,
    });
  } catch (error: unknown) {
    console.error("Error saving files:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
