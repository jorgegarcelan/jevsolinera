import type { Track } from "@/lib/track";

const WORD = { today: "Llenar", partial: "Lo justo", wait: "Esperar" } as const;
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const dm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const plus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** ¿Acierta? Precinto de verificación + libro de registro de los últimos días. */
export default function TrackRecord({ track, province, fuel }: { track: Track; province: string; fuel: string }) {
  const rate = track.rate != null ? Math.round(track.rate * 100) : null;
  const first = track.recent[track.recent.length - 1]?.date;

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
            <b>
              {track.hits} de {track.decided}
            </b>{" "}
            veces ha acertado mirando el precio {track.horizonDays} días después
            {track.evaluated > track.decided ? ` (${track.evaluated - track.decided} días no cuentan: el precio no se movió o dijo «lo justo»)` : ""}.
            {track.avgSaving40 != null && (
              <>
                {" "}
                Siguiendo el consejo, <b>{track.avgSaving40 >= 0 ? `${eur(track.avgSaving40)} de ahorro` : `${eur(-track.avgSaving40)} de pérdida`}</b> de media por depósito de 40 L.
              </>
            )}
          </p>
        ) : track.evaluated > 0 ? (
          <p className="ledger-lead">
            De momento, en los {track.evaluated} días evaluados el precio no se movió: aún no hay aciertos ni fallos que contar.
          </p>
        ) : (
          <p className="ledger-lead">
            El registro empezó el {first ? dm(first) : "hoy"}. El primer resultado llega {track.horizonDays} días después
            {first ? `, el ${dm(plus(first, track.horizonDays))}` : ""}.
          </p>
        )}
        <table>
          <thead>
            <tr>
              <th>Día</th>
              <th>Dijo</th>
              <th>{track.horizonDays} días después</th>
              <th aria-label="Resultado" />
            </tr>
          </thead>
          <tbody>
            {track.recent.map((r) => (
              <tr key={r.date}>
                <td>{dm(r.date)}</td>
                <td>{WORD[r.verdict]}</td>
                <td>{r.change == null ? <span className="pending">pendiente</span> : pct(r.change)}</td>
                <td className={r.ok === undefined ? "" : r.ok === null ? "tie" : r.ok ? "hit" : "miss"} title={r.ok === null ? (r.verdict === "partial" ? "«Lo justo» no cuenta ni como acierto ni como fallo" : "Empate: el precio no se movió") : undefined}>
                  {r.ok === undefined ? "·" : r.ok === null ? "=" : r.ok ? "✓" : "✗"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ledger-note">
          Se guarda lo que dijo la web cada día y se compara con el precio de las mismas gasolineras {track.horizonDays} días
          después, según el histórico del Ministerio.
        </p>
      </div>
    </section>
  );
}
