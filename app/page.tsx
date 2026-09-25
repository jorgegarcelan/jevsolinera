"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Trend from "@/components/Trend";
import { FUELS, type FuelId } from "@/lib/minetur";
import { DEFAULT_STYLE, STYLES, STYLE_IDS, type StyleId } from "@/lib/styles";
import type { Analysis, StationResult } from "@/lib/types";

const StationMap = dynamic(() => import("@/components/StationMap"), {
  ssr: false,
  loading: () => <div className="map map-loading" />,
});

const TANKS = [
  ["reserva", "En reserva"],
  ["cuarto", "1/4"],
  ["medio", "Medio"],
  ["lleno", "3/4 o más"],
] as const;
type TankId = (typeof TANKS)[number][0];

type Place = { lat: number; lon: number; label: string };

const VERDICT = {
  today: { word: "Hoy", sub: "Echa hoy. Lo más probable es que mañana esté más cara." },
  partial: { word: "Lo justo", sub: "La cosa no está clara: echa para unos días y vuelve a mirar." },
  wait: { word: "Espera", sub: "Aguanta: todo apunta a que bajará en los próximos días." },
} as const;

const eur3 = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const eur2 = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
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
  const [style, setStyle] = useState<StyleId>(DEFAULT_STYLE);

  // Preferencias guardadas (solo en este navegador).
  useEffect(() => {
    setFuel(load("fuel", "g95"));
    setTank(load("tank", "cuarto"));
    setLiters(load("liters", 40));
    setPlace(load<Place | null>("place", null));
    const st = document.documentElement.dataset.style as StyleId;
    if (STYLE_IDS.includes(st)) setStyle(st);
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
    const id = setTimeout(() => analyze(place, fuel, tank, liters), 250);
    return () => clearTimeout(id);
  }, [ready, place, fuel, tank, liters, analyze]);

  function pickStyle(st: StyleId) {
    setStyle(st);
    document.documentElement.dataset.style = st;
    try {
      localStorage.setItem("jevsolinera:style", st);
    } catch {}
    // Si llegaste con ?estilo=, que la URL refleje el estilo actual.
    const url = new URL(location.href);
    if (url.searchParams.has("estilo")) {
      url.searchParams.set("estilo", st);
      history.replaceState(null, "", url);
    }
  }

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

  const d = data?.decision;
  const best = data?.stations[0];
  const selStation = data?.stations.find((s) => s.id === selected) ?? best;

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 64 64" aria-hidden className="logo">
            <path d="M20 50V16a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v34" />
            <path d="M16 50h30" />
            <rect x="25" y="18" width="12" height="9" rx="1.5" />
            <path d="M42 24l6 5v14a3 3 0 0 0 6 0V26l-5-5" />
          </svg>
          <span>
            jev<b>solinera</b>
          </span>
        </div>
        <p className="tagline">¿Echo hoy o espero? ¿Y dónde?</p>
        <label className="style-pick">
          <span>Estilo</span>
          <select value={style} onChange={(e) => pickStyle(e.target.value as StyleId)}>
            {STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="panel controls" aria-label="Tus datos">
        <div className="where">
          <button className="btn btn-primary" onClick={locate} type="button">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" className="fill" />
            </svg>
            Usar mi ubicación
          </button>
          <form onSubmit={search} className="search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="o escribe ciudad, calle o CP"
              aria-label="Buscar ubicación"
            />
            <button className="btn" type="submit">
              Buscar
            </button>
          </form>
        </div>
        {place && (
          <p className="here">
            <span className="dot" /> {place.label}
          </p>
        )}

        <div className="field">
          <span className="label">Combustible</span>
          <div className="seg" role="radiogroup">
            {(Object.keys(FUELS) as FuelId[]).map((f) => (
              <button key={f} role="radio" aria-checked={fuel === f} className={fuel === f ? "on" : ""} onClick={() => setFuel(f)} type="button">
                {FUELS[f].label}
              </button>
            ))}
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <span className="label">¿Cómo vas de depósito?</span>
            <div className="seg" role="radiogroup">
              {TANKS.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={tank === id} className={tank === id ? "on" : ""} onClick={() => setTank(id)} type="button">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="field liters">
            <span className="label">Litros a echar</span>
            <input type="number" min={5} max={120} step={5} value={liters} onChange={(e) => setLiters(Math.max(5, Math.min(120, Number(e.target.value) || 40)))} />
          </label>
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {!place && !loading && ready && (
        <section className="empty">
          <h1>Los precios cambian cada día.<br />Tú decides cuándo.</h1>
          <p>
            Miramos los precios oficiales de las gasolineras cerca de ti, cómo han ido este mes, el petróleo y las noticias.
            Jev, un modelo de IA hecho para tomar decisiones, te dice si te compensa repostar hoy o esperar.
          </p>
        </section>
      )}

      {loading && !data && (
        <section className="loading" aria-live="polite">
          <div className="pump-anim" />
          {loading}
        </section>
      )}

      {data && d && best && (
        <div className={`results ${loading ? "stale" : ""}`} aria-busy={!!loading}>
          <section className={`panel verdict v-${d.verdict}`} aria-live="polite">
            <p className="q">¿Echo {FUELS[data.fuel].label.toLowerCase()} hoy?</p>
            <h2 className="word">{VERDICT[d.verdict].word}</h2>
            <p className="sub">{d.overridden ?? VERDICT[d.verdict].sub}</p>

            <div className="probs" aria-label="Probabilidades de Jev">
              {(["today", "partial", "wait"] as const).map((k) => (
                <div key={k} className={`p p-${k}`} style={{ flexGrow: Math.max(d.probabilities[k], 0.02) }} title={`${VERDICT[k].word}: ${Math.round(d.probabilities[k] * 100)} %`} />
              ))}
            </div>
            <div className="prob-legend">
              {(["today", "partial", "wait"] as const).map((k) => (
                <span key={k}>
                  <i className={`sw p-${k}`} />
                  {VERDICT[k].word} <b>{Math.round(d.probabilities[k] * 100)} %</b>
                </span>
              ))}
            </div>
            <p className="meta">
              {d.source === "jev" ? (
                <>
                  Noticias leídas por <b>Jev</b> ({d.model}) + tendencias de precios · seguridad {Math.round(d.confidence * 100)} %
                </>
              ) : (
                <>Estimación básica sin Jev{d.error ? ` (${d.error})` : ""}</>
              )}
            </p>
          </section>

          <section className="panel best">
            <p className="kicker">{selStation?.id === best.id ? "Dónde te sale más a cuenta" : "Gasolinera seleccionada"}</p>
            {selStation && <StationCard s={selStation} data={data} isBest={selStation.id === best.id} />}
          </section>

          <section className="panel mapbox">
            <StationMap center={place!} stations={data.stations} selectedId={selected} onSelect={setSelected} />
          </section>

          <section className="panel list">
            <h3>
              Cerca de ti <small>({data.stations.length} en {data.radiusKm} km, ordenadas por lo que te cuesta llegar y llenar)</small>
            </h3>
            <ol>
              {data.stations.slice(0, 15).map((s, i) => (
                <li key={s.id} className={s.id === selStation?.id ? "sel" : ""}>
                  <button type="button" onClick={() => setSelected(s.id)}>
                    <span className="rank">{i + 1}</span>
                    <span className="nm">
                      <b>{s.name}</b>
                      <small>
                        {s.address} · {km(s.distanceKm)}
                      </small>
                    </span>
                    <span className="pr">
                      {eur3(s.price)}
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

          <section className="panel why">
            <h3>Por qué</h3>
            <Trend series={data.stats.series} province={data.province} />
            <Factors factors={d.factors} />
            <ul className="reasons">
              {d.reasons.map((r, i) => (
                <li key={i} className={`r-${r.kind}`}>
                  <span className="ic" aria-hidden>
                    {{ up: "▲", down: "▼", flat: "▬", calendar: "◷", news: "❝", tank: "◧", oil: "◆" }[r.kind]}
                  </span>
                  {r.text}
                </li>
              ))}
            </ul>
            {data.headlines.length > 0 && (
              <details className="news">
                <summary>{d.source === "jev" ? "Titulares que ha leído Jev" : "Titulares recientes"} ({Math.min(data.headlines.length, 12)})</summary>
                <ul>
                  {data.headlines.slice(0, 12).map((h, i) => (
                    <li key={i}>
                      {h.title} <small>{h.source}</small>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      )}

      <footer className="foot">
        <p>
          Precios oficiales del{" "}
          <a href="https://geoportalgasolineras.es" target="_blank" rel="noreferrer">
            Ministerio para la Transición Ecológica
          </a>
          {data && <> · actualizados {data.updated}</>}. Decisión con{" "}
          <a href="https://typesafe.ai" target="_blank" rel="noreferrer">
            Jev de TypeSafe AI
          </a>
          . Es una predicción, no una garantía.
        </p>
      </footer>
    </main>
  );
}

function Factors({ factors }: { factors: Analysis["decision"]["factors"] }) {
  if (!factors?.length) return null;
  const max = Math.max(...factors.map((f) => Math.abs(f.value)), 0.004);
  return (
    <div className="factors">
      <div className="factors-head">
        <span>← espera</span>
        <b>Qué pesa en la decisión</b>
        <span>echa hoy →</span>
      </div>
      <ul>
        {factors.map((f) => (
          <li key={f.key}>
            <span className="fl">{f.label}</span>
            <span className="fbar">
              <i className={f.value > 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(f.value) / max) * 50}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StationCard({ s, data, isBest }: { s: StationResult; data: Analysis; isBest: boolean }) {
  const save = (data.stats.localMedian - s.price) * data.liters;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
  return (
    <div className="station">
      <div className="totem" aria-label={`${eur3(s.price)} euros por litro`}>
        <span className="fuel">{FUELS[data.fuel].label}</span>
        <span className="led">
          {[...eur3(s.price)].map((c, i) => (
            <i key={i} className={/\d/.test(c) ? "" : "sep"}>
              {c}
            </i>
          ))}
        </span>
        <span className="unit">€/L</span>
      </div>
      <div className="info">
        <h3>{s.name}</h3>
        <p>
          {s.address}, {s.town}
        </p>
        <p className="facts">
          <span>{km(s.distanceKm)}</span>
          {s.hours && <span>{s.hours.replace(/;/g, " · ")}</span>}
        </p>
        <p className={`saving ${save >= 0 ? "pos" : "neg"}`}>
          {Math.abs(save) < 0.05
            ? "Precio en la media de tu zona."
            : save > 0
              ? <>Ahorras <b>{eur2(save)}</b> en {data.liters} L frente a la media de tu zona.</>
              : <>Pagas <b>{eur2(-save)}</b> más que la media de tu zona.{isBest && " Pero está muy cerca."}</>}
        </p>
        <a className="btn btn-primary go" href={maps} target="_blank" rel="noreferrer">
          Cómo llegar →
        </a>
      </div>
    </div>
  );
}
