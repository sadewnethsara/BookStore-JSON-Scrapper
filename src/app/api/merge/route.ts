import { createLuminaServerClient } from "@lumina/supabase-client/server";
import { partitionScrapedBooks, type ScrapedBook } from "@lumina/shared-types";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { assertJsonViewWriteAuth, isJsonViewSupabaseConfigured } from "@/lib/auth-guard";
import { dedupeBySku } from "@/lib/dedupe-by-sku";
import { rehostExternalBookCovers } from "@/lib/rehost-external-covers";

export async function POST() {
  try {
    const auth = await assertJsonViewWriteAuth();
    if (auth) {
      return auth;
    }

    if (isJsonViewSupabaseConfigured()) {
      const supabase = await createLuminaServerClient();
      const { data, error } = await supabase.rpc("promote_staging_to_catalog");

      if (error) {
        console.error("promote_staging_to_catalog:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const promoted =
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        "promoted" in data
          ? Number((data as { promoted: unknown }).promoted)
          : 0;

      const { uploaded, failed } = await rehostExternalBookCovers(supabase);

      return NextResponse.json({
        success: true,
        target: "supabase",
        count: Number.isFinite(promoted) ? promoted : 0,
        rehostedCovers: uploaded,
        rehostFailed: failed,
      });
    }

    const saveDir = path.join(process.cwd(), "assets", "save");
    const outputDir = path.join(process.cwd(), "output");
    
    // Ensure output dir exists
    await fs.mkdir(outputDir, { recursive: true });

    // Read all files in saveDir
    const files = await fs.readdir(saveDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort((a, b) => {
      // Sort numerically if possible
      const na = parseInt(a.replace('.json', ''));
      const nb = parseInt(b.replace('.json', ''));
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    let allItems: ScrapedBook[] = [];
    for (const file of jsonFiles) {
      const filePath = path.join(saveDir, file);
      const content = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(content) as unknown;
      if (Array.isArray(data)) {
        const { valid } = partitionScrapedBooks(data);
        allItems = allItems.concat(valid);
      } else {
        const { valid } = partitionScrapedBooks([data]);
        allItems = allItems.concat(valid);
      }
    }

    const merged = dedupeBySku(allItems);

    const outputPath = path.join(outputDir, "merged.json");
    await fs.writeFile(outputPath, JSON.stringify(merged, null, 2));

    return NextResponse.json({
      success: true,
      target: "local",
      count: merged.length,
      filePath: outputPath,
    });
  } catch (error: unknown) {
    console.error("Error merging files:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
