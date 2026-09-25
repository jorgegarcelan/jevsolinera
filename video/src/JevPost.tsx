import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { FullPump, Phone } from "./app-parts";
import { Canopy, Paper, Reels, Stamp, Starburst, useIn } from "./parts";
import { C, clamp, ease, F } from "./theme";

// Post para X: "Quería probar Jev, el nuevo modelo de TypeSafe, con algo de actualidad".
// 1080×1080, 30 fps, sin audio (X reproduce en silencio): todo se cuenta con texto.
// Los datos son los de la prueba real (scripts/backtest.ts) y de la web el 25/09/2026.

export const SCENES = { hook: 120, context: 150, app: 285, reads: 225, try1: 170, try2: 215, today: 190, outro: 110 };
const T = 12; // frames de cada transición
export const DURATION = Object.values(SCENES).reduce((a, b) => a + b, 0) - T * (Object.keys(SCENES).length - 1);

const SIDE = 84;
const TOP = 190; // bajo la marquesina

const Kicker: React.FC<{ children: React.ReactNode; color?: string; at?: number }> = ({ children, color = C.red, at = 0 }) => (
  <div style={{ fontFamily: F.sign, fontWeight: 800, fontSize: 34, letterSpacing: 7, textTransform: "uppercase", color, ...useIn(at) }}>
    {children}
  </div>
);

const Column: React.FC<{ children: React.ReactNode; gap?: number; center?: boolean; top?: number }> = ({ children, gap = 28, center, top = TOP }) => (
  <AbsoluteFill
    style={{
      padding: `${top}px ${SIDE}px 90px`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: center ? "center" : "flex-start",
      textAlign: center ? "center" : "left",
      gap,
    }}
  >
    {children}
  </AbsoluteFill>
);

// ---------- 1. Gancho ----------
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const words = ["¿ECHO", "GASOLINA", "HOY", "O ESPERO?"];
  return (
    <Paper>
      <Column gap={34}>
        <Kicker at={0}>Un experimento con IA</Kicker>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 42, fontFamily: F.sign, fontWeight: 900, fontSize: 150, lineHeight: 0.9, color: C.ink }}>
          {words.map((w, i) => (
            <span
              key={w}
              style={{
                // Visible desde el fotograma 0 (es la miniatura en X); solo un leve asentamiento.
                scale: interpolate(frame, [0, 24 + i * 4], [1.06, 1], { ...clamp, easing: ease.out }),
                color: w === "HOY" ? C.red : C.ink,
              }}
            >
              {w}
            </span>
          ))}
        </div>
        <div style={{ fontFamily: F.body, fontSize: 46, lineHeight: 1.3, color: C.ink, maxWidth: 880, ...useIn(52) }}>
          He probado <b style={{ color: C.red }}>Jev</b>, el nuevo modelo de TypeSafe AI, con el tema del momento.
        </div>
        {/* Aviso: visible desde el fotograma 0, así también sale en la miniatura de X */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "12px 24px 10px 18px",
            borderRadius: 14,
            border: `3px solid ${C.red}`,
            outline: `1.5px solid ${C.red}`,
            outlineOffset: 4,
            background: "rgba(168,37,28,0.06)",
            color: C.red,
            fontFamily: F.sign,
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: 4,
          }}
        >
          <svg width="40" height="36" viewBox="0 0 40 36" style={{ flex: "none" }}>
            <path d="M20 3 L37 33 H3 Z" fill="none" stroke={C.red} strokeWidth="4" strokeLinejoin="round" />
            <rect x="18" y="13" width="4" height="10" rx="1.5" fill={C.red} />
            <circle cx="20" cy="27.5" r="2.4" fill={C.red} />
          </svg>
          ES UN EXPERIMENTO, NO UN CONSEJO
        </div>
      </Column>
    </Paper>
  );
};

