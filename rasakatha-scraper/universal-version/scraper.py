"""
╔══════════════════════════════════════════════════════════════════╗
║       Sri Lanka Book Store Scraper — Interactive Edition         ║
║  Covers 20+ Sri Lankan book websites with site-specific tuning  ║
╚══════════════════════════════════════════════════════════════════╝

Run:  python scraper.py
      python scraper.py --add https://newbooksite.lk
      python scraper.py --list
"""

import argparse
import csv
import json
import logging
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

from sites import SITES

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

OUTPUT_DIR = Path("output")
CUSTOM_SITES_FILE = Path("custom_sites.json")

# ══════════════════════════════════════════════════════════════════════════════
# TERMINAL UI  (no external libraries needed)
# ══════════════════════════════════════════════════════════════════════════════

BOLD  = "\033[1m"
GREEN = "\033[92m"
CYAN  = "\033[96m"
YELLOW= "\033[93m"
RED   = "\033[91m"
DIM   = "\033[2m"
RESET = "\033[0m"

def c(color: str, text: str) -> str:
    return f"{color}{text}{RESET}"

BANNER = f"""
{CYAN}{BOLD}╔══════════════════════════════════════════════════════════╗
║     🇱🇰  Sri Lanka Book Store Scraper  📚                ║
║     Covers 20+ local book websites                       ║
╚══════════════════════════════════════════════════════════╝{RESET}
"""

def print_banner():
    print(BANNER)

def print_site_table(sites: list[dict]):
    """Print a numbered table of all available sites."""
    all_sites = sites
    print(f"\n  {'#':<4} {'Site':<25} {'Platform':<12} {'Language':<22} {'Active'}")
    print(f"  {'─'*4} {'─'*25} {'─'*12} {'─'*22} {'─'*6}")
    for i, s in enumerate(all_sites, 1):
        active = c(GREEN, "✓") if s["active"] else c(RED, "✗ (bot-blocked)")
        lang = s["language"][:20]
        platform = s["platform"]
        name = s["name"][:23]
        print(f"  {c(CYAN, str(i)):<12} {name:<25} {platform:<12} {lang:<22} {active}")
    print()

def prompt_selection(all_sites: list[dict]) -> list[dict]:
    """Interactive site selection. Returns chosen sites."""
    print(c(BOLD, "  Select sites to scrape:"))
    print(f"  {c(DIM, 'Enter numbers separated by commas, or special commands:')}")
    print(f"  {c(YELLOW, '  all')}     — scrape all active sites")
    print(f"  {c(YELLOW, '  active')} — scrape all active sites (same as all)")
    print(f"  {c(YELLOW, '  1,3,5')} — scrape sites #1, #3, #5")
    print(f"  {c(YELLOW, '  q')}      — quit\n")

    while True:
        try:
            raw = input(f"  {c(BOLD, '>')} ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\n  Goodbye!")
            sys.exit(0)

        if raw in ("q", "quit", "exit"):
            print("  Goodbye!")
            sys.exit(0)

        if raw in ("all", "active", "a"):
            chosen = [s for s in all_sites if s["active"]]
            print(f"\n  {c(GREEN, f'Selected all {len(chosen)} active sites.')}\n")
            return chosen

        try:
            indices = [int(x.strip()) for x in raw.split(",") if x.strip()]
            chosen = []
            for idx in indices:
                if 1 <= idx <= len(all_sites):
                    chosen.append(all_sites[idx - 1])
                else:
                    print(f"  {c(RED, f'Invalid number: {idx}. Must be 1–{len(all_sites)}')} ")
                    chosen = []
                    break
            if chosen:
                names = ", ".join(s["name"] for s in chosen)
                print(f"\n  {c(GREEN, 'Selected:')} {names}\n")
                return chosen
        except ValueError:
            print(f"  {c(RED, 'Invalid input.')} Enter numbers like: 1,3,5 or type all\n")

def prompt_options() -> dict:
    """Ask for scraping options."""
    print(c(BOLD, "  Scraping options (press Enter to use defaults):"))

    def ask(prompt: str, default) -> str:
        val = input(f"  {prompt} [{c(DIM, str(default))}]: ").strip()
        return val if val else str(default)

    pages  = ask("Max listing pages per site (0 = all)", "0")
    delay  = ask("Delay between requests in seconds", "1.5")
    fmt    = ask("Output format (csv / json / both)", "both")

    try:
        max_pages = int(pages) or None
    except ValueError:
        max_pages = None
    try:
        delay_f = float(delay)
    except ValueError:
        delay_f = 1.5

    print()
    return {"max_pages": max_pages, "delay": delay_f, "format": fmt}


