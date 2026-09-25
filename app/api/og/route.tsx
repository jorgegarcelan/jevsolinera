import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// Tarjeta para compartir (1200×630): el globo del surtidor con el veredicto y, si viene
// en la URL, la gasolinera y su precio. Sin parámetros: la tarjeta genérica de la web.

const C = {
  canopy: "#16213a",
  cream: "#fbf5e6",
  bg: "#ede3cc",
  red: "#a8251c",
  redDeep: "#7c1911",
  gold: "#c9a55b",
  ink: "#18223a",
  muted: "#6b6454",
};
const VERDICT = {
  today: { color: "#a8251c", word: "Hoy", title: "LLENA HOY", withDate: "LLENA ANTES DEL" },
  partial: { color: "#c07d14", word: "Lo justo", title: "ECHA LO JUSTO", withDate: "ECHA LO JUSTO" },
  wait: { color: "#276f60", word: "Espera", title: "ESPERA", withDate: "ESPERA AL" },
  any: { color: "#2b3f66", word: "Da igual", title: "HOY DA IGUAL", withDate: "HOY DA IGUAL" },
} as const;
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const FUEL: Record<string, string> = { g95: "Gasolina 95", g98: "Gasolina 98", diesel: "Diésel", dieselp: "Diésel Premium", glp: "GLP" };

