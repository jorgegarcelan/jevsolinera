// ¿Acierta? Cada día se guarda lo que dijo la web para cada provincia y combustible
// (la primera consulta del día, o la tarea diaria), con los precios de las gasolineras
// de la zona. Tres días después se miran esas mismas gasolineras en el histórico del
// Ministerio y se comprueba si seguir el consejo salió bien.

import type { EventType, Verdict } from "./decide";
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
  verdict: Verdict; // veredicto de las noticias (sin depósito): today/wait con evento, o any
  confidence: number;
  event?: { date: string; direction: "up" | "down"; type: EventType }; // el aviso que lo decide
  source: "jev" | "heuristic";
  median: number; // mediana de la zona ese día
  prices: Record<string, number>; // IDEESS → precio
  outcome?: Outcome;
}

export interface Outcome {
  target: string; // día con el que se compara: D+3, o el día siguiente al evento
  change: number; // variación mediana de esas gasolineras entre el día del consejo y target
  ok: boolean | null; // null = no cuenta
  saving40: number | null; // € en 40 L por seguir el aviso (null en "da igual")
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
  recent: { date: string; verdict: Verdict; eventDate?: string; target: string; change: number | null; ok: boolean | null | undefined }[]; // undefined = pendiente
  alerts: { total: number; decided: number; hits: number }; // solo los avisos (llena antes / espera al)
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

// Cómo se juzga cada consejo:
// - "Llena antes del X" (today): acierta si el día después de X el precio es mayor que el día del aviso.
// - "Espera al X" (wait): acierta si el día después de X el precio es menor.
// - "Hoy da igual" (any): acierta si en 3 días el precio se mueve menos de un 1 % (≈ 0,75 € en 40 L).
const FLAT_ANY = 0.01;

export function targetDate(p: Pick<Prediction, "date" | "verdict" | "event">) {
  return p.event && p.verdict !== "any" ? isoPlus(p.event.date, 1) : isoPlus(p.date, HORIZON_DAYS);
}

export function judge(verdict: Verdict, change: number, median: number): Omit<Outcome, "target"> {
  const delta = median * change * 40;
  if (verdict === "any") return { change, ok: Math.abs(change) < FLAT_ANY, saving40: null };
  if (verdict === "partial") return { change, ok: null, saving40: null };
  const ok = verdict === "today" ? change > TOLERANCE : change < -TOLERANCE;
  return { change, ok, saving40: verdict === "today" ? delta : -delta };
}

async function evaluate(p: Prediction, todayIso: string): Promise<Outcome | undefined> {
  const target = targetDate(p);
  if (target > todayIso) return undefined; // aún no ha llegado el día de comprobarlo
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
  return { target, ...judge(p.verdict, median(changes)!, p.median) };
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
      .map((p) => ({
        date: p.date,
        verdict: p.verdict,
        eventDate: p.event?.date,
        target: targetDate(p),
        change: p.outcome?.change ?? null,
        ok: p.outcome ? p.outcome.ok : undefined,
      })),
    alerts: {
      total: preds.filter((p) => p.verdict === "today" || p.verdict === "wait").length,
      decided: decided.filter((p) => p.verdict === "today" || p.verdict === "wait").length,
      hits: decided.filter((p) => (p.verdict === "today" || p.verdict === "wait") && p.outcome!.ok).length,
    },
  };
}