# ══════════════════════════════════════════════════════════════════════════════
# DATA MODEL
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Book:
    name:             str = ""
    url:              str = ""
    sku:              str = ""
    category:         str = ""
    original_price:   str = ""
    sale_price:       str = ""
    discount_percent: str = ""
    description:      str = ""
    image_url:        str = ""
    author:           str = ""
    publisher:        str = ""
    language:         str = ""
    page_count:       str = ""
    platform:         str = ""
    source_site:      str = ""

FIELDS = list(Book.__dataclass_fields__.keys())


# ══════════════════════════════════════════════════════════════════════════════
# HTTP SESSION
# ══════════════════════════════════════════════════════════════════════════════

def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9,si;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    return s

def fetch(session: requests.Session, url: str, timeout: int = 15) -> Optional[BeautifulSoup]:
    try:
        r = session.get(url, timeout=timeout, allow_redirects=True)
        r.raise_for_status()
        return BeautifulSoup(r.text, "html.parser")
    except requests.RequestException as e:
        log.warning("Fetch failed: %s — %s", url, e)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL SELECTOR FALLBACK LISTS
# (site-specific selectors from sites.py are tried FIRST)
# ══════════════════════════════════════════════════════════════════════════════

NAME_SEL = [
    "h1.product_title", "h1.entry-title", "h1.page-title span",
    "h1.product-name", "h1.product-single__title", "h1.product__title",
    "#product-name", ".product-info h1", "h1",
]
PRICE_SEL = [
    ".summary .price", "p.price", ".product-info-price .price-wrapper",
    ".product__price", ".price-new", ".price-box .price",
    ".price", ".product-price", ".book-price",
]
DESC_SEL = [
    ".woocommerce-product-details__short-description",
    ".product-short-description", "#tab-description .entry-content",
    ".product__description", ".product-single__description",
    ".product.attribute.description .value",
    "[itemprop='description']", "#tab-description", ".description",
    ".product-description",
]
IMAGE_SEL = [
    ".woocommerce-product-gallery__image img",
    ".product__media img", ".product-single__photo img",
    ".gallery-placeholder img", ".fotorama__img",
    ".product-gallery img", ".product-image img",
    "#image-main img", "[itemprop='image']",
    ".thumbnail img",
]
SKU_SEL = [
    ".sku", "[itemprop='sku']", ".product-sku",
    ".isbn", "[itemprop='isbn']",
]
CAT_SEL = [
    ".posted_in a", ".product_meta .posted_in a",
    ".breadcrumbs a", ".breadcrumb a",
    ".product-category a", ".categories a",
]

META_KEYWORDS = {
    "author":     ["author", "authors", "written by", "book author", "by"],
    "publisher":  ["publisher", "published by", "publication", "book publisher"],
    "language":   ["language", "book language"],
    "page_count": ["pages", "page count", "number of pages", "page"],
}

CURRENCY_RE = re.compile(r"රු|Rs\.?|LKR|[$£€₹]", re.IGNORECASE)


def first_text(soup: BeautifulSoup, selectors: list[str]) -> str:
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            t = el.get_text(strip=True)
            if t:
                return t
    return ""

def first_el(soup: BeautifulSoup, selectors: list[str]):
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            return el
    return None


# ══════════════════════════════════════════════════════════════════════════════
# PRICE PARSING
# ══════════════════════════════════════════════════════════════════════════════

def _to_float(s: str) -> Optional[float]:
    try:
        return float(s.replace(",", "").strip())
    except ValueError:
        return None

def _clean(s: str) -> str:
    return CURRENCY_RE.sub("", s).strip().strip(",").strip()

def _calc(orig_raw: str, sale_raw: str) -> tuple[str, str, str]:
    oc, sc = _clean(orig_raw), _clean(sale_raw)
    disc = ""
    of_, sf_ = _to_float(oc), _to_float(sc)
    if of_ and sf_ and of_ > 0 and sf_ < of_:
        disc = f"{round((of_ - sf_) / of_ * 100)}%"
    sym_m = CURRENCY_RE.search(orig_raw)
    sym = sym_m.group(0) if sym_m else ""
    return f"{sym}{oc}", f"{sym}{sc}", disc