// Google Fonts sirve TTF (lo que necesita next/og) si no pides woff2; `text` recorta la fuente.
async function font(family: string, text: string) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`, {
    cache: "force-cache",
  }).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error(`Sin fuente ${family}`);
  return fetch(url, { cache: "force-cache" }).then((r) => r.arrayBuffer());
}

const clean = (s: string | null, max: number) => (s ?? "").replace(/[\u0000-\u001f<>]/g, "").slice(0, max).trim();

function star(size: number, fill: string, core: string) {
  const pts = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 === 0 ? 50 : i % 2 === 0 ? 26 : 9;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <polygon points={pts} fill={fill} />
      <circle cx="50" cy="50" r="7" fill={core} />
    </svg>
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const v = q.get("v");
  const verdict = v === "today" || v === "partial" || v === "wait" || v === "any" ? VERDICT[v] : null;
  const ev = /^\d{4}-\d{2}-\d{2}$/.test(q.get("e") ?? "") ? q.get("e")! : null;
  const fuel = FUEL[q.get("f") ?? ""] ?? null;
  const priceNum = Number(q.get("p"));
  const price = priceNum > 0 && priceNum < 10 ? priceNum.toFixed(3).replace(".", ",") : null;
  const station = clean(q.get("s"), 28);
  const zone = clean(q.get("z"), 32);
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") ?? "") ? q.get("d")! : null;
  const date = dateIso
    ? new Date(`${dateIso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  const word = verdict?.word ?? "¿?";
  const title = verdict
    ? ev && (v === "today" || v === "wait")
      ? `${verdict.withDate} ${Number(ev.slice(8, 10))} ${MONTHS[Number(ev.slice(5, 7)) - 1]}`
      : verdict.title
    : "¿LLENO HOY O ESPERO?";
  const color = verdict?.color ?? "#9a8f78";
  const kicker = verdict
    ? ["La decisión de hoy", fuel, zone].filter(Boolean).join(" · ").toUpperCase()
    : "PRECIOS OFICIALES · DECISIÓN CON IA";

  // Subconjunto de glifos: alfabeto completo (los nombres de gasolinera son arbitrarios).
  const glyphs = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚÜÇabcdefghijklmnñopqrstuvwxyzáéíóúüç0123456789·¿?¡!,.:;/€'&()+- ";
  const [script, sign, body] = await Promise.all([
    font("Yellowtail", glyphs),
    font("Big+Shoulders:wght@800", glyphs),
    font("DM+Sans:wght@500", glyphs),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: C.bg, fontFamily: "Body" }}>
        {/* Marquesina */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 118, padding: "0 56px", background: C.canopy }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {star(64, C.gold, C.red)}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "Script", fontSize: 62, color: C.cream, textShadow: `3px 4px 0 ${C.red}`, lineHeight: 1 }}>jevsolinera</span>
              <span style={{ fontFamily: "Sign", fontSize: 18, letterSpacing: 6, color: C.gold, marginTop: 6 }}>ESTACIÓN DE SERVICIO · EST. 2026</span>
            </div>
          </div>
          <span style={{ fontFamily: "Sign", fontSize: 30, letterSpacing: 4, color: C.cream }}>¿ECHO HOY?</span>
        </div>
        <div style={{ display: "flex", height: 8, background: C.red }} />
        <div style={{ display: "flex", height: 4, background: C.cream }} />
        <div style={{ display: "flex", height: 5, background: C.red }} />

        <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "0 56px", gap: 56 }}>
          {/* Globo del surtidor */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                width: 330,
                height: 330,
                borderRadius: 999,
                padding: 16,
                background: "linear-gradient(180deg, #ffffff 0%, #dfe2e6 22%, #9aa0a8 48%, #eef0f2 62%, #b3b8bf 82%, #e9ebee 100%)",
                boxShadow: "0 24px 40px -18px rgba(0,0,0,0.55)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  borderRadius: 999,
                  border: `20px solid ${color}`,
                  background: "radial-gradient(circle at 36% 28%, #ffffff 0%, #fffaf0 22%, #f3e9d3 58%, #d9c9a4 100%)",
                }}
              >
                <span style={{ fontFamily: "Sign", fontSize: 20, letterSpacing: 6, color: C.ink }}>¿ECHO HOY?</span>
                <span style={{ fontFamily: "Script", fontSize: word.length > 4 ? 64 : 92, color, lineHeight: 1.15, paddingBottom: 10 }}>{word}</span>
              </div>
            </div>
            <div style={{ display: "flex", width: 120, height: 22, marginTop: -6, borderRadius: "0 0 10px 10px", background: "linear-gradient(90deg, #b9bec5, #f4f5f7 30%, #9aa0a8 55%, #e9ebee 80%, #aeb3ba)" }} />
          </div>

          {/* Rótulo */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <span style={{ fontFamily: "Sign", fontSize: 22, letterSpacing: 4, color: verdict ? color : C.red }}>{kicker}</span>
            <span style={{ fontFamily: "Sign", fontSize: !verdict ? 96 : title.length > 14 ? 96 : 128, lineHeight: 0.95, color: verdict ? color : C.ink, marginTop: 8, textShadow: "3px 4px 0 rgba(0,0,0,0.12)" }}>
              {title}
            </span>

            {station && price ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 26,
                  padding: "14px 22px",
                  borderRadius: 18,
                  background: C.canopy,
                  border: `3px solid ${C.gold}`,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: "Sign", fontSize: 16, letterSpacing: 4, color: C.gold }}>DONDE MÁS TE CONVIENE</span>
                  <span style={{ fontFamily: "Script", fontSize: 50, color: C.cream, lineHeight: 1.15, paddingBottom: 6 }}>{station}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 6, borderRadius: 8, background: "linear-gradient(180deg, #ffffff, #9aa0a8 50%, #e9ebee)" }}>
                  {[...price].map((c, i) =>
                    c === "," ? (
                      <span key={i} style={{ fontFamily: "Sign", fontSize: 44, color: "#1b1d21", width: 12, display: "flex", justifyContent: "center" }}>,</span>
                    ) : (
                      <span
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          width: 42,
                          height: 62,
                          borderRadius: 4,
                          background: "linear-gradient(180deg, #000 0%, #2a261e 25%, #14110d 55%, #000 100%)",
                          color: "#f6efdc",
                          fontFamily: "Sign",
                          fontSize: 50,
                        }}
                      >
                        {c}
                      </span>
                    ),
                  )}
                  <span style={{ fontFamily: "Sign", fontSize: 22, color: "#1b1d21", marginLeft: 6 }}>€/L</span>
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 28, color: C.muted, marginTop: 22, lineHeight: 1.35 }}>
                Precios de todas las gasolineras de España. Dónde repostar cerca de ti.
              </span>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, fontFamily: "Sign", fontSize: 20, letterSpacing: 3, color: C.muted }}>
              <span>{date ? date.toUpperCase() : "PRECIOS OFICIALES DEL MINISTERIO"}</span>
              <span style={{ color: C.red }}>JEVSOLINERA.VERCEL.APP</span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Script", data: script, style: "normal", weight: 400 },
        { name: "Sign", data: sign, style: "normal", weight: 800 },
        { name: "Body", data: body, style: "normal", weight: 500 },
      ],
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
