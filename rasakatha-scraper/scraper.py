"""
rasakatha.lk Product Scraper
Scrapes product name, original price, sale/discount price,
description, image URLs, stock status from rasakatha.lk (WooCommerce store).
"""

import csv
import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ── Configuration ────────────────────────────────────────────────────────────
BASE_URL = "https://rasakatha.lk"
SHOP_URL = "https://rasakatha.lk/shop/"
OUTPUT_DIR = Path("output")
OUTPUT_CSV = OUTPUT_DIR / "products.csv"
OUTPUT_JSON = OUTPUT_DIR / "products.json"

DELAY_BETWEEN_REQUESTS = float(os.environ.get("RASAKATHA_DELAY_SECONDS", "1.5"))
REQUEST_TIMEOUT = int(os.environ.get("RASAKATHA_REQUEST_TIMEOUT", "15"))


def _max_pages_from_env() -> int | None:
    """Unset or empty = scrape all pages. Set RASAKATHA_MAX_PAGES=5 for a short test run."""
    raw = os.environ.get("RASAKATHA_MAX_PAGES", "").strip()
    if not raw:
        return None
    try:
        n = int(raw)
        return n if n > 0 else None
    except ValueError:
        return None


MAX_PAGES = _max_pages_from_env()

CATALOG_SOURCE = os.environ.get("CATALOG_SOURCE", "rasakatha").strip() or "rasakatha"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ── Data model ───────────────────────────────────────────────────────────────
@dataclass
class Product:
    name: str = ""
    url: str = ""
    sku: str = ""
    category: str = ""
    original_price: str = ""
    sale_price: str = ""
    discount_percent: str = ""
    stock_status: str = ""
    description: str = ""
    image_url: str = ""
    author: str = ""
    publisher: str = ""
    language: str = ""
    page_count: str = ""
    catalog_source: str = "rasakatha"


# ── HTTP helpers ─────────────────────────────────────────────────────────────
session = requests.Session()
session.headers.update(HEADERS)


def get_soup(url: str) -> Optional[BeautifulSoup]:
    """Fetch a URL and return a BeautifulSoup object, or None on failure."""
    try:
        resp = session.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as exc:
        log.warning("Failed to fetch %s — %s", url, exc)
        return None


# ── Listing page helpers ──────────────────────────────────────────────────────
def get_product_urls_from_page(page: int) -> list[str]:
    """Return all product URLs found on a shop listing page."""
    url = SHOP_URL if page == 1 else f"{SHOP_URL}?page={page}"
    soup = get_soup(url)
    if soup is None:
        return []

    urls = []
    for a in soup.select("a[href*='/books/']"):
        href = a.get("href", "")
        if href and href not in urls:
            if "/books/" in href and not href.endswith("/books/"):
                urls.append(href)
    return urls


def get_total_pages(soup: BeautifulSoup) -> int:
    """Parse the total number of shop pages from the first listing page."""
    pagination = soup.select_one("nav.woocommerce-pagination")
    if not pagination:
        return 1
    pages = pagination.select("a.page-numbers:not(.next)")
    if pages:
        try:
            return int(pages[-1].get_text(strip=True))
        except ValueError:
            pass
    return 1


# ── Product page helpers ──────────────────────────────────────────────────────
def _text(soup: BeautifulSoup, selector: str) -> str:
    el = soup.select_one(selector)
    return el.get_text(strip=True) if el else ""


def _attr(soup: BeautifulSoup, selector: str, attr: str) -> str:
    el = soup.select_one(selector)
    if el:
        return el.get(attr, "") or ""
    return ""