def parse_prices(soup: BeautifulSoup,
                 site_sel: Optional[str] = None) -> tuple[str, str, str]:
    selectors = ([site_sel] if site_sel else []) + PRICE_SEL
    block = first_el(soup, selectors)
    if block:
        del_ = block.select_one("del .woocommerce-Price-amount, del .amount, del bdi")
        ins_ = block.select_one("ins .woocommerce-Price-amount, ins .amount, ins bdi")
        if del_ and ins_:
            return _calc(del_.get_text(strip=True), ins_.get_text(strip=True))

        amounts = block.select(".woocommerce-Price-amount, .amount, bdi, .money")
        if len(amounts) >= 2:
            return _calc(amounts[0].get_text(strip=True), amounts[-1].get_text(strip=True))
        elif len(amounts) == 1:
            p = amounts[0].get_text(strip=True)
            return p, p, ""

        # Shopify / custom — look for data attributes
        price_el = block.select_one("[data-price], [data-regular-price]")
        if price_el:
            reg = price_el.get("data-regular-price", "")
            cur = price_el.get("data-price", reg)
            if reg and cur:
                return _calc(f"Rs.{int(reg)//100}", f"Rs.{int(cur)//100}")

        # Plain text fallback
        text = block.get_text(strip=True)
        nums = re.findall(r"[\d,]+\.?\d*", text)
        if len(nums) >= 2:
            return _calc(nums[0], nums[-1])
        elif nums:
            return nums[0], nums[0], ""

    return "", "", ""


# ══════════════════════════════════════════════════════════════════════════════
# METADATA EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_metadata(soup: BeautifulSoup) -> dict:
    meta = {k: "" for k in META_KEYWORDS}

    def _key(text: str) -> Optional[str]:
        t = text.lower().strip().rstrip(":")
        for field, kws in META_KEYWORDS.items():
            if any(kw in t for kw in kws):
                return field
        return None

    def _set(f: str, v: str):
        if not meta[f] and v.strip():
            meta[f] = v.strip()

    # 1. WooCommerce meta list / custom attribute lists
    for li in soup.select(".product_meta li, .product-attributes li, .product-meta li"):
        t = li.get_text(" ", strip=True)
        if ":" in t:
            k, v = t.split(":", 1)
            f = _key(k)
            if f:
                a = li.select_one("a")
                _set(f, a.get_text(strip=True) if a else v.strip())

    # 2. Definition list
    for dt in soup.select("dl dt"):
        f = _key(dt.get_text())
        if f:
            dd = dt.find_next_sibling("dd")
            if dd:
                _set(f, dd.get_text(strip=True))

    # 3. Table rows
    for th in soup.select("table th, table td:first-child"):
        f = _key(th.get_text())
        if f:
            td = th.find_next_sibling("td")
            if td:
                _set(f, td.get_text(strip=True))

    # 4. Generic <li> or <p> with colon (rasakatha style)
    for el in soup.select("li, .product-info p"):
        t = el.get_text(" ", strip=True)
        if ":" in t:
            k, v = t.split(":", 1)
            f = _key(k)
            if f:
                a = el.select_one("a")
                _set(f, a.get_text(strip=True) if a else v.strip())

    # 5. Tags fallback for author
    if not meta["author"]:
        genre_words = {
            "fiction", "novel", "sinhala", "english", "tamil", "kids",
            "poetry", "romance", "thriller", "non-fiction", "education",
        }
        for a in soup.select(".tagged_as a, .product-tags a"):
            t = a.get_text(strip=True)
            if t.lower() not in genre_words and len(t) > 3:
                meta["author"] = t
                break

    return meta


# ══════════════════════════════════════════════════════════════════════════════
# PRODUCT URL DETECTION
# ══════════════════════════════════════════════════════════════════════════════

def is_product_url(href: str, site: dict, base_url: str) -> bool:
    if not href or not href.startswith("http"):
        return False
    if not href.startswith(base_url.rstrip("/")):
        return False

    path = urlparse(href).path.lower()
    query = urlparse(href).query

    # Must not contain any skip fragments
    for skip in site.get("product_url_skip", []):
        if skip.lower() in path or skip.lower() in query:
            return False

    must = site.get("product_url_must_contain", "")
    if must:
        if must in path or must in query:
            return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# PAGINATION
