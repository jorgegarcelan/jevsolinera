import { NextResponse, type NextRequest } from "next/server";
import { decide, TANKS, type TankId, type Trend } from "@/lib/decide";
import {
  FUELS,
  distanceKm,
  getCurrentStations,
  getHistory,
  isFuel,
  madridDate,
  median,
  type Prices,
} from "@/lib/minetur";
import { getBrent, getHeadlines } from "@/lib/signals";

export const runtime = "nodejs";
export const maxDuration = 30;

const HIST_DAYS = [1, 3, 7, 14, 30] as const;
const CONSUMPTION = 0.065; // L/km de un coche medio
const ROAD_FACTOR = 1.3; // la carretera no va en línea recta

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const fuel = q.get("fuel");
  const tankParam = q.get("tank") ?? "cuarto";
  const liters = Math.min(120, Math.max(5, Number(q.get("liters")) || 40));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isFuel(fuel))
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const tank: TankId = tankParam in TANKS ? (tankParam as TankId) : "cuarto";

  let data;
  try {
    data = await getCurrentStations();
  } catch {
    return NextResponse.json({ error: "El servicio de precios del Ministerio no responde. Prueba en un minuto." }, { status: 502 });
  }
  const headlinesP = getHeadlines();
  const brentP = getBrent();

  // Gasolineras cercanas: amplía el radio hasta tener un puñado donde elegir.
  const withFuel = data.stations
    .filter((s) => s.prices[fuel])
    .map((s) => ({ s, d: distanceKm(lat, lon, s.lat, s.lon) }))
    .filter((x) => x.d <= 50)
    .sort((a, b) => a.d - b.d);
  let radiusKm = 5;
  for (const r of [3, 5, 10, 20, 50]) {
    radiusKm = r;
    if (withFuel.filter((x) => x.d <= r).length >= 8) break;
  }
  const nearby = withFuel.filter((x) => x.d <= radiusKm).slice(0, 60);
  if (!nearby.length)
    return NextResponse.json({ error: `No hay gasolineras con ${FUELS[fuel].label} a menos de 50 km.` }, { status: 404 });

  // Histórico de las provincias de la zona (máx. 2).
  const provCount = new Map<string, number>();
  for (const { s } of nearby) provCount.set(s.provinceId, (provCount.get(s.provinceId) ?? 0) + 1);
  const provinces = [...provCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p);
  const mainProv = provinces[0];

  const hist = new Map<number, Map<string, Prices>>();
  const provHist = new Map<number, Map<string, Prices>>();
  await Promise.all(
    HIST_DAYS.map(async (days) => {
      const date = madridDate(days).api;
      const maps = await Promise.allSettled(provinces.map((p) => getHistory(p, date)));
      const merged = new Map<string, Prices>();
      maps.forEach((m, i) => {
        if (m.status !== "fulfilled") return;
        for (const [k, v] of m.value) merged.set(k, v);
        if (provinces[i] === mainProv) provHist.set(days, m.value);
      });
      if (merged.size) hist.set(days, merged);
    }),
  );

  // Tendencia de la zona: mediana de la variación de cada gasolinera frente a sí misma.
  const trend: Trend = {};
  const series: { daysAgo: number; local?: number; province?: number }[] = [];
  const provNow = median(data.stations.filter((s) => s.provinceId === mainProv && s.prices[fuel]).map((s) => s.prices[fuel]!));
  series.push({ daysAgo: 0, local: median(nearby.map((x) => x.s.prices[fuel]!)), province: provNow });
  for (const days of HIST_DAYS) {
    const h = hist.get(days);
    if (!h) continue;
    const changes: number[] = [];
    const then: number[] = [];
    for (const { s } of nearby) {
      const p = h.get(s.id)?.[fuel];
      if (!p) continue;
      then.push(p);
      changes.push(s.prices[fuel]! / p - 1);
    }
    const ph = provHist.get(days);
    series.push({
      daysAgo: days,
      local: median(then),
      province: ph ? median([...ph.values()].map((v) => v[fuel]).filter((v): v is number => !!v)) : undefined,
    });
    if (changes.length >= 2 && (days === 1 || days === 3 || days === 7 || days === 30))
      trend[`d${days}` as keyof Trend] = median(changes);
  }
  series.sort((a, b) => b.daysAgo - a.daysAgo);

  const week = hist.get(7);
  const stations = nearby
    .map(({ s, d }) => {
      const price = s.prices[fuel]!;
      const detourL = d * ROAD_FACTOR * 2 * CONSUMPTION;
      const prev = week?.get(s.id)?.[fuel];
      return {
        id: s.id,
        name: s.name,
        address: s.address,
        town: s.town,
        hours: s.hours,
        lat: s.lat,
        lon: s.lon,
        price,
        distanceKm: Math.round(d * 100) / 100,
        change7d: prev ? price / prev - 1 : null,
        totalCost: price * (liters + detourL),
      };
    })
    .sort((a, b) => a.totalCost - b.totalCost);

  const [headlines, brent] = await Promise.all([headlinesP, brentP]);
  const today = madridDate(0);
  const decision = await decide({ fuel, tank, trend, brent, weekday: today.weekday, headlines });

  const localMedian = series.find((x) => x.daysAgo === 0)?.local ?? stations[0].price;

  return NextResponse.json(
    {
      updated: data.updated,
      fuel,
      liters,
      radiusKm,
      province: nearby[0].s.province,
      stations,
      stats: {
        localMedian,
        provinceMedian: provNow,
        cheapest: Math.min(...stations.map((s) => s.price)),
        bestSaving: (localMedian - stations[0].price) * liters,
        trend,
        series,
      },
      brent,
      headlines,
      decision,
    },
    { headers: { "Cache-Control": "private, max-age=120" } },
  );
}
