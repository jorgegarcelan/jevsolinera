// ¿Echo hoy o espero? Casi nunca importa: esperar 3 días mueve de media menos de 1 € por
// depósito (prueba con 60 días, scripts/backtest.ts). Lo que sí cambia la respuesta es un
// evento anunciado con fecha: fin de una bonificación, subida de impuestos, huelga, rebaja…
//
// Jev lee la prensa en dos pasos (https://docs.typesafe.ai/patterns/fan-out):
//   1. Por titular: ¿sube o baja?, ¿va de España?, ¿anuncia un cambio con fecha?
//   2. Solo los marcados: tipo de evento, si encarece o abarata y cuándo entra en vigor,
//      eligiendo entre las fechas que ha encontrado el código (lib/dates.ts).
// El veredicto lo pone el código: "Llena antes del X", "Espera al X" o "Hoy da igual".

import { dateLabel, daysBetween, findDates, referenceDay } from "./dates";
import { askJev, hasJev, PRICE_PER_INPUT_TOKEN_USD, type Answer, type Question } from "./jev";
import { FUELS, type FuelId } from "./minetur";
import type { Brent, Headline } from "./signals";

export const TANKS = {
  reserva: { label: "En reserva" },
  cuarto: { label: "1/4" },
  medio: { label: "Medio" },
  lleno: { label: "3/4 o más" },
} as const;
export type TankId = keyof typeof TANKS;

/** today = llena antes del evento · wait = espera al evento · any = hoy da igual · partial = echa lo justo */
export type Verdict = "today" | "partial" | "wait" | "any";

export interface Trend {
  d1?: number; // variación en fracción (0.012 = +1,2 %)
  d3?: number;
  d7?: number;
  d30?: number;
}

export interface DecisionInput {
  fuel: FuelId;
  tank: TankId;
  trend: Trend;
  brent: Brent | null;
  today: string; // ISO, Madrid
  headlines: Headline[];
}

export interface Reason {
  kind: "up" | "down" | "flat" | "news" | "event" | "tank" | "oil";
  text: string;
}

export const EVENT_TYPES = {
  tax_up: "Subida de impuestos",
  tax_down: "Bajada de impuestos",
  discount_end: "Fin de una bonificación o ayuda",
  discount_start: "Nueva bonificación o ayuda",
  strike: "Huelga o protesta",
  holiday: "Operación salida o festivo",
  supply: "Cambio en el suministro de crudo",
  loyalty: "Descuentos de fidelización de algunas gasolineras",
  other: "Otro cambio anunciado",
} as const;
// Los descuentos para clientes de una cadena no cambian el precio del surtidor: no deciden.
const NOT_PUMP_PRICE: EventType[] = ["loyalty"];

/** A qué combustibles afecta un evento. */
export type EventFuels = "diesel" | "petrol" | "both";
export const FUEL_SCOPE: Record<FuelId, EventFuels[]> = {
  g95: ["petrol", "both"],
  g98: ["petrol", "both"],
  diesel: ["diesel", "both"],
  dieselp: ["diesel", "both"],
  glp: ["both"],
};
export const EVENT_FUELS: Record<EventFuels, string> = { diesel: "solo diésel", petrol: "solo gasolina", both: "todos" };
export type EventType = keyof typeof EVENT_TYPES;

export interface HeadlineRead {
  direction: "up" | "down" | "none";
  probabilities: Record<"up" | "down" | "none", number>;
  spain: number; // P(va del surtidor español)
  event: number; // P(anuncia un cambio con fecha)
}

export interface NewsEvent {
  headlines: number[]; // índices de los titulares que lo anuncian
  type: EventType;
  direction: "up" | "down";
  fuels: EventFuels;
  date: string | null; // ISO; null si el titular no dice cuándo
  dateText?: string; // cómo lo dice el titular: "1 de octubre", "el lunes"…
  confidence: number; // P(evento) × P(España) × P(dirección) × P(fecha)
}