// ---------- 2. Actualidad ----------
const Context: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Paper>
      <Column center gap={30}>
        <Kicker at={0}>La actualidad</Kicker>
        <div style={useIn(6)}>
          <Reels from="1,819" to="2,027" start={14} duration={60} h={170} />
        </div>
        <div style={{ fontFamily: F.sign, fontWeight: 700, fontSize: 34, letterSpacing: 6, color: C.muted, ...useIn(16) }}>€ / LITRO · GASOLINA 95 · MADRID</div>
        <div
          style={{
            fontFamily: F.sign,
            fontWeight: 900,
            fontSize: 120,
            lineHeight: 1,
            color: C.red,
            textShadow: "3px 4px 0 rgba(0,0,0,0.12)",
            opacity: interpolate(frame, [70, 82], [0, 1], clamp),
            scale: interpolate(frame, [70, 86], [1.4, 1], { ...clamp, easing: ease.out }),
          }}
        >
          {"+11,6\u00a0% EN UN MES"}
        </div>
      </Column>
    </Paper>
  );
};

// ---------- La app: el móvil con la web real ----------
const APP_STEPS = [
  { from: 0, to: 88, n: "1", title: "Dile dónde estás y qué le pones" },
  { from: 88, to: 190, n: "2", title: "Cuánto te cuesta llenar en la más barata" },
  { from: 190, to: 999, n: "3", title: "Y el veredicto de Jev, con las noticias que lo prueban" },
];

const AppScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Paper>
      <AbsoluteFill style={{ padding: `${TOP - 20}px ${SIDE - 20}px 40px ${SIDE}px`, display: "flex", flexDirection: "row", alignItems: "center", gap: 44 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 26 }}>
          <Kicker at={0}>La app</Kicker>
          <div style={{ position: "relative", height: 420 }}>
            {APP_STEPS.map((st) => (
              <div
                key={st.n}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                  opacity: interpolate(frame, [st.from + 4, st.from + 16, st.to - 6, st.to + 4], [0, 1, 1, 0], clamp),
                  translate: `0 ${interpolate(frame, [st.from + 4, st.from + 20], [30, 0], { ...clamp, easing: ease.out })}px`,
                }}
              >
                <span
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: "50%",
                    background: C.ink,
                    color: C.cream,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: F.sign,
                    fontWeight: 900,
                    fontSize: 48,
                  }}
                >
                  {st.n}
                </span>
                <span style={{ fontFamily: F.sign, fontWeight: 900, fontSize: 76, lineHeight: 0.95, color: C.ink, textTransform: "uppercase" }}>{st.title}</span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: F.sign, fontWeight: 700, fontSize: 32, letterSpacing: 4, color: C.muted, ...useIn(10) }}>JEVSOLINERA.VERCEL.APP</div>
        </div>
        <div style={{ opacity: interpolate(frame, [0, 16], [0, 1], clamp), translate: `0 ${interpolate(frame, [0, 26], [120, 0], { ...clamp, easing: ease.out })}px` }}>
          <Phone
            width={352}
            taps={[
              { at: 26, x: 160, y: 285 },
              { at: 54, x: 90, y: 510 },
            ]}
            stops={[
              { at: 92, to: 1085, dur: 44 },
              { at: 196, to: 1995, dur: 40 },
            ]}
          />
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

// ---------- 3. Jev lee la prensa ----------
const CLIPS = [
  {
    source: "RTVE · hace 11 h",
    title: "Gasolina y diésel siguen subiendo: ¿hay que llenar el depósito antes del 1 de octubre?",
    stamp: { text: "Sube", sub: "99 %", color: C.red },
    tag: "Aviso · 1 de octubre",
  },
  {
    source: "Infobae · hace 8 h",
    title: "Este es el precio de la gasolina este 25 de septiembre en Madrid, Barcelona y otras ciudades",
    stamp: { text: "Neutro", sub: "95 %", color: "#5f5a50" },
  },
  {
    source: "Autoio · hace 4 h",
    title: "Probamos el GWM ORA 5: opinión, precios y gama del SUV gasolina, híbrido y eléctrico",
    stamp: { text: "No va del surtidor", sub: "90 %", color: "#5f5a50" },
    dim: true,
  },
];

