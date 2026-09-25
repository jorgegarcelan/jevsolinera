import Trend from "./Trend";
import { FUELS } from "@/lib/minetur";
import type { Analysis } from "@/lib/types";

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const WORD = { today: "HOY", partial: "LO JUSTO", wait: "ESPERA" } as const;
const TANK = { reserva: "En reserva", cuarto: "1/4", medio: "Medio", lleno: "3/4 o más" } as const;

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <p className={`rc-line ${strong ? "strong" : ""}`}>
      <span>{k}</span>
      <i aria-hidden />
      <span>{v}</span>
    </p>
  );
}

/** El "por qué", impreso como el ticket de la gasolinera. */
export default function Receipt({ data, tank }: { data: Analysis; tank: keyof typeof TANK }) {
  const d = data.decision;
  const t = data.stats.trend;
  const [date, time] = data.updated.split(" ");
  const max = Math.max(...d.factors.map((f) => Math.abs(f.value)), 0.004);
  const ticket = (date ?? "").replace(/\//g, "").slice(0, 4) + (time ?? "").replace(/:/g, "").slice(0, 4);

  return (
    <div className="receipt-wrap">
      <article className="receipt" aria-label="Por qué: el ticket de la decisión">
        <header className="rc-head">
          <p className="rc-brand">★ JEVSOLINERA ★</p>
          <p>ESTACIÓN DE SERVICIO</p>
          <p>
            TICKET Nº {ticket} · {date} {time?.slice(0, 5)}
          </p>
        </header>
        <hr />
        <Line k="Combustible" v={FUELS[data.fuel].label} />
        <Line k="Provincia" v={data.province} />
        <Line k="Depósito" v={TANK[tank]} />
        <Line k="Media en tu zona" v={`${data.stats.localMedian.toFixed(3).replace(".", ",")} €/L`} />
        {t.d7 != null && <Line k="Tendencia 7 días" v={pct(t.d7)} />}
        {t.d30 != null && <Line k="Tendencia 30 días" v={pct(t.d30)} />}
        {data.brent && <Line k="Brent 7 días" v={pct(data.brent.change7d)} />}
        <hr />
        <p className="rc-section">Precio en tu zona · 30 días</p>
        <Trend series={data.stats.series} province={data.province} />
        <hr />
        <p className="rc-section">Qué pesa en la decisión</p>
        <div className="rc-scale" aria-hidden>
          <span>← espera</span>
          <span>echa hoy →</span>
        </div>
        <ul className="rc-factors">
          {d.factors.map((f) => (
            <li key={f.key}>
              <span className="rc-f-label">{f.label}</span>
              <span className="rc-f-bar">
                <i className={f.value > 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(f.value) / max) * 50}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <hr />
        <ul className="rc-notes">
          {d.reasons.map((r, i) => (
            <li key={i}>{r.text}</li>
          ))}
        </ul>
        {data.headlines.length > 0 && <p className="rc-see">» Titulares y lo que lee Jev en cada uno: en «El Heraldo del Surtidor», más abajo.</p>}
        <hr className="double" />
        <Line k="VEREDICTO" v={WORD[d.verdict]} strong />
        <Line k="Seguridad" v={`${Math.round(d.confidence * 100)} %`} />
        <Line k="Atendido por" v={d.source === "jev" ? `Jev · ${d.model}` : "Regla básica"} />
        <div className="rc-barcode" aria-hidden />
        <p className="rc-thanks">¡Gracias por su visita!</p>
      </article>
    </div>
  );
}
