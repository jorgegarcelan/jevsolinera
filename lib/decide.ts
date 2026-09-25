// ¿Echo hoy o espero? Puntuación compuesta (https://docs.typesafe.ai/patterns/composite-scoring):
// Jev responde preguntas atómicas sobre los titulares (lo que sabe hacer: leer y juzgar),
// el código calcula las tendencias de precios (lo que Jev hace mal: números) y suma todo
// con pesos fijos. El nivel del depósito se aplica al final, también en código.

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

export type Verdict = "today" | "partial" | "wait";

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
  weekday: string; // en inglés, hora de Madrid
  headlines: Headline[];
}

export interface Reason {
  kind: "up" | "down" | "flat" | "calendar" | "news" | "tank" | "oil";
  text: string;
}

/** Cuánto empuja cada señal: positivo → echa hoy, negativo → espera. */
export interface Factor {
  key: "momentum" | "month" | "oil" | "news" | "deadline" | "warning" | "relief" | "weekday";
  label: string;
  value: number;
}

export interface NewsRead {
  model: string;
  outlook: "rise" | "fall" | "stable" | "unclear";
  probabilities: Record<string, number>;
  confidence: number;
  deadline: number; // P(se anuncia una fecha tras la que subirá)
  warning: number; // 0–2: cuánto urgen a repostar ya
  relief: number; // P(se anuncia una rebaja en España)
  /** Lo que lee Jev en cada titular, en el mismo orden. */
  headlines?: HeadlineRead[];
  /** La llamada: cuántas preguntas, tokens, tiempo y coste. */
  call?: { questions: number; inputTokens: number; ms: number; costUsd: number; at: string };
}

export interface HeadlineRead {
  direction: "up" | "down" | "none";
  probabilities: Record<"up" | "down" | "none", number>;
  spain: number; // P(habla del surtidor en España)
  date: number; // P(anuncia una fecha o evento tras el que subirá)
}

export interface Decision {
  verdict: Verdict;
  /** Veredicto solo con el mercado, antes de aplicar tu depósito: es el que se registra y evalúa. */
  market: Verdict;
  source: "jev" | "heuristic";
  model?: string;
  confidence: number;
  probabilities: Record<Verdict, number>;
  score: number;
  factors: Factor[];
  news?: NewsRead;
  overridden?: string;
  reasons: Reason[];
  error?: string;
}

// Pesos, en "fracción de precio esperada". El umbral para decidir es ±0,4 %.
export type Weights = typeof W;
export const W = {
  d7: 0.5,
  d3: 0.3,
  d1: 0.6,
  d30: 0.05,
  brent7: 0.15,
  news: 0.01, // titulares claramente alcistas ≈ +1 %
  deadline: 0.008,
  warning: 0.002, // por nivel (0–2)
  relief: 0.01,
  monday: 0.004,
  mondaySoon: 0.003,
};
const THRESHOLD = 0.004;
const SHARPNESS = 180;

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

function daysUntilMonday(weekday: string) {
  const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const i = order.indexOf(weekday);
  return i <= 0 ? 0 : 7 - i;
}

// ---------- Jev lee los titulares ----------

const newsCache = new Map<string, { at: number; read: NewsRead }>();

