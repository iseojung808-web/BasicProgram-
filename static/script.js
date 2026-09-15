const indexesGrid = document.getElementById("indexes-grid");
const indexesStatus = document.getElementById("indexes-status");
const newsList = document.getElementById("news-list");
const newsStatus = document.getElementById("news-status");
const refreshBtn = document.getElementById("refresh-btn");

const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchStatus = document.getElementById("search-status");
const searchResult = document.getElementById("search-result");

function formatChange(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function buildChartSVG(history) {
  if (!history || history.length < 2) {
    return '<div class="chart-empty">Not enough data for a chart</div>';
  }

  const closes = history.map((h) => h.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const width = 300;
  const height = 70;
  const padding = 4;

  const points = closes
    .map((c, i) => {
      const x = padding + (i / (closes.length - 1)) * (width - padding * 2);
      const y = height - padding - ((c - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const trendUp = closes[closes.length - 1] >= closes[0];
  const color = trendUp ? "#16a34a" : "#dc2626";

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" />
    </svg>
    <div class="chart-range">
      <span>${history[0].date}</span>
      <span>${history[history.length - 1].date}</span>
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
    <div class="price">${idx.price.toLocaleString()}</div>
    <div class="change ${direction}">
      ${arrow} ${formatChange(idx.change)} (${formatChange(idx.percentChange)}%)
    </div>
    ${buildChartSVG(idx.history)}
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

function loadAll() {
  loadIndexes();
  loadNews();
}

async function handleSearch(event) {
  event.preventDefault();
  const symbol = searchInput.value.trim();
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

refreshBtn.addEventListener("click", loadAll);
searchForm.addEventListener("submit", handleSearch);

loadAll();
setInterval(loadAll, 60000);