const Reads: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Paper color={C.paper}>
      <AbsoluteFill style={{ padding: `${TOP - 24}px ${SIDE}px 56px`, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center", borderBottom: `4px double ${C.ink}`, paddingBottom: 10, ...useIn(0, 14) }}>
          <div style={{ fontFamily: F.news, fontWeight: 900, fontSize: 62, lineHeight: 1.05, color: "#1d1a15" }}>El Heraldo del Surtidor</div>
          <div style={{ fontFamily: F.sign, fontWeight: 800, fontSize: 30, letterSpacing: 6, color: C.red, marginTop: 6 }}>JEV LEE CADA TITULAR</div>
        </div>
        {CLIPS.map((c, i) => {
          const at = 16 + i * 38;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                paddingBottom: 14,
                borderBottom: "1.5px solid rgba(29,26,21,0.3)",
                ...useIn(at, 14),
              }}
            >
              <div style={{ flex: 1, opacity: c.dim ? 0.55 : 1 }}>
                <div style={{ fontFamily: F.sign, fontWeight: 700, fontSize: 24, letterSpacing: 4, color: "#6a6150", textTransform: "uppercase" }}>{c.source}</div>
                <div style={{ fontFamily: F.news, fontWeight: 700, fontSize: 35, lineHeight: 1.18, color: "#1d1a15" }}>{c.title}</div>
                {c.tag && (
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: 10,
                      padding: "4px 16px 2px",
                      borderRadius: 999,
                      background: C.red,
                      color: C.cream,
                      fontFamily: F.sign,
                      fontWeight: 800,
                      fontSize: 26,
                      letterSpacing: 3,
                      textTransform: "uppercase",
                      opacity: interpolate(frame, [at + 24, at + 30], [0, 1], clamp),
                    }}
                  >
                    {c.tag}
                  </div>
                )}
              </div>
              <Stamp text={c.stamp.text} sub={c.stamp.sub} color={c.stamp.color} at={at + 14} size={c.stamp.text.length > 8 ? 26 : 40} rotate={i % 2 ? 5 : -8} />
            </div>
          );
        })}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-around",
            borderTop: `2px solid ${C.ink}`,
            borderBottom: `2px solid ${C.ink}`,
            padding: "10px 0",
            ...useIn(150, 16),
          }}
        >
          {[
            ["84", "preguntas"],
            ["2,1 s", "en responder"],
            ["0,0004 $", "lo que cuesta"],
          ].map(([b, s]) => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontFamily: F.sign, fontWeight: 900, fontSize: 50, lineHeight: 1, color: C.red }}>{b}</span>
              <span style={{ fontFamily: F.news, fontStyle: "italic", fontSize: 28, color: "#4a4438" }}>{s}</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

// ---------- 4. Intento 1: predecir el precio ----------
const Bar: React.FC<{ label: string; value: number; color: string; at: number }> = ({ label, value, color, at }) => {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [at, at + 30], [0, value], { ...clamp, easing: ease.out });
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, ...useIn(at - 6, 12) }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sign, fontWeight: 800, fontSize: 44, letterSpacing: 2, color: C.ink, textTransform: "uppercase" }}>
        <span>{label}</span>
        <span style={{ color }}>{Math.round(w)} %</span>
      </div>
      <div style={{ height: 56, borderRadius: 999, padding: 6, background: C.chrome, boxShadow: "0 3px 8px rgba(0,0,0,0.25)" }}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: 999, background: color }} />
      </div>
    </div>
  );
};

