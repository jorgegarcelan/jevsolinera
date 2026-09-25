"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, LayerGroup } from "leaflet";
import type { StationResult } from "@/lib/types";

interface Props {
  center: { lat: number; lon: number };
  stations: StationResult[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const eur = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function StationMap({ center, stations, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);

  // Crea el mapa una vez.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      map.current = mod.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lon], 13);
      mod.control.zoom({ position: "bottomright" }).addTo(map.current);
      mod
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
          className: "tiles",
        })
        .addTo(map.current);
      layer.current = mod.layerGroup().addTo(map.current);
      draw(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => draw(true), [stations, center.lat, center.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => draw(false), [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function draw(fit: boolean) {
    const mod = L.current;
    if (!mod || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const prices = stations.map((s) => s.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const best = stations[0]?.id;

    mod
      .circleMarker([center.lat, center.lon], { radius: 7, color: "#fff", weight: 3, fillColor: "#2f6fec", fillOpacity: 1 })
      .bindTooltip("Tú")
      .addTo(layer.current);

    // Las caras encima: dibuja de más cara a más barata.
    [...stations].reverse().forEach((s) => {
      const t = hi > lo ? (s.price - lo) / (hi - lo) : 0;
      const isBest = s.id === best;
      const isSel = s.id === selectedId;
      const icon = mod.divIcon({
        className: "",
        html: `<div class="pin ${isBest ? "pin-best" : ""} ${isSel ? "pin-sel" : ""}" style="--t:${t.toFixed(3)}">${eur(s.price)}</div>`,
        iconSize: undefined,
        iconAnchor: [28, 30],
      });
      mod
        .marker([s.lat, s.lon], { icon, zIndexOffset: isSel ? 2000 : isBest ? 1000 : Math.round((1 - t) * 500) })
        .on("click", () => onSelect(s.id))
        .addTo(layer.current!);
    });

    if (fit) {
      const pts: [number, number][] = [[center.lat, center.lon], ...stations.slice(0, 8).map((s) => [s.lat, s.lon] as [number, number])];
      map.current.fitBounds(mod.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    } else if (selectedId) {
      const s = stations.find((x) => x.id === selectedId);
      if (s) map.current.panTo([s.lat, s.lon]);
    }
  }

  return <div ref={el} className="map" role="region" aria-label="Mapa de gasolineras cercanas" />;
}
