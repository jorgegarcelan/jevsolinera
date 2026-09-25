"use client";

export const TANKS = [
  { id: "reserva", short: "R", label: "En reserva", angle: -72 },
  { id: "cuarto", short: "¼", label: "Un cuarto", angle: -40 },
  { id: "medio", short: "½", label: "Medio", angle: 0 },
  { id: "lleno", short: "¾", label: "3/4 o más", angle: 46 },
] as const;
export type TankId = (typeof TANKS)[number]["id"];

// Indicador de gasolina del salpicadero: la aguja marca tu nivel; debajo, los botones.
export default function FuelGauge({ value, onChange }: { value: TankId; onChange: (t: TankId) => void }) {
  const angle = TANKS.find((t) => t.id === value)?.angle ?? -40;
  const ticks = Array.from({ length: 9 }, (_, i) => -80 + i * 20);
  const labels = [
    { a: -80, t: "E" },
    { a: -40, t: "¼" },
    { a: 0, t: "½" },
    { a: 40, t: "¾" },
    { a: 80, t: "F" },
  ];
  const at = (a: number, r: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [100 + r * Math.cos(rad), 104 + r * Math.sin(rad)];
  };
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = at(from, r);
    const [x2, y2] = at(to, r);
    return `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`;
  };

  return (
    <div className="gauge">
      <svg viewBox="0 0 200 124" aria-hidden className="gauge-dial">
        <path d={arc(-86, 86, 86)} className="gauge-rim" />
        <path d={arc(-80, -56, 74)} className="gauge-red" />
        {ticks.map((a) => {
          const [x1, y1] = at(a, 74);
          const [x2, y2] = at(a, a % 40 === 0 ? 62 : 67);
          return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} className="gauge-tick" />;
        })}
        {labels.map(({ a, t }) => {
          const [x, y] = at(a, 48);
          return (
            <text key={t} x={x} y={y + 5} textAnchor="middle" className="gauge-label">
              {t}
            </text>
          );
        })}
        <text x="100" y="80" textAnchor="middle" className="gauge-brand">
          FUEL
        </text>
        <g className="gauge-needle" style={{ transform: `rotate(${angle}deg)` }}>
          <path d="M97.5,104 L100,30 L102.5,104 Z" />
        </g>
        <circle cx="100" cy="104" r="9" className="gauge-hub" />
      </svg>
      <div className="gauge-buttons" role="radiogroup" aria-label="¿Cómo vas de depósito?">
        {TANKS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            className={value === t.id ? "on" : ""}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
