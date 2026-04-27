# rasakatha.lk Scraper 📚

A Python web scraper for [rasakatha.lk](https://rasakatha.lk) — Sri Lanka's largest online Sinhala book store.

Extracts the following data from every product page:

| Field | Description |
|---|---|
| `name` | Book title (Sinhala + English) |
| `url` | Product page URL |
| `sku` | ISBN / SKU |
| `category` | Book category/genre |
| `original_price` | Original price (LKR) |
| `sale_price` | Discounted sale price (LKR) |
| `discount_percent` | Discount percentage (e.g. `10%`) |
| `description` | Book description / blurb |
| `image_url` | Full-resolution cover image URL |
| `author` | Book author |
| `publisher` | Publisher name |
| `language` | Language (e.g. Sinhala, English) |
| `page_count` | Number of pages |

---

## 🚀 Quickstart

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/rasakatha-scraper.git
cd rasakatha-scraper
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the scraper

```bash
python scraper.py
```

Output files are saved in the `output/` folder:
- `output/products.csv` — spreadsheet-friendly format
- `output/products.json` — structured JSON

---

## ⚙️ Configuration

Edit the top of `scraper.py` to adjust behaviour:

```python
DELAY_BETWEEN_REQUESTS = 1.5   # Seconds to wait between requests (be polite!)
REQUEST_TIMEOUT        = 15    # HTTP timeout in seconds
MAX_PAGES              = None  # Set e.g. 5 to scrape only first 5 pages (for testing)
```

> **Tip:** Set `MAX_PAGES = 2` for a quick test run before scraping all 1,400+ products.

---

## 📁 Project Structure

```
rasakatha-scraper/
├── scraper.py          # Main scraper
├── requirements.txt    # Python dependencies
├── .gitignore
├── README.md
└── output/             # Generated after running (gitignored)
    ├── products.csv
    └── products.json
```

---

## ⚠️ Disclaimer

This scraper is for **personal / educational use only**.  
Please respect the site's `robots.txt` and Terms of Service.  
The built-in delay (`DELAY_BETWEEN_REQUESTS`) ensures the server is not overloaded.

---

## 🛠️ Tech Stack

- **Python 3.11+**
- [requests](https://pypi.org/project/requests/) — HTTP client
- [BeautifulSoup4](https://pypi.org/project/beautifulsoup4/) — HTML parsing
- [lxml](https://pypi.org/project/lxml/) — fast XML/HTML parser backend