export interface NewsRead {
  model: string;
  outlook: "rise" | "fall" | "stable" | "unclear";
  probabilities: Record<string, number>;
  headlines: HeadlineRead[];
  events: NewsEvent[];
  call: { calls: number; questions: number; inputTokens: number; ms: number; costUsd: number; at: string };
}

export interface Decision {
  verdict: Verdict;
  /** Veredicto solo con las noticias, antes de aplicar tu depósito: es el que se registra y evalúa. */
  market: Verdict;
  source: "jev" | "heuristic";
  model?: string;
  /** El evento que decide, si lo hay. */
  event?: NewsEvent & { label: string; daysAway: number };
  confidence: number;
  news?: NewsRead;
  overridden?: string;
  reasons: Reason[];
  error?: string;
}

const MIN_CONFIDENCE = 0.5;
const HORIZON_DAYS = 14; // eventos más lejanos no cambian lo que haces hoy
// Prueba con 60 días (24/07–21/09/2026, 7 ciudades, 95 y diésel): esperar 3 días movió de
// media 0,85 € el coste de un depósito de 40 L.
export const TYPICAL_3D_MOVE_40L = 0.85;

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const choice = (a: Answer | undefined) => a as Extract<Answer, { type: "choice" }>;
const noul = (a: Answer | undefined) => (a as Extract<Answer, { type: "noul" }>).noul;

// ---------- Jev lee la prensa ----------

const newsCache = new Map<string, { at: number; read: NewsRead }>();

