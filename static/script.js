const indexesGrid = document.getElementById("indexes-grid");
const indexesStatus = document.getElementById("indexes-status");
const newsList = document.getElementById("news-list");
const newsStatus = document.getElementById("news-status");
const refreshBtn = document.getElementById("refresh-btn");

function formatChange(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
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
    `;
    indexesGrid.appendChild(card);
  }
}

function renderNews(data) {
  newsList.innerHTML = "";

  if (!data.news || data.news.length === 0) {
    newsStatus.textContent = "No news available right now.";
    newsStatus.classList.add("error");
    return;
  }

  newsStatus.classList.remove("error");
  newsStatus.textContent = data.errors && data.errors.length
    ? `Some news sources failed to load: ${data.errors.join("; ")}`
    : "";

  for (const article of data.news) {
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
    newsList.appendChild(li);
  }
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

refreshBtn.addEventListener("click", loadAll);

loadAll();
setInterval(loadAll, 60000);
