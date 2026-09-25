"use client";

import { useEffect, useState, type CSSProperties } from "react";

const DIGITS = "0123456789".split("");

/**
 * Contador mecánico de surtidor: cada cifra es un rodillo 0–9 que gira hasta su valor.
 * `spin` los deja girando sin parar (mientras se cargan los datos).
 */
export default function Reels({ text, spin = false, className = "" }: { text: string; spin?: boolean; className?: string }) {
  // Primero se pintan a 0 y luego giran hasta su cifra, también la primera vez.
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <span className={`reels ${spin ? "spin" : ""} ${className}`} role="img" aria-label={text}>
      {[...text].map((c, i) =>
        /\d/.test(c) || c === "-" ? (
          <span className="reel" key={i} aria-hidden>
            <span
              className="strip"
              style={{ "--d": on && c !== "-" ? Number(c) : 0, "--i": i } as CSSProperties}
            >
              {DIGITS.map((n) => (
                <span key={n}>{c === "-" && !spin ? "" : n}</span>
              ))}
            </span>
          </span>
        ) : (
          <span className="reel-sep" key={i} aria-hidden>
            {c}
          </span>
        ),
      )}
    </span>
  );
}
