// Estrella "atómica" de la arquitectura Googie: 8 rayos largos y 8 cortos.
const points = Array.from({ length: 32 }, (_, i) => {
  const a = (i / 32) * Math.PI * 2 - Math.PI / 2;
  const r = i % 4 === 0 ? 50 : i % 2 === 0 ? 26 : 9;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

export default function Starburst({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`starburst ${className}`} aria-hidden>
      <polygon points={points} />
      <circle cx="50" cy="50" r="7" />
    </svg>
  );
}
