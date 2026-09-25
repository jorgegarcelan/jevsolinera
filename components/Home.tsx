"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import FuelGauge, { type TankId } from "@/components/FuelGauge";
import Pump, { GRADES } from "@/components/Pump";
import Press from "@/components/Press";
import Receipt from "@/components/Receipt";
import Reels from "@/components/Reels";
import Starburst from "@/components/Starburst";
import TrackRecord from "@/components/TrackRecord";
import { FUELS, type FuelId } from "@/lib/minetur";
import type { Analysis } from "@/lib/types";

const StationMap = dynamic(() => import("@/components/StationMap"), {
  ssr: false,
  loading: () => <div className="map map-loading" />,
});

type Place = { lat: number; lon: number; label: string };

const SIGN = {
  today: { title: "Llena hoy", sub: "Lo más probable es que en los próximos días esté más cara." },
  partial: { title: "Echa lo justo", sub: "La cosa no está clara: pon para unos días y vuelve a mirar." },
  wait: { title: "Espera", sub: "Todo apunta a que bajará en los próximos días." },
} as const;
const ODDS = [
  ["today", "Hoy"],
  ["partial", "Lo justo"],
  ["wait", "Espera"],
] as const;

const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`);
const pctTxt = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

function load<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`jevsolinera:${k}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(`jevsolinera:${k}`, JSON.stringify(v));
  } catch {}
}

