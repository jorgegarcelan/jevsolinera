import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

// Busca una ciudad, dirección o código postal en España (OpenStreetMap Nominatim).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ error: "Escribe un lugar" }, { status: 400 });
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&accept-language=es&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "jevsolinera/1.0 (https://jevsolinera.vercel.app)" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6000),
    });
    const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (!hit) return NextResponse.json({ error: `No encuentro «${q}»` }, { status: 404 });
    return NextResponse.json({
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      label: hit.display_name.split(",").slice(0, 2).join(",").trim(),
    });
  } catch {
    return NextResponse.json({ error: "El buscador no responde" }, { status: 502 });
  }
}