export async function readNews(headlines: Headline[]): Promise<NewsRead> {
  const titles = headlines.map((h) => h.title);
  const key = titles.join("|");
  const hit = newsCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.read;

  // Además de las 4 preguntas de conjunto, 3 por titular. Todas van en la misma llamada:
  // Jev lee el estado una vez y responde cada pregunta en paralelo.
  const perHeadline: Record<string, Question> = {};
  titles.forEach((_, i) => {
    perHeadline[`h${i}_dir`] = {
      type: "choice",
      instructions: `What does \`headlines[${i}]\` say about the direction of pump fuel prices?`,
      criteria: {
        up: "It says fuel prices are going up, have risen or will rise.",
        down: "It says fuel prices are going down, have fallen or will fall.",
        none: "It does not say whether fuel prices are going up or down.",
      },
    };
    perHeadline[`h${i}_spain`] = {
      type: "noul",
      instructions: `Is \`headlines[${i}]\` about fuel prices for drivers in Spain, or about crude oil that affects them? A headline only about another country's pump prices is not.`,
    };
    perHeadline[`h${i}_date`] = {
      type: "noul",
      instructions: `Does \`headlines[${i}]\` mention a specific upcoming date or event after which fuel will cost more?`,
    };
  });

  const res = await askJev(
    { country: "Spain", headlines: titles },
    {
      ...perHeadline,
      outlook: {
        type: "choice",
        instructions: "What do the `headlines` say will happen to pump fuel prices in Spain over the next week?",
        criteria: {
          rise: "Headlines say pump prices in Spain will keep rising (hikes, rising crude oil, tax increases, end of discounts).",
          fall: "Headlines say pump prices in Spain will go down.",
          stable: "Headlines say pump prices in Spain will stay roughly the same.",
          unclear: "Headlines are mixed or say nothing about where pump prices in Spain are going.",
        },
      },
      deadline: {
        type: "noul",
        instructions:
          "Do the `headlines` mention a specific upcoming date or event after which fuel will cost more in Spain, such as a tax change or the end of a discount?",
      },
      warning: {
        type: "score",
        instructions: "How strongly do the `headlines` tell drivers in Spain to refuel soon?",
        criteria: [
          "Headlines do not tell drivers to refuel soon.",
          "Headlines hint that refuelling soon could save money.",
          "Headlines urgently tell drivers to fill the tank before prices go up.",
        ],
      },
      relief: {
        type: "noul",
        instructions:
          "Do the `headlines` announce a measure that will lower fuel prices in Spain soon, such as a tax cut, a discount or a subsidy? Measures in other countries do not count.",
      },
    },
  );

  const a = res.answers as Record<string, Answer>;
  const outlook = a.outlook as Extract<Answer, { type: "choice" }>;
  const read: NewsRead = {
    model: res.model,
    outlook: outlook.choice as NewsRead["outlook"],
    probabilities: outlook.probabilities,
    confidence: outlook.confidence,
    deadline: (a.deadline as Extract<Answer, { type: "noul" }>).noul,
    warning: (a.warning as Extract<Answer, { type: "score" }>).score,
    relief: (a.relief as Extract<Answer, { type: "noul" }>).noul,
    headlines: titles.map((_, i) => {
      const dir = a[`h${i}_dir`] as Extract<Answer, { type: "choice" }>;
      return {
        direction: dir.choice as HeadlineRead["direction"],
        probabilities: dir.probabilities as HeadlineRead["probabilities"],
        spain: (a[`h${i}_spain`] as Extract<Answer, { type: "noul" }>).noul,
        date: (a[`h${i}_date`] as Extract<Answer, { type: "noul" }>).noul,
      };
    }),
    call: {
      questions: Object.keys(perHeadline).length + 4,
      inputTokens: res.usage.input_tokens,
      ms: res.ms,
      costUsd: res.usage.input_tokens * PRICE_PER_INPUT_TOKEN_USD,
      at: new Date().toISOString(),
    },
  };
  newsCache.set(key, { at: Date.now(), read });
  if (newsCache.size > 50) newsCache.delete(newsCache.keys().next().value!);
  return read;
}

// ---------- Suma de señales ----------

export function combine(i: DecisionInput, news?: NewsRead, error?: string, w: Weights = W): Decision {
  const t = i.trend;
  const toMon = daysUntilMonday(i.weekday);
  const factors: Factor[] = [
    { key: "momentum", label: "Precios en tu zona (última semana)", value: w.d7 * (t.d7 ?? 0) + w.d3 * (t.d3 ?? 0) + w.d1 * (t.d1 ?? 0) },
    { key: "month", label: "Precios en tu zona (último mes)", value: w.d30 * (t.d30 ?? 0) },
    { key: "oil", label: "Petróleo Brent (7 días)", value: w.brent7 * (i.brent?.change7d ?? 0) },
    {
      key: "weekday",
      label: toMon === 0 ? "Hoy es lunes" : `El lunes (en ${toMon} día${toMon > 1 ? "s" : ""}) suele ser más barato`,
      value: toMon === 0 ? w.monday : toMon <= 2 ? -w.mondaySoon : 0,
    },
  ];
  if (news) {
    // La dirección cuenta en proporción a lo que Jev está segura; "unclear"/"stable" no empujan.
    const dir = (news.probabilities.rise ?? 0) - (news.probabilities.fall ?? 0);
    factors.push(
      { key: "news", label: "Hacia dónde apuntan las noticias", value: w.news * dir },
      { key: "deadline", label: "Fecha anunciada de subida", value: w.deadline * news.deadline },
      { key: "warning", label: "La prensa urge a repostar ya", value: w.warning * news.warning },
      { key: "relief", label: "Rebaja anunciada en España", value: -w.relief * news.relief },
    );
  }

  const score = factors.reduce((s, f) => s + f.value, 0);
  const sig = (x: number) => 1 / (1 + Math.exp(-x));
  const up = sig(SHARPNESS * (score - THRESHOLD));
  const down = sig(-SHARPNESS * (score + THRESHOLD));
  const probabilities = { today: up, partial: Math.max(0, 1 - up - down), wait: down };
  const verdict = (Object.entries(probabilities) as [Verdict, number][]).sort((a, b) => b[1] - a[1])[0][0];

  return {
    verdict,
    market: verdict,
    source: news ? "jev" : "heuristic",
    model: news?.model,
    confidence: probabilities[verdict],
    probabilities,
    score,
    factors: factors.filter((f) => Math.abs(f.value) >= 0.0002).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    news,
    reasons: buildReasons(i, news),
    error,
  };
}

