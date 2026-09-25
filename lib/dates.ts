// Fechas candidatas en un titular: "el 1 de octubre", "este lunes", "mañana", "la semana
// que viene", "en octubre"… El código las encuentra y las convierte en días concretos
// (contando desde que se publicó el titular); Jev solo elige cuál es la buena.
// Así la aritmética de fechas no depende del modelo, que no es bueno con ella.

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface DateCandidate {
  iso: string; // AAAA-MM-DD
  text: string; // tal cual aparece en el titular
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`);
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Día de publicación (hora de Madrid) → fecha de referencia. */
export function referenceDay(publishedIso: string) {
  const d = new Date(publishedIso);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(Number.isFinite(d.getTime()) ? d : new Date());
}

export function findDates(title: string, refIso: string): DateCandidate[] {
  const t = title.toLowerCase();
  const ref = utcDay(refIso);
  const out: DateCandidate[] = [];
  const add = (d: Date, text: string) => {
    const v = iso(d);
    if (!out.some((c) => c.iso === v)) out.push({ iso: v, text });
  };

  // "1 de octubre", "el 15 de enero de 2027"
  for (const m of t.matchAll(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?/g)) {
    const day = Number(m[1]);
    const month = MONTHS.indexOf(m[2]);
    let year = m[3] ? Number(m[3]) : ref.getUTCFullYear();
    let d = new Date(Date.UTC(year, month, day, 12));
    // Sin año y ya muy pasada (> 2 meses): será del año que viene.
    if (!m[3] && d.getTime() < ref.getTime() - 60 * 86_400_000) d = new Date(Date.UTC(++year, month, day, 12));
    if (d.getUTCDate() === day) add(d, m[0]);
  }

  // "este lunes", "el próximo viernes", "a partir del martes"
  for (const m of t.matchAll(/\b(este|esta|el|próximo|proximo|a partir del|desde el)\s+(próximo\s+)?(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/g)) {
    const name = m[3].replace("miercoles", "miércoles").replace("sabado", "sábado");
    const target = WEEKDAYS.indexOf(name);
    let diff = (target - ref.getUTCDay() + 7) % 7;
    // "este sábado" dicho un sábado es hoy; "el próximo lunes" dicho un lunes, el siguiente.
    if (diff === 0 && !/^(este|esta)$/.test(m[1])) diff = 7;
    add(plus(ref, diff), m[0]);
  }

  if (/\bpasado mañana\b/.test(t)) add(plus(ref, 2), "pasado mañana");
  else if (/\bmañana\b/.test(t)) add(plus(ref, 1), "mañana");

  // "la semana que viene", "la próxima semana" → el lunes siguiente
  if (/semana que viene|próxima semana|proxima semana/.test(t)) {
    const diff = ((1 - ref.getUTCDay() + 7) % 7) || 7;
    add(plus(ref, diff), "la semana que viene");
  }

  // "este fin de semana" → el sábado
  if (/fin de semana/.test(t)) {
    const diff = ((6 - ref.getUTCDay() + 7) % 7) || 7;
    add(plus(ref, diff), "el fin de semana");
  }

  // "en octubre", "a partir de enero", "desde noviembre" → día 1 de ese mes, si es futuro
  for (const m of t.matchAll(/\b(en|a partir de|desde|para)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b(?! de \d)/g)) {
    const month = MONTHS.indexOf(m[2]);
    let year = ref.getUTCFullYear();
    if (month < ref.getUTCMonth() || (month === ref.getUTCMonth() && ref.getUTCDate() > 1)) year++;
    add(new Date(Date.UTC(year, month, 1, 12)), m[0]);
  }

  return out;
}

export function dateLabel(isoDate: string) {
  const d = utcDay(isoDate);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((utcDay(toIso).getTime() - utcDay(fromIso).getTime()) / 86_400_000);
}
