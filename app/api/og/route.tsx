import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// Tarjeta para compartir (1200×630): el surtidor completo delante de la marquesina, con el
// veredicto en el globo y, si viene en la URL, la gasolinera y su precio en los contadores.
// Sin parámetros: la tarjeta genérica de la web.

const C = {
  canopy: "#16213a",
  cream: "#fbf5e6",
  bg: "#ede3cc",
  red: "#a8251c",
  redDeep: "#7c1911",
  gold: "#c9a55b",
  ink: "#18223a",
  muted: "#6b6454",
  chrome: "linear-gradient(180deg, #ffffff 0%, #dfe2e6 22%, #9aa0a8 48%, #eef0f2 62%, #b3b8bf 82%, #e9ebee 100%)",
  chromeH: "linear-gradient(90deg, #b9bec5, #f4f5f7 30%, #9aa0a8 55%, #e9ebee 80%, #aeb3ba)",
};
const VERDICT = {
  today: { color: "#a8251c", word: "Hoy", title: "LLENA HOY", withDate: ["LLENA ANTES", "DEL"] },
  partial: { color: "#c07d14", word: "Lo justo", title: "ECHA LO JUSTO", withDate: null },
  wait: { color: "#276f60", word: "Espera", title: "ESPERA", withDate: ["ESPERA", "AL"] },
  any: { color: "#2b3f66", word: "Da igual", title: "HOY DA IGUAL", withDate: null },
} as const;
const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const FUEL: Record<string, { label: string; big: string; small: string; color: string }> = {
  g95: { label: "Gasolina 95", big: "95", small: "GASOLINA", color: "#2f7a3e" },
  g98: { label: "Gasolina 98", big: "98", small: "GASOLINA", color: "#1d4a2c" },
  diesel: { label: "Diésel", big: "DIÉSEL", small: "GASÓLEO A", color: "#1b1b1b" },
  dieselp: { label: "Diésel Premium", big: "DIÉSEL+", small: "PREMIUM", color: "#2b2620" },
  glp: { label: "GLP", big: "GLP", small: "AUTOGÁS", color: "#1f5a9e" },
};

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

/** Contador de rodillo: cada cifra en su ventanita negra, dentro de un marco cromado. */
function Reels({ text, h }: { text: string; h: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: h * 0.07, padding: h * 0.1, borderRadius: h * 0.14, background: C.chrome }}>
      {[...text].map((c, i) =>
        /[\d-]/.test(c) ? (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: h * 0.66,
              height: h,
              borderRadius: 3,
              background: "linear-gradient(180deg, #000 0%, #2a261e 22%, #14110d 55%, #000 100%)",
              color: "#f6efdc",
              fontFamily: "Sign",
              fontSize: h * 0.82,
            }}
          >
            {c === "-" ? "" : c}
          </div>
        ) : (
          <div key={i} style={{ display: "flex", width: h * 0.2, justifyContent: "center", fontFamily: "Sign", fontSize: h * 0.7, lineHeight: 1, color: "#1b1d21" }}>
            {c}
          </div>
        ),
      )}
    </div>
  );
}

