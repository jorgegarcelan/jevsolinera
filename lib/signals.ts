// Señales de mercado: titulares recientes y crudo Brent. Ambas son opcionales:
// si fallan, la decisión se toma con lo que haya.

export interface Headline {
  title: string;
  source: string;
  date: string; // ISO
  url?: string; // enlace de Google News, redirige al artículo
}

const RELEVANT = /gasolin|di[eé]sel|gas[oó]leo|carburant|combustib|petr[oó]leo|brent|opep|surtidor|repostar/i;
const LISTING = /m[aá]s barat[ao]s? (de|en) |consulta(r)? (el|los) precio|precios en las principales ciudades|localiza las gasolineras/i;
// Precios de surtidor de otros países (Latinoamérica, otros mercados europeos): no dicen nada
// del surtidor español. Lo global (crudo, OPEP, EE. UU. exportando diésel) sí se queda.
const FOREIGN =
  /\b(per[uú]|lima|m[eé]xico|argentin|chile|colombia|ecuador|bolivia|venezuela|uruguay|paraguay|guatemala|honduras|salvador|nicaragua|costa rica|panam[aá]|dominicana|cuba|puerto rico|italia|alemania|bundestag|francia|portugal|reino unido|andorra|marruecos)/i;
export const MAX_HEADLINES = 12; // los mismos que lee Jev y que enseña el ticket

export const NEWS_QUERY = "(precio gasolina OR diésel OR carburantes OR gasolineras OR Brent) España";

/** Titulares de un feed RSS de Google News: filtrados, sin duplicados, del más reciente al más antiguo. */
export function parseFeed(xml: string): Headline[] {
  const seen = new Set<string>();
  const items: Headline[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const raw = decode(m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const pub = m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const cut = raw.lastIndexOf(" - ");
    const title = cut > 0 ? raw.slice(0, cut) : raw;
    const source = cut > 0 ? raw.slice(cut + 3) : "";
    // Los listados diarios de "gasolineras más baratas" no dicen nada de hacia dónde va el precio.
    if (!RELEVANT.test(title) || LISTING.test(title) || FOREIGN.test(title)) continue;
    const key = title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    const link = decode(m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    items.push({
      title,
      source,
      date: pub ? new Date(pub).toISOString() : "",
      // Solo enlaces https: el feed es externo y esto acaba en un href.
      url: /^https:\/\//.test(link) ? link : undefined,
    });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchFeed(query: string) {
  const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es&gl=ES&ceid=ES:es`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google News ${res.status}`);
  return parseFeed(await res.text());
}

let newsCache: { at: number; items: Headline[] } | null = null;

export async function getHeadlines(): Promise<Headline[]> {
  if (newsCache && Date.now() - newsCache.at < 30 * 60_000) return newsCache.items;
  try {
    const items = await fetchFeed(`${NEWS_QUERY} when:4d`);
    newsCache = { at: Date.now(), items: items.slice(0, MAX_HEADLINES) };
    return newsCache.items;
  } catch {
    return newsCache?.items ?? [];
  }
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export interface Brent {
  last: number; // USD/barril
  change7d: number; // fracción
  change30d: number;
}

let brentCache: { at: number; value: Brent | null } | null = null;

export async function getBrent(): Promise<Brent | null> {
  if (brentCache && Date.now() - brentCache.at < 30 * 60_000) return brentCache.value;
  try {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=2mo&interval=1d", {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (jevsolinera)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const r = d.chart.result[0];
    const ts: number[] = r.timestamp;
    const close: (number | null)[] = r.indicators.quote[0].close;
    const pts = ts.map((t, i) => [t * 1000, close[i]] as const).filter((p): p is [number, number] => p[1] != null);
    const [lastT, last] = pts[pts.length - 1];
    const at = (days: number) => {
      const target = lastT - days * 86_400_000;
      return pts.reduce((best, p) => (Math.abs(p[0] - target) < Math.abs(best[0] - target) ? p : best))[1];
    };
    const value = { last, change7d: last / at(7) - 1, change30d: last / at(30) - 1 };
    brentCache = { at: Date.now(), value };
    return value;
  } catch {
    brentCache = { at: Date.now() - 25 * 60_000, value: brentCache?.value ?? null }; // reintenta en 5 min
    return brentCache.value;
  }
}