export async function readNews(headlines: Headline[]): Promise<NewsRead> {
  const titles = headlines.map((h) => h.title);
  const key = titles.join("|");
  const hit = newsCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.read;

  // Paso 1: tres preguntas por titular y una de conjunto, en una sola llamada.
  const q1: Record<string, Question> = {
    outlook: {
      type: "choice",
      instructions: "What do the `headlines` say will happen to pump fuel prices in Spain over the next week?",
      criteria: {
        rise: "Headlines say pump prices in Spain will keep rising.",
        fall: "Headlines say pump prices in Spain will go down.",
        stable: "Headlines say pump prices in Spain will stay roughly the same.",
        unclear: "Headlines are mixed or say nothing about where pump prices in Spain are going.",
      },
    },
  };
  titles.forEach((_, i) => {
    q1[`h${i}_dir`] = {
      type: "choice",
      instructions: `What does \`headlines[${i}]\` say about the direction of pump fuel prices?`,
      criteria: {
        up: "It says fuel prices are going up, have risen or will rise.",
        down: "It says fuel prices are going down, have fallen or will fall.",
        none: "It does not say whether fuel prices are going up or down.",
      },
    };
    q1[`h${i}_spain`] = {
      type: "noul",
      instructions: `Is \`headlines[${i}]\` about fuel prices for drivers in Spain, or about crude oil that affects them? A headline only about another country's pump prices is not.`,
    };
    q1[`h${i}_event`] = {
      type: "noul",
      instructions: `Does \`headlines[${i}]\` announce a specific future change that will make fuel more expensive or cheaper for drivers in Spain from a particular date, such as a tax change, the start or end of a discount or subsidy, a strike, or a holiday travel rush?`,
    };
  });
  const r1 = await askJev({ country: "Spain", headlines: titles }, q1);
  const a1 = r1.answers;

  const reads: HeadlineRead[] = titles.map((_, i) => {
    const dir = choice(a1[`h${i}_dir`]);
    return {
      direction: dir.choice as HeadlineRead["direction"],
      probabilities: dir.probabilities as HeadlineRead["probabilities"],
      spain: noul(a1[`h${i}_spain`]),
      event: noul(a1[`h${i}_event`]),
    };
  });

  // Paso 2: solo los titulares que anuncian algo (máx. 6): tipo, sentido y fecha.
  const flagged = reads
    .map((r, i) => ({ i, p: r.event * r.spain }))
    .filter((x) => x.p >= 0.35)
    .sort((a, b) => b.p - a.p)
    .slice(0, 6)
    .map((x) => x.i);

  const events: NewsEvent[] = [];
  let r2: Awaited<ReturnType<typeof askJev>> | null = null;
  let q2count = 0;
  if (flagged.length) {
    const q2: Record<string, Question> = {};
    const candidates = flagged.map((i) => findDates(titles[i], referenceDay(headlines[i].date)));
    flagged.forEach((i, k) => {
      q2[`e${k}_type`] = {
        type: "choice",
        instructions: `What kind of change does \`announcements[${k}]\` announce?`,
        criteria: {
          tax_up: "A tax increase on fuel.",
          tax_down: "A tax cut on fuel.",
          discount_end: "The end of a fuel discount, subsidy or price cap.",
          discount_start: "The start of a fuel discount, subsidy or price cap.",
          strike: "A strike or protest that could disrupt fuel supply.",
          holiday: "A holiday travel period with higher fuel demand.",
          supply: "A change in crude oil supply or OPEC production.",
          loyalty: "Discounts that some stations or brands give to their own customers or loyalty card holders.",
          other: "Something else.",
        },
      };
      q2[`e${k}_fuel`] = {
        type: "choice",
        instructions: `Whose price will change because of what \`announcements[${k}]\` announces: diesel, petrol or both?`,
        criteria: {
          diesel: "Only the price of diesel (gasóleo) changes. The headline may mention petrol just to compare.",
          petrol: "Only the price of petrol (gasolina) changes. The headline may mention diesel just to compare.",
          both: "Both diesel and petrol prices change, or the headline does not say which fuel.",
        },
      };
      q2[`e${k}_dir`] = {
        type: "choice",
        instructions: `After the change announced in \`announcements[${k}]\`, will fuel for drivers in Spain be more expensive or cheaper?`,
        criteria: { up: "More expensive.", down: "Cheaper." },
      };
      if (candidates[k].length) {
        const criteria: Record<string, string> = {};
        candidates[k].forEach((c, j) => (criteria[`d${j}`] = `On ${c.iso} (the headline says "${c.text}").`));
        criteria.none = "The headline does not say when the change takes effect.";
        q2[`e${k}_when`] = {
          type: "choice",
          instructions: `When does the change announced in \`announcements[${k}]\` take effect?`,
          criteria,
        };
      }
    });
    q2count = Object.keys(q2).length;
    r2 = await askJev({ country: "Spain", announcements: flagged.map((i) => titles[i]) }, q2);

    flagged.forEach((i, k) => {
      const type = choice(r2!.answers[`e${k}_type`]);
      const dir = choice(r2!.answers[`e${k}_dir`]);
      const fuels = choice(r2!.answers[`e${k}_fuel`]).choice as EventFuels;
      const when = r2!.answers[`e${k}_when`] ? choice(r2!.answers[`e${k}_when`]) : null;
      const picked = when && when.choice !== "none" ? candidates[k][Number(when.choice.slice(1))] : undefined;
      const confidence =
        reads[i].event * reads[i].spain * (dir.probabilities[dir.choice] ?? 0) * (picked ? (when!.probabilities[when!.choice] ?? 0) : 1);
      const ev: NewsEvent = {
        headlines: [i],
        type: type.choice as EventType,
        direction: dir.choice as "up" | "down",
        fuels,
        date: picked?.iso ?? null,
        dateText: picked?.text,
        confidence,
      };
      events.push(ev);
    });
  }

  const outlook = choice(a1.outlook);
  const tokens = r1.usage.input_tokens + (r2?.usage.input_tokens ?? 0);
  const read: NewsRead = {
    model: r1.model,
    outlook: outlook.choice as NewsRead["outlook"],
    probabilities: outlook.probabilities,
    headlines: reads,
    events: events.sort((a, b) => b.confidence - a.confidence), // uno por titular; se agrupan al decidir
    call: {
      calls: r2 ? 2 : 1,
      questions: Object.keys(q1).length + q2count,
      inputTokens: tokens,
      ms: r1.ms + (r2?.ms ?? 0),
      costUsd: tokens * PRICE_PER_INPUT_TOKEN_USD,
      at: new Date().toISOString(),
    },
  };
  newsCache.set(key, { at: Date.now(), read });
  if (newsCache.size > 50) newsCache.delete(newsCache.keys().next().value!);
  return read;
}

