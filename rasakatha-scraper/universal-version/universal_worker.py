"""
╔══════════════════════════════════════════════════════════════════════════╗
║   Universal Worker Daemon — OCI VM / any always-on Linux host            ║
║                                                                          ║
║   Polls the json-view pending-job endpoint every POLL_INTERVAL seconds. ║
║   When a job is found it:                                                ║
║     1. Looks up the site config in sites.py by catalog_source            ║
║     2. Runs scraper.py --site <id> --format json                         ║
║     3. Reads output/<id>.json                                            ║
║     4. POSTs chunks to /api/catalog/ingest-jobs/:id/worker               ║
║     5. Marks the job complete (or failed)                                ║
║     6. Goes back to polling                                              ║
║                                                                          ║
║  Environment (required):                                                 ║
║    JSONVIEW_BASE_URL       https://bookstore-json.vercel.app             ║
║    JSONVIEW_WORKER_SECRET  shared secret                                 ║
║                                                                          ║
║  Environment (optional):                                                 ║
║    POLL_INTERVAL           seconds between polls (default 30)            ║
║    JSONVIEW_PART_CHUNK_SIZE rows per part (default from job.config or 50)║
║    SCRAPER_MAX_PAGES        max listing pages per site (0 = all)         ║
║    SCRAPER_DELAY            seconds between requests (default 1.5)       ║
║                                                                          ║
║  Run as a daemon (tmux / systemd):                                       ║
║    source .venv/bin/activate                                             ║
║    export JSONVIEW_BASE_URL=https://bookstore-json.vercel.app            ║
║    export JSONVIEW_WORKER_SECRET='...'                                   ║
║    python3 universal_worker.py                                           ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import json
import logging
import math
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

import requests

from sites import SITES as KNOWN_SITES

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).resolve().parent

# ── Environment ───────────────────────────────────────────────────────────────
BASE_URL      = os.environ.get("JSONVIEW_BASE_URL", "").rstrip("/")
WORKER_SECRET = os.environ.get("JSONVIEW_WORKER_SECRET", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
DEFAULT_CHUNK = int(os.environ.get("JSONVIEW_PART_CHUNK_SIZE", "50"))
MAX_PAGES     = os.environ.get("SCRAPER_MAX_PAGES", "")   # "" means all
SCRAPER_DELAY = os.environ.get("SCRAPER_DELAY", "1.5")


# ══════════════════════════════════════════════════════════════════════════════
# HTTP helpers
# ══════════════════════════════════════════════════════════════════════════════

def _headers() -> dict[str, str]:
    return {
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {WORKER_SECRET}",
    }


def _post_worker(session: requests.Session, job_id: str, body: dict[str, Any],
                 timeout: int = 120) -> dict[str, Any]:
    url = f"{BASE_URL}/api/catalog/ingest-jobs/{job_id}/worker"
    r = session.post(url, json=body, headers=_headers(), timeout=timeout)
    try:
        data = r.json()
    except Exception:
        data = {"_raw": r.text[:500]}
    if not r.ok:
        log.error("Worker POST %s — %s: %s", r.status_code, url, data)
        r.raise_for_status()
    return data if isinstance(data, dict) else {"_data": data}


def _fail_job(session: requests.Session, job_id: str, message: str) -> None:
    try:
        _post_worker(session, job_id, {"type": "fail", "error_message": message})
    except Exception as e:
        log.warning("Could not POST fail payload: %s", e)


def _heartbeat(session: requests.Session, job_id: str,
               rows_scraped: int = 0, rows_total_est: int = 0,
               parts_total: int = 0) -> None:
    try:
        _post_worker(session, job_id, {
            "type":           "heartbeat",
            "status":         "running",
            "rows_scraped":   rows_scraped,
            "rows_total_est": rows_total_est,
            "parts_total":    parts_total,
        })
    except Exception as e:
        log.warning("Heartbeat failed: %s", e)


class _HeartbeatThread(threading.Thread):
    """Sends a keep-alive heartbeat every INTERVAL seconds while the scraper runs."""

    INTERVAL = 90  # seconds — well under the 10-min stale threshold

    def __init__(self, session: requests.Session, job_id: str):
        super().__init__(daemon=True)
        self._session  = session
        self._job_id   = job_id
        self._stop_evt = threading.Event()

    def run(self) -> None:
        while not self._stop_evt.wait(self.INTERVAL):
            log.debug("Sending scrape-phase heartbeat for job %s", self._job_id)
            _heartbeat(self._session, self._job_id)

    def stop(self) -> None:
        self._stop_evt.set()


# ══════════════════════════════════════════════════════════════════════════════
# Pending-job polling
# ══════════════════════════════════════════════════════════════════════════════

def poll_pending_job(session: requests.Session) -> Optional[dict[str, Any]]:
    """
    GET /api/catalog/pending-job — claims the next pending job.
    Returns the job dict or None if nothing is pending.
    """
    url = f"{BASE_URL}/api/catalog/pending-job"
    try:
        r = session.get(url, headers=_headers(), timeout=20)
        if not r.ok:
            log.warning("pending-job poll %s: %s", r.status_code, r.text[:300])
            return None
        data = r.json()
        return data.get("job")  # None when no pending jobs
    except requests.RequestException as e:
        log.warning("pending-job poll error: %s", e)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# Site lookup
# ══════════════════════════════════════════════════════════════════════════════

SITE_INDEX: dict[str, dict] = {s["id"]: s for s in KNOWN_SITES}


def load_custom_sites() -> list[dict]:
    p = SCRIPT_DIR / "custom_sites.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def all_sites() -> dict[str, dict]:
    combined = {**SITE_INDEX}
    for s in load_custom_sites():
        combined[s["id"]] = s
    return combined


def resolve_site(catalog_source: str, job_config: dict) -> Optional[dict]:
    """
    Find the site config for a catalog_source slug.
    Falls back to building a minimal config from job.config if no known site matches.
    """
    sites = all_sites()
    if catalog_source in sites:
        return sites[catalog_source]

    # Fallback: construct a minimal site from job.config if shop_url is present
    shop_url = job_config.get("shop_url", "")
    if shop_url:
        frags = job_config.get("product_path_fragments", "/product/")
        log.info(
            "No known site for '%s'; building from job.config (shop_url=%s)",
            catalog_source,
            shop_url,
        )
        from urllib.parse import urlparse
        parsed = urlparse(shop_url)
        return {
            "id":        catalog_source,
            "name":      catalog_source,
            "url":       f"{parsed.scheme}://{parsed.netloc}",
            "platform":  "custom",
            "language":  "Unknown",
            "specialty": "Custom site from job config",
            "shop_paths": [parsed.path or "/"],
            "product_url_must_contain": frags.split(",")[0].strip(),
            "product_url_skip": ["/cart", "/account", "/checkout"],
            "selectors": {},
            "active": True,
            "notes": "Auto-generated from job.config",
        }

    log.error(
        "Unknown catalog_source '%s' and no shop_url in job config. "
        "Add it to sites.py or provide shop_url in the job config.",
        catalog_source,
    )
    return None


# ══════════════════════════════════════════════════════════════════════════════
# Scraping
# ══════════════════════════════════════════════════════════════════════════════

def run_scraper(site_id: str, max_pages: Optional[int], delay: float,
                heartbeat_thread: Optional["_HeartbeatThread"] = None) -> Path:
    """Run scraper.py --site <id> --format json and return path to output JSON."""
    scraper = SCRIPT_DIR / "scraper.py"
    args = [sys.executable, str(scraper), "--site", site_id, "--format", "json"]
    if max_pages:
        args += ["--pages", str(max_pages)]
    if delay:
        args += ["--delay", str(delay)]

    log.info("Running scraper: %s", " ".join(args))
    if heartbeat_thread:
        heartbeat_thread.start()

    try:
        result = subprocess.run(args, cwd=str(SCRIPT_DIR), capture_output=False)
    finally:
        if heartbeat_thread:
            heartbeat_thread.stop()

    if result.returncode != 0:
        raise RuntimeError(f"scraper.py exited with code {result.returncode}")

    output_path = SCRIPT_DIR / "output" / f"{site_id}.json"
    if not output_path.exists():
        raise FileNotFoundError(f"Scraper output not found: {output_path}")
    return output_path


def chunk_list(items: list, size: int) -> list[list]:
    if size < 1:
        size = 50
    return [items[i : i + size] for i in range(0, len(items), size)]


# ══════════════════════════════════════════════════════════════════════════════
# Job processing
# ══════════════════════════════════════════════════════════════════════════════

def process_job(session: requests.Session, job: dict[str, Any]) -> None:
    job_id        = job["id"]
    catalog_src   = job["catalog_source"]
    job_config    = job.get("config") or {}

    chunk_size = int(job_config.get("chunk_size", DEFAULT_CHUNK) or DEFAULT_CHUNK)
    max_pages_env = MAX_PAGES or job_config.get("max_pages", "")
    max_pages: Optional[int] = int(max_pages_env) if max_pages_env else None
    delay = float(SCRAPER_DELAY)

    log.info("═══ Processing job %s — source: %s ═══", job_id, catalog_src)

    site = resolve_site(catalog_src, job_config)
    if not site:
        _fail_job(session, job_id, f"Unknown catalog_source '{catalog_src}' — add it to sites.py")
        return

    if not site.get("active", True):
        _fail_job(session, job_id, f"Site '{site['name']}' is marked inactive (bot-blocked).")
        return

    # ── Heartbeat: starting ────────────────────────────────────────────────
    _heartbeat(session, job_id)
    log.info("Scraping %s — this may take a while. Heartbeats sent every 90s.", site["name"])

    # ── Run scraper (background thread keeps heartbeat alive) ──────────────
    hb = _HeartbeatThread(session, job_id)
    try:
        output_path = run_scraper(site["id"], max_pages, delay, heartbeat_thread=hb)
    except Exception as e:
        log.error("Scraper error: %s", e)
        _fail_job(session, job_id, f"Scraper error: {e}")
        return

    # ── Load results ───────────────────────────────────────────────────────
    try:
        raw = json.loads(output_path.read_text(encoding="utf-8"))
    except Exception as e:
        _fail_job(session, job_id, f"Could not read output JSON: {e}")
        return

    if not isinstance(raw, list):
        _fail_job(session, job_id, "Scraper output is not a JSON array.")
        return

    # Pass scraper fields through as-is — ScrapedBook schema uses the same names
    # (name, url, sku, sale_price, original_price, image_url, description, etc.)
    # Only inject catalog_source which the scraper doesn't set.
    products = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        if not item.get("name", "").strip():
            continue
        mapped: dict[str, Any] = {**item, "catalog_source": catalog_src}
        # Ensure sku is present — fall back to last URL path segment
        if not mapped.get("sku", "").strip():
            mapped["sku"] = item.get("url", "").rstrip("/").split("/")[-1]
        products.append(mapped)

    n = len(products)
    log.info("Loaded %d valid products from %s", n, output_path)

    if n == 0:
        _post_worker(session, job_id, {"type": "complete"})
        log.info("No products — job marked complete.")
        return

    parts = chunk_list(products, chunk_size)
    parts_total = len(parts)

    # ── Announce totals ────────────────────────────────────────────────────
    _heartbeat(session, job_id, rows_scraped=0, rows_total_est=n, parts_total=parts_total)

    # ── Upload parts ───────────────────────────────────────────────────────
    rows_done = 0
    for idx, chunk in enumerate(parts, start=1):
        try:
            _post_worker(session, job_id, {"type": "part", "partIndex": idx, "items": chunk}, timeout=180)
            rows_done += len(chunk)
            log.info("  Part %d/%d uploaded (%d rows, total done: %d)", idx, parts_total, len(chunk), rows_done)
        except Exception as e:
            log.error("Failed to upload part %d: %s", idx, e)
            _fail_job(session, job_id, f"Part {idx} upload failed: {e}")
            return

        # Heartbeat after each part
        _heartbeat(session, job_id, rows_scraped=rows_done, rows_total_est=n, parts_total=parts_total)

    # ── Complete ───────────────────────────────────────────────────────────
    _post_worker(session, job_id, {"type": "complete"})
    log.info("Job %s complete — %d rows in %d parts.", job_id, n, parts_total)


# ══════════════════════════════════════════════════════════════════════════════
# Daemon loop
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    if not BASE_URL or not WORKER_SECRET:
        log.error(
            "Set JSONVIEW_BASE_URL and JSONVIEW_WORKER_SECRET before running."
        )
        sys.exit(1)

    log.info("═══ Universal Worker Daemon started ═══")
    log.info("  Base URL      : %s", BASE_URL)
    log.info("  Poll interval : %ds", POLL_INTERVAL)
    log.info("  Default chunk : %d rows/part", DEFAULT_CHUNK)
    log.info("  Known sites   : %d (%d active)",
             len(all_sites()),
             sum(1 for s in all_sites().values() if s.get("active", True)))

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    })

    while True:
        try:
            job = poll_pending_job(session)
            if job:
                log.info("Claimed job: %s (%s)", job["id"], job.get("catalog_source"))
                process_job(session, job)
            else:
                log.debug("No pending jobs. Sleeping %ds…", POLL_INTERVAL)
        except KeyboardInterrupt:
            log.info("Daemon stopped by user.")
            break
        except Exception as e:
            log.exception("Unexpected error in daemon loop: %s", e)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
