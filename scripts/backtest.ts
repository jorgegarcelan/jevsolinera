// Prueba con el pasado: ¿habría acertado la web los últimos N días?
//
//   npx tsx --env-file=.env.local scripts/backtest.ts [días=60]
//
// Para cada día D, zona (7 ciudades) y combustible (95 y diésel), la web decide a las
// 9:00 con lo que se sabía entonces: tendencias con precios hasta D, Brent hasta D,
// titulares publicados antes de las 9:00 de D (Google News por fechas) leídos por Jev.
// El resultado es el precio de las mismas gasolineras en D+3 (histórico del Ministerio).
// Se compara con estrategias tontas: llenar siempre, esperar siempre.
// Todo se guarda en .data/backtest para no repetir descargas ni llamadas a Jev.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { combine, readNews, W, type NewsRead, type Trend, type Verdict, type Weights } from "../lib/decide";
import { distanceKm, getCurrentStations, getHistory, madridDate, median, type FuelId } from "../lib/minetur";
import { fetchFeed, MAX_HEADLINES, NEWS_QUERY, type Brent, type Headline } from "../lib/signals";

const DAYS = Number(process.argv[2] ?? 60);
const HORIZON = 3;
const DIR = path.join(process.cwd(), ".data", "backtest");
const CITIES = [
  { name: "Madrid", lat: 40.4168, lon: -3.7038 },
  { name: "Barcelona", lat: 41.3874, lon: 2.1686 },
  { name: "Valencia", lat: 39.4699, lon: -0.3763 },
  { name: "Sevilla", lat: 37.3891, lon: -5.9845 },
  { name: "Zaragoza", lat: 41.6488, lon: -0.8891 },
  { name: "Málaga", lat: 36.7213, lon: -4.4214 },
  { name: "Bilbao", lat: 43.263, lon: -2.935 },
];
const FUELS: FuelId[] = ["g95", "diesel"];

// ---------- fechas ----------
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const apiDate = (iso: string) => iso.split("-").reverse().join("-");
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
const decisionTime = (iso: string) => Date.parse(`${iso}T07:00:00Z`); // 9:00 en Madrid (verano)

// ---------- caché en disco ----------
async function cached<T>(name: string, make: () => Promise<T>): Promise<T> {
  const file = path.join(DIR, name);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    const value = await make();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value));
    return value;
  }
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- juicio (igual que el registro de aciertos) ----------
type Outcome = { ok: boolean | null; cost: number }; // cost: € extra en 40 L frente a llenar hoy
function judge(verdict: Verdict, change: number, p0: number): Outcome {
  const move = p0 * change * 40; // lo que cambia llenar 40 L en D+3 frente a hoy
  const cost = verdict === "today" ? 0 : verdict === "wait" ? move : move / 2; // "lo justo": medio hoy, medio luego
  if (verdict === "partial") return { ok: null, cost };
  if (Math.abs(change) < 0.001) return { ok: null, cost }; // empate: el precio no se movió
  return { ok: verdict === "today" ? change > 0 : change < 0, cost };
}

