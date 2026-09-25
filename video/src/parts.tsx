import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, ease, F } from "./theme";

// ---------- Fondo: papel esmaltado con grano ----------
export const Paper: React.FC<{ color?: string; children?: React.ReactNode }> = ({ color = C.bg, children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: color,
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .1 0 0 0 0 .14 0 0 0 0 .22 0 0 0 .08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
    }}
  >
    {children}
  </AbsoluteFill>
);

// ---------- Estrella Googie ----------
const starPoints = Array.from({ length: 32 }, (_, i) => {
  const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
  const r = i % 4 === 0 ? 50 : i % 2 === 0 ? 26 : 9;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

export const Starburst: React.FC<{ size: number; fill?: string; core?: string; spin?: number }> = ({
  size,
  fill = C.gold,
  core = C.red,
  spin = 0,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ rotate: `${spin}deg`, flex: "none" }}>
    <polygon points={starPoints} fill={fill} />
    <circle cx="50" cy="50" r="7" fill={core} />
  </svg>
);

// ---------- Marquesina con franjas ----------
export const Canopy: React.FC<{ right?: string }> = ({ right }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      <div
        style={{
          height: 132,
          background: `linear-gradient(180deg, rgba(255,255,255,0.06), transparent 40%), ${C.canopy}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 64px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Starburst size={64} spin={frame * 0.4} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontFamily: F.script, fontSize: 60, color: C.cream, textShadow: `3px 4px 0 ${C.red}`, paddingBottom: 6 }}>
              jevsolinera
            </span>
            <span style={{ fontFamily: F.sign, fontWeight: 700, fontSize: 17, letterSpacing: 6, color: C.gold }}>
              ESTACIÓN DE SERVICIO · EST. 2026
            </span>
          </div>
        </div>
        {right && <span style={{ fontFamily: F.sign, fontWeight: 800, fontSize: 30, letterSpacing: 4, color: C.cream }}>{right}</span>}
      </div>
      <div style={{ height: 9, background: C.red }} />
      <div style={{ height: 4, background: C.cream }} />
      <div style={{ height: 5, background: C.red }} />
    </div>
  );
};

// ---------- Contador de rodillo que gira de un valor a otro ----------
export const Reels: React.FC<{ from: string; to: string; start: number; duration: number; h?: number }> = ({
  from,
  to,
  start,
  duration,
  h = 120,
}) => {
  const frame = useCurrentFrame();
  const chars = [...to];
  const fromChars = [...from.padStart(to.length, "0")];
  return (
    <div style={{ display: "flex", gap: h * 0.06, padding: h * 0.1, borderRadius: h * 0.14, background: C.chrome, boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }}>
      {chars.map((c, i) => {
        if (!/\d/.test(c))
          return (
            <span key={i} style={{ alignSelf: "flex-end", width: h * 0.2, textAlign: "center", fontFamily: F.sign, fontWeight: 800, fontSize: h * 0.75, lineHeight: 1, color: "#1b1d21" }}>
              {c}
            </span>
          );
        const a = Number(/\d/.test(fromChars[i]) ? fromChars[i] : 0);
        const b = Number(c);
        // Cada rodillo da una vuelta extra y se para escalonado, como un surtidor.
        const target = b + 10;
        const pos = interpolate(frame, [start + i * 3, start + duration + i * 5], [a, target], { ...clamp, easing: ease.out });
        const digits = Array.from({ length: 22 }, (_, k) => k % 10);
        return (
          <div key={i} style={{ position: "relative", width: h * 0.66, height: h, overflow: "hidden", borderRadius: 4, background: "#121009" }}>
            <div style={{ translate: `0 ${-pos * h}px` }}>
              {digits.map((n, k) => (
                <div key={k} style={{ height: h, lineHeight: `${h}px`, textAlign: "center", fontFamily: F.sign, fontWeight: 700, fontSize: h * 0.84, color: "#f6efdc" }}>
                  {n}
                </div>
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(255,255,255,0.12) 22%, transparent 45%, transparent 60%, rgba(0,0,0,0.8) 100%)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

// ---------- Sello de tinta que cae sobre el papel ----------
export const Stamp: React.FC<{ text: string; sub?: string; color: string; at: number; rotate?: number; size?: number }> = ({
  text,
  sub,
  color,
  at,
  rotate = -8,
  size = 40,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: `${size * 0.2}px ${size * 0.4}px ${size * 0.14}px`,
        border: `${size * 0.09}px solid ${color}`,
        outline: `2px solid ${color}`,
        outlineOffset: size * 0.08,
        borderRadius: 8,
        color,
        fontFamily: F.sign,
        fontWeight: 800,
        letterSpacing: size * 0.12,
        textTransform: "uppercase",
        lineHeight: 1,
        mixBlendMode: "multiply",
        opacity: interpolate(frame, [at, at + 4], [0, 0.9], clamp),
        scale: interpolate(frame, [at, at + 6], [2.2, 1], { ...clamp, easing: ease.out }),
        rotate: `${rotate}deg`,
        flex: "none",
      }}
    >
      <span style={{ fontSize: size }}>{text}</span>
      {sub && <span style={{ fontSize: size * 0.6, marginTop: size * 0.12, letterSpacing: size * 0.05 }}>{sub}</span>}
    </div>
  );
};

// ---------- Globo de surtidor ----------
export const Globe: React.FC<{ word: string; color: string; size?: number; glow?: number }> = ({ word, color, size = 420, glow = 0 }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        padding: size * 0.05,
        background: C.chrome,
        boxShadow: `0 30px 50px -24px rgba(0,0,0,0.6), 0 0 ${120 * glow}px ${30 * glow}px rgba(255, 214, 150, ${0.45 * glow})`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 36% 28%, #ffffff 0%, #fffaf0 22%, #f3e9d3 58%, #d9c9a4 100%)",
          boxShadow: `inset 0 0 0 ${size * 0.05}px ${color}, inset 0 0 0 ${size * 0.058}px rgba(255,255,255,0.7)`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "20%",
            top: "11%",
            width: "36%",
            height: "20%",
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(255,255,255,0.95), transparent 70%)",
            rotate: "-24deg",
          }}
        />
        <span style={{ fontFamily: F.sign, fontWeight: 800, fontSize: size * 0.06, letterSpacing: size * 0.014, color: C.ink }}>¿ECHO HOY?</span>
        <span style={{ fontFamily: F.script, fontSize: size * (word.length > 4 ? 0.19 : 0.26), lineHeight: 1.15, color, paddingBottom: size * 0.03, whiteSpace: "nowrap" }}>
          {word}
        </span>
      </div>
    </div>
    <div style={{ width: size * 0.42, height: size * 0.07, marginTop: -size * 0.02, borderRadius: "0 0 14px 14px", background: "linear-gradient(90deg, #b9bec5, #f4f5f7 30%, #9aa0a8 55%, #e9ebee 80%, #aeb3ba)" }} />
  </div>
);

// ---------- Entradas ----------
export const useIn = (at: number, dur = 18) => {
  const frame = useCurrentFrame();
  return {
    opacity: interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing: ease.out }),
    translate: `0 ${interpolate(frame, [at, at + dur], [40, 0], { ...clamp, easing: ease.out })}px`,
  } as const;
};
