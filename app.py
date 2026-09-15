"""
Economic Index Tracker
----------------------
A small, dependency-free web app that tracks the change in major economic
indexes (NASDAQ Composite and S&P 100) and shows related news headlines.

Run with:
    python3 app.py

Then open http://localhost:8000 in a browser.

Only the Python standard library is used, so no `pip install` is required.
"""

import json
import re
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

HOST = "0.0.0.0"
PORT = 8000

STATIC_DIR = Path(__file__).parent / "static"

# Symbol -> display name for the indexes we track.
INDEXES = {
    "^IXIC": "NASDAQ Composite",
    "^OEX": "S&P 100",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

REQUEST_TIMEOUT = 8


def fetch_json(url):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_text(url):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return resp.read().decode("utf-8", errors="replace")


def get_index_quote(symbol, name):
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{quote(symbol)}?interval=1d&range=1d"
    )
    data = fetch_json(url)
    result = data["chart"]["result"][0]
    meta = result["meta"]

    price = meta.get("regularMarketPrice")
    prev_close = meta.get("previousClose") or meta.get("chartPreviousClose")

    change = price - prev_close
    percent_change = (change / prev_close) * 100 if prev_close else 0

    return {
        "symbol": symbol,
        "name": name,
        "price": round(price, 2),
        "previousClose": round(prev_close, 2),
        "change": round(change, 2),
        "percentChange": round(percent_change, 2),
        "currency": meta.get("currency", "USD"),
    }


def get_indexes():
    indexes = []
    errors = []
    for symbol, name in INDEXES.items():
        try:
            indexes.append(get_index_quote(symbol, name))
        except (URLError, HTTPError, KeyError, IndexError, TypeError) as exc:
            errors.append(f"{name}: {exc}")
    return {"indexes": indexes, "errors": errors}


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def get_news_for_query(query, limit=5):
    url = (
        "https://news.google.com/rss/search?q="
        f"{quote(query)}&hl=en-US&gl=US&ceid=US:en"
    )
    xml_text = fetch_text(url)
    root = ET.fromstring(xml_text)

    items = []
    for item in root.findall("./channel/item")[:limit]:
        title = strip_html(item.findtext("title"))
        link = item.findtext("link", default="").strip()
        source_el = item.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else None

        if not source and " - " in title:
            title, source = title.rsplit(" - ", 1)

        items.append({
            "title": title,
            "source": source or "Unknown source",
            "link": link,
        })
    return items


def get_news():
    news = []
    seen_titles = set()
    errors = []
    for query in ("NASDAQ", "S%26P 100 index"):
        try:
            for article in get_news_for_query(query):
                if article["title"] not in seen_titles:
                    seen_titles.add(article["title"])
                    news.append(article)
        except (URLError, HTTPError, ET.ParseError) as exc:
            errors.append(f"{query}: {exc}")
    return {"news": news, "errors": errors}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # keep console output quiet

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, rel_path, content_type):
        file_path = STATIC_DIR / rel_path
        try:
            body = file_path.read_bytes()
        except FileNotFoundError:
            self.send_error(404, "Not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self._send_static("index.html", "text/html; charset=utf-8")
        elif self.path == "/style.css":
            self._send_static("style.css", "text/css; charset=utf-8")
        elif self.path == "/script.js":
            self._send_static("script.js", "application/javascript; charset=utf-8")
        elif self.path == "/api/indexes":
            self._send_json(get_indexes())
        elif self.path == "/api/news":
            self._send_json(get_news())
        else:
            self.send_error(404, "Not found")


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Economic Index Tracker running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
