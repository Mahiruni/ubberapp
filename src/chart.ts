import type { Candle } from "./bybit";

const UP = "#20b26c";
const DOWN = "#ef454a";

// Renders candlesticks as an inline SVG string.
export function candleChartSvg(candles: Candle[], width = 360, height = 220): string {
  if (candles.length === 0) return `<svg viewBox="0 0 ${width} ${height}"></svg>`;

  const pad = { t: 8, b: 8, l: 4, r: 4 };
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const span = hi - lo || 1;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const step = innerW / candles.length;
  const bodyW = Math.max(1, step * 0.6);
  const y = (p: number) => pad.t + ((hi - p) / span) * innerH;

  const parts = candles.map((c, i) => {
    const x = pad.l + i * step + step / 2;
    const color = c.close >= c.open ? UP : DOWN;
    const top = y(Math.max(c.open, c.close));
    const bodyH = Math.max(1, Math.abs(y(c.open) - y(c.close)));
    return (
      `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(c.high).toFixed(1)}" y2="${y(c.low).toFixed(1)}" stroke="${color}" stroke-width="1"/>` +
      `<rect x="${(x - bodyW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}"/>`
    );
  });

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Candlestick chart">${parts.join("")}</svg>`;
}