const Try1: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Paper>
      <Column gap={34}>
        <Kicker>Intento 1</Kicker>
        <div style={{ fontFamily: F.sign, fontWeight: 900, fontSize: 92, lineHeight: 0.95, color: C.ink, ...useIn(4) }}>¿PUEDE PREDECIR EL PRECIO A 3 DÍAS?</div>
        <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: 30 }}>
          <Bar label="Jev + precios" value={75} color={C.red} at={30} />
          <Bar label="Llenar siempre, sin IA" value={82} color={C.canopy} at={52} />
          <div style={{ position: "absolute", right: 40, top: 92, display: "flex" }}>
            <Stamp text="Suspenso" color={C.red} at={96} size={56} rotate={-10} />
          </div>
        </div>
        <div style={{ fontFamily: F.body, fontSize: 44, lineHeight: 1.3, color: C.ink, opacity: interpolate(frame, [112, 128], [0, 1], clamp) }}>
          Las noticias cuentan lo que <b>ya ha pasado</b>. Con los precios subiendo, «llena hoy» acierta sin pensar.
        </div>
      </Column>
    </Paper>
  );
};

// ---------- 5. Intento 2: avisar de eventos con fecha ----------
const EVENTS = [
  ["1 AGO", "Suben impuestos", "+3,4 %"],
  ["1 SEP", "Rebaja al diésel", "−5,9 %"],
  ["1 SEP", "Sube la gasolina", "+3,8 %"],
];

const Try2: React.FC = () => {
  const frame = useCurrentFrame();
  const swap = 112;
  const listOut = interpolate(frame, [swap, swap + 14], [1, 0], clamp);
  return (
    <Paper>
      <Column gap={30}>
        <Kicker>Intento 2</Kicker>
        <div style={{ fontFamily: F.sign, fontWeight: 900, fontSize: 84, lineHeight: 0.95, color: C.ink, ...useIn(4) }}>
          QUE SOLO AVISE CUANDO SE ANUNCIA ALGO <span style={{ color: C.red }}>CON FECHA</span>
        </div>
        <div style={{ position: "relative", width: "100%", height: 390 }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 18, opacity: listOut }}>
            {EVENTS.map(([d, what, ch], i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  padding: "18px 26px",
                  borderRadius: 16,
                  background: C.paper,
                  border: `2px solid ${C.ink}`,
                  fontFamily: F.type,
                  fontSize: 38,
                  color: "#2a2620",
                  ...useIn(30 + i * 16, 12),
                }}
              >
                <b style={{ fontFamily: F.sign, fontWeight: 900, fontSize: 44, color: C.red, width: 150 }}>{d}</b>
                <span style={{ flex: 1 }}>{what}</span>
                <span>{ch}</span>
                <b style={{ fontSize: 48, color: C.wait }}>✓</b>
              </div>
            ))}
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 14,
              opacity: interpolate(frame, [swap + 8, swap + 22], [0, 1], clamp),
              scale: interpolate(frame, [swap + 8, swap + 26], [0.9, 1], { ...clamp, easing: ease.out }),
            }}
          >
            <div style={{ fontFamily: F.sign, fontWeight: 900, fontSize: 150, lineHeight: 0.9, color: C.wait }}>17 DE 17</div>
            <div style={{ fontFamily: F.sign, fontWeight: 800, fontSize: 48, letterSpacing: 3, color: C.ink }}>AVISOS CUMPLIDOS · ~4 € POR DEPÓSITO</div>
            <div style={{ fontFamily: F.body, fontSize: 34, color: C.muted }}>Con datos de los últimos 60 días. La prueba de verdad: el 1 de octubre.</div>
          </div>
        </div>
      </Column>
    </Paper>
  );
};

