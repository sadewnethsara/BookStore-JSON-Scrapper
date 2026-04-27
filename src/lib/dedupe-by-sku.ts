/** Normalised key for merge / save deduplication (last occurrence wins). */
export function normaliseSkuKey(sku: string): string {
  return sku.trim().toLowerCase();
}

function catalogSlug(item: { catalog_source?: string }): string {
  const raw = item.catalog_source?.trim();
  return (raw && raw.length > 0 ? raw : "rasakatha").toLowerCase();
}

/** Dedupe by source + sku (Phase 3 multi-catalog). */
export function dedupeBySku<
  T extends { sku: string; catalog_source?: string },
>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = `${catalogSlug(item)}::${normaliseSkuKey(item.sku)}`;
    map.set(key, item);
  }
  return [...map.values()];
}
