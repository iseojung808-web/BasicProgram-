# Economic Index Tracker

A small dashboard that tracks changes in major economic indexes — **NASDAQ
Composite** and **S&P 100** — and shows related news headlines.

## Features

- **Market Indexes**: current price, point change, and percent change for
  NASDAQ Composite (`^IXIC`) and S&P 100 (`^OEX`), color-coded green/red for
  up/down.
- **Related News**: headlines related to those indexes, showing only the
  **title** and the **source** it came from, plus a **"Read Article →"**
  button that opens the original article in a new tab.
- Manual **Refresh** button, plus auto-refresh every 60 seconds.

## Requirements

- Python 3.8+
- An internet connection (the app calls Yahoo Finance's chart API for index
  quotes and Google News RSS for headlines — no API key needed)

No third-party packages are required; only the Python standard library is
used.

## Running it

```bash
python3 app.py
```

Then open <http://localhost:8000> in your browser.

## Project layout

```
app.py            # stdlib HTTP server + data fetching (indexes & news)
static/
  index.html      # page structure
  style.css       # styling
  script.js       # fetches /api/indexes and /api/news, renders the UI
```

## Notes

- If the index or news requests fail (e.g. no internet access, or a data
  source is temporarily unavailable), the dashboard shows a short error
  message instead of crashing.
- To track different indexes, edit the `INDEXES` dictionary in `app.py`
  (values are Yahoo Finance ticker symbols, e.g. `^GSPC` for S&P 500,
  `^DJI` for Dow Jones).
