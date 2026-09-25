// Prueba con el pasado: ¿habría acertado la web los últimos N días?
//
//   npx tsx --env-file=.env.local scripts/backtest.ts [días=60]
//
// Cada día D, a las 9:00, la web lee los titulares publicados hasta entonces (Google News
// por fechas: generales de 4 días + eventos de 7 días) con Jev y decide:
//   "Llena antes del X" / "Espera al X" si hay un cambio anunciado con fecha, o "Hoy da igual".
// Se comprueba con el precio de las gasolineras de 7 ciudades (95 y diésel) en el histórico
// del Ministerio: el aviso, el día después de X; "da igual", a los 3 días.
// Todo se guarda en .data/backtest para no repetir descargas ni llamadas a Jev.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dateLabel } from "../lib/dates";
import { EVENT_TYPES, readNews, verdictFromNews, type NewsRead, type Verdict } from "../lib/decide";
import { distanceKm, getCurrentStations, getHistory, madridDate, median, type FuelId } from "../lib/minetur";
import { EVENTS_QUERY, fetchFeed, mergeHeadlines, NEWS_QUERY, type Headline } from "../lib/signals";
import { judge, targetDate } from "../lib/track";

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

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const apiDate = (iso: string) => iso.split("-").reverse().join("-");
const decisionTime = (iso: string) => Date.parse(`${iso}T07:00:00Z`); // 9:00 en Madrid (verano)
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")} %`;
const share = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function main() {
  const today = madridDate(0).iso;
  const yesterday = addDays(today, -1);
  const lastD = addDays(today, -(HORIZON + 1));
  const firstD = addDays(lastD, -(DAYS - 1));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(firstD, i));
  console.log(`Días: ${firstD} → ${lastD} (${DAYS}) · Jev: ${process.env.TYPESAFE_API_KEY ? "sí" : "NO"}`);

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

  // 2) Histórico del Ministerio, de D hasta ayer (los avisos se comprueban en su fecha).
  const wanted = new Set(zones.flatMap((z) => z.ids));
  const provinces = [...new Set(zones.flatMap((z) => z.provinces))];
  const dates: string[] = [];
  for (let d = firstD; d <= yesterday; d = addDays(d, 1)) dates.push(d);
  const hist = new Map<string, Record<string, Record<string, number>>>();
  await pool(provinces.flatMap((p) => dates.map((d) => [p, d] as const)), 4, async ([p, d]) => {
    const data = await cached(`hist/${p}_${d}.json`, async () => {
      const m = await getHistory(p, apiDate(d));
      const out: Record<string, Record<string, number>> = {};
      for (const [id, pr] of m) if (wanted.has(id)) out[id] = { g95: pr.g95 ?? 0, diesel: pr.diesel ?? 0 };
      return out;
    }).catch(() => ({}));
    hist.set(`${p}/${d}`, data);
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

  // 3) Titulares de cada día (antes de las 9:00) y lo que lee Jev.
  const reads = new Map<string, { headlines: Headline[]; read: NewsRead | null }>();
  for (const d of days) {
    const general = await cached(`news/${d}.json`, async () => {
      await sleep(1200);
      const items = await fetchFeed(`${NEWS_QUERY} after:${addDays(d, -4)} before:${addDays(d, 1)}`);
      return items.filter((h) => Date.parse(h.date) < decisionTime(d)).slice(0, 12);
    });
    const events = await cached(`news-events/${d}.json`, async () => {
      await sleep(1200);
      const items = await fetchFeed(`${EVENTS_QUERY} after:${addDays(d, -7)} before:${addDays(d, 1)}`);
      return items.filter((h) => Date.parse(h.date) < decisionTime(d));
    });
    const headlines = mergeHeadlines(general, events);
    const read = process.env.TYPESAFE_API_KEY && headlines.length
      ? await cached(`jev-events-v5/${d}.json`, () => readNews(headlines)).catch((e) => (console.log(`  Jev ${d}: ${e.message}`), null))
      : null;
    reads.set(d, { headlines, read });
  }
  const read = days.filter((d) => reads.get(d)!.read).length;
  console.log(`Titulares: media ${(days.reduce((s, d) => s + reads.get(d)!.headlines.length, 0) / days.length).toFixed(1)} por día · leídos por Jev: ${read}/${days.length}`);

  // 4) Veredicto de cada día (es nacional: sale de las noticias) y resultado en cada zona.
  type Row = { date: string; zone: string; verdict: Verdict; eventDate?: string; target: string; change?: number; ok?: boolean | null };
  const rows: Row[] = [];
  const perDay = days.flatMap((d) => FUELS.map((fuel) => {
    const { headlines, read } = reads.get(d)!;
    const decision = verdictFromNews({ fuel, tank: "cuarto", trend: {}, brent: null, today: d, headlines }, read ?? undefined);
    const event = decision.event;
    const pred = { date: d, verdict: decision.market, event: event ? { date: event.date!, direction: event.direction, type: event.type } : undefined };
    const target = targetDate(pred);
    for (const z of zones.filter((z) => z.fuel === fuel)) {
      const ch = target <= yesterday ? change(z, d, target) : undefined;
      const p0 = median(z.ids.map((id) => priceAt(z, id, d)).filter((v): v is number => !!v)) ?? 0;
      const j = ch != null ? judge(decision.market, ch, p0) : undefined;
      rows.push({ date: d, zone: `${z.city}/${z.fuel}`, verdict: decision.market, eventDate: event?.date ?? undefined, target, change: ch, ok: j?.ok });
    }
    return { date: d, fuel, decision, headlines };
  }));

  // 5) Resultados
  const alertDays = perDay.filter((x) => x.decision.market !== "any");
  const anyRows = rows.filter((r) => r.verdict === "any" && r.ok != null);
  const alertRows = rows.filter((r) => r.verdict !== "any" && r.ok != null);
  const allWindows = days.flatMap((d) => zones.map((z) => change(z, d, addDays(d, HORIZON)))).filter((c): c is number => c != null);

  console.log(`\nVeredictos (día × combustible): ${perDay.length - alertDays.length} «Hoy da igual» · ${alertDays.length} con aviso.`);
  console.log(`\n«Hoy da igual» → el precio se movió menos de un 1 % en 3 días en ${share(anyRows.filter((r) => r.ok).length / anyRows.length)} de los casos (${anyRows.length}).`);
  console.log(`   Referencia, todos los días: ${share(allWindows.filter((c) => Math.abs(c) < 0.01).length / allWindows.length)} · movimiento medio ${pct(allWindows.reduce((a, c) => a + Math.abs(c), 0) / allWindows.length)}`);
  if (alertRows.length)
    console.log(`\nAvisos → se cumplieron en ${share(alertRows.filter((r) => r.ok).length / alertRows.length)} de las zonas (${alertRows.length} comprobaciones).`);

  console.log("\nDías con aviso:");
  for (const x of alertDays) {
    const e = x.decision.event!;
    const rs = rows.filter((r) => r.date === x.date && r.zone.endsWith(`/${x.fuel}`) && r.ok != null);
    const outcome = rs.length ? `${rs.filter((r) => r.ok).length}/${rs.length} zonas ✓ · cambio mediano ${pct(median(rs.map((r) => r.change!))!)}` : "pendiente (la fecha aún no ha llegado)";
    console.log(`  ${x.date} ${x.fuel.padEnd(6)} → ${x.decision.market === "today" ? "Llena antes del" : "Espera al"} ${dateLabel(e.date!)} · ${EVENT_TYPES[e.type]} · ${Math.round(e.confidence * 100)} % · ${outcome}`);
    for (const i of e.headlines.slice(0, 2)) console.log(`       «${x.headlines[i].title.slice(0, 110)}»`);
  }

  const calls = perDay.filter((x) => x.fuel === FUELS[0]).map((x) => x.decision.news?.call).filter((c) => !!c);
  if (calls.length)
    console.log(`\nJev: ${calls.length} días leídos · ${Math.round(calls.reduce((a, c) => a + c!.questions, 0) / calls.length)} preguntas por día · ${Math.round(calls.reduce((a, c) => a + c!.ms, 0) / calls.length)} ms · coste total ${calls.reduce((a, c) => a + c!.costUsd, 0).toFixed(4)} $`);

  await writeFile(path.join(DIR, "result-events.json"), JSON.stringify({ firstD, lastD, perDay, rows }, null, 1));
  console.log(`\nDetalle en .data/backtest/result-events.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
