// Horarios del Ministerio, p. ej. "L-D: 24H", "L-V: 06:00-22:00; S: 07:00-15:00",
// "L-S: 07:00-14:00 y 16:00-21:00; D: 08:00-14:00". Días: L M X J V S D.

const DAYS = "LMXJVSD";
type Range = [number, number]; // minutos desde medianoche; end puede ser 1440

export interface OpenState {
  open: boolean | null; // null = no se entiende el horario
  closesAt?: string; // si cierra en menos de 60 min
  opensAt?: string; // si está cerrada: próxima apertura (hoy o mañana)
}

function mins(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Horario semanal: para cada día (0 = lunes), sus franjas. null si no se entiende. */
export function parseHours(text: string): Range[][] | null {
  const week: Range[][] = Array.from({ length: 7 }, () => []);
  const segs = text.split(";").map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return null;
  const covered = new Set<number>();

  for (const seg of segs) {
    const m = seg.match(/^([LMXJVSD])(?:-([LMXJVSD]))?\s*:\s*(.+)$/);
    if (!m) return null;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    const days: number[] = [];
    for (let d = a; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === b) break;
    }
    const spec = m[3].trim();
    const ranges: Range[] = [];
    if (/^24\s*H$/i.test(spec)) ranges.push([0, 1440]);
    else {
      for (const part of spec.split(/\s+y\s+/)) {
        const r = part.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
        if (!r) return null;
        const start = mins(r[1]);
        let end = mins(r[2]);
        if (end === 0 || end === 1439) end = 1440; // "00:00" / "23:59" = hasta medianoche
        ranges.push([start, end]);
      }
    }
    for (const d of days) {
      covered.add(d);
      for (const [s, e] of ranges) {
        if (e > s) week[d].push([s, e]);
        else {
          // Cruza la medianoche: hasta las 24 h y sigue al día siguiente.
          week[d].push([s, 1440]);
          week[(d + 1) % 7].push([0, e]);
        }
      }
    }
  }
  // "L: 06:00-22:00" a secas aparece en cientos de fichas y casi seguro no significa
  // "solo los lunes": si solo se describe un día, no nos fiamos.
  if (covered.size === 1 && segs.length === 1) return null;
  return week;
}

/** Hora local de la gasolinera (Canarias va una hora por detrás). */
export function localNow(provinceId: string, now = new Date()) {
  const tz = provinceId === "35" || provinceId === "38" ? "Atlantic/Canary" : "Europe/Madrid";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  return { day, minute: Number(p.hour) * 60 + Number(p.minute) };
}

export function openState(text: string, provinceId: string, now = new Date()): OpenState {
  const week = parseHours(text);
  if (!week) return { open: null };
  const { day, minute } = localNow(provinceId, now);
  const today = week[day];
  const current = today.find(([s, e]) => minute >= s && minute < e);
  if (current) {
    let end = current[1];
    // Si enlaza con la franja de mañana a las 00:00, no "cierra".
    if (end === 1440 && week[(day + 1) % 7].some(([s]) => s === 0)) return { open: true };
    return end - minute <= 60 ? { open: true, closesAt: hhmm(end) } : { open: true };
  }
  const later = today.filter(([s]) => s > minute).sort((a, b) => a[0] - b[0])[0];
  if (later) return { open: false, opensAt: hhmm(later[0]) };
  const tomorrow = week[(day + 1) % 7].sort((a, b) => a[0] - b[0])[0];
  return tomorrow ? { open: false, opensAt: `mañana ${hhmm(tomorrow[0])}` } : { open: false };
}