# ══════════════════════════════════════════════════════════════════════════════

PAGINATION_SEL = [
    "a.next.page-numbers",          # WooCommerce
    ".woocommerce-pagination a.next",
    "a[rel='next']",                # generic rel
    "link[rel='next']",
    ".pagination .next a",
    "li.next a",
    "a.next",
    ".pager .next a",
    "[aria-label='Next page']",
    "[aria-label='Next']",
]

def next_page_url(soup: BeautifulSoup, current_url: str,
                  platform: str) -> Optional[str]:
    # Try <link rel="next"> in head first (most reliable)
    link = soup.find("link", {"rel": "next"})
    if link:
        return urljoin(current_url, link.get("href", ""))

    for sel in PAGINATION_SEL:
        el = soup.select_one(sel)
        if el:
            href = el.get("href", "")
            if href:
                return urljoin(current_url, href)

    # OpenCart: increment page= query param
    if platform == "opencart":
        parsed = urlparse(current_url)
        qs = parse_qs(parsed.query)
        page = int(qs.get("page", ["1"])[0])
        # Build next URL manually
        base = current_url.split("&page=")[0].split("?page=")[0]
        sep = "&" if "?" in base else "?"
        next_url = f"{base}{sep}page={page + 1}" if "?" in base else f"{base}?page={page + 1}"
        return next_url

    return None


# ══════════════════════════════════════════════════════════════════════════════
# PRODUCT PAGE PARSER
# ══════════════════════════════════════════════════════════════════════════════

def parse_product(session: requests.Session, url: str, site: dict) -> Optional[Book]:
    soup = fetch(session, url)
    if not soup:
        return None

    sel = site.get("selectors", {})
    book = Book(url=url, platform=site["platform"], source_site=site["id"])

    # Name — site-specific selector first, then global fallbacks
    name_sel = ([sel["name"]] if sel.get("name") else []) + NAME_SEL
    book.name = first_text(soup, name_sel)

    # Prices
    book.original_price, book.sale_price, book.discount_percent = \
        parse_prices(soup, sel.get("price"))

    # SKU
    book.sku = first_text(soup, SKU_SEL)

    # Categories
    cats = []
    for cs in CAT_SEL:
        els = soup.select(cs)
        if els:
            cats = [a.get_text(strip=True) for a in els
                    if a.get_text(strip=True).lower() not in ("home","shop","books","")]
            if cats:
                break
    book.category = ", ".join(dict.fromkeys(cats))

    # Description
    desc_sel = ([sel["desc"]] if sel.get("desc") else []) + DESC_SEL
    desc_el = first_el(soup, desc_sel)
    if desc_el:
        book.description = " ".join(desc_el.get_text(" ", strip=True).split())

    # Image
    img_sel = ([sel["image"]] if sel.get("image") else []) + IMAGE_SEL
    img = first_el(soup, img_sel)
    if img:
        book.image_url = (
            img.get("data-large_image") or img.get("data-src") or img.get("src") or ""
        )
        if book.image_url and not book.image_url.startswith("http"):
            book.image_url = urljoin(url, book.image_url)

    # Metadata
    meta = extract_metadata(soup)
    book.author     = meta["author"]
    book.publisher  = meta["publisher"]
    book.language   = meta["language"]
    book.page_count = meta["page_count"]

    return book


# ══════════════════════════════════════════════════════════════════════════════
# SITE SCRAPER
# ══════════════════════════════════════════════════════════════════════════════

def scrape_site(site: dict, max_pages: Optional[int],
                delay: float, session: requests.Session) -> list[Book]:
    base_url = site["url"].rstrip("/")
    domain   = site["id"]
    log.info("━━━ Scraping: %s (%s) ━━━", site["name"], base_url)

    # Collect product URLs from all listing pages
    all_product_urls: list[str] = []
    pages_done = 0

    for shop_path in site["shop_paths"]:
        if max_pages and pages_done >= max_pages:
            break

        current_url: Optional[str] = base_url + shop_path
        visited: set[str] = set()

        while current_url and current_url not in visited:
            if max_pages and pages_done >= max_pages:
                break
            pages_done += 1
            visited.add(current_url)
            log.info("  [Listing p.%d] %s", pages_done, current_url)

            soup = fetch(session, current_url)
            if not soup:
                break

            new = 0
            for a in soup.select("a[href]"):
                href = a.get("href", "")
                full = urljoin(current_url, href)
                if full not in all_product_urls and is_product_url(full, site, base_url):
                    all_product_urls.append(full)
                    new += 1

            log.info("    Found %d new product URLs (total: %d)", new, len(all_product_urls))
            time.sleep(delay)

            current_url = next_page_url(soup, current_url, site["platform"])

    log.info("  Total product URLs: %d", len(all_product_urls))

    if not all_product_urls:
        log.warning("  ⚠ No product URLs found for %s", site["name"])
        return []

    # Scrape each product
    books: list[Book] = []
    for i, url in enumerate(all_product_urls, 1):
        log.info("  [%d/%d] %s", i, len(all_product_urls), url)
        book = parse_product(session, url, site)
        if book and book.name:
            books.append(book)
        time.sleep(delay)

    log.info("  ✅ %s: scraped %d books", site["name"], len(books))
    return books


