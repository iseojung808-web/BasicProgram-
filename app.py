"""
Economic Index Tracker
----------------------
A small, dependency-free web app that tracks the change in major economic
indexes (NASDAQ Composite and S&P 100), shows related news headlines, and
lets you look up any company by ticker symbol (price, 50-day chart, news).

Run with:
    python3 app.py

Then open http://localhost:8000 in a browser.

Only the Python standard library is used, so no `pip install` is required.
"""

import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.parse import quote, urlparse, parse_qs
from urllib.request import Request, urlopen, build_opener, HTTPCookieProcessor

HOST = "0.0.0.0"
PORT = 8000

STATIC_DIR = Path(__file__).parent / "static"
WATCHLIST_FILE = Path(__file__).parent / "watchlist.json"

# Symbol -> display name for the indexes we always track on the dashboard.
INDEXES = {
    "^IXIC": "NASDAQ Composite",
    "^OEX": "S&P 100",
}

HISTORY_DAYS = 50

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

REQUEST_TIMEOUT = 8

# Yahoo's quoteSummary endpoint requires a session cookie plus a "crumb"
# anti-bot token. The chart/quote endpoint used elsewhere does not need this.
_YAHOO_COOKIE_JAR = CookieJar()
_YAHOO_OPENER = build_opener(HTTPCookieProcessor(_YAHOO_COOKIE_JAR))
_yahoo_crumb_cache = {"value": None}


def fetch_json(url):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_text(url):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_json_with_yahoo_session(url):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with _YAHOO_OPENER.open(req, timeout=REQUEST_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_yahoo_crumb(force_refresh=False):
    if force_refresh:
        _yahoo_crumb_cache["value"] = None
    if _yahoo_crumb_cache["value"]:
        return _yahoo_crumb_cache["value"]

    # Visiting the finance homepage first sets the cookies Yahoo expects
    # before it will hand out a crumb.
    warmup_req = Request("https://fc.yahoo.com", headers={"User-Agent": USER_AGENT})
    try:
        _YAHOO_OPENER.open(warmup_req, timeout=REQUEST_TIMEOUT).read()
    except (URLError, HTTPError):
        pass

    crumb_req = Request(
        "https://query2.finance.yahoo.com/v1/test/getcrumb",
        headers={"User-Agent": USER_AGENT},
    )
    with _YAHOO_OPENER.open(crumb_req, timeout=REQUEST_TIMEOUT) as resp:
        crumb = resp.read().decode("utf-8").strip()

    if not crumb:
        raise ValueError("Could not obtain a Yahoo Finance session crumb")

    _yahoo_crumb_cache["value"] = crumb
    return crumb


def get_chart_result(symbol, range_="3mo"):
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{quote(symbol)}?interval=1d&range={range_}"
    )
    data = fetch_json(url)
    chart = data.get("chart", {})
    error = chart.get("error")
    if error:
        raise ValueError(error.get("description") or "Unknown symbol")
    results = chart.get("result")
    if not results:
        raise ValueError(f"No data found for '{symbol}'")
    return results[0]


def get_quote(symbol, name=None):
    result = get_chart_result(symbol, range_="1d")
    meta = result["meta"]

    price = meta.get("regularMarketPrice")
    prev_close = meta.get("previousClose") or meta.get("chartPreviousClose")

    if price is None or prev_close is None:
        raise ValueError(f"No price data found for '{symbol}'")

    change = price - prev_close
    percent_change = (change / prev_close) * 100 if prev_close else 0

    display_name = name or meta.get("longName") or meta.get("shortName") or symbol

    return {
        "symbol": symbol,
        "name": display_name,
        "price": round(price, 2),
        "previousClose": round(prev_close, 2),
        "change": round(change, 2),
        "percentChange": round(percent_change, 2),
        "currency": meta.get("currency", "USD"),
    }


def get_history(symbol, days=HISTORY_DAYS):
    result = get_chart_result(symbol, range_="3mo")
    timestamps = result.get("timestamp") or []
    quote_block = result.get("indicators", {}).get("quote", [{}])[0]
    closes = quote_block.get("close") or []

    pairs = [(t, c) for t, c in zip(timestamps, closes) if c is not None]
    pairs = pairs[-days:]

    return [
        {
            "date": datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d"),
            "close": round(c, 2),
        }
        for t, c in pairs
    ]