// ---------- 6. Hoy: el surtidor completo ----------
const Today: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Paper color="#e6dcc3">
      <AbsoluteFill style={{ padding: `${TOP - 30}px ${SIDE}px 30px ${SIDE - 20}px`, display: "flex", flexDirection: "row", alignItems: "center", gap: 70 }}>
        <div
          style={{
            opacity: interpolate(frame, [0, 14], [0, 1], clamp),
            translate: `0 ${interpolate(frame, [0, 30], [140, 0], { ...clamp, easing: ease.out })}px`,
            scale: 0.95,
          }}
        >
          <FullPump start={14} glow={interpolate(frame, [30, 70], [0, 1], clamp)} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 26 }}>
          <Kicker at={40}>Hoy, 25 de septiembre</Kicker>
          <div style={{ fontFamily: F.sign, fontWeight: 900, fontSize: 92, lineHeight: 0.92, color: C.red, textShadow: "3px 4px 0 rgba(0,0,0,0.12)", ...useIn(50) }}>
            LLENA ANTES DEL 1 DE OCTUBRE
          </div>
          <div style={{ fontFamily: F.body, fontSize: 38, lineHeight: 1.3, color: C.ink, ...useIn(72) }}>
            Jev lo da por seguro al {"94\u00a0%"}. <b>El 2 de octubre veremos si acierta.</b>
          </div>
        </div>
      </AbsoluteFill>
    </Paper>
  );
};

// ---------- 7. Cierre ----------
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.canopy, alignItems: "center", justifyContent: "center", gap: 26, display: "flex", flexDirection: "column" }}>
      <div style={{ opacity: interpolate(frame, [0, 14], [0, 1], clamp), scale: interpolate(frame, [0, 24], [0.6, 1], { ...clamp, easing: ease.pop }) }}>
        <Starburst size={170} spin={frame * 0.8} />
      </div>
      <div style={{ fontFamily: F.script, fontSize: 170, lineHeight: 1.1, color: C.cream, textShadow: `5px 6px 0 ${C.red}`, paddingBottom: 18, ...useIn(8) }}>jevsolinera</div>
      <div style={{ fontFamily: F.sign, fontWeight: 800, fontSize: 52, letterSpacing: 6, color: C.gold, ...useIn(22) }}>JEVSOLINERA.VERCEL.APP</div>
      <div style={{ fontFamily: F.body, fontSize: 32, color: "rgba(251,245,230,0.75)", ...useIn(34) }}>Precios oficiales del Ministerio · Jev de TypeSafe AI</div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ height: 5, background: C.red }} />
        <div style={{ height: 4, background: C.cream }} />
        <div style={{ height: 12, background: C.red }} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- Montaje ----------
export const JevPost: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const outroStart = durationInFrames - SCENES.outro;
  const t = linearTiming({ durationInFrames: T });
  return (
    <AbsoluteFill style={{ background: C.canopy }}>
      <TransitionSeries>
        <TransitionSeries.Sequence name="Gancho" durationInFrames={SCENES.hook}>
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={t} />
        <TransitionSeries.Sequence name="Actualidad" durationInFrames={SCENES.context}>
          <Context />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={t} />
        <TransitionSeries.Sequence name="La app" durationInFrames={SCENES.app}>
          <AppScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={t} />
        <TransitionSeries.Sequence name="Jev lee la prensa" durationInFrames={SCENES.reads}>
          <Reads />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={t} />
        <TransitionSeries.Sequence name="Intento 1" durationInFrames={SCENES.try1}>
          <Try1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={wipe({ direction: "from-right" })} timing={t} />
        <TransitionSeries.Sequence name="Intento 2" durationInFrames={SCENES.try2}>
          <Try2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence name="Hoy" durationInFrames={SCENES.today}>
          <Today />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence name="Cierre" durationInFrames={SCENES.outro}>
          <Outro />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {/* La marquesina acompaña todo el vídeo salvo el cierre */}
      <Sequence name="Marquesina" durationInFrames={outroStart} layout="none">
        <MarqueeIn />
      </Sequence>
    </AbsoluteFill>
  );
};

const MarqueeIn: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], clamp),
      }}
    >
      <Canopy right="¿ECHO HOY?" />
    </div>
  );
};