# ══════════════════════════════════════════════════════════════════════════════
# OUTPUT
# ══════════════════════════════════════════════════════════════════════════════

def _san(v: str) -> str:
    """Prevent CSV formula injection."""
    if isinstance(v, str) and v and v[0] in ("=", "+", "-", "@"):
        return "'" + v
    return v

def save(books: list[Book], stem: str, fmt: str):
    OUTPUT_DIR.mkdir(exist_ok=True)
    if fmt in ("csv", "both"):
        csv_path = OUTPUT_DIR / f"{stem}.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            for b in books:
                w.writerow({k: _san(v) for k, v in asdict(b).items()})
        log.info("  💾 CSV → %s (%d rows)", csv_path, len(books))

    if fmt in ("json", "both"):
        json_path = OUTPUT_DIR / f"{stem}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump([asdict(b) for b in books], f, ensure_ascii=False, indent=2)
        log.info("  💾 JSON → %s", json_path)


# ══════════════════════════════════════════════════════════════════════════════
# CUSTOM SITE MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

def load_custom_sites() -> list[dict]:
    if CUSTOM_SITES_FILE.exists():
        with open(CUSTOM_SITES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return []

def save_custom_sites(sites: list[dict]):
    with open(CUSTOM_SITES_FILE, "w", encoding="utf-8") as f:
        json.dump(sites, f, ensure_ascii=False, indent=2)

def add_custom_site(url: str) -> dict:
    """Auto-detect platform and create a site config from any URL."""
    session = make_session()
    print(f"\n  Probing {url} ...")
    soup = fetch(session, url)
    if not soup:
        print(c(RED, f"  Could not load {url}"))
        sys.exit(1)

    html = str(soup).lower()
    # Detect platform
    if "woocommerce" in html or "wp-content" in html:
        platform = "woocommerce"
        must = "/product/"
        shop_paths = ["/shop/"]
        skip = ["/product-category/", "/cart", "/tag/"]
    elif "route=product" in html or "opencart" in html:
        platform = "opencart"
        must = "product_id="
        shop_paths = ["/"]
        skip = ["/account", "/cart", "/checkout"]
    elif "magento" in html or "mage-init" in html:
        platform = "magento"
        must = ".html"
        shop_paths = ["/"]
        skip = ["/customer", "/cart", "/checkout"]
    elif "myshopify" in html or "shopify" in html or "cdn.shopify" in html:
        platform = "shopify"
        must = "/products/"
        shop_paths = ["/collections/all"]
        skip = ["/collections/", "/pages/", "/cart"]
    else:
        platform = "custom"
        must = "/product/"
        shop_paths = ["/shop/", "/books/", "/products/"]
        skip = ["/cart", "/account"]

    parsed = urlparse(url)
    domain = parsed.netloc.replace("www.", "")
    site_id = domain.replace(".", "_")
    name = domain

    site = {
        "id": site_id,
        "name": name,
        "url": f"{parsed.scheme}://{parsed.netloc}",
        "platform": platform,
        "language": "Unknown",
        "specialty": "Custom / user-added site",
        "shop_paths": shop_paths,
        "product_url_must_contain": must,
        "product_url_skip": skip,
        "selectors": {},
        "active": True,
        "notes": "Auto-detected. Tune selectors manually if needed.",
    }

    custom = load_custom_sites()
    # Don't add duplicate
    if not any(s["id"] == site_id for s in custom):
        custom.append(site)
        save_custom_sites(custom)
        print(c(GREEN, f"  ✅ Added '{name}' (platform: {platform}) to custom_sites.json"))
    else:
        print(c(YELLOW, f"  '{name}' is already in your custom sites."))

    return site


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def get_all_sites() -> list[dict]:
    custom = load_custom_sites()
    return SITES + custom

def main():
    parser = argparse.ArgumentParser(
        description="Sri Lanka Book Store Scraper — Interactive Edition",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scraper.py                          # interactive menu
  python scraper.py --list                   # list all sites
  python scraper.py --add https://newsite.lk # add a new site
  python scraper.py --site rasakatha         # scrape one site directly
  python scraper.py --site all               # scrape all active sites
  python scraper.py --site rasakatha,kbooks  # scrape multiple by ID
  python scraper.py --site rasakatha --pages 3 --delay 2 --format csv
        """,
    )
    parser.add_argument("--list",   action="store_true", help="List all known sites and exit")
    parser.add_argument("--add",    metavar="URL",       help="Add a new site by URL")
    parser.add_argument("--site",   metavar="ID",        help="Site ID(s) to scrape, or 'all'")
    parser.add_argument("--pages",  type=int,            help="Max listing pages per site")
    parser.add_argument("--delay",  type=float, default=1.5, help="Delay between requests")
    parser.add_argument("--format", choices=["csv","json","both"], default="both")
    args = parser.parse_args()

    all_sites = get_all_sites()

    # ── --list ────────────────────────────────────────────────────────────
    if args.list:
        print_banner()
        print_site_table(all_sites)
        print(f"  Total: {len(all_sites)} sites  |  "
              f"Active: {sum(1 for s in all_sites if s['active'])}  |  "
              f"Bot-blocked: {sum(1 for s in all_sites if not s['active'])}\n")
        for s in all_sites:
            notes = f"  {c(DIM, s['notes'])}" if s["notes"] else ""
            print(f"  {c(CYAN, s['id']):<30} {s['specialty'][:60]}{notes}")
        print()
        return

    # ── --add ─────────────────────────────────────────────────────────────
    if args.add:
        add_custom_site(args.add)
        all_sites = get_all_sites()

    # ── --site (non-interactive) ──────────────────────────────────────────
    if args.site:
        if args.site == "all":
            chosen = [s for s in all_sites if s["active"]]
        else:
            ids = [x.strip() for x in args.site.split(",")]
            chosen = [s for s in all_sites if s["id"] in ids]
            missing = set(ids) - {s["id"] for s in chosen}
            if missing:
                print(c(RED, f"Unknown site IDs: {', '.join(missing)}"))
                print("Run --list to see valid IDs.")
                sys.exit(1)
        opts = {"max_pages": args.pages, "delay": args.delay, "format": args.format}
    else:
        # ── Interactive mode ──────────────────────────────────────────────
        print_banner()
        print_site_table(all_sites)
        chosen = prompt_selection(all_sites)
        opts   = prompt_options()

    if not chosen:
        print(c(RED, "  No sites selected. Exiting."))
        return

    # ── Scrape ────────────────────────────────────────────────────────────
    session = make_session()
    all_books: list[Book] = []
    summary: list[dict] = []

    for site in chosen:
        if not site["active"]:
            print(c(YELLOW, f"\n  ⚠ Skipping {site['name']} (marked as bot-blocked)\n"))
            continue

        books = scrape_site(site, opts["max_pages"], opts["delay"], session)
        all_books.extend(books)

        stem = site["id"]
        save(books, stem, opts["format"])
        summary.append({"site": site["name"], "books": len(books), "file": stem})

    # Combined output if multiple sites
    if len(chosen) > 1 and all_books:
        save(all_books, "combined_all_sites", opts["format"])

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\n{CYAN}{BOLD}{'═'*55}{RESET}")
    print(f"{CYAN}{BOLD}  SCRAPING SUMMARY{RESET}")
    print(f"{CYAN}{BOLD}{'═'*55}{RESET}")
    for s in summary:
        print(f"  {c(GREEN, '✓')} {s['site']:<30} {c(BOLD, str(s['books']))} books")
    print(f"  {'─'*55}")
    print(f"  {c(BOLD,'Total:')} {len(all_books)} books scraped")
    print(f"  {c(BOLD,'Output:')} output/ directory")
    print(f"{CYAN}{BOLD}{'═'*55}{RESET}\n")


if __name__ == "__main__":
    main()
