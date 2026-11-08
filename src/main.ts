import "./style.css";
import {
  INTERVALS,
  getCandles,
  getOrderBook,
  getTickers,
  type Category,
  type Interval,
  type Ticker,
} from "./bybit";
import { candleChartSvg } from "./chart";
import { baseOf, escapeHtml, fmtPct, fmtPrice, fmtVolume } from "./format";

type Tab = "markets" | "favorites";

const app = document.getElementById("app") as HTMLElement;

const state = {
  tab: "markets" as Tab,
  category: "spot" as Category,
  query: "",
  tickers: [] as Ticker[],
  error: "",
  loading: true,
  favorites: loadFavorites(),
  detail: null as null | { symbol: string; interval: Interval },
};

let refreshTimer: number | undefined;
let detailToken = 0;

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem("favorites");
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(): void {
  try {
    localStorage.setItem("favorites", JSON.stringify([...state.favorites]));
  } catch {
    /* storage unavailable; favorites last for this session only */
  }
}

const key = (category: Category, symbol: string) => `${category}:${symbol}`;

async function refreshTickers(): Promise<void> {
  try {
    state.tickers = await getTickers(state.category);
    state.error = "";
  } catch (e) {
    state.error = e instanceof Error ? e.message : "Could not load markets";
  }
  state.loading = false;
  if (!state.detail) renderList();
}

function startRefresh(): void {
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    if (!state.detail) void refreshTickers();
  }, 5000);
}

function visibleTickers(): Ticker[] {
  const q = state.query.trim().toUpperCase();
  return state.tickers.filter((t) => {
    if (state.tab === "favorites" && !state.favorites.has(key(state.category, t.symbol))) return false;
    return !q || t.symbol.includes(q);
  });
}

function renderShell(): void {
  state.detail = null;
  detailToken++;
  app.innerHTML = `
    <header class="top">
      <h1>${state.tab === "markets" ? "Markets" : "Favorites"}</h1>
      <div class="seg" role="tablist">
        <button data-cat="spot" class="${state.category === "spot" ? "on" : ""}">Spot</button>
        <button data-cat="linear" class="${state.category === "linear" ? "on" : ""}">Futures</button>
      </div>
      <input id="q" type="search" placeholder="Search coin" value="${escapeHtml(state.query)}" autocomplete="off" />
    </header>
    <main id="list" class="list"></main>
    <nav class="tabs">
      <button data-tab="markets" class="${state.tab === "markets" ? "on" : ""}">Markets</button>
      <button data-tab="favorites" class="${state.tab === "favorites" ? "on" : ""}">Favorites</button>
    </nav>`;

  app.querySelectorAll<HTMLButtonElement>("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      state.category = b.dataset.cat as Category;
      state.loading = true;
      state.tickers = [];
      renderShell();
      void refreshTickers();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab as Tab;
      renderShell();
    }),
  );
  (document.getElementById("q") as HTMLInputElement).addEventListener("input", (e) => {
    state.query = (e.target as HTMLInputElement).value;
    renderList();
  });
  renderList();
}

function renderList(): void {
  const el = document.getElementById("list");
  if (!el) return;

  if (state.loading) {
    el.innerHTML = `<p class="note">Loading markets…</p>`;
    return;
  }
  if (state.error && state.tickers.length === 0) {
    el.innerHTML = `<p class="note err">${escapeHtml(state.error)}</p><button id="retry" class="btn">Retry</button>`;
    document.getElementById("retry")?.addEventListener("click", () => {
      state.loading = true;
      renderList();
      void refreshTickers();
    });
    return;
  }

  const rows = visibleTickers();
  if (rows.length === 0) {
    el.innerHTML = `<p class="note">${state.tab === "favorites" ? "No favorites yet. Open a coin and tap the star." : "No matches."}</p>`;
    return;
  }

  el.innerHTML = rows
    .slice(0, 150)
    .map((t) => {
      const up = t.price24hPcnt >= 0;
      return `<button class="row" data-sym="${escapeHtml(t.symbol)}">
        <span class="name"><b>${escapeHtml(baseOf(t.symbol))}</b><small>/USDT · Vol ${fmtVolume(t.turnover24h)}</small></span>
        <span class="price">${fmtPrice(t.lastPrice)}</span>
        <span class="chg ${up ? "up" : "down"}">${fmtPct(t.price24hPcnt)}</span>
      </button>`;
    })
    .join("");

  el.querySelectorAll<HTMLButtonElement>("[data-sym]").forEach((b) =>
    b.addEventListener("click", () => openDetail(b.dataset.sym as string)),
  );
}

