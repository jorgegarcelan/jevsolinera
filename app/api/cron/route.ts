import { NextResponse, type NextRequest } from "next/server";
import { analyze } from "@/lib/analyze";
import { madridDate, type FuelId } from "@/lib/minetur";
import { storeKind } from "@/lib/store";
import { getTrack, recordPrediction } from "@/lib/track";

export const runtime = "nodejs";
export const maxDuration = 300;

// Tarea diaria (vercel.json → crons): registra la predicción de las ciudades grandes
// aunque ese día nadie haya entrado desde allí, y evalúa las de hace 3 días.
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

export async function GET(req: NextRequest) {
  // Vercel firma sus llamadas con CRON_SECRET si está definido.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!storeKind) return NextResponse.json({ error: "Sin almacenamiento configurado" }, { status: 503 });

  const today = madridDate(0).iso;
  const results: Record<string, string> = {};
  for (const city of CITIES) {
    await Promise.all(
      FUELS.map(async (fuel) => {
        const label = `${city.name}/${fuel}`;
        try {
          const { prediction, mainProv } = await analyze({ lat: city.lat, lon: city.lon, fuel, tank: "cuarto", liters: 40 });
          const written = await recordPrediction(prediction);
          const track = await getTrack(fuel, mainProv, today);
          results[label] = `${written ? "registrada" : "ya existía"}: ${prediction.verdict} · evaluadas ${track?.evaluated ?? 0}`;
        } catch (e) {
          results[label] = `error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }),
    );
  }
  return NextResponse.json({ date: today, results });
}