const Label = ({ children, size = 11, color = C.gold }: { children: string; size?: number; color?: string }) => (
  <div style={{ display: "flex", fontFamily: "Sign", fontSize: size, letterSpacing: size * 0.26, color }}>{children}</div>
);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const v = q.get("v");
  const verdict = v === "today" || v === "partial" || v === "wait" || v === "any" ? VERDICT[v] : null;
  const ev = /^\d{4}-\d{2}-\d{2}$/.test(q.get("e") ?? "") ? q.get("e")! : null;
  const fuel = FUEL[q.get("f") ?? ""] ?? null;
  const grade = fuel ?? FUEL.g95;
  const priceNum = Number(q.get("p"));
  const hasPrice = priceNum > 0 && priceNum < 10;
  const station = clean(q.get("s"), 24);
  const zone = clean(q.get("z"), 32);
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") ?? "") ? q.get("d")! : null;
  const date = dateIso
    ? new Date(`${dateIso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  const word = verdict?.word ?? "¿?";
  // El titular en líneas decididas a mano, para que la fecha no quede partida.
  const lines: string[] = verdict
    ? ev && verdict.withDate
      ? [verdict.withDate[0], `${verdict.withDate[1]} ${Number(ev.slice(8, 10))} DE ${MONTHS[Number(ev.slice(5, 7)) - 1]}`]
      : [verdict.title]
    : ["¿LLENO HOY", "O ESPERO?"];
  const longest = Math.max(...lines.map((l) => l.length));
  const color = verdict?.color ?? "#9a8f78";
  const kicker = verdict ? ["La decisión de hoy", fuel?.label, zone].filter(Boolean).join(" · ").toUpperCase() : "PRECIOS OFICIALES · DECISIÓN CON IA";
  const total = hasPrice ? (priceNum * 40).toFixed(2).replace(".", ",") : "--,--";
  const price = hasPrice ? priceNum.toFixed(3).replace(".", ",") : "-,---";

  // Subconjunto de glifos: alfabeto completo (los nombres de gasolinera son arbitrarios).
  const glyphs = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚÜÇabcdefghijklmnñopqrstuvwxyzáéíóúüç0123456789·¿?¡!,.:;/€'&()+- ";
  const [script, sign, body] = await Promise.all([
    font("Yellowtail", glyphs),
    font("Big+Shoulders:wght@800", glyphs),
    font("DM+Sans:wght@500", glyphs),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: C.bg, fontFamily: "Body" }}>
        {/* Marquesina a todo el ancho, detrás del surtidor */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", height: 118, padding: "0 56px", background: C.canopy }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {star(58, C.gold, C.red)}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "Script", fontSize: 58, color: C.cream, textShadow: `3px 4px 0 ${C.red}`, lineHeight: 1 }}>jevsolinera</span>
                <span style={{ fontFamily: "Sign", fontSize: 16, letterSpacing: 6, color: C.gold, marginTop: 6 }}>ESTACIÓN DE SERVICIO · EST. 2026</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", height: 8, background: C.red }} />
          <div style={{ display: "flex", height: 4, background: C.cream }} />
          <div style={{ display: "flex", height: 5, background: C.red }} />
        </div>

        {/* El surtidor */}
        <div style={{ position: "absolute", left: 70, top: 22, width: 262, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Globo */}
          <div style={{ display: "flex", width: 196, height: 196, borderRadius: 999, padding: 10, background: C.chrome, boxShadow: "0 16px 26px -12px rgba(0,0,0,0.55)" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                borderRadius: 999,
                border: `13px solid ${color}`,
                background: "radial-gradient(circle at 36% 28%, #ffffff 0%, #fffaf0 22%, #f3e9d3 58%, #d9c9a4 100%)",
              }}
            >
              <span style={{ fontFamily: "Sign", fontSize: 13, letterSpacing: 3, color: C.ink }}>¿ECHO HOY?</span>
              <span style={{ fontFamily: "Script", fontSize: word.length > 4 ? 36 : 52, color, lineHeight: 1.15, paddingBottom: 6 }}>{word}</span>
            </div>
          </div>
          <div style={{ display: "flex", width: 76, height: 14, marginTop: -4, borderRadius: "0 0 8px 8px", background: C.chromeH }} />

          {/* Cuerpo con moldura cromada */}
          <div style={{ display: "flex", flexDirection: "column", width: 262, marginTop: -2, padding: 5, borderRadius: "32px 32px 12px 12px", background: C.chrome, boxShadow: "0 22px 40px -22px rgba(24,34,58,0.7)" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "9px 10px 7px", borderRadius: "27px 27px 0 0", background: `linear-gradient(180deg, #c1362b, ${C.red} 40%, ${C.redDeep})` }}>
              <span style={{ fontFamily: "Script", fontSize: 25, color: C.cream, lineHeight: 1.1 }}>jevsolinera</span>
              <Label size={8} color="rgba(251,245,230,0.8)">MODELO 505 · SERVICIO COMPLETO</Label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px 11px", background: "radial-gradient(ellipse at 50% 0%, #2a3552, #111827 70%)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <Label size={9}>TOTAL A PAGAR · €</Label>
                <Reels text={total} h={36} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Label size={9}>LITROS</Label>
                  <Reels text="40" h={24} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Label size={9}>€ / LITRO</Label>
                  <Reels text={price} h={24} />
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 8,
                padding: "6px 8px 5px",
                background: `linear-gradient(180deg, ${grade.color}bb, ${grade.color} 45%)`,
                color: C.cream,
              }}
            >
              <span style={{ fontFamily: "Sign", fontSize: 21, lineHeight: 1 }}>{grade.big}</span>
              <Label size={10} color={C.cream}>
                {grade.small}
              </Label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "9px 10px 12px", background: `linear-gradient(180deg, ${C.cream}, #efe4ca)` }}>
              <Label size={9} color={C.red}>
                {station ? "DONDE MÁS TE CONVIENE" : "LA MÁS BARATA CERCA DE TI"}
              </Label>
              <span style={{ fontFamily: "Script", fontSize: station && station.length > 12 ? 26 : 32, color: C.red, lineHeight: 1.2, paddingBottom: 2 }}>
                {station || "jevsolinera"}
              </span>
              <span style={{ fontFamily: "Body", fontSize: 12, color: "#5d5647" }}>{zone || "Precios oficiales del Ministerio"}</span>
            </div>
            <div style={{ display: "flex", height: 13, borderRadius: "0 0 9px 9px", background: "linear-gradient(180deg, #2b2f36, #111317)" }} />
          </div>

          {/* Manguera y boquerel */}
          <svg width="44" height="264" viewBox="0 0 70 420" style={{ position: "absolute", right: -26, top: 262 }}>
            <path d="M40 78 C 70 150, 66 300, 34 392 C 28 408, 12 414, 2 410" fill="none" stroke="#15171b" strokeWidth="9" strokeLinecap="round" />
            <rect x="0" y="36" width="16" height="62" rx="4" fill="#9aa0a8" />
            <path d="M12 44 h24 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 h-6 l-3 10 h-9 l2 -10 h-8 z" fill="#1c1e22" />
          </svg>
        </div>

        {/* El mensaje */}
        <div style={{ position: "absolute", left: 400, right: 56, top: 158, bottom: 40, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontFamily: "Sign", fontSize: 22, letterSpacing: 4, color: verdict ? color : C.red }}>{kicker}</span>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
            {lines.map((l) => (
              <span key={l} style={{ fontFamily: "Sign", fontSize: longest > 14 ? 104 : 116, lineHeight: 1.02, color: verdict ? color : C.ink, textShadow: "3px 4px 0 rgba(0,0,0,0.12)" }}>
                {l}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 28, color: C.muted, marginTop: 20, lineHeight: 1.35 }}>
            {verdict && station && hasPrice
              ? `${grade.label} a ${priceNum.toFixed(3).replace(".", ",")} €/L en ${station}. Precios oficiales y noticias leídas por Jev.`
              : "Precios de todas las gasolineras de España. Dónde repostar cerca de ti, y si compensa esperar."}
          </span>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 26, fontFamily: "Sign", fontSize: 20, letterSpacing: 3, color: C.muted }}>
            <span>{date ? date.toUpperCase() : "EXPERIMENTO CON JEV DE TYPESAFE AI"}</span>
            <span style={{ color: C.red }}>JEVSOLINERA.VERCEL.APP</span>
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
