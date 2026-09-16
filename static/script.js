const indexesGrid = document.getElementById("indexes-grid");
const indexesStatus = document.getElementById("indexes-status");
const newsList = document.getElementById("news-list");
const newsStatus = document.getElementById("news-status");
const refreshBtn = document.getElementById("refresh-btn");

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchStatus = document.getElementById("search-status");
const searchResult = document.getElementById("search-result");

const watchlistForm = document.getElementById("watchlist-form");
const watchlistInput = document.getElementById("watchlist-input");
const watchlistStatus = document.getElementById("watchlist-status");
const watchlistGrid = document.getElementById("watchlist-grid");

const watchlistCodeForm = document.getElementById("watchlist-code-form");
const watchlistCodeInput = document.getElementById("watchlist-code-input");
const watchlistCodeLabel = document.getElementById("watchlist-code-label");
const watchlistCopyBtn = document.getElementById("watchlist-copy-btn");

function formatChange(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function computeSMA(closes, window) {
  const sma = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= window) sum -= closes[i - window];
    if (i >= window - 1) sma[i] = sum / window;
  }
  return sma;
}

function seriesToPoints(series, totalCount, min, range, width, height, padding) {
  const pts = [];
  series.forEach((value, i) => {
    if (value == null) return;
    const x = padding.left + (i / (totalCount - 1)) * (width - padding.left - padding.right);
    const y = height - padding.bottom - ((value - min) / range) * (height - padding.top - padding.bottom);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return pts.join(" ");
}

function formatAxisPrice(value) {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(2);
}

function formatAxisDate(dateStr) {
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateStr;
}

function buildStatRow(label, value) {
  return `
    <div class="chart-stat">
      <span class="chart-stat-label">${label}</span>
      <span class="chart-stat-value">${value}</span>
    </div>
  `;
}

function buildChartSection(idx) {
  const history = idx.history;
  if (!history || history.length < 2) {
    return '<div class="chart-empty">Not enough data for a chart</div>';
  }

  const closes = history.map((h) => h.close);
  const sma10 = closes.length >= 10 ? computeSMA(closes, 10) : null;
  const sma20 = closes.length >= 20 ? computeSMA(closes, 20) : null;
  const prevClose = typeof idx.previousClose === "number" ? idx.previousClose : null;

  const allValues = [
    ...closes,
    ...((sma10 || []).filter((v) => v != null)),
    ...((sma20 || []).filter((v) => v != null)),
    ...(prevClose != null ? [prevClose] : []),
  ];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const mid = (min + max) / 2;

  const width = 320;
  const height = 100;
  const padding = { left: 38, right: 6, top: 8, bottom: 16 };

  const closePoints = seriesToPoints(closes, closes.length, min, range, width, height, padding);
  const trendUp = closes[closes.length - 1] >= closes[0];
  const color = trendUp ? "#16a34a" : "#dc2626";

  let overlays = "";
  let legend = "";
  if (sma10) {
    const pts = seriesToPoints(sma10, closes.length, min, range, width, height, padding);
    overlays += `<polyline points="${pts}" fill="none" stroke="#f59e0b" stroke-width="1.3" stroke-dasharray="4 2" />`;
    legend += `<span class="legend-item"><span class="legend-dot sma10"></span>SMA 10</span>`;
  }
  if (sma20) {
    const pts = seriesToPoints(sma20, closes.length, min, range, width, height, padding);
    overlays += `<polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="1.3" stroke-dasharray="1 2" />`;
    legend += `<span class="legend-item"><span class="legend-dot sma20"></span>SMA 20</span>`;
  }

  let refLine = "";
  if (prevClose != null) {
    const y = height - padding.bottom - ((prevClose - min) / range) * (height - padding.top - padding.bottom);
    const plotMid = padding.top + (height - padding.top - padding.bottom) / 2;
    const labelY = y > plotMid ? y - 3 : y + 9;
    refLine = `
      <line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" class="chart-refline" />
      <text x="${padding.left + 3}" y="${labelY.toFixed(1)}" class="chart-axis-label chart-refline-label" text-anchor="start">Prev Close</text>
    `;
  }

  const yAxis = [max, mid, min]
    .map((value) => {
      const y = height - padding.bottom - ((value - min) / range) * (height - padding.top - padding.bottom);
      return `
        <line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" class="chart-gridline" />
        <text x="${padding.left - 4}" y="${(y + 2.5).toFixed(1)}" class="chart-axis-label chart-axis-label-y" text-anchor="end">${formatAxisPrice(value)}</text>
      `;
    })
    .join("");

  const xTickIndexes = [0, Math.round((history.length - 1) / 2), history.length - 1];
  const xAxis = xTickIndexes
    .map((i) => {
      const x = padding.left + (i / (closes.length - 1)) * (width - padding.left - padding.right);
      const anchor = i === 0 ? "start" : i === history.length - 1 ? "end" : "middle";
      return `<text x="${x.toFixed(1)}" y="${height - 3}" class="chart-axis-label" text-anchor="${anchor}">${formatAxisDate(history[i].date)}</text>`;
    })
    .join("");

  let peakIdx = 0;
  let troughIdx = 0;
  closes.forEach((v, i) => {
    if (v > closes[peakIdx]) peakIdx = i;
    if (v < closes[troughIdx]) troughIdx = i;
  });

  const stats = [
    buildStatRow("Period High", `${formatAxisPrice(closes[peakIdx])} <span class="chart-stat-date">${formatAxisDate(history[peakIdx].date)}</span>`),
    buildStatRow("Period Low", `${formatAxisPrice(closes[troughIdx])} <span class="chart-stat-date">${formatAxisDate(history[troughIdx].date)}</span>`),
  ];
  if (prevClose != null) {
    stats.push(buildStatRow("Prev. Close", formatAxisPrice(prevClose)));
  }
  const latestSma = sma20 ? sma20[sma20.length - 1] : sma10 ? sma10[sma10.length - 1] : null;
  if (latestSma != null) {
    stats.push(buildStatRow(sma20 ? "20-Day Avg" : "10-Day Avg", formatAxisPrice(latestSma)));
  }

  return `
    <div class="chart-row">
      <div class="chart-svg-wrap">
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
          ${yAxis}
          ${refLine}
          <polyline points="${closePoints}" fill="none" stroke="${color}" stroke-width="2" />
          ${overlays}
          ${xAxis}
        </svg>
        ${legend ? `<div class="chart-legend">${legend}</div>` : ""}
      </div>
      <div class="chart-stats">
        ${stats.join("")}
      </div>
    </div>
  `;
}

function buildIndexCard(idx) {
  const direction = idx.change >= 0 ? "up" : "down";
  const arrow = idx.change >= 0 ? "▲" : "▼";

  const card = document.createElement("div");
  card.className = "index-card";
  card.innerHTML = `
    <div class="name">${idx.name}</div>
    <div class="symbol">${idx.symbol}</div>
    ${idx.marketCap ? `<div class="market-cap">Market Cap: ${idx.marketCap}</div>` : ""}
    <div class="price">${idx.price.toLocaleString()}</div>
    <div class="change ${direction}">
      ${arrow} ${formatChange(idx.change)} (${formatChange(idx.percentChange)}%)
    </div>
    ${buildChartSection(idx)}
  `;
  return card;
}

function buildNewsItem(article) {
  const li = document.createElement("li");
  li.className = "news-item";

  const text = document.createElement("div");
  text.className = "news-text";
  text.innerHTML = `
    <div class="news-title">${article.title}</div>
    <div class="news-source">${article.source}</div>
  `;

  const goBtn = document.createElement("button");
  goBtn.className = "go-btn";
  goBtn.textContent = "Read Article →";
  goBtn.addEventListener("click", () => {
    window.open(article.link, "_blank", "noopener,noreferrer");
  });

  li.appendChild(text);
  li.appendChild(goBtn);
  return li;
}

function renderNewsInto(listEl, articles) {
  listEl.innerHTML = "";
  for (const article of articles) {
    listEl.appendChild(buildNewsItem(article));
  }
}

function buildProfileCard(profile, founders) {
  const card = document.createElement("div");
  card.className = "profile-card";

  const rows = [
    ["CEO", profile.ceo || "Not available"],
    ["Founder(s)", founders && founders.length ? founders.join(", ") : "Not available"],
    ["Sector", profile.sector || "—"],
    ["Industry", profile.industry || "—"],
    ["Headquarters", profile.headquarters || "—"],
    ["Employees", profile.employees ? profile.employees.toLocaleString() : "—"],
  ];

  const rowsHtml = rows
    .map(([label, value]) => `
      <div class="profile-row">
        <span class="profile-label">${label}</span>
        <span class="profile-value">${value}</span>
      </div>
    `)
    .join("");

  const summaryHtml = profile.summary
    ? `<p class="profile-summary">${
        profile.summary.length > 320 ? profile.summary.slice(0, 320) + "…" : profile.summary
      }</p>`
    : "";

  card.innerHTML = `
    <h3 class="card-heading">Company Profile</h3>
    ${rowsHtml}
    ${summaryHtml}
  `;

  if (profile.website) {
    const websiteBtn = document.createElement("button");
    websiteBtn.className = "go-btn";
    websiteBtn.textContent = "Visit Website →";
    websiteBtn.addEventListener("click", () => {
      window.open(profile.website, "_blank", "noopener,noreferrer");
    });
    card.appendChild(websiteBtn);
  }

  return card;
}

function buildFinancialsCard(financials) {
  const card = document.createElement("div");
  card.className = "profile-card";

  const netIncomeLabel = financials.netIncomeIsLoss ? "Net Loss" : "Net Profit";
  const netIncomeClass = financials.netIncomeIsLoss ? "down" : "up";

  const retainedLabel = financials.retainedEarningsIsDeficit
    ? "Accumulated Deficit"
    : "Retained Earnings (Surplus)";
  const retainedClass = financials.retainedEarningsIsDeficit ? "down" : "up";

  const rows = [
    ["Total Revenue", financials.revenue, ""],
    ["Gross Profit", financials.grossProfit, ""],
    [netIncomeLabel, financials.netIncome, netIncomeClass],
    [retainedLabel, financials.retainedEarnings, retainedClass],
    ["Profit Margin", financials.profitMargin, ""],
  ];

  const rowsHtml = rows
    .map(([label, value, cls]) => `
      <div class="profile-row">
        <span class="profile-label">${label}</span>
        <span class="profile-value ${cls}">${value != null ? value : "—"}</span>
      </div>
    `)
    .join("");

  card.innerHTML = `
    <h3 class="card-heading">Financial Snapshot</h3>
    ${financials.periodEnding ? `<div class="status-text">As of ${financials.periodEnding}</div>` : ""}
    ${rowsHtml}
  `;
  return card;
}

function buildStatsCard(stats) {
  const card = document.createElement("div");
  card.className = "profile-card";

  const range = (low, high) => (low != null && high != null ? `${low} – ${high}` : "—");

  const rows = [
    ["52-Week Range", range(stats.fiftyTwoWeekLow, stats.fiftyTwoWeekHigh)],
    ["Day Range", range(stats.dayLow, stats.dayHigh)],
    ["Volume", stats.volume ?? "—"],
    ["Avg. Volume", stats.averageVolume ?? "—"],
    ["P/E (Trailing)", stats.trailingPE ?? "—"],
    ["P/E (Forward)", stats.forwardPE ?? "—"],
    ["Dividend Yield", stats.dividendYield ?? "—"],
    ["Beta", stats.beta ?? "—"],
  ];

  const rowsHtml = rows
    .map(([label, value]) => `
      <div class="profile-row">
        <span class="profile-label">${label}</span>
        <span class="profile-value">${value}</span>
      </div>
    `)
    .join("");

  card.innerHTML = `
    <h3 class="card-heading">Key Statistics</h3>
    ${rowsHtml}
  `;
  return card;
}

function renderIndexes(data) {
  indexesGrid.innerHTML = "";

  if (!data.indexes || data.indexes.length === 0) {
    indexesStatus.textContent = "No index data available right now.";
    indexesStatus.classList.add("error");
    return;
  }

  indexesStatus.classList.remove("error");
  indexesStatus.textContent = data.errors && data.errors.length
    ? `Some indexes failed to load: ${data.errors.join("; ")}`
    : "";

  for (const idx of data.indexes) {
    indexesGrid.appendChild(buildIndexCard(idx));
  }
}

function renderNews(data) {
  if (!data.news || data.news.length === 0) {
    newsList.innerHTML = "";
    newsStatus.textContent = "No news available right now.";
    newsStatus.classList.add("error");
    return;
  }

  newsStatus.classList.remove("error");
  newsStatus.textContent = data.errors && data.errors.length
    ? `Some news sources failed to load: ${data.errors.join("; ")}`
    : "";

  renderNewsInto(newsList, data.news);
}

async function loadIndexes() {
  indexesStatus.classList.remove("error");
  indexesStatus.textContent = "Loading...";
  try {
    const res = await fetch("/api/indexes");
    const data = await res.json();
    renderIndexes(data);
  } catch (err) {
    indexesStatus.textContent = "Failed to load index data.";
    indexesStatus.classList.add("error");
  }
}

async function loadNews() {
  newsStatus.classList.remove("error");
  newsStatus.textContent = "Loading...";
  try {
    const res = await fetch("/api/news");
    const data = await res.json();
    renderNews(data);
  } catch (err) {
    newsStatus.textContent = "Failed to load news.";
    newsStatus.classList.add("error");
  }
}

async function runSearch(symbol) {
  searchResult.innerHTML = "";
  searchStatus.classList.remove("error");

  if (!symbol) {
    searchStatus.textContent = "Enter a ticker symbol first.";
    searchStatus.classList.add("error");
    return;
  }

  searchStatus.textContent = `Looking up ${symbol.toUpperCase()}...`;

  try {
    const res = await fetch(`/api/search?symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();

    if (data.error) {
      searchStatus.textContent = data.error;
      searchStatus.classList.add("error");
      return;
    }

    searchStatus.textContent = data.errors && data.errors.length
      ? `Loaded with some issues: ${data.errors.join("; ")}`
      : "";

    const cardWrap = document.createElement("div");
    cardWrap.className = "indexes-grid";
    cardWrap.appendChild(buildIndexCard(data.quote && { ...data.quote, history: data.history }));
    searchResult.appendChild(cardWrap);

    if (data.profile || data.financials || data.stats) {
      const detailsWrap = document.createElement("div");
      detailsWrap.className = "indexes-grid";
      if (data.profile) {
        detailsWrap.appendChild(buildProfileCard(data.profile, data.founders));
      }
      if (data.stats) {
        detailsWrap.appendChild(buildStatsCard(data.stats));
      }
      if (data.financials) {
        detailsWrap.appendChild(buildFinancialsCard(data.financials));
      }
      searchResult.appendChild(detailsWrap);
    }

    if (data.news && data.news.length > 0) {
      const heading = document.createElement("h2");
      heading.textContent = `News about ${data.symbol}`;
      searchResult.appendChild(heading);

      const list = document.createElement("ul");
      list.className = "news-list";
      renderNewsInto(list, data.news);
      searchResult.appendChild(list);
    }
  } catch (err) {
    searchStatus.textContent = "Search failed. Please try again.";
    searchStatus.classList.add("error");
  }
}

function handleSearch(event) {
  event.preventDefault();
  runSearch(searchInput.value.trim());
}

// --- Watchlist codes ----------------------------------------------------
// Watchlists live server-side keyed by a 6-letter code (no login needed).
// The code is remembered in this browser via localStorage so reloads and
// restarts of the server still find the same list; entering the same code
// on another device/browser pulls up the same watchlist there too.

const WATCHLIST_CODE_KEY = "watchlistCode";

function getStoredCode() {
  try {
    return localStorage.getItem(WATCHLIST_CODE_KEY) || null;
  } catch (err) {
    return null;
  }
}

function setStoredCode(code) {
  try {
    if (code) {
      localStorage.setItem(WATCHLIST_CODE_KEY, code);
    } else {
      localStorage.removeItem(WATCHLIST_CODE_KEY);
    }
  } catch (err) {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

function renderCodeBar() {
  const code = getStoredCode();
  if (code) {
    watchlistCodeLabel.textContent = `Your code: ${code}`;
    watchlistCodeLabel.classList.remove("muted");
    watchlistCopyBtn.hidden = false;
  } else {
    watchlistCodeLabel.textContent = "No code yet — add a ticker below to create one.";
    watchlistCodeLabel.classList.add("muted");
    watchlistCopyBtn.hidden = true;
  }
}

watchlistCopyBtn.addEventListener("click", async () => {
  const code = getStoredCode();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    watchlistCopyBtn.textContent = "Copied!";
    setTimeout(() => {
      watchlistCopyBtn.textContent = "Copy";
    }, 1500);
  } catch (err) {
    // Clipboard API unavailable — the code is still visible to copy by hand.
  }
});

function handleWatchlistCodeSubmit(event) {
  event.preventDefault();
  const code = watchlistCodeInput.value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 6) {
    watchlistStatus.textContent = "A watchlist code is exactly 6 letters, e.g. KXQPZM.";
    watchlistStatus.classList.add("error");
    return;
  }
  setStoredCode(code);
  watchlistCodeInput.value = "";
  loadWatchlist();
}

// --- Watchlist & price alerts -----------------------------------------

function loadAlerts() {
  try {
    return JSON.parse(localStorage.getItem("watchlistAlerts") || "{}");
  } catch (err) {
    return {};
  }
}

function saveAlerts(alerts) {
  try {
    localStorage.setItem("watchlistAlerts", JSON.stringify(alerts));
  } catch (err) {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

function notifyAlert(quote, target) {
  const message = `${quote.symbol} crossed your target of $${target} (now $${quote.price})`;
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Price Alert", { body: message });
    }
  } catch (err) {
    // Notification API unsupported (e.g. iOS Safari) — the on-card badge below still shows.
  }
}

function checkAlerts(quotes) {
  const alerts = loadAlerts();
  let changed = false;

  for (const quote of quotes) {
    const entry = alerts[quote.symbol];
    if (!entry || entry.target == null) continue;

    if (!entry.fired && entry.lastPrice != null) {
      const crossed =
        (entry.lastPrice < entry.target && quote.price >= entry.target) ||
        (entry.lastPrice > entry.target && quote.price <= entry.target);
      if (crossed) {
        entry.fired = true;
        notifyAlert(quote, entry.target);
        changed = true;
      }
    }
    if (entry.lastPrice !== quote.price) {
      entry.lastPrice = quote.price;
      changed = true;
    }
  }

  if (changed) saveAlerts(alerts);
  return alerts;
}

function buildWatchlistCard(quote, alerts) {
  const direction = quote.change >= 0 ? "up" : "down";
  const arrow = quote.change >= 0 ? "▲" : "▼";
  const entry = alerts[quote.symbol];

  const card = document.createElement("div");
  card.className = "index-card watchlist-card";
  card.innerHTML = `
    <div class="name">${quote.name}</div>
    <div class="symbol">${quote.symbol}</div>
    <div class="price">${quote.price.toLocaleString()}</div>
    <div class="change ${direction}">
      ${arrow} ${formatChange(quote.change)} (${formatChange(quote.percentChange)}%)
    </div>
    ${entry && entry.fired ? `<div class="alert-badge">🔔 Target of $${entry.target} reached</div>` : ""}
    <div class="alert-row">
      <input type="number" step="0.01" class="alert-input" placeholder="Alert price" value="${entry && entry.target != null ? entry.target : ""}" />
      <button type="button" class="alert-btn">Set Alert</button>
    </div>
  `;

  const viewBtn = document.createElement("button");
  viewBtn.className = "go-btn";
  viewBtn.textContent = "View Details →";
  viewBtn.addEventListener("click", () => {
    searchInput.value = quote.symbol;
    runSearch(quote.symbol);
    searchInput.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => removeFromWatchlist(quote.symbol));

  const alertInput = card.querySelector(".alert-input");
  const alertBtn = card.querySelector(".alert-btn");
  alertBtn.addEventListener("click", () => {
    const value = parseFloat(alertInput.value);
    const allAlerts = loadAlerts();
    if (Number.isNaN(value)) {
      delete allAlerts[quote.symbol];
    } else {
      allAlerts[quote.symbol] = { target: value, fired: false, lastPrice: quote.price };
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
    saveAlerts(allAlerts);
    renderWatchlist({ watchlist: currentWatchlistQuotes, errors: [] });
  });

  card.appendChild(viewBtn);
  card.appendChild(removeBtn);
  return card;
}

let currentWatchlistQuotes = [];

function renderWatchlist(data) {
  watchlistGrid.innerHTML = "";
  currentWatchlistQuotes = data.watchlist || [];

  if (currentWatchlistQuotes.length === 0) {
    watchlistStatus.textContent = "Your watchlist is empty — add a ticker above.";
    watchlistStatus.classList.remove("error");
    return;
  }

  const alerts = checkAlerts(currentWatchlistQuotes);

  watchlistStatus.classList.remove("error");
  watchlistStatus.textContent = data.errors && data.errors.length
    ? `Some watchlist symbols failed to load: ${data.errors.join("; ")}`
    : "";

  for (const quote of currentWatchlistQuotes) {
    watchlistGrid.appendChild(buildWatchlistCard(quote, alerts));
  }
}

async function loadWatchlist() {
  renderCodeBar();
  const code = getStoredCode();
  if (!code) {
    watchlistGrid.innerHTML = "";
    watchlistStatus.classList.remove("error");
    watchlistStatus.textContent = "Add a ticker below to start a watchlist and get your code.";
    return;
  }
  try {
    const res = await fetch(`/api/watchlist?code=${encodeURIComponent(code)}`);
    const data = await res.json();
    renderWatchlist(data);
  } catch (err) {
    watchlistStatus.textContent = "Failed to load watchlist.";
    watchlistStatus.classList.add("error");
  }
}

async function addToWatchlist(symbol) {
  watchlistStatus.classList.remove("error");
  watchlistStatus.textContent = `Adding ${symbol.toUpperCase()}...`;
  try {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, code: getStoredCode() }),
    });
    const data = await res.json();
    if (data.error) {
      watchlistStatus.textContent = data.error;
      watchlistStatus.classList.add("error");
      return;
    }
    if (data.code) setStoredCode(data.code);
    renderCodeBar();
    renderWatchlist(data);
    if (data.generated) {
      watchlistStatus.textContent = `Created your watchlist! Your code is ${data.code} — save it to check this list from any device.`;
      watchlistStatus.classList.remove("error");
    }
  } catch (err) {
    watchlistStatus.textContent = "Failed to add symbol.";
    watchlistStatus.classList.add("error");
  }
}

async function removeFromWatchlist(symbol) {
  const code = getStoredCode();
  if (!code) return;
  try {
    const res = await fetch(
      `/api/watchlist?code=${encodeURIComponent(code)}&symbol=${encodeURIComponent(symbol)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    renderWatchlist(data);
  } catch (err) {
    watchlistStatus.textContent = "Failed to remove symbol.";
    watchlistStatus.classList.add("error");
  }
}

function handleWatchlistSubmit(event) {
  event.preventDefault();
  const symbol = watchlistInput.value.trim();
  if (!symbol) {
    watchlistStatus.textContent = "Enter a ticker symbol first.";
    watchlistStatus.classList.add("error");
    return;
  }
  addToWatchlist(symbol);
  watchlistInput.value = "";
}

function loadAll() {
  loadIndexes();
  loadNews();
  loadWatchlist();
}

refreshBtn.addEventListener("click", loadAll);
searchForm.addEventListener("submit", handleSearch);
watchlistForm.addEventListener("submit", handleWatchlistSubmit);
watchlistCodeForm.addEventListener("submit", handleWatchlistCodeSubmit);

loadAll();
setInterval(loadAll, 60000);
