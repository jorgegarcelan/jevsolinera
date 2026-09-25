"use client";

import type { CSSProperties } from "react";
import Reels from "./Reels";
import type { Verdict } from "@/lib/decide";
import type { StationResult } from "@/lib/types";

export const GRADES = {
  g95: { big: "95", small: "Gasolina", color: "#2f7a3e" },
  g98: { big: "98", small: "Gasolina", color: "#1d4a2c" },
  diesel: { big: "Diésel", small: "Gasóleo A", color: "#1b1b1b" },
  dieselp: { big: "Diésel+", small: "Premium", color: "#2b2620" },
  glp: { big: "GLP", small: "Autogás", color: "#1f5a9e" },
} as const;
export type GradeId = keyof typeof GRADES;

const WORD: Record<Verdict, string> = { today: "Hoy", partial: "Lo justo", wait: "Espera", any: "Da igual" };

const n2 = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const n3 = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`);
const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

interface Props {
  grade: GradeId;
  liters: number;
  verdict?: Verdict;
  station?: StationResult;
  isBest?: boolean;
  saving?: number;
  busy?: boolean;
}

/** El surtidor: el globo dice si echar hoy; la esfera, cuánto te costaría llenar aquí. */
export default function Pump({ grade, liters, verdict, station, isBest, saving, busy }: Props) {
  const g = GRADES[grade];
  const total = station ? n2(station.price * liters) : "---,--";
  const price = station ? n3(station.price) : "-,---";
  const lit = String(liters).padStart(2, "0");

  return (
    <div className={`pump-stage ${busy ? "busy" : ""}`} style={{ "--g": g.color } as CSSProperties}>
      <div className={`globe ${verdict ? `v-${verdict}` : "v-none"}`} aria-live="polite">
        <div className="globe-glass">
          <span className="globe-q">¿Echo hoy?</span>
          <span className="globe-word">{busy && !verdict ? "…" : verdict ? WORD[verdict] : "¿?"}</span>
        </div>
      </div>
      <div className="globe-collar" aria-hidden />

      <div className="pump">
        <div className="pump-crown">
          <span className="pump-maker">jevsolinera</span>
          <span className="pump-model">Modelo 505 · Servicio completo</span>
        </div>

        <div className="pump-face">
          <div className="dial dial-total">
            <span className="dial-label">Total a pagar · €</span>
            <Reels text={total} spin={busy} />
          </div>
          <div className="dial-row">
            <div className="dial">
              <span className="dial-label">Litros</span>
              <Reels text={lit} />
            </div>
            <div className="dial">
              <span className="dial-label">€ / litro</span>
              <Reels text={price} spin={busy} />
            </div>
          </div>
        </div>

        <div className="grade-plate">
          <b>{g.big}</b>
          <span>{g.small}</span>
        </div>

        <div className="pump-panel">
          {station ? (
            <>
              <p className="pump-kicker">{isBest ? "Donde más te conviene" : "Gasolinera elegida"}</p>
              <h2 className="station-name">{station.name}</h2>
              <p className="station-addr">
                {station.address}, {station.town}
              </p>
              <p className="station-facts">
                <span>{km(station.distanceKm)}</span>
                {station.hours && <span>{station.hours.replace(/;/g, " · ")}</span>}
              </p>
              {station.open === false ? (
                <p className="station-open closed">Cerrada ahora{station.opensAt ? ` · abre ${station.opensAt}` : ""}</p>
              ) : station.closesAt ? (
                <p className="station-open soon">Abierta · cierra a las {station.closesAt}</p>
              ) : station.open ? (
                <p className="station-open">Abierta ahora</p>
              ) : null}
              {saving != null && (
                <p className={`station-saving ${saving >= 0 ? "pos" : "neg"}`}>
                  {Math.abs(saving) < 0.05 ? (
                    "En la media de tu zona."
                  ) : saving > 0 ? (
                    <>
                      Ahorras <b>{eur(saving)}</b> frente a la media de tu zona.
                    </>
                  ) : (
                    <>
                      <b>{eur(-saving)}</b> más que la media de tu zona.
                    </>
                  )}
                </p>
              )}
              <a
                className="btn btn-red"
                href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                Cómo llegar →
              </a>
            </>
          ) : (
            <p className="pump-idle">{busy ? "Consultando precios…" : "Dinos dónde estás y te decimos dónde repostar."}</p>
          )}
        </div>
        <div className="pump-base" aria-hidden />
      </div>

      <svg className="hose" viewBox="0 0 70 420" aria-hidden>
        <path className="hose-line" d="M40 78 C 70 150, 66 300, 34 392 C 28 408, 12 414, 2 410" />
        <rect className="holster" x="0" y="36" width="16" height="62" rx="4" />
        <path className="nozzle" d="M12 44 h24 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 h-6 l-3 10 h-9 l2 -10 h-8 z" />
        <path className="spout" d="M12 50 h-8 a3 3 0 0 0 0 6 h8 z" />
      </svg>
    </div>
  );
}
