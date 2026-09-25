import { EVENT_FUELS, EVENT_TYPES, type NewsRead } from "@/lib/decide";
import type { Headline } from "@/lib/signals";

const STAMP = { up: "Sube", down: "Baja", none: "Neutro" } as const;
const OUTLOOK = { rise: "subidas", fall: "bajadas", stable: "estabilidad", unclear: "nada claro" } as const;

const pct = (x: number) => `${Math.round(x * 100)} %`;
const usd = (x: number) => `${x.toLocaleString("es-ES", { maximumSignificantDigits: 2 })} $`;

function ago(iso: string) {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (!Number.isFinite(h)) return "";
  if (h < 1) return "hace un rato";
  if (h < 24) return `hace ${Math.round(h)} h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/** "Lo que lee Jev": los titulares como recortes de periódico, cada uno con el sello de Jev. */
export default function Press({ headlines, read }: { headlines: Headline[]; read?: NewsRead }) {
  if (!headlines.length) return null;
  const call = read?.call;
  const long = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
  const today = long.charAt(0).toUpperCase() + long.slice(1);

  return (
    <section className="press" aria-label="Lo que lee Jev en los titulares">
      <header className="press-masthead">
        <div className="press-ears">
          <span>Edición de hoy</span>
          <span>{call ? `Precio: ${usd(call.costUsd)}` : "Precio: gratis"}</span>
        </div>
        <h2 className="press-title">El Heraldo del Surtidor</h2>
        <div className="press-dateline">
          <span>{today}</span>
          <span>Lo que lee Jev en la prensa</span>
          <span>{headlines.length} titulares</span>
        </div>
      </header>

      {call && read && (
        <div className="press-stats">
          <p>
            <b>{call.questions}</b>
            <span>preguntas</span>
          </p>
          <p>
            <b>{call.calls}</b>
            <span>{call.calls === 1 ? "llamada a Jev" : "llamadas a Jev"}</span>
          </p>
          <p>
            <b>{call.ms.toLocaleString("es-ES")} ms</b>
            <span>en responder</span>
          </p>
          <p>
            <b>{call.inputTokens.toLocaleString("es-ES")}</b>
            <span>tokens leídos</span>
          </p>
          <p>
            <b>{usd(call.costUsd)}</b>
            <span>lo que ha costado</span>
          </p>
        </div>
      )}

      {read ? (
        <p className="press-lede">
          En conjunto, los titulares apuntan a <b>{OUTLOOK[read.outlook]}</b> ({pct(read.probabilities[read.outlook] ?? 0)})
          {read.events.some((e) => e.date && e.confidence >= 0.5)
            ? `, y ${read.events.filter((e) => e.date && e.confidence >= 0.5).length === 1 ? "hay un aviso" : "hay avisos"} con fecha.`
            : ", pero ninguno anuncia un cambio con fecha."}{" "}
          Así ha leído Jev cada uno:
        </p>
      ) : (
        <p className="press-lede">Jev no está disponible ahora mismo: estos son los titulares, sin sellar.</p>
      )}

      <ol className="clips">
        {headlines.map((h, i) => {
          const r = read?.headlines?.[i];
          const ev = read?.events.find((e) => e.headlines.includes(i) && e.confidence >= 0.35);
          return (
            <li key={i} className={`clip ${r && r.spain < 0.5 ? "off" : ""}`}>
              {r && (
                <span className={`stamp s-${r.direction}`} title={`Sube ${pct(r.probabilities.up)} · Baja ${pct(r.probabilities.down)} · Neutro ${pct(r.probabilities.none)}`}>
                  {STAMP[r.direction]}
                  <b>{pct(r.probabilities[r.direction])}</b>
                </span>
              )}
              <p className="clip-meta">
                {h.source}
                {h.date && ` · ${ago(h.date)}`}
              </p>
              {h.url ? (
                <a className="clip-title" href={h.url} target="_blank" rel="noopener noreferrer">
                  {h.title}
                </a>
              ) : (
                <p className="clip-title">{h.title}</p>
              )}
              {r && (ev || r.spain < 0.5) && (
                <p className="clip-tags">
                  {ev && (
                    <span className="tag tag-date">
                      Aviso: {EVENT_TYPES[ev.type].toLowerCase()}
                      {ev.fuels !== "both" ? ` (${EVENT_FUELS[ev.fuels]})` : ""}
                      {ev.date ? ` · ${ev.date.split("-").reverse().slice(0, 2).join("/")}` : " · sin fecha"} · {pct(ev.confidence)}
                    </span>
                  )}
                  {r.spain < 0.5 && <span className="tag tag-off">No va del surtidor español · {pct(1 - r.spain)}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <p className="press-note">
        Jev no escribe ni resume: responde a preguntas cerradas con una probabilidad. Los sellos son sus respuestas tal cual, sin
        retocar. Primero, tres preguntas por titular (¿sube o baja?, ¿va de España?, ¿anuncia un cambio con fecha?). Después,
        solo con los que anuncian algo: qué tipo de cambio es, si encarece o abarata y cuándo entra en vigor, eligiendo entre las
        fechas que encuentra el código en el titular. Modelo: {read?.model ?? "Jev"}.
      </p>
    </section>
  );
}
