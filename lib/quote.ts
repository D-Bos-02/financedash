// Latest share price or FX rate (e.g. "AUDUSD=X") from Yahoo Finance's public chart endpoint (no API key).
// Unofficial, so callers must handle null and fall back to a saved price.

export interface Quote {
  price: number;
  asOf: string;
}

export async function getQuote(symbol: string, decimals = 2): Promise<Quote | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const meta = (await res.json())?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    const asOf = meta.regularMarketTime
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
          timeZoneName: "short",
        }).format(new Date(meta.regularMarketTime * 1000))
      : "";
    return { price: Number(price.toFixed(decimals)), asOf };
  } catch {
    return null;
  }
}
