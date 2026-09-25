// Precios oficiales del Ministerio (Geoportal de Gasolineras).
// Actual: todas las estaciones de España (~12 MB, se actualiza cada 30 min).
// Histórico: por provincia y día (~1 MB), inmutable.

export const FUELS = {
  g95: { label: "Gasolina 95", field: "Precio Gasolina 95 E5", en: "95-octane petrol" },
  g98: { label: "Gasolina 98", field: "Precio Gasolina 98 E5", en: "98-octane petrol" },
  diesel: { label: "Diésel", field: "Precio Gasoleo A", en: "diesel" },
  dieselp: { label: "Diésel Premium", field: "Precio Gasoleo Premium", en: "premium diesel" },
  glp: { label: "GLP", field: "Precio Gases licuados del petróleo", en: "LPG autogas" },
} as const;

export type FuelId = keyof typeof FUELS;
export const isFuel = (f: string | null): f is FuelId => !!f && f in FUELS;

export type Prices = Partial<Record<FuelId, number>>;

export interface Station {
  id: string;
  name: string;
  address: string;
  town: string;
  province: string;
  provinceId: string;
  lat: number;
  lon: number;
  hours: string;
  prices: Prices;
}

const BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes";

type Raw = Record<string, string>;

const num = (s?: string) => {
  if (!s) return undefined;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function parsePrices(r: Raw): Prices {
  const p: Prices = {};
  for (const [id, f] of Object.entries(FUELS) as [FuelId, (typeof FUELS)[FuelId]][]) {
    const v = num(r[f.field]);
    if (v) p[id] = v;
  }
  return p;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

function parseStation(r: Raw): Station | null {
  // "R" = venta restringida (socios de cooperativas, flotas): no sirve al público.
  if (r["Tipo Venta"] && r["Tipo Venta"] !== "P") return null;
  const latN = parseFloat((r["Latitud"] ?? "").replace(",", "."));
  const lonN = parseFloat((r["Longitud (WGS84)"] ?? "").replace(",", "."));
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return null;
  const prices = parsePrices(r);
  if (!Object.keys(prices).length) return null;
  return {
    id: r["IDEESS"],
    name: titleCase(r["Rótulo"] || "Gasolinera"),
    address: titleCase(r["Dirección"] || ""),
    town: titleCase(r["Localidad"] || r["Municipio"] || ""),
    province: titleCase(r["Provincia"] || ""),
    provinceId: r["IDProvincia"],
    lat: latN,
    lon: lonN,
    hours: r["Horario"] || "",
    prices,
  };
}

async function getJson(url: string, timeoutMs = 25_000) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ministerio ${res.status} en ${url}`);
  return res.json() as Promise<{ Fecha: string; ListaEESSPrecio: Raw[]; ResultadoConsulta: string }>;
}

// ---- Precios actuales (cache en memoria de la función, 15 min) ----

interface Snapshot {
  at: number;
  updated: string;
  stations: Station[];
}

let current: Snapshot | null = null;
let currentInflight: Promise<Snapshot> | null = null;

export async function getCurrentStations(): Promise<Snapshot> {
  if (current && Date.now() - current.at < 15 * 60_000) return current;
  currentInflight ??= getJson(`${BASE}/EstacionesTerrestres/`)
    .then((d) => {
      const stations = d.ListaEESSPrecio.map(parseStation).filter((s): s is Station => !!s);
      const snap: Snapshot = { at: Date.now(), updated: d.Fecha, stations };
      current = snap;
      return snap;
    })
    .finally(() => {
      currentInflight = null;
    });
  // Si falla la recarga pero tenemos datos viejos, mejor viejos que nada.
  try {
    return await currentInflight;
  } catch (e) {
    if (current) return current;
    throw e;
  }
}

// ---- Histórico por provincia y día (inmutable → cache sin caducidad) ----

const histCache = new Map<string, Promise<Map<string, Prices>>>();

export function getHistory(provinceId: string, date: string) {
  const key = `${provinceId}/${date}`;
  let p = histCache.get(key);
  if (!p) {
    p = getJson(`${BASE}/EstacionesTerrestresHist/FiltroProvincia/${date}/${provinceId}`, 15_000).then(
      (d) => new Map(d.ListaEESSPrecio.map((r) => [r["IDEESS"], parsePrices(r)])),
    );
    p.catch(() => histCache.delete(key));
    histCache.set(key, p);
    if (histCache.size > 400) histCache.delete(histCache.keys().next().value!);
  }
  return p;
}

// ---- Utilidades ----

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function median(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Fecha en Madrid hace `daysAgo` días: "dd-MM-yyyy" para la API, ISO y día de la semana. */
export function madridDate(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      weekday: "long",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return {
    api: `${parts.day}-${parts.month}-${parts.year}`,
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday as string,
  };
}
