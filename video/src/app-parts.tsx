import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Globe, Reels } from "./parts";
import { C, clamp, ease, F } from "./theme";

// ---------- El móvil con la web real (captura en public/app.png, 390 px CSS de ancho, @2x) ----------

export interface ScrollStop {
  at: number; // frame en el que empieza a moverse
  to: number; // px CSS de la página
  dur?: number;
}

export const Phone: React.FC<{ width: number; stops: ScrollStop[]; taps?: { at: number; x: number; y: number }[] }> = ({
  width,
  stops,
  taps = [],
}) => {
  const frame = useCurrentFrame();
  const k = width / 390; // px de pantalla por px CSS
  const height = Math.round(844 * k);
  // Desplazamiento encadenado: cada parada parte de la anterior.
  let y = 0;
  for (const s of stops) y = interpolate(frame, [s.at, s.at + (s.dur ?? 34)], [y, s.to], { ...clamp, easing: ease.inOut });
  const bezel = 14;

  return (
    <div
      style={{
        position: "relative",
        padding: bezel,
        borderRadius: 64,
        background: "linear-gradient(145deg, #2a2d33, #0c0d10 55%, #1d2026)",
        boxShadow: "0 40px 70px -30px rgba(0,0,0,0.65), inset 0 0 0 2px #3a3e45",
        flex: "none",
      }}
    >
      <div style={{ position: "relative", width, height, borderRadius: 50, overflow: "hidden", background: C.bg }}>
        <Img src={staticFile("app.png")} style={{ width, display: "block", translate: `0 ${-y * k}px` }} />
        {/* Isla dinámica */}
        <div style={{ position: "absolute", top: 12, left: "50%", width: 104, height: 30, marginLeft: -52, borderRadius: 20, background: "#000" }} />
        {taps.map((t, i) => {
          const p = interpolate(frame, [t.at, t.at + 18], [0, 1], clamp);
          if (p <= 0 || p >= 1) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: t.x * k - 40,
                top: (t.y - y) * k - 40,
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.55)",
                border: "3px solid rgba(24,34,58,0.5)",
                scale: interpolate(p, [0, 1], [0.3, 1.4]),
                opacity: interpolate(p, [0, 0.3, 1], [0, 1, 0]),
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

// ---------- El surtidor completo, como en la web ----------

const Label: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size = 15, color = C.gold }) => (
  <span style={{ fontFamily: F.sign, fontWeight: 700, fontSize: size, letterSpacing: size * 0.26, color, textTransform: "uppercase" }}>{children}</span>
);

export const FullPump: React.FC<{ start?: number; glow?: number }> = ({ start = 0, glow = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "relative", width: 390, display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
      <Globe word="Hoy" color={C.red} size={270} glow={glow} />
      <div
        style={{
          width: 390,
          marginTop: -6,
          padding: 7,
          borderRadius: "46px 46px 18px 18px",
          background: C.chrome,
          boxShadow: "0 30px 60px -34px rgba(24,34,58,0.7)",
        }}
      >
        {/* Cabeza roja */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "14px 16px 10px",
            borderRadius: "40px 40px 0 0",
            background: `linear-gradient(180deg, #c1362b, ${C.red} 40%, ${C.redDeep})`,
          }}
        >
          <span style={{ fontFamily: F.script, fontSize: 36, lineHeight: 1.1, color: C.cream, textShadow: "1px 2px 0 rgba(0,0,0,0.25)", paddingBottom: 2 }}>jevsolinera</span>
          <Label size={12} color="rgba(251,245,230,0.8)">Modelo 505 · Servicio completo</Label>
        </div>
        {/* Esfera con los contadores */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "14px 18px 16px",
            background: "radial-gradient(ellipse at 50% 0%, #2a3552, #111827 70%)",
            borderTop: "3px solid #0a0f1a",
            borderBottom: "3px solid #0a0f1a",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <Label>Total a pagar · €</Label>
            <Reels from="00,00" to="75,16" start={start + 10} duration={45} h={58} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Label>Litros</Label>
              <Reels from="00" to="40" start={start + 4} duration={30} h={38} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Label>€ / litro</Label>
              <Reels from="0,000" to="1,879" start={start + 6} duration={40} h={38} />
            </div>
          </div>
        </div>
        {/* Placa del combustible */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 12,
            padding: "8px 12px 6px",
            background: "linear-gradient(180deg, #6fa77b, #2f7a3e 40%, #245f30)",
            color: C.cream,
          }}
        >
          <span style={{ fontFamily: F.sign, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>95</span>
          <Label size={13} color={C.cream}>Gasolina</Label>
        </div>
        {/* La gasolinera */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: "14px 18px 18px",
            background: `linear-gradient(180deg, ${C.cream}, #efe4ca)`,
            opacity: interpolate(frame, [start + 30, start + 46], [0, 1], clamp),
          }}
        >
          <Label size={14} color={C.red}>Donde más te conviene</Label>
          <span style={{ fontFamily: F.script, fontSize: 48, lineHeight: 1.15, color: C.red, paddingBottom: 2 }}>Ballenoil</span>
          <span style={{ fontFamily: F.body, fontSize: 19, color: "#5d5647" }}>Chamberí · 2,5 km · abierta 24 h</span>
          <span style={{ fontFamily: F.body, fontSize: 19, color: C.ink }}>
            Ahorras <b style={{ color: C.wait }}>5,84 €</b> frente a la media
          </span>
        </div>
        <div style={{ height: 20, borderRadius: "0 0 12px 12px", background: "linear-gradient(180deg, #2b2f36, #111317)" }} />
      </div>
      {/* Manguera y boquerel */}
      <svg viewBox="0 0 70 420" style={{ position: "absolute", right: -40, top: 400, width: 66, overflow: "visible" }}>
        <path d="M40 78 C 70 150, 66 300, 34 392 C 28 408, 12 414, 2 410" fill="none" stroke="#15171b" strokeWidth={9} strokeLinecap="round" />
        <rect x="0" y="36" width="16" height="62" rx="4" fill="#9aa0a8" />
        <path d="M12 44 h24 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 h-6 l-3 10 h-9 l2 -10 h-8 z" fill="#1c1e22" />
        <path d="M12 50 h-8 a3 3 0 0 0 0 6 h8 z" fill="#c9ccd1" />
      </svg>
    </div>
  );
};