def get_indexes():
    indexes = []
    errors = []
    for symbol, name in INDEXES.items():
        try:
            quote_data = get_quote(symbol, name)
            quote_data["history"] = get_history(symbol)
            indexes.append(quote_data)
        except (URLError, HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
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


def _raw(d, key):
    entry = (d or {}).get(key)
    return entry.get("raw") if isinstance(entry, dict) else entry


def _fmt(d, key):
    entry = (d or {}).get(key)
    return entry.get("fmt") if isinstance(entry, dict) else None


def _fetch_quote_summary(symbol, force_refresh_crumb=False):
    crumb = get_yahoo_crumb(force_refresh=force_refresh_crumb)
    modules = (
        "assetProfile,financialData,incomeStatementHistory,balanceSheetHistory,"
        "price,summaryDetail,defaultKeyStatistics"
    )
    url = (
        "https://query1.finance.yahoo.com/v10/finance/quoteSummary/"
        f"{quote(symbol)}?modules={modules}&crumb={quote(crumb)}"
    )
    return fetch_json_with_yahoo_session(url)


def get_company_profile_and_financials(symbol):
    try:
        data = _fetch_quote_summary(symbol)
    except HTTPError as exc:
        if exc.code == 401:
            # The cached crumb may have expired; get a fresh one and retry once.
            data = _fetch_quote_summary(symbol, force_refresh_crumb=True)
        else:
            raise

    results = data.get("quoteSummary", {}).get("result")
    if not results:
        raise ValueError("No company profile data found")
    r = results[0]

    asset = r.get("assetProfile") or {}
    financial = r.get("financialData") or {}
    price_module = r.get("price") or {}
    summary_detail = r.get("summaryDetail") or {}
    key_stats = r.get("defaultKeyStatistics") or {}
    income_list = (r.get("incomeStatementHistory") or {}).get("incomeStatementHistory") or []
    balance_list = (r.get("balanceSheetHistory") or {}).get("balanceSheetStatements") or []
    income = income_list[0] if income_list else {}
    balance = balance_list[0] if balance_list else {}
    market_cap = _fmt(price_module, "marketCap") or _raw(price_module, "marketCap")

    stats = {
        "fiftyTwoWeekLow": _fmt(summary_detail, "fiftyTwoWeekLow") or _raw(summary_detail, "fiftyTwoWeekLow"),
        "fiftyTwoWeekHigh": _fmt(summary_detail, "fiftyTwoWeekHigh") or _raw(summary_detail, "fiftyTwoWeekHigh"),
        "dayLow": _fmt(summary_detail, "dayLow") or _raw(summary_detail, "dayLow"),
        "dayHigh": _fmt(summary_detail, "dayHigh") or _raw(summary_detail, "dayHigh"),
        "volume": _fmt(summary_detail, "volume") or _raw(summary_detail, "volume"),
        "averageVolume": _fmt(summary_detail, "averageVolume") or _raw(summary_detail, "averageVolume"),
        "trailingPE": _fmt(summary_detail, "trailingPE") or _raw(summary_detail, "trailingPE"),
        "forwardPE": _fmt(key_stats, "forwardPE") or _raw(key_stats, "forwardPE"),
        "dividendYield": _fmt(summary_detail, "dividendYield") or _raw(summary_detail, "dividendYield"),
        "beta": _fmt(key_stats, "beta") or _raw(key_stats, "beta"),
    }

    officers = asset.get("companyOfficers") or []
    ceo = None
    for officer in officers:
        title = (officer.get("title") or "").lower()
        if "chief executive" in title or title.strip() == "ceo":
            ceo = officer.get("name")
            break

    headquarters = ", ".join(
        p for p in (asset.get("city"), asset.get("state"), asset.get("country")) if p
    )

    profile = {
        "sector": asset.get("sector"),
        "industry": asset.get("industry"),
        "website": asset.get("website"),
        "employees": asset.get("fullTimeEmployees"),
        "headquarters": headquarters or None,
        "summary": asset.get("longBusinessSummary"),
        "ceo": ceo,
    }

    net_income_raw = _raw(income, "netIncome")
    retained_raw = _raw(balance, "retainedEarnings")
    period_end = income.get("endDate")

    financials = {
        "periodEnding": period_end.get("fmt") if isinstance(period_end, dict) else None,
        "revenue": _fmt(income, "totalRevenue") or _raw(income, "totalRevenue"),
        "grossProfit": _fmt(income, "grossProfit") or _raw(income, "grossProfit"),
        "netIncome": _fmt(income, "netIncome") or net_income_raw,
        "netIncomeIsLoss": net_income_raw is not None and net_income_raw < 0,
        "retainedEarnings": _fmt(balance, "retainedEarnings") or retained_raw,
        "retainedEarningsIsDeficit": retained_raw is not None and retained_raw < 0,
        "profitMargin": _fmt(financial, "profitMargins"),
    }

    return profile, financials, market_cap, stats


def get_founders(company_name):
    """Best-effort lookup of a company's founder(s) via Wikidata (P112)."""
    search_url = (
        "https://www.wikidata.org/w/api.php?action=wbsearchentities"
        f"&search={quote(company_name)}&language=en&format=json&type=item&limit=1"
    )
    search_data = fetch_json(search_url)
    matches = search_data.get("search") or []
    if not matches:
        return []
    entity_id = matches[0]["id"]

    entity_url = f"https://www.wikidata.org/wiki/Special:EntityData/{entity_id}.json"
    entity_data = fetch_json(entity_url)
    claims = entity_data.get("entities", {}).get(entity_id, {}).get("claims", {})
    founder_claims = claims.get("P112", [])

    founder_ids = []
    for claim in founder_claims:
        try:
            founder_ids.append(claim["mainsnak"]["datavalue"]["value"]["id"])
        except (KeyError, TypeError):
            continue
    if not founder_ids:
        return []

    labels_url = (
        "https://www.wikidata.org/w/api.php?action=wbgetentities"
        f"&ids={'|'.join(founder_ids)}&props=labels&languages=en&format=json"
    )
    labels_data = fetch_json(labels_url)
    names = []
    for founder_id in founder_ids:
        entity = labels_data.get("entities", {}).get(founder_id, {})
        label = entity.get("labels", {}).get("en", {}).get("value")
        if label:
            names.append(label)
    return names


def load_watchlist():
    try:
        with WATCHLIST_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_watchlist(symbols):
    with WATCHLIST_FILE.open("w", encoding="utf-8") as f:
        json.dump(symbols, f)


def normalize_symbol(raw_symbol):
    return re.sub(r"[^A-Za-z0-9.\-^]", "", raw_symbol or "").upper()


def get_watchlist_quotes():
    symbols = load_watchlist()
    quotes = []
    errors = []
    for symbol in symbols:
        try:
            quotes.append(get_quote(symbol))
        except (URLError, HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            errors.append(f"{symbol}: {exc}")
    return {"watchlist": quotes, "errors": errors}


def add_to_watchlist(raw_symbol):
    symbol = normalize_symbol(raw_symbol)
    if not symbol:
        return {"error": "Please enter a ticker symbol, e.g. AAPL."}
    symbols = load_watchlist()
    if symbol not in symbols:
        symbols.append(symbol)
        save_watchlist(symbols)
    return get_watchlist_quotes()


def remove_from_watchlist(raw_symbol):
    symbol = normalize_symbol(raw_symbol)
    symbols = [s for s in load_watchlist() if s != symbol]
    save_watchlist(symbols)
    return get_watchlist_quotes()


def get_company_lookup(raw_symbol):
    symbol = normalize_symbol(raw_symbol)
    if not symbol:
        return {"error": "Please enter a ticker symbol, e.g. AAPL."}

    result = {"symbol": symbol}
    errors = []

    try:
        result["quote"] = get_quote(symbol)
        result["history"] = get_history(symbol)
    except (URLError, HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        return {"error": f"Couldn't find data for '{symbol}': {exc}"}

    try:
        result["news"] = get_news_for_query(f"{symbol} stock")
    except (URLError, HTTPError, ET.ParseError) as exc:
        result["news"] = []
        errors.append(f"news: {exc}")

    try:
        profile, financials, market_cap, stats = get_company_profile_and_financials(symbol)
        result["profile"] = profile
        result["financials"] = financials
        result["stats"] = stats
        if market_cap:
            result["quote"]["marketCap"] = market_cap
    except (URLError, HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        result["profile"] = None
        result["financials"] = None
        result["stats"] = None
        errors.append(f"company profile: {exc}")

    try:
        result["founders"] = get_founders(result["quote"]["name"])
    except (URLError, HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        result["founders"] = []
        errors.append(f"founders: {exc}")

    result["errors"] = errors
    return result


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
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/" or path == "/index.html":
            self._send_static("index.html", "text/html; charset=utf-8")
        elif path == "/style.css":
            self._send_static("style.css", "text/css; charset=utf-8")
        elif path == "/script.js":
            self._send_static("script.js", "application/javascript; charset=utf-8")
        elif path == "/api/indexes":
            self._send_json(get_indexes())
        elif path == "/api/news":
            self._send_json(get_news())
        elif path == "/api/search":
            params = parse_qs(parsed.query)
            symbol = (params.get("symbol") or [""])[0]
            self._send_json(get_company_lookup(symbol))
        elif path == "/api/watchlist":
            self._send_json(get_watchlist_quotes())
        else:
            self.send_error(404, "Not found")

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def do_POST(self):
        if self.path == "/api/watchlist":
            body = self._read_json_body()
            self._send_json(add_to_watchlist(body.get("symbol", "")))
        else:
            self.send_error(404, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/watchlist":
            params = parse_qs(parsed.query)
            symbol = (params.get("symbol") or [""])[0]
            self._send_json(remove_from_watchlist(symbol))
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
