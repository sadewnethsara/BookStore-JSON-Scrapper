"""
Post scraped products to json-view Phase 5 worker API (OCI VM → Vercel).

Environment (required):
  JSONVIEW_BASE_URL       e.g. https://bookstore-json.vercel.app
  JSONVIEW_WORKER_SECRET  same value as server JSONVIEW_WORKER_SECRET
  JSONVIEW_JOB_ID         UUID from admin POST /api/catalog/ingest-jobs

Environment (optional):
  JSONVIEW_SCRAPE_FIRST   if "1"/"true", run scraper.py before upload
  SCRAPER_SHOP_URL        shop listing URL (must match job.config.shop_url); default rasakatha
  SCRAPER_PRODUCT_PATH_FRAGMENTS  e.g. /books/ or /product/,/books/ — must match product links
  CATALOG_SOURCE          slug stored on rows (often same as catalog_source)
  JSONVIEW_INPUT_JSON     path to JSON array (default: output/products.json)
  JSONVIEW_PART_CHUNK_SIZE rows per part (default: 50)

Example:
  export JSONVIEW_BASE_URL=https://bookstore-json.vercel.app
  export JSONVIEW_WORKER_SECRET=...
  export JSONVIEW_JOB_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  python jsonview_worker.py
"""

from __future__ import annotations

import json
import logging
import math
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT = SCRIPT_DIR / "output" / "products.json"


def _env_bool(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def worker_endpoint(base: str, job_id: str) -> str:
    return f"{base.rstrip('/')}/api/catalog/ingest-jobs/{job_id.strip()}/worker"


def post_worker(
    session: requests.Session,
    url: str,
    secret: str,
    body: dict[str, Any],
    timeout: int = 120,
) -> dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {secret}",
    }
    r = session.post(url, json=body, headers=headers, timeout=timeout)
    try:
        data = r.json()
    except Exception:
        data = {"_raw": r.text[:500]}
    if not r.ok:
        log.error("Worker POST %s — %s: %s", r.status_code, url, data)
        r.raise_for_status()
    return data if isinstance(data, dict) else {"_data": data}


def load_products(path: Path) -> list[Any]:
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("JSON root must be an array of product objects")
    return data


def chunk_list(items: list[Any], size: int) -> list[list[Any]]:
    if size < 1:
        size = 50
    return [items[i : i + size] for i in range(0, len(items), size)]


def run_scraper() -> None:
    scraper = SCRIPT_DIR / "scraper.py"
    log.info("Running %s …", scraper)
    subprocess.run([sys.executable, str(scraper)], cwd=str(SCRIPT_DIR), check=True)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    base = os.environ.get("JSONVIEW_BASE_URL", "").strip()
    secret = os.environ.get("JSONVIEW_WORKER_SECRET", "").strip()
    job_id = os.environ.get("JSONVIEW_JOB_ID", "").strip()

    if not base or not secret or not job_id:
        log.error(
            "Set JSONVIEW_BASE_URL, JSONVIEW_WORKER_SECRET, and JSONVIEW_JOB_ID "
            "(create a job in json-view admin: POST /api/catalog/ingest-jobs)."
        )
        return 1

    input_raw = os.environ.get("JSONVIEW_INPUT_JSON", "").strip()
    input_path = Path(input_raw) if input_raw else DEFAULT_INPUT
    if not input_path.is_absolute():
        input_path = SCRIPT_DIR / input_path

    try:
        chunk_size = int(os.environ.get("JSONVIEW_PART_CHUNK_SIZE", "50") or "50")
    except ValueError:
        chunk_size = 50

    if _env_bool("JSONVIEW_SCRAPE_FIRST"):
        run_scraper()

    url = worker_endpoint(base, job_id)

    if not input_path.exists():
        log.error("Input JSON not found: %s", input_path)
        _fail(session := requests.Session(), url, secret, f"Missing file: {input_path}")
        return 1

    try:
        products = load_products(input_path)
    except (OSError, json.JSONDecodeError, ValueError) as e:
        log.error("Could not read products: %s", e)
        _fail(requests.Session(), url, secret, str(e))
        return 1

    n = len(products)
    parts_total = math.ceil(n / chunk_size) if n and chunk_size > 0 else 0

    session = requests.Session()

    # Heartbeat: tell server how many rows / parts we plan to send
    post_worker(
        session,
        url,
        secret,
        {
            "type": "heartbeat",
            "status": "running",
            "rows_scraped": 0,
            "rows_total_est": n,
            "parts_total": parts_total,
        },
    )
    log.info("Heartbeat ok — rows_total_est=%s parts_total=%s", n, parts_total)

    if n == 0:
        post_worker(session, url, secret, {"type": "complete"})
        log.info("No rows; marked job complete.")
        return 0

    parts = chunk_list(products, chunk_size)
    rows_done = 0
    for idx, chunk in enumerate(parts, start=1):
        post_worker(
            session,
            url,
            secret,
            {"type": "part", "partIndex": idx, "items": chunk},
            timeout=180,
        )
        rows_done += len(chunk)
        log.info("Uploaded part %s/%s (%s rows)", idx, len(parts), len(chunk))
        post_worker(
            session,
            url,
            secret,
            {
                "type": "heartbeat",
                "status": "running",
                "rows_scraped": rows_done,
                "rows_total_est": n,
                "parts_total": parts_total,
            },
        )

    post_worker(session, url, secret, {"type": "complete"})
    log.info("Job complete — %s rows in %s parts.", n, len(parts))
    return 0


def _fail(session: requests.Session, url: str, secret: str, message: str) -> None:
    try:
        post_worker(session, url, secret, {"type": "fail", "error_message": message})
    except requests.RequestException:
        log.warning("Could not POST fail payload to worker API")


if __name__ == "__main__":
    raise SystemExit(main())
