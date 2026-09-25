import type { Track } from "@/lib/track";

const WORD = { today: "Llena antes", partial: "Lo justo", wait: "Espera", any: "Da igual" } as const;
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const dm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** ¿Acierta? Precinto de verificación + libro de registro de los últimos días. */
export default function TrackRecord({ track, province, fuel }: { track: Track; province: string; fuel: string }) {
  const rate = track.rate != null ? Math.round(track.rate * 100) : null;
  const first = track.recent[track.recent.length - 1]?.date;
  const quiet = track.decided - track.alerts.decided; // días "da igual" ya comprobados
  const quietHits = track.hits - track.alerts.hits;

  return (
    <section className="track" aria-label="Registro de aciertos">
      <div className="seal" aria-hidden={rate == null}>
        <svg viewBox="0 0 200 200" className="seal-ring">
          <defs>
            <path id="seal-path" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
          </defs>
          <circle cx="100" cy="100" r="96" className="seal-edge" />
          <circle cx="100" cy="100" r="64" className="seal-core" />
          <text className="seal-text">
            <textPath href="#seal-path" startOffset="0">
              ★ PRECISIÓN VERIFICADA ★ REGISTRO DIARIO ★ JEVSOLINERA
            </textPath>
          </text>
        </svg>
        <div className="seal-value">
          <b>{rate != null ? `${rate}%` : "—"}</b>
          <span>{rate != null ? "aciertos" : "sin datos"}</span>
        </div>
      </div>

      <div className="ledger">
        <p className="ledger-kicker">¿Acierta? · {fuel} en {province}</p>
        {track.decided > 0 ? (
          <p className="ledger-lead">
            {track.alerts.decided > 0 ? (
              <>
                <b>
                  Avisos: {track.alerts.hits} de {track.alerts.decided}
                </b>{" "}
                se cumplieron el día señalado.{" "}
              </>
            ) : track.alerts.total > 0 ? (
              <>
                <b>{track.alerts.total}</b> aviso{track.alerts.total > 1 ? "s" : ""} pendiente{track.alerts.total > 1 ? "s" : ""} de su fecha.{" "}
              </>
            ) : (
              <>Aún no ha habido ningún aviso. </>
            )}
            {quiet > 0 && (
              <>
                <b>
                  «Da igual»: {quietHits} de {quiet}
                </b>{" "}
                veces el precio se movió menos de un 1 % en {track.horizonDays} días.
              </>
            )}
          </p>
        ) : (
          <p className="ledger-lead">
            El registro empezó el {first ? dm(first) : "hoy"}. Cada consejo se comprueba solo: los avisos, el día después de su fecha;
            «da igual», a los {track.horizonDays} días.
          </p>
        )}
        <table>
          <thead>
            <tr>
              <th>Día</th>
              <th>Dijo</th>
              <th>Se mira el</th>
              <th>Qué pasó</th>
              <th aria-label="Resultado" />
            </tr>
          </thead>
          <tbody>
            {track.recent.map((r) => (
              <tr key={r.date}>
                <td>{dm(r.date)}</td>
                <td>
                  {WORD[r.verdict]}
                  {r.eventDate && ` ${dm(r.eventDate)}`}
                </td>
                <td>{dm(r.target)}</td>
                <td>{r.change == null ? <span className="pending">pendiente</span> : pct(r.change)}</td>
                <td
                  className={r.ok === undefined ? "" : r.ok === null ? "tie" : r.ok ? "hit" : "miss"}
                  title={r.ok === null ? "No cuenta ni como acierto ni como fallo" : undefined}
                >
                  {r.ok === undefined ? "·" : r.ok === null ? "=" : r.ok ? "✓" : "✗"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ledger-note">
          Se guarda lo que dijo la web cada día. Un aviso («llena antes del 1/10») acierta si el día después de esa fecha el precio
          de las mismas gasolineras es mayor; «da igual» acierta si en {track.horizonDays} días se mueve menos de un 1 %. Precios del
          histórico del Ministerio.
        </p>
      </div>
    </section>
  );
}
