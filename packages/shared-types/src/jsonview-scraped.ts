import { z } from "zod";

/** Rasakatha / json-view catalog row (strings match scraper CSV fields). */
export const scrapedBookSchema = z
  .object({
    name: z.string().min(1, "name is required"),
    url: z.string().optional().default(""),
    sku: z.string().min(1, "sku is required"),
    category: z.string().optional().default(""),
    original_price: z.string().optional().default(""),
    sale_price: z.string().optional().default(""),
    discount_percent: z.string().optional().default(""),
    stock_status: z.string().optional().default(""),
    description: z.string().optional().default(""),
    image_url: z.string().optional().default(""),
    author: z.string().optional().default(""),
    publisher: z.string().optional().default(""),
    language: z.string().optional().default(""),
    page_count: z.string().optional().default(""),
    /** Ingest source slug (rasakatha, publisher_xy, …); paired with sku for uniqueness. */
    catalog_source: z.string().min(1).default("rasakatha"),
  })
  .passthrough();

export type ScrapedBook = z.infer<typeof scrapedBookSchema>;

export function partitionScrapedBooks(json: unknown): {
  valid: ScrapedBook[];
  errors: { index: number; message: string }[];
} {
  if (!Array.isArray(json)) {
    return {
      valid: [],
      errors: [{ index: -1, message: "Root JSON must be an array" }],
    };
  }
  const valid: ScrapedBook[] = [];
  const errors: { index: number; message: string }[] = [];
  json.forEach((item, index) => {
    const r = scrapedBookSchema.safeParse(item);
    if (r.success) {
      valid.push(r.data);
    } else {
      errors.push({
        index,
        message: r.error.issues.map((i) => i.message).join("; "),
      });
    }
  });
  return { valid, errors };
}
