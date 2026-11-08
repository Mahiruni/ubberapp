// Typed client for Bybit's public v5 market-data API. No API keys are used.
const BASE = "https://api.bybit.com";

export type Category = "spot" | "linear";

export interface Ticker {
  symbol: string;
  lastPrice: number;
  price24hPcnt: number; // fraction, e.g. 0.0123 = +1.23%
  highPrice24h: number;
  lowPrice24h: number;
  turnover24h: number; // quote-currency volume
}

export interface Candle {
  time: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OrderBook {
  bids: [number, number][]; // [price, size], best first
  asks: [number, number][];
}

interface ApiEnvelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bybit HTTP ${res.status}`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (body.retCode !== 0) throw new Error(`Bybit: ${body.retMsg}`);
  return body.result;
}

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function getTickers(category: Category): Promise<Ticker[]> {
  const r = await get<{ list: Record<string, string>[] }>("/v5/market/tickers", { category });
  return r.list
    .filter((t) => t.symbol.endsWith("USDT"))
    .map((t) => ({
      symbol: t.symbol,
      lastPrice: num(t.lastPrice),
      price24hPcnt: num(t.price24hPcnt),
      highPrice24h: num(t.highPrice24h),
      lowPrice24h: num(t.lowPrice24h),
      turnover24h: num(t.turnover24h),
    }))
    .sort((a, b) => b.turnover24h - a.turnover24h);
}

export const INTERVALS = ["15", "60", "240", "D"] as const;
export type Interval = (typeof INTERVALS)[number];

export async function getCandles(
  category: Category,
  symbol: string,
  interval: Interval,
  limit = 80,
): Promise<Candle[]> {
  const r = await get<{ list: string[][] }>("/v5/market/kline", {
    category,
    symbol,
    interval,
    limit: String(limit),
  });
  // Bybit returns newest first; charts want oldest first.
  return r.list
    .map((k) => ({
      time: num(k[0]),
      open: num(k[1]),
      high: num(k[2]),
      low: num(k[3]),
      close: num(k[4]),
    }))
    .reverse();
}

export async function getOrderBook(category: Category, symbol: string, limit = 10): Promise<OrderBook> {
  const r = await get<{ b: string[][]; a: string[][] }>("/v5/market/orderbook", {
    category,
    symbol,
    limit: String(limit),
  });
  const conv = (rows: string[][]): [number, number][] => rows.map((x) => [num(x[0]), num(x[1])]);
  return { bids: conv(r.b), asks: conv(r.a) };
}