export default function Home() {
  const [fuel, setFuel] = useState<FuelId>("g95");
  const [tank, setTank] = useState<TankId>("cuarto");
  const [liters, setLiters] = useState(40);
  const [place, setPlace] = useState<Place | null>(null);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  const [shared, setShared] = useState<string | null>(null);

  // Preferencias guardadas (solo en este navegador).
  useEffect(() => {
    setFuel(load("fuel", "g95"));
    setTank(load("tank", "cuarto"));
    setLiters(load("liters", 40));
    setPlace(load<Place | null>("place", null));
    setReady(true);
  }, []);

  const analyze = useCallback(async (p: Place, f: FuelId, t: TankId, l: number) => {
    setLoading("Mirando precios y preguntando a Jev…");
    setError(null);
    try {
      const qs = new URLSearchParams({ lat: String(p.lat), lon: String(p.lon), fuel: f, tank: t, liters: String(l) });
      const res = await fetch(`/api/analisis?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Algo ha fallado");
      setData(json);
      setSelected(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo ha fallado");
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    if (!ready || !place) return;
    save("fuel", fuel);
    save("tank", tank);
    save("liters", liters);
    save("place", place);
    const id = setTimeout(() => analyze(place, fuel, tank, liters), 300);
    return () => clearTimeout(id);
  }, [ready, place, fuel, tank, liters, analyze]);

  function locate() {
    if (!navigator.geolocation) return setError("Tu navegador no permite geolocalización. Busca tu ciudad.");
    setLoading("Buscando dónde estás…");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Tu ubicación" }),
      () => {
        setLoading(null);
        setError("No he podido obtener tu ubicación. Escribe tu ciudad o código postal.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading("Buscando el sitio…");
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPlace(json);
      setQuery("");
    } catch (e) {
      setLoading(null);
      setError(e instanceof Error ? e.message : "No lo encuentro");
    }
  }

  async function share() {
    if (!data || !d || !station) return;
    // Solo datos públicos: la provincia, nunca tus coordenadas.
    const qs = new URLSearchParams({
      v: d.verdict,
      f: data.fuel,
      p: station.price.toFixed(3),
      s: station.name,
      z: data.province,
      d: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }),
    });
    const url = `${location.origin}/?${qs}`;
    const text = `${SIGN[d.verdict].title}: ${FUELS[data.fuel].label} a ${station.price.toFixed(3).replace(".", ",")} € en ${station.name} (${data.province}). Según jevsolinera.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "jevsolinera", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared("¡Enlace copiado!");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setShared("No se ha podido compartir");
    }
    setTimeout(() => setShared(null), 2500);
  }

  const d = data?.decision;
  const best = data?.stations[0];
  const station = data?.stations.find((s) => s.id === selected) ?? best;
  const grade = (data?.fuel ?? fuel) as FuelId;
  const saving = data && station ? (data.stats.localMedian - station.price) * data.liters : undefined;

  return (
    <>
      <header className="canopy">
        <div className="canopy-inner">
          <a className="brand" href="/" aria-label="jevsolinera, inicio">
            <Starburst />
            <span className="brand-text">
              <span className="brand-script">jevsolinera</span>
              <span className="brand-sub">Estación de servicio · Est. 2026</span>
            </span>
          </a>
          <p className="canopy-right">
            <b>¿Echo hoy o espero?</b>
            <span>{data ? `Precios oficiales · ${data.updated.slice(0, 16)}` : "Precios oficiales del Ministerio"}</span>
          </p>
        </div>
      </header>

      <main className="wrap">
        <section className="service" aria-label="Tus datos">
          <div className="svc-where">
            <p className="svc-label">
              <span>01</span> ¿Dónde estás?
            </p>
            <div className="where">
              <button className="btn btn-red" onClick={locate} type="button">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" className="fill" />
                </svg>
                Usar mi ubicación
              </button>
              <form onSubmit={search} className="search">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="o escribe ciudad, calle o CP" aria-label="Buscar ubicación" />
                <button className="btn btn-ghost" type="submit">
                  Buscar
                </button>
              </form>
            </div>
            {place && (
              <p className="here">
                <span className="dot" /> {place.label}
              </p>
            )}
          </div>

          <div className="svc-fuel">
            <p className="svc-label">
              <span>02</span> ¿Qué le ponemos?
            </p>
            <div className="grades" role="radiogroup" aria-label="Combustible">
              {(Object.keys(FUELS) as FuelId[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={fuel === f}
                  aria-label={FUELS[f].label}
                  className={`grade ${fuel === f ? "on" : ""} ${GRADES[f].big.length > 3 ? "long" : ""}`}
                  style={{ "--g": GRADES[f].color } as React.CSSProperties}
                  onClick={() => setFuel(f)}
                >
                  <b>{GRADES[f].big}</b>
                  <span>{GRADES[f].small}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="svc-tank">
            <p className="svc-label">
              <span>03</span> ¿Cómo vas de depósito?
            </p>
            <FuelGauge value={tank} onChange={setTank} />
          </div>

          <div className="svc-liters">
            <p className="svc-label">
              <span>04</span> ¿Cuántos litros?
            </p>
            <div className="stepper">
              <button type="button" aria-label="Menos litros" onClick={() => setLiters((l) => Math.max(5, l - 5))}>
                −
              </button>
              <Reels text={String(liters).padStart(3, "0")} className="small" />
              <button type="button" aria-label="Más litros" onClick={() => setLiters((l) => Math.min(120, l + 5))}>
                +
              </button>
            </div>
            <p className="svc-hint">litros</p>
          </div>
        </section>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className={`stage ${loading && data ? "stale" : ""}`} aria-busy={!!loading}>
          <div className="col-pump">
            <Pump grade={grade} liters={data?.liters ?? liters} verdict={d?.verdict} station={station} isBest={station?.id === best?.id} saving={saving} busy={!!loading} />
          </div>

          <div className="col-side">
            {d && data ? (
              <section className={`sign v-${d.verdict}`} aria-live="polite">
                <span className="bolt tl" />
                <span className="bolt tr" />
                <span className="bolt bl" />
                <span className="bolt br" />
                <p className="sign-kicker">
                  La decisión de hoy · {FUELS[data.fuel].label}
                </p>
                <h1 className="sign-title">{SIGN[d.verdict].title}</h1>
                <p className="sign-sub">{d.overridden ?? SIGN[d.verdict].sub}</p>
                <div className="odds" aria-label="Probabilidades">
                  <div className="odds-bar">
                    {ODDS.map(([k]) => (
                      <i key={k} className={`o-${k}`} style={{ flexGrow: Math.max(d.probabilities[k], 0.015) }} />
                    ))}
                  </div>
                  <div className="odds-legend">
                    {ODDS.map(([k, label]) => (
                      <span key={k} className={d.verdict === k ? "win" : ""}>
                        <i className={`o-${k}`} />
                        {label} <b>{Math.round(d.probabilities[k] * 100)} %</b>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sign-actions">
                  <button type="button" className="btn btn-cream" onClick={share}>
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                    </svg>
                    Compartir
                  </button>
                  {shared && (
                    <span className="sign-toast" role="status">
                      {shared}
                    </span>
                  )}
                </div>
                <p className="sign-meta">
                  {d.source === "jev" ? (
                    <>
                      Noticias leídas por <b>Jev</b> ({d.model}) + tendencias de precios · seguridad {Math.round(d.confidence * 100)} %
                    </>
                  ) : (
                    <>Estimación básica sin Jev{d.error ? ` (${d.error})` : ""}</>
                  )}
                </p>
              </section>
            ) : (
              <section className="poster">
                <Starburst className="poster-star" />
                <p className="poster-kicker">Servicio completo · Precios oficiales · Decisión con IA</p>
                <h1 className="poster-title">
                  ¿Lleno hoy
                  <br />o mañana?
                </h1>
                <p className="poster-body">
                  Miramos los precios oficiales de las gasolineras cerca de ti, cómo han ido este mes, el petróleo y las noticias. Jev,
                  un modelo de IA hecho para decidir, te dice si te compensa repostar hoy o esperar.
                </p>
                {!loading && (
                  <button className="btn btn-red" type="button" onClick={locate}>
                    Empezar con mi ubicación
                  </button>
                )}
                {loading && <p className="poster-loading">{loading}</p>}
              </section>
            )}

            {data?.track && data.track.total > 0 && (
              <TrackRecord track={data.track} province={data.province} fuel={FUELS[data.fuel].label} />
            )}

            {data && place && (
              <section className="roadmap">
                <header className="roadmap-cover">
                  <Starburst />
                  <span>Mapa de carreteras</span>
                  <small>{place.label} · radio {data.radiusKm} km</small>
                </header>
                <div className="roadmap-sheet">
                  <StationMap center={place} stations={data.stations} selectedId={station?.id} onSelect={setSelected} />
                  <span className="folds" aria-hidden />
                </div>
              </section>
            )}
          </div>

          {data && station && (
            <section className="board" aria-label="Gasolineras cercanas">
              <header className="board-head">
                <span className="board-title">Precios de la zona</span>
                <small>
                  {data.stations.length} gasolineras · ordenadas por lo que cuesta llegar y llenar
                </small>
              </header>
              <ol>
                {data.stations.slice(0, 12).map((s, i) => (
                  <li key={s.id} className={`${s.id === station.id ? "sel" : ""} ${s.open === false ? "is-closed" : ""}`}>
                    <button type="button" onClick={() => setSelected(s.id)}>
                      <span className="b-rank">{i + 1}</span>
                      <span className="b-name">
                        <b>{s.name}</b>
                        <small>
                          {s.address} · {km(s.distanceKm)}
                        </small>
                        {s.open === false ? (
                          <em className="b-hours closed">Cerrada{s.opensAt ? ` · abre ${s.opensAt}` : ""}</em>
                        ) : s.closesAt ? (
                          <em className="b-hours soon">Cierra a las {s.closesAt}</em>
                        ) : null}
                      </span>
                      <span className="b-price">
                        <span className="slats">
                          {[...s.price.toFixed(3).replace(".", ",")].map((c, j) => (
                            <i key={j} className={c === "," ? "sep" : ""}>
                              {c}
                            </i>
                          ))}
                        </span>
                        {s.change7d != null && Math.abs(s.change7d) >= 0.001 && (
                          <small className={s.change7d > 0 ? "up" : "down"}>
                            {s.change7d > 0 ? "▲" : "▼"} {pctTxt(s.change7d)} 7d
                          </small>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {data && <Receipt data={data} tank={tank} />}

          {data && <Press headlines={data.headlines} read={d?.news} />}
        </div>
      </main>

      <footer className="foot">
        <Starburst />
        <p>
          Precios oficiales del{" "}
          <a href="https://geoportalgasolineras.es" target="_blank" rel="noreferrer">
            Ministerio para la Transición Ecológica
          </a>
          . Decisión con{" "}
          <a href="https://typesafe.ai" target="_blank" rel="noreferrer">
            Jev de TypeSafe AI
          </a>
          . Es una predicción, no una garantía.
        </p>
        <p className="foot-script">Gracias por su visita</p>
      </footer>
    </>
  );
}