async function main() {
  const today = madridDate(0).iso;
  const lastD = addDays(today, -(HORIZON + 1));
  const firstD = addDays(lastD, -(DAYS - 1));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(firstD, i));
  console.log(`Días: ${firstD} → ${lastD} (${DAYS}) · resultado a ${HORIZON} días · Jev: ${process.env.TYPESAFE_API_KEY ? "sí" : "NO"}`);

  // 1) Zonas: las gasolineras de hoy alrededor de cada ciudad (como en la web).
  const { stations } = await getCurrentStations();
  const zones = CITIES.flatMap((city) =>
    FUELS.map((fuel) => {
      const near = stations
        .filter((s) => s.prices[fuel])
        .map((s) => ({ s, d: distanceKm(city.lat, city.lon, s.lat, s.lon) }))
        .sort((a, b) => a.d - b.d);
      const r = [3, 5, 10, 20, 50].find((r) => near.filter((x) => x.d <= r).length >= 8) ?? 50;
      const zone = near.filter((x) => x.d <= r).slice(0, 60);
      return { city: city.name, fuel, ids: zone.map((x) => x.s.id), provinces: [...new Set(zone.map((x) => x.s.provinceId))].slice(0, 2) };
    }),
  );

  // 2) Histórico del Ministerio: de D-30 a D+3, solo las gasolineras de las zonas.
  const wanted = new Set(zones.flatMap((z) => z.ids));
  const provinces = [...new Set(zones.flatMap((z) => z.provinces))];
  const dates = Array.from({ length: DAYS + 30 + HORIZON }, (_, i) => addDays(firstD, i - 30));
  const hist = new Map<string, Record<string, Record<string, number>>>(); // prov/fecha → id → {g95, diesel}
  let done = 0;
  await pool(provinces.flatMap((p) => dates.map((d) => [p, d] as const)), 4, async ([p, d]) => {
    const data = await cached(`hist/${p}_${d}.json`, async () => {
      const m = await getHistory(p, apiDate(d));
      const out: Record<string, Record<string, number>> = {};
      for (const [id, pr] of m) if (wanted.has(id)) out[id] = { g95: pr.g95 ?? 0, diesel: pr.diesel ?? 0 };
      return out;
    }).catch(() => ({}));
    hist.set(`${p}/${d}`, data);
    if (++done % 100 === 0) console.log(`  histórico ${done}/${provinces.length * dates.length}`);
  });
  const priceAt = (z: (typeof zones)[number], id: string, d: string) => {
    for (const p of z.provinces) {
      const v = hist.get(`${p}/${d}`)?.[id]?.[z.fuel];
      if (v) return v;
    }
    return undefined;
  };
  const change = (z: (typeof zones)[number], from: string, to: string) => {
    const ch: number[] = [];
    for (const id of z.ids) {
      const a = priceAt(z, id, from);
      const b = priceAt(z, id, to);
      if (a && b) ch.push(b / a - 1);
    }
    return ch.length >= 2 ? median(ch) : undefined;
  };

  // 3) Brent: cierres diarios de Yahoo, solo los anteriores a la hora de decidir.
  const closes = await cached("brent.json", async () => {
    const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=1y&interval=1d", { headers: { "User-Agent": "Mozilla/5.0" } });
    const j = await r.json();
    const res = j.chart.result[0];
    return (res.timestamp as number[]).map((t, i) => [t * 1000, res.indicators.quote[0].close[i]] as [number, number | null]).filter((x): x is [number, number] => x[1] != null);
  });
  const brentAt = (d: string): Brent | null => {
    const upTo = closes.filter(([t]) => t < decisionTime(d));
    if (upTo.length < 25) return null;
    const [lt, last] = upTo[upTo.length - 1];
    const near = (days: number) => upTo.reduce((b, p) => (Math.abs(p[0] - (lt - days * 86_400_000)) < Math.abs(b[0] - (lt - days * 86_400_000)) ? p : b))[1];
    return { last, change7d: last / near(7) - 1, change30d: last / near(30) - 1 };
  };

  // 4) Titulares antes de las 9:00 de cada día, y lo que Jev lee en ellos.
  const news = new Map<string, { headlines: Headline[]; read: NewsRead | null }>();
  for (const d of days) {
    const headlines = await cached(`news/${d}.json`, async () => {
      await sleep(1200); // con calma con Google News
      const items = await fetchFeed(`${NEWS_QUERY} after:${addDays(d, -4)} before:${addDays(d, 1)}`);
      return items.filter((h) => Date.parse(h.date) < decisionTime(d)).slice(0, MAX_HEADLINES);
    });
    const read = process.env.TYPESAFE_API_KEY && headlines.length
      ? await cached(`jev/${d}.json`, () => readNews(headlines)).catch((e) => (console.log(`  Jev ${d}: ${e.message}`), null))
      : null;
    news.set(d, { headlines, read });
  }
  console.log(`Titulares: media ${(days.reduce((s, d) => s + news.get(d)!.headlines.length, 0) / days.length).toFixed(1)} por día · leídos por Jev: ${days.filter((d) => news.get(d)!.read).length}/${days.length}`);

  // 5) Decidir cada día y comparar con lo que pasó.
  const halfNews: Weights = { ...W, news: W.news / 2, deadline: W.deadline / 2, warning: W.warning / 2, relief: W.relief / 2 };
  const strategies = {
    web: "La web (Jev + precios)",
    webHalf: "La web con noticias a la mitad",
    noJev: "Solo precios (sin Jev)",
    jevOnly: "Solo Jev (titulares)",
    always: "Llenar siempre",
    never: "Esperar siempre",
  } as const;
  type S = keyof typeof strategies;
  const rows: { city: string; fuel: string; date: string; change: number; p0: number; verdicts: Record<S, Verdict> }[] = [];

  for (const z of zones) {
    for (const d of days) {
      const out = change(z, d, addDays(d, HORIZON));
      if (out == null) continue;
      const trend: Trend = { d1: change(z, addDays(d, -1), d), d3: change(z, addDays(d, -3), d), d7: change(z, addDays(d, -7), d), d30: change(z, addDays(d, -30), d) };
      const p0 = median(z.ids.map((id) => priceAt(z, id, d)).filter((v): v is number => !!v))!;
      const n = news.get(d)!;
      const input = { fuel: z.fuel, tank: "cuarto" as const, trend, brent: brentAt(d), weekday: weekday(d), headlines: n.headlines };
      const web = n.read ? combine(input, n.read).verdict : combine(input).verdict;
      rows.push({
        city: z.city,
        fuel: z.fuel,
        date: d,
        change: out,
        p0,
        verdicts: {
          web,
          webHalf: n.read ? combine(input, n.read, undefined, halfNews).verdict : web,
          noJev: combine(input).verdict,
          jevOnly: !n.read ? "partial" : n.read.outlook === "rise" ? "today" : n.read.outlook === "fall" ? "wait" : "partial",
          always: "today",
          never: "wait",
        },
      });
    }
  }

  // 6) Resultados
  const up = rows.filter((r) => r.change >= 0.001).length;
  const down = rows.filter((r) => r.change <= -0.001).length;
  console.log(`\n${rows.length} decisiones (${zones.length} zonas × ${days.length} días).`);
  console.log(`Qué hizo el precio a 3 días: sube ${pct(up / rows.length)} · baja ${pct(down / rows.length)} · igual ${pct(1 - (up + down) / rows.length)}\n`);

  const summary = (Object.keys(strategies) as S[]).map((s) => {
    const res = rows.map((r) => judge(r.verdicts[s], r.change, r.p0));
    const decided = res.filter((x) => x.ok != null);
    const hits = decided.filter((x) => x.ok).length;
    const committed = rows.filter((r) => r.verdicts[s] !== "partial").length;
    const avgCost = res.reduce((a, x) => a + x.cost, 0) / res.length;
    return { strategy: strategies[s], key: s, committed: committed / rows.length, hits, decided: decided.length, rate: decided.length ? hits / decided.length : null, avgCost };
  });
  const oracle = rows.reduce((a, r) => a + Math.min(0, r.p0 * r.change * 40), 0) / rows.length;

  console.log("Estrategia                        Se moja   Aciertos        € por depósito vs llenar siempre");
  for (const s of summary)
    console.log(
      `${s.strategy.padEnd(34)}${pct(s.committed).padStart(6)}   ${s.rate == null ? "  —   " : pct(s.rate).padStart(6)} (${s.hits}/${s.decided})`.padEnd(62) +
        `${(-s.avgCost >= 0 ? "+" : "") + (-s.avgCost).toFixed(3)} €`,
    );
  console.log(`${"Adivino perfecto (techo)".padEnd(62)}${(-oracle >= 0 ? "+" : "") + (-oracle).toFixed(3)} €`);

  // Jev por separado: ¿lo que lee en los titulares anticipa el precio?
  const jevRows = rows.filter((r) => news.get(r.date)!.read);
  const byOutlook: Record<string, number[]> = {};
  for (const r of jevRows) (byOutlook[news.get(r.date)!.read!.outlook] ??= []).push(r.change);
  console.log("\nLo que Jev lee en los titulares → qué hizo después el precio (mediana a 3 días):");
  for (const [o, ch] of Object.entries(byOutlook))
    console.log(`  ${o.padEnd(8)} ${String(ch.length).padStart(4)} decisiones · mediana ${pct(median(ch)!)} · sube en ${pct(ch.filter((c) => c >= 0.001).length / ch.length)}`);

  await writeFile(path.join(DIR, "result.json"), JSON.stringify({ firstD, lastD, rows, summary, oracle, news: Object.fromEntries(news) }, null, 1));
  console.log(`\nDetalle en ${path.relative(process.cwd(), path.join(DIR, "result.json"))}`);
}

function pct(x: number) {
  return `${(x * 100).toFixed(1).replace(".", ",")} %`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
