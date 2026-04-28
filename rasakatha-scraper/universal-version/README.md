# 🇱🇰 Sri Lanka Book Store Scraper

A comprehensive, interactive Python scraper covering **20+ Sri Lankan online book stores** — with platform-specific tuning and a simple terminal menu.

---

## 📋 All Covered Sites

| # | Site | Platform | Language | Notes |
|---|------|----------|----------|-------|
| 1 | rasakatha.lk | WooCommerce | Sinhala | 1400+ Sinhala books |
| 2 | books.lk | WooCommerce | EN/SI/TA | English, Sinhala, Tamil |
| 3 | pothak.lk | WooCommerce | SI/EN | Sinhala + children's |
| 4 | viyathbooks.lk | WooCommerce | EN/SI | Up to 20% discounts |
| 5 | bargainbooks.lk | WooCommerce | English | Discounted/clearance |
| 6 | bookshop.lk | WooCommerce | Sinhala | School books + past papers |
| 7 | jeyabookcentre.com | WooCommerce | EN/SI/TA | Medical + academic |
| 8 | mdgunasena.com | WooCommerce | SI/EN | Est. 1913, 16 stores |
| 9 | bookrack.lk | WooCommerce | SI/EN | General |
| 10 | kbooks.lk | OpenCart | SI/EN/TA | Largest translations |
| 11 | booksbay.lk | OpenCart | Sinhala | Novels, educational |
| 12 | grantha.lk | Magento | Sinhala | Largest Sinhala catalogue |
| 13 | bookolog.lk | Custom | English | 277 English books |
| 14 | slbooks.lk | Custom | EN/SI | Cambridge + academic |
| 15 | sarasavi.lk | Custom | SI/EN | Major chain |
| 16 | booxworm.lk | Shopify | English | Bestsellers + guides |
| 17 | makeenbooks.com | Custom | EN/SI | Large catalogue |
| 18 | samudrabooks.com | Custom | Sinhala | Physical + online |
| 19 | bookstore.lk | WooCommerce | SI/EN | BOGO deals |
| 20 | vijithayapa.com | WooCommerce | SI/EN | ⚠ Bot-blocked |
| 21 | jumpbooks.lk | Shopify | EN/SI | ⚠ Bot-blocked |
| 22 | bookmania.lk | WooCommerce | SI/EN/TA | ⚠ Bot-blocked |

> ⚠ Sites marked "bot-blocked" return 403 for automated requests. They work fine in a browser.

---

## 📦 Data Extracted

`name` · `url` · `sku` · `category` · `original_price` · `sale_price` · `discount_percent` · `description` · `image_url` · `author` · `publisher` · `language` · `page_count` · `platform` · `source_site`

---

## 🚀 Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/lk-book-scraper.git
cd lk-book-scraper

python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

python scraper.py           # launches the interactive menu
```

---

## 🖥️ Usage

### Interactive menu (recommended)

```bash
python scraper.py
```

You'll see:
```
  #    Site                      Platform     Language               Active
  ───  ─────────────────────────  ───────────  ──────────────────────  ──────
  1    Rasakatha.lk              woocommerce  Sinhala                ✓
  2    Books.lk                  woocommerce  English, Sinhala, Tamil ✓
  ...

  Select: 1,3,5   or   all   or   q (quit)
  > 1,4,7

  Max listing pages [0=all]: 5
  Delay between requests [1.5]: 2
  Output format csv/json/both [both]:
```

### Command line (non-interactive)

```bash
# List all sites
python scraper.py --list

# Scrape one site
python scraper.py --site rasakatha

# Scrape multiple sites by ID
python scraper.py --site rasakatha,kbooks,bookolog

# Scrape all active sites
python scraper.py --site all

# With options
python scraper.py --site grantha --pages 3 --delay 2.5 --format json

# Add a brand new site (auto-detects platform)
python scraper.py --add https://newbookstore.lk
```

---

## ➕ Adding a New Site

### Option 1 — Auto-detect (easiest)

```bash
python scraper.py --add https://newbooksite.lk
```

The scraper will probe the site, detect the platform, and save it to `custom_sites.json`. It will appear in the menu on the next run.

### Option 2 — Manual (for full control)

Add an entry to `custom_sites.json`:

```json
[
  {
    "id": "mysite",
    "name": "My Book Site",
    "url": "https://mysite.lk",
    "platform": "woocommerce",
    "language": "Sinhala",
    "specialty": "Sinhala novels",
    "shop_paths": ["/shop/"],
    "product_url_must_contain": "/product/",
    "product_url_skip": ["/product-category/", "/cart"],
    "selectors": {
      "name":  "h1.product_title",
      "price": ".summary .price",
      "desc":  ".short-description",
      "image": ".product-gallery img"
    },
    "active": true,
    "notes": "Added manually"
  }
]
```

**Platforms:** `woocommerce` · `opencart` · `magento` · `shopify` · `custom`

---

## 📁 Project Structure

```
lk-book-scraper/
├── scraper.py          # Main script + interactive UI
├── sites.py            # Registry of all 20+ known sites
├── custom_sites.json   # Your added sites (auto-created)
├── requirements.txt
├── README.md
├── .gitignore
└── output/             # All scraped data (gitignored)
    ├── rasakatha.csv
    ├── rasakatha.json
    ├── kbooks.csv
    └── combined_all_sites.json
```

---

## ⚙️ How It Works

```
Interactive menu
      ↓
Platform-specific config loaded (sites.py / custom_sites.json)
      ↓
Crawl listing pages → collect product URLs
      ↓
For each product URL:
  → Try site-specific CSS selectors
  → Fall back to 10+ global selector patterns
  → Extract: name, prices, description, image, metadata
      ↓
Auto-save every 50 books (never lose progress)
      ↓
Save per-site CSV + JSON + combined file
```

---

## ⚠️ Disclaimer

For personal/educational use only. Respect each site's `robots.txt` and Terms of Service. The built-in delay keeps requests polite.