function openDetail(symbol: string): void {
  state.detail = { symbol, interval: "60" };
  drawDetail();
}

function drawDetail(): void {
  const d = state.detail;
  if (!d) return;
  const token = ++detailToken;
  const t = state.tickers.find((x) => x.symbol === d.symbol);
  const fav = state.favorites.has(key(state.category, d.symbol));
  const up = (t?.price24hPcnt ?? 0) >= 0;

  app.innerHTML = `
    <header class="top detail">
      <button id="back" class="icon" aria-label="Back">←</button>
      <h1>${escapeHtml(baseOf(d.symbol))}/USDT</h1>
      <button id="fav" class="icon ${fav ? "star" : ""}" aria-label="Toggle favorite">${fav ? "★" : "☆"}</button>
    </header>
    <main class="detailbody">
      <div class="big ${up ? "up" : "down"}">${t ? fmtPrice(t.lastPrice) : "—"}</div>
      <div class="sub ${up ? "up" : "down"}">${t ? fmtPct(t.price24hPcnt) : ""}</div>
      <div class="stats">
        <div><small>24h high</small><b>${t ? fmtPrice(t.highPrice24h) : "—"}</b></div>
        <div><small>24h low</small><b>${t ? fmtPrice(t.lowPrice24h) : "—"}</b></div>
        <div><small>24h volume</small><b>${t ? fmtVolume(t.turnover24h) : "—"}</b></div>
      </div>
      <div class="seg small">
        ${INTERVALS.map(
          (i) => `<button data-int="${i}" class="${i === d.interval ? "on" : ""}">${i === "D" ? "1D" : i === "60" ? "1H" : i === "240" ? "4H" : "15m"}</button>`,
        ).join("")}
      </div>
      <div id="chart" class="chart"><p class="note">Loading chart…</p></div>
      <h2>Order book</h2>
      <div id="book" class="book"><p class="note">Loading…</p></div>
    </main>`;

  document.getElementById("back")?.addEventListener("click", () => {
    renderShell();
    void refreshTickers();
  });
  document.getElementById("fav")?.addEventListener("click", () => {
    const k = key(state.category, d.symbol);
    if (state.favorites.has(k)) state.favorites.delete(k);
    else state.favorites.add(k);
    saveFavorites();
    drawDetail();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-int]").forEach((b) =>
    b.addEventListener("click", () => {
      d.interval = b.dataset.int as Interval;
      drawDetail();
    }),
  );

  getCandles(state.category, d.symbol, d.interval)
    .then((c) => {
      if (token !== detailToken) return;
      const el = document.getElementById("chart");
      if (el) el.innerHTML = candleChartSvg(c);
    })
    .catch((e: unknown) => {
      if (token !== detailToken) return;
      const el = document.getElementById("chart");
      if (el) el.innerHTML = `<p class="note err">${escapeHtml(e instanceof Error ? e.message : "Chart failed")}</p>`;
    });

  getOrderBook(state.category, d.symbol)
    .then((ob) => {
      if (token !== detailToken) return;
      const el = document.getElementById("book");
      if (!el) return;
      const rows = (side: [number, number][], cls: string) =>
        side.map(([p, s]) => `<div class="${cls}"><span>${fmtPrice(p)}</span><span>${s}</span></div>`).join("");
      el.innerHTML = `<div class="col"><small>Bids</small>${rows(ob.bids.slice(0, 8), "up")}</div>
        <div class="col"><small>Asks</small>${rows(ob.asks.slice(0, 8), "down")}</div>`;
    })
    .catch((e: unknown) => {
      if (token !== detailToken) return;
      const el = document.getElementById("book");
      if (el) el.innerHTML = `<p class="note err">${escapeHtml(e instanceof Error ? e.message : "Order book failed")}</p>`;
    });
}

renderShell();
void refreshTickers();
startRefresh();