/**
 * Varios titulares que anuncian un cambio para la misma fecha, en el mismo sentido y para los
 * mismos combustibles son el mismo evento: se juntan y cada titular refuerza la confianza como
 * prueba independiente (1 − Π(1 − cᵢ)). El tipo es el del titular más seguro.
 */
export function groupEvents(events: NewsEvent[], sameFuels = true): NewsEvent[] {
  const out: NewsEvent[] = [];
  for (const ev of [...events].sort((a, b) => b.confidence - a.confidence)) {
    const same = ev.date
      ? out.find((e) => e.date === ev.date && e.direction === ev.direction && (!sameFuels || e.fuels === ev.fuels))
      : undefined;
    if (!same) {
      out.push({ ...ev, headlines: [...ev.headlines] });
      continue;
    }
    same.headlines.push(...ev.headlines);
    same.confidence = 1 - (1 - same.confidence) * (1 - ev.confidence);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

// ---------- El veredicto ----------

/** Solo cuentan los eventos con fecha, de tu combustible, que muevan el precio del surtidor,
 *  en los próximos 14 días y con confianza suficiente. */
export function upcoming(news: NewsRead, today: string, fuel: FuelId) {
  // Primero lo que afecta a tu combustible; después se agrupa. Así una rebaja solo del
  // diésel no se suma a un titular genérico para decirle "espera" a la gasolina.
  const mine = news.events.filter((e) => e.date && FUEL_SCOPE[fuel].includes(e.fuels) && !NOT_PUMP_PRICE.includes(e.type));
  const groups = groupEvents(mine, false).filter((e) => e.confidence >= MIN_CONFIDENCE);
  // Avisos contrarios para el mismo día: gana el que habla de tu combustible en concreto
  // ("la gasolina subirá") frente a los genéricos. Si ninguno o los dos lo son, gana el más
  // seguro solo si lo es claramente; si no, no hay aviso.
  const specific = (e: NewsEvent) => mine.some((m) => e.headlines.includes(m.headlines[0]) && m.fuels !== "both");
  const kept = groups.filter((e) => {
    const rival = groups.find((o) => o !== e && o.date === e.date && o.direction !== e.direction);
    if (!rival) return true;
    if (specific(e) !== specific(rival)) return specific(e);
    return e.confidence - rival.confidence > 0.2;
  });
  return kept
    .map((e) => ({ ...e, daysAway: daysBetween(today, e.date!) }))
    .filter((e) => e.daysAway >= 1 && e.daysAway <= HORIZON_DAYS)
    .sort((a, b) => b.confidence - a.confidence || a.daysAway - b.daysAway);
}

export function verdictFromNews(i: DecisionInput, news?: NewsRead, error?: string): Decision {
  const next = news ? upcoming(news, i.today, i.fuel) : [];
  const top = next[0];
  const verdict: Verdict = top ? (top.direction === "up" ? "today" : "wait") : "any";
  return {
    verdict,
    market: verdict,
    source: news ? "jev" : "heuristic",
    model: news?.model,
    event: top ? { ...top, label: dateLabel(top.date!) } : undefined,
    confidence: top ? top.confidence : 1 - Math.max(0, ...(news ? upcoming(news, i.today, i.fuel).map((e) => e.confidence) : [])),
    news,
    reasons: buildReasons(i, news, next),
    error,
  };
}

function buildReasons(i: DecisionInput, news: NewsRead | undefined, next: ReturnType<typeof upcoming>): Reason[] {
  const r: Reason[] = [];
  if (news) {
    if (next.length)
      for (const e of next)
        r.push({
          kind: "event",
          text: `${EVENT_TYPES[e.type]}${e.fuels !== "both" ? ` (${EVENT_FUELS[e.fuels]})` : ""} el ${dateLabel(e.date!)} (${e.daysAway === 1 ? "mañana" : `en ${e.daysAway} días`}): el combustible será más ${e.direction === "up" ? "caro" : "barato"}. Lo anuncian ${e.headlines.length} titular${e.headlines.length > 1 ? "es" : ""} · confianza ${Math.round(e.confidence * 100)} %.`,
        });
    else
      r.push({
        kind: "news",
        text: `Jev ha revisado ${i.headlines.length} titulares y ninguno anuncia un cambio con fecha en los próximos ${HORIZON_DAYS} días.`,
      });
    const other = groupEvents(news.events).filter(
      (e) => e.date && e.confidence >= MIN_CONFIDENCE && (!FUEL_SCOPE[i.fuel].includes(e.fuels) || NOT_PUMP_PRICE.includes(e.type)),
    );
    if (other.length)
      r.push({
        kind: "news",
        text: `Jev ha visto ${other.length} aviso${other.length > 1 ? "s" : ""} que no te afecta${other.length > 1 ? "n" : ""}: ${other.map((e) => `${EVENT_TYPES[e.type].toLowerCase()} (${EVENT_FUELS[e.fuels]})`).join("; ")}.`,
      });
    const vague = groupEvents(news.events).filter((e) => !e.date && e.confidence >= MIN_CONFIDENCE);
    if (vague.length)
      r.push({ kind: "news", text: `Hay ${vague.length} aviso${vague.length > 1 ? "s" : ""} sin fecha concreta: no cambian lo que conviene hacer hoy.` });
  }
  // Contexto: se enseña, pero no decide (en la prueba de 60 días no mejoraba el resultado).
  const fuel = FUELS[i.fuel].label;
  const t7 = i.trend.d7 ?? i.trend.d3;
  if (t7 != null) {
    const kind = Math.abs(t7) < 0.004 ? "flat" : t7 > 0 ? "up" : "down";
    r.push({
      kind,
      text: `${fuel} en tu zona: ${pct(t7)} en ${i.trend.d7 != null ? "7" : "3"} días${i.trend.d30 != null ? ` y ${pct(i.trend.d30)} en un mes` : ""}.`,
    });
  }
  if (i.brent)
    r.push({
      kind: "oil",
      text: `Brent a ${i.brent.last.toLocaleString("es-ES", { maximumFractionDigits: 1 })} $: ${pct(i.brent.change7d)} en 7 días.`,
    });
  return r;
}

// ---------- Entrada pública ----------

export async function decide(i: DecisionInput): Promise<Decision> {
  let base: Decision;
  if (!hasJev()) base = verdictFromNews(i, undefined, "Falta TYPESAFE_API_KEY");
  else if (!i.headlines.length) base = verdictFromNews(i, undefined, "No hay titulares que leer");
  else {
    try {
      base = verdictFromNews(i, await readNews(i.headlines));
    } catch (e) {
      base = verdictFromNews(i, undefined, e instanceof Error ? e.message : String(e));
    }
  }
  return applyTank(base, i.tank);
}

function applyTank(d: Decision, tank: TankId): Decision {
  const out: Decision = { ...d, reasons: [...d.reasons] };
  const when = d.event ? `el ${d.event.label}` : "";
  if (tank === "reserva" && d.verdict === "wait") {
    out.verdict = "partial";
    out.overridden = `Vas en reserva: echa solo lo justo para llegar a ${when}.`;
  } else if (tank === "reserva" && d.verdict === "any") {
    out.verdict = "today";
    out.overridden = "Vas en reserva: echa hoy. El día da igual; la gasolinera, no.";
  } else if (tank === "lleno" && d.verdict === "today") {
    out.overridden = `Tienes el depósito casi lleno: complétalo antes de ${when} si pasas por una barata.`;
  }
  out.reasons.unshift({ kind: "tank", text: `Depósito: ${TANKS[tank].label.toLowerCase()}.` });
  return out;
}