def parse_product_page(url: str) -> Optional[Product]:
    """Scrape a single product page and return a Product dataclass."""
    soup = get_soup(url)
    if soup is None:
        return None

    p = Product(url=url)

    # ── Name ──────────────────────────────────────────────────────────────
    p.name = _text(soup, "h1.product_title") or _text(soup, "h1.entry-title")

    # ── Prices ────────────────────────────────────────────────────────────
    # Anchor on p.price (the wrapper), NOT .woocommerce-Price-amount directly.
    # Selecting the amount span directly would make nested del/ins lookups fail
    # because you'd already be inside the span with no del/ins parent above it.
    price_block = soup.select_one("p.price") or soup.select_one(".price")
    if price_block:
        del_tag = price_block.select_one("del .woocommerce-Price-amount")
        ins_tag = price_block.select_one("ins .woocommerce-Price-amount")
        single_tag = price_block.select_one(".woocommerce-Price-amount")

        if del_tag and ins_tag:
            p.original_price = del_tag.get_text(strip=True)
            p.sale_price = ins_tag.get_text(strip=True)
            try:
                orig = float(p.original_price.replace("රු", "").replace(",", "").strip())
                sale = float(p.sale_price.replace("රු", "").replace(",", "").strip())
                discount = round((orig - sale) / orig * 100)
                p.discount_percent = f"{discount}%"
            except (ValueError, ZeroDivisionError):
                pass
        elif single_tag:
            p.sale_price = single_tag.get_text(strip=True)
            p.original_price = p.sale_price

    # ── Stock status ───────────────────────────────────────────────────────
    # WooCommerce renders <p class="stock in-stock">In stock</p> or
    # <p class="stock out-of-stock">Out of stock</p> on product pages.
    stock_el = soup.select_one("p.stock")
    if stock_el:
        p.stock_status = stock_el.get_text(strip=True)
    else:
        # Fallback: check if the add-to-cart button is disabled (OOS themes
        # sometimes hide the stock paragraph but still disable the button).
        btn = soup.select_one("button.single_add_to_cart_button")
        if btn:
            p.stock_status = "Out of stock" if "disabled" in btn.get("class", []) else "In stock"
        else:
            p.stock_status = "Unknown"

    # ── SKU ───────────────────────────────────────────────────────────────
    sku_el = soup.select_one(".sku")
    p.sku = sku_el.get_text(strip=True) if sku_el else ""

    # ── Category ──────────────────────────────────────────────────────────
    cat_els = soup.select(".posted_in a")
    p.category = ", ".join(a.get_text(strip=True) for a in cat_els)

    # ── Description ───────────────────────────────────────────────────────
    desc_el = soup.select_one(
        ".woocommerce-product-details__short-description, "
        ".product-short-description, "
        "#tab-description"
    )
    if desc_el:
        p.description = " ".join(desc_el.get_text(" ", strip=True).split())

    # ── Image ─────────────────────────────────────────────────────────────
    img = soup.select_one(".woocommerce-product-gallery__image img, .product img")
    if img:
        p.image_url = (
            img.get("data-large_image")
            or img.get("data-src")
            or img.get("src")
            or ""
        )

    # ── Extra metadata from product details list ──────────────────────────
    for li in soup.select(
        ".product_meta li, .woodmart-product-info li, .product-attributes li"
    ):
        text = li.get_text(" ", strip=True)
        lower = text.lower()
        if "author" in lower:
            a_tag = li.select_one("a")
            p.author = (
                a_tag.get_text(strip=True) if a_tag else text.split(":", 1)[-1].strip()
            )
        elif "publisher" in lower:
            a_tag = li.select_one("a")
            p.publisher = (
                a_tag.get_text(strip=True) if a_tag else text.split(":", 1)[-1].strip()
            )
        elif "language" in lower:
            p.language = text.split(":", 1)[-1].strip()
        elif "page" in lower:
            p.page_count = text.split(":", 1)[-1].strip()

    # Fallback: inline bullet list metadata
    if not p.author:
        for li in soup.select("ul li"):
            txt = li.get_text(strip=True)
            if "Book Author" in txt or "Author :" in txt:
                a_tag = li.select_one("a")
                p.author = (
                    a_tag.get_text(strip=True)
                    if a_tag
                    else txt.split(":", 1)[-1].strip()
                )
            elif "Book Publisher" in txt:
                a_tag = li.select_one("a")
                p.publisher = (
                    a_tag.get_text(strip=True)
                    if a_tag
                    else txt.split(":", 1)[-1].strip()
                )
            elif "Book Language" in txt:
                p.language = txt.split(":", 1)[-1].strip()
            elif "Page Count" in txt:
                p.page_count = txt.split(":", 1)[-1].strip()

    return p


# ── Output helpers ────────────────────────────────────────────────────────────
FIELDNAMES = [
    "name", "url", "sku", "category",
    "original_price", "sale_price", "discount_percent",
    "stock_status",
    "description", "image_url",
    "author", "publisher", "language", "page_count",
    "catalog_source",
]


def save_csv(products: list[Product]):
    OUTPUT_DIR.mkdir(exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for p in products:
            writer.writerow(asdict(p))
    log.info("Saved %d products to %s", len(products), OUTPUT_CSV)


def save_json(products: list[Product]):
    OUTPUT_DIR.mkdir(exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump([asdict(p) for p in products], f, ensure_ascii=False, indent=2)
    log.info("Saved %d products to %s", len(products), OUTPUT_JSON)


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    log.info("Starting rasakatha.lk scraper …")
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Discover total pages
    first_soup = get_soup(SHOP_URL)
    if first_soup is None:
        log.error("Could not load shop page. Exiting.")
        return

    total_pages = get_total_pages(first_soup)
    if MAX_PAGES:
        total_pages = min(total_pages, MAX_PAGES)
    log.info("Total pages to scrape: %d", total_pages)

    # Collect all product URLs
    all_product_urls: list[str] = []
    for page in range(1, total_pages + 1):
        log.info("Listing page %d / %d", page, total_pages)
        urls = get_product_urls_from_page(page)
        new_urls = [u for u in urls if u not in all_product_urls]
        all_product_urls.extend(new_urls)
        log.info(
            "  Found %d product URLs (total so far: %d)",
            len(new_urls),
            len(all_product_urls),
        )
        time.sleep(DELAY_BETWEEN_REQUESTS)

    log.info("Total unique product URLs discovered: %d", len(all_product_urls))

    # Scrape each product
    products: list[Product] = []
    for i, url in enumerate(all_product_urls, 1):
        log.info("[%d/%d] Scraping %s", i, len(all_product_urls), url)
        product = parse_product_page(url)
        if product:
            product.catalog_source = CATALOG_SOURCE
            products.append(product)
        time.sleep(DELAY_BETWEEN_REQUESTS)

        # Save incrementally every 50 products
        if i % 50 == 0:
            save_csv(products)
            save_json(products)

    # Final save
    save_csv(products)
    save_json(products)
    log.info("✅ Done! Scraped %d products.", len(products))


if __name__ == "__main__":
    main()