function buildReasons(i: DecisionInput, news?: NewsRead): Reason[] {
  const r: Reason[] = [];
  const fuel = FUELS[i.fuel].label;
  const t7 = i.trend.d7 ?? i.trend.d3;
  if (t7 != null) {
    const kind = Math.abs(t7) < 0.004 ? "flat" : t7 > 0 ? "up" : "down";
    r.push({
      kind,
      text:
        kind === "flat"
          ? `${fuel} en tu zona: estable esta semana (${pct(t7)}).`
          : `${fuel} en tu zona: ${pct(t7)} en ${i.trend.d7 != null ? "7" : "3"} días${i.trend.d30 != null ? ` y ${pct(i.trend.d30)} en un mes` : ""}.`,
    });
  }
  if (i.trend.d1 != null && Math.abs(i.trend.d1) >= 0.003)
    r.push({ kind: i.trend.d1 > 0 ? "up" : "down", text: `Desde ayer: ${pct(i.trend.d1)}.` });
  if (i.brent)
    r.push({
      kind: "oil",
      text: `Brent a ${i.brent.last.toLocaleString("es-ES", { maximumFractionDigits: 1 })} $: ${pct(i.brent.change7d)} en 7 días. Lo que hace el crudo llega al surtidor con 1–2 semanas de retraso.`,
    });
  const toMon = daysUntilMonday(i.weekday);
  r.push({
    kind: "calendar",
    text:
      toMon === 0
        ? "Hoy es lunes: suele ser el día más barato de la semana."
        : `El lunes (en ${toMon} día${toMon > 1 ? "s" : ""}) suele ser el día más barato; los precios tienden a subir hacia el fin de semana.`,
  });
  if (news) {
    const words = { rise: "más subidas", fall: "bajadas", stable: "estabilidad", unclear: "señales mixtas" };
    r.push({
      kind: "news",
      text: `Jev ha leído ${i.headlines.length} titulares recientes: apuntan a ${words[news.outlook]} (${Math.round((news.probabilities[news.outlook] ?? 0) * 100)} %).`,
    });
    if (news.deadline >= 0.6)
      r.push({ kind: "news", text: "La prensa menciona una fecha próxima a partir de la cual repostar será más caro." });
    if (news.relief >= 0.6) r.push({ kind: "news", text: "La prensa anuncia una rebaja del combustible en España." });
  }
  return r;
}

// ---------- Entrada pública ----------

export async function decide(i: DecisionInput): Promise<Decision> {
  let base: Decision;
  if (!hasJev()) base = combine(i, undefined, "Falta TYPESAFE_API_KEY");
  else if (!i.headlines.length) base = combine(i, undefined, "No hay titulares que leer");
  else {
    try {
      base = combine(i, await readNews(i.headlines));
    } catch (e) {
      base = combine(i, undefined, e instanceof Error ? e.message : String(e));
    }
  }
  return applyTank(base, i.tank);
}

function applyTank(d: Decision, tank: TankId): Decision {
  const out: Decision = { ...d, reasons: [...d.reasons] };
  if (tank === "reserva" && d.verdict === "wait") {
    out.verdict = "partial";
    out.overridden = "Vas en reserva: no puedes esperar, pero echa solo lo justo hasta que baje.";
  } else if (tank === "reserva" && d.verdict === "partial") {
    out.overridden = "Vas en reserva: echa lo justo para unos días.";
  } else if (tank === "lleno" && d.verdict !== "today") {
    out.verdict = "wait";
    out.overridden = "Con el depósito casi lleno, no hay prisa.";
  } else if (tank === "lleno" && d.verdict === "today") {
    out.overridden = "Tienes el depósito casi lleno, pero si pasas por una barata, complétalo: va a subir.";
  }
  out.reasons.unshift({ kind: "tank", text: `Depósito: ${TANKS[tank].label.toLowerCase()}.` });
  return out;
}
