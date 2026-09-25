import Trend from "./Trend";
import { EVENT_TYPES, groupEvents } from "@/lib/decide";
import { FUELS } from "@/lib/minetur";
import type { Analysis } from "@/lib/types";

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const WORD = { today: "LLENA HOY", partial: "LO JUSTO", wait: "ESPERA", any: "DA IGUAL" } as const;
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
        <p className="rc-section">Avisos en la prensa</p>
        {d.news ? (
          d.news.events.length ? (
            <ul className="rc-events">
              {groupEvents(d.news.events).map((e, k) => (
                <li key={k}>
                  <span>
                    {EVENT_TYPES[e.type]}
                    {e.fuels !== "both" ? ` (${e.fuels === "diesel" ? "diésel" : "gasolina"})` : ""}
                  </span>
                  <span>{e.date ? e.date.split("-").reverse().slice(0, 2).join("/") : "sin fecha"}</span>
                  <span>{e.direction === "up" ? "▲" : "▼"}</span>
                  <span>{Math.round(e.confidence * 100)} %</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rc-muted">Ninguno en {data.headlines.length} titulares.</p>
          )
        ) : (
          <p className="rc-muted">Sin Jev no se leen las noticias.</p>
        )}
        <hr />
        <ul className="rc-notes">
          {d.reasons.map((r, i) => (
            <li key={i}>{r.text}</li>
          ))}
        </ul>
        {data.headlines.length > 0 && <p className="rc-see">» Titulares y lo que lee Jev en cada uno: en «El Heraldo del Surtidor», más abajo.</p>}
        <hr className="double" />
        <Line k="VEREDICTO" v={WORD[d.verdict]} strong />
        {d.event && <Line k="Fecha clave" v={d.event.date!.split("-").reverse().join("/")} />}
        <Line k="Seguridad" v={`${Math.round(d.confidence * 100)} %`} />
        <Line k="Atendido por" v={d.source === "jev" ? `Jev · ${d.model}` : "Regla básica"} />
        <div className="rc-barcode" aria-hidden />
        <p className="rc-thanks">¡Gracias por su visita!</p>
      </article>
    </div>
  );
}
