// ¿Acierta? Cada día se guarda lo que dijo la web para cada provincia y combustible
// (la primera consulta del día, o la tarea diaria), con los precios de las gasolineras
// de la zona. Tres días después se miran esas mismas gasolineras en el histórico del
// Ministerio y se comprueba si seguir el consejo salió bien.

import type { Verdict } from "./decide";
import { getHistory, median, type FuelId } from "./minetur";
import { store, storeKind } from "./store";

export const HORIZON_DAYS = 3;
const WINDOW_DAYS = 60;
const TOLERANCE = 0.001; // ±0,1 %: ~0,2 céntimos, ruido

export interface Prediction {
  date: string; // ISO, Madrid
  fuel: FuelId;
  prov: string; // IDProvincia principal
  provName: string;
  provinces: string[]; // provincias de las gasolineras de la zona
  verdict: Verdict; // veredicto de mercado (sin depósito)
  probabilities: Record<Verdict, number>;
  source: "jev" | "heuristic";
  median: number; // mediana de la zona ese día
  prices: Record<string, number>; // IDEESS → precio
  outcome?: Outcome;
}

export interface Outcome {
  change: number; // variación mediana de esas gasolineras a los 3 días
  ok: boolean | null; // null = no cuenta: el precio no se movió o el consejo fue "lo justo"
  saving40: number | null; // € en 40 L por seguir el consejo (null en "lo justo")
}

export interface Track {
  storage: "redis" | "file";
  horizonDays: number;
  total: number; // predicciones guardadas (60 días)
  evaluated: number; // con resultado (incluye empates)
  decided: number; // con resultado y el precio se movió
  hits: number;
  rate: number | null;
  avgSaving40: number | null;
  recent: { date: string; verdict: Verdict; change: number | null; ok: boolean | null | undefined }[]; // undefined = pendiente
}

const key = (fuel: string, prov: string, date: string) => `jev:pred:${fuel}:${prov}:${date}`;
const indexKey = (fuel: string, prov: string) => `jev:preds:${fuel}:${prov}`;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const isoPlus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const apiDate = (iso: string) => iso.split("-").reverse().join("-"); // dd-MM-yyyy

/** Guarda la primera predicción del día para esa provincia y combustible. */
export async function recordPrediction(p: Prediction) {
  if (!store) return false;
  const written = await store.setnx(key(p.fuel, p.prov, p.date), JSON.stringify(p));
  if (written) await store.zadd(indexKey(p.fuel, p.prov), dayNumber(p.date), p.date);
  return written;
}

function judge(p: Prediction, change: number): Outcome {
  const flat = Math.abs(change) < TOLERANCE;
  // "Lo justo" no se moja: no cuenta ni como acierto ni como fallo (igual que en scripts/backtest.ts).
  const ok = p.verdict === "partial" || flat ? null : p.verdict === "today" ? change > 0 : change < 0;
  // Echar hoy ahorra lo que habría subido; esperar, lo que habría bajado.
  const delta = p.median * change * 40;
  const saving40 = p.verdict === "today" ? delta : p.verdict === "wait" ? -delta : null;
  return { change, ok, saving40 };
}

async function evaluate(p: Prediction, todayIso: string): Promise<Outcome | undefined> {
  const target = isoPlus(p.date, HORIZON_DAYS);
  if (target > todayIso) return undefined; // aún no han pasado 3 días
  const maps = await Promise.allSettled(p.provinces.map((prov) => getHistory(prov, apiDate(target))));
  const changes: number[] = [];
  for (const [id, before] of Object.entries(p.prices)) {
    for (const m of maps) {
      const after = m.status === "fulfilled" ? m.value.get(id)?.[p.fuel] : undefined;
      if (after) {
        changes.push(after / before - 1);
        break;
      }
    }
  }
  if (changes.length < 2) return undefined;
  return judge(p, median(changes)!);
}

/** Historial de aciertos de una provincia y combustible. Evalúa lo pendiente sobre la marcha. */
export async function getTrack(fuel: FuelId, prov: string, todayIso: string): Promise<Track | null> {
  if (!store || !storeKind) return null;
  const today = dayNumber(todayIso);
  const dates = await store.zrangeByScore(indexKey(fuel, prov), today - WINDOW_DAYS, today);
  const raw = await store.mget(dates.map((d) => key(fuel, prov, d)));
  const preds = raw.filter((r): r is string => !!r).map((r) => JSON.parse(r) as Prediction);

  // Evalúa como mucho 8 pendientes por petición; el resto, en la siguiente.
  const pending = preds.filter((p) => !p.outcome).slice(0, 8);
  await Promise.all(
    pending.map(async (p) => {
      const outcome = await evaluate(p, todayIso).catch(() => undefined);
      if (!outcome) return;
      p.outcome = outcome;
      await store!.set(key(fuel, prov, p.date), JSON.stringify(p));
    }),
  );

  const done = preds.filter((p) => p.outcome);
  const decided = done.filter((p) => p.outcome!.ok != null); // sin empates
  const hits = decided.filter((p) => p.outcome!.ok).length;
  const savings = done.map((p) => p.outcome!.saving40).filter((s): s is number => s != null);
  return {
    storage: storeKind,
    horizonDays: HORIZON_DAYS,
    total: preds.length,
    evaluated: done.length,
    decided: decided.length,
    hits,
    rate: decided.length ? hits / decided.length : null,
    avgSaving40: savings.length ? savings.reduce((a, b) => a + b, 0) / savings.length : null,
    recent: preds
      .slice(-7)
      .reverse()
      .map((p) => ({ date: p.date, verdict: p.verdict, change: p.outcome?.change ?? null, ok: p.outcome ? p.outcome.ok : undefined })),
  };
}
