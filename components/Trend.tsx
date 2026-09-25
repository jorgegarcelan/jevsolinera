import type { Analysis } from "@/lib/types";

const W = 320;
const H = 110;
const PAD = { l: 6, r: 52, t: 12, b: 20 };

// Precio mediano de tu zona y de tu provincia en los últimos 30 días.
export default function Trend({ series, province }: { series: Analysis["stats"]["series"]; province: string }) {
  const vals = series.flatMap((p) => [p.local, p.province]).filter((v): v is number => v != null);
  if (series.filter((p) => p.local != null).length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(hi - lo, 0.01);
  const x = (d: number) => PAD.l + ((30 - d) / 30) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);
  const line = (k: "local" | "province") =>
    series
      .filter((p) => p[k] != null)
      .map((p, i) => `${i ? "L" : "M"}${x(p.daysAgo).toFixed(1)},${y(p[k]!).toFixed(1)}`)
      .join("");
  const now = series.find((p) => p.daysAgo === 0);

  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución del precio en 30 días">
        {[30, 14, 7, 0].map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={PAD.t} y2={H - PAD.b} className="grid" />
            <text x={x(d)} y={H - 5} textAnchor="middle" className="axis">
              {d === 0 ? "hoy" : `−${d}d`}
            </text>
          </g>
        ))}
        <path d={line("province")} className="line-prov" />
        <path d={line("local")} className="line-local" />
        {series
          .filter((p) => p.local != null)
          .map((p) => (
            <circle key={p.daysAgo} cx={x(p.daysAgo)} cy={y(p.local!)} r={p.daysAgo === 0 ? 3.5 : 2.2} className="dot-local" />
          ))}
        {now?.local != null && (
          <text x={x(0) + 8} y={y(now.local) + 4} className="val">
            {now.local.toFixed(3)}
          </text>
        )}
      </svg>
      <figcaption>
        <span className="key key-local" /> Tu zona <span className="key key-prov" /> Provincia de {province}
      </figcaption>
    </figure>
  );
}
