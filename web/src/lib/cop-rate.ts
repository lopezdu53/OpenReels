const FALLBACK_USD_COP = 4100;
const CACHE_KEY = "openreels_usd_cop";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export async function fetchUsdToCopRate(): Promise<number> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { rate: number; at: number };
      if (parsed.rate > 0 && Date.now() - parsed.at < CACHE_TTL_MS) return parsed.rate;
    }
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=COP");
    if (res.ok) {
      const data = (await res.json()) as { rates?: { COP?: number } };
      const rate = data.rates?.COP;
      if (typeof rate === "number" && rate > 0) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, at: Date.now() }));
        return rate;
      }
    }
  } catch {
    /* offline / blocked */
  }

  return FALLBACK_USD_COP;
}
