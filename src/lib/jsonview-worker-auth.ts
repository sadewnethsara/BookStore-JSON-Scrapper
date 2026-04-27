/**
 * Phase 5: machine-to-machine auth for OCI / VM workers posting ingest progress and parts.
 * Header: Authorization: Bearer <JSONVIEW_WORKER_SECRET> or X-Jsonview-Worker: <secret>
 */
export function getJsonViewWorkerSecret(): string | undefined {
  return process.env.JSONVIEW_WORKER_SECRET?.trim() || undefined;
}

export function isJsonViewWorkerRequestAuthorized(request: Request): boolean {
  const expected = getJsonViewWorkerSecret();
  if (!expected) {
    return false;
  }
  const bearer =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim() ?? "";
  const alt = request.headers.get("x-jsonview-worker")?.trim() ?? "";
  const got = bearer || alt;
  return Boolean(got) && got === expected;
}
