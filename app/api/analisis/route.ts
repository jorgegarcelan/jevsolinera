import { after, NextResponse, type NextRequest } from "next/server";
import { analyze, AnalyzeError } from "@/lib/analyze";
import { TANKS, type TankId } from "@/lib/decide";
import { isFuel, madridDate } from "@/lib/minetur";
import { getTrack, recordPrediction } from "@/lib/track";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  try {
    const { analysis, prediction, mainProv } = await analyze({ lat, lon, fuel, tank, liters });
    const track = await getTrack(fuel, mainProv, madridDate(0).iso).catch(() => null);
    // Registrar la predicción del día no debe retrasar la respuesta.
    after(() => recordPrediction(prediction).catch(() => {}));
    return NextResponse.json({ ...analysis, track }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (e) {
    if (e instanceof AnalyzeError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
