import type { Metadata } from "next";
import Home from "@/components/Home";

type Params = Promise<Record<string, string | string[] | undefined>>;

const VERDICT = {
  today: "Llena antes de que suba",
  partial: "Hoy, echa lo justo",
  wait: "Mejor espera",
  any: "Hoy da igual el día: importa la gasolinera",
} as const;
const FUEL: Record<string, string> = { g95: "Gasolina 95", g98: "Gasolina 98", diesel: "Diésel", dieselp: "Diésel Premium", glp: "GLP" };

// Un enlace compartido (?v=…&p=…&s=…) lleva su propia tarjeta: veredicto, gasolinera y precio.
export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const q = await searchParams;
  const get = (k: string) => (typeof q[k] === "string" ? (q[k] as string).slice(0, 40) : undefined);
  const v = get("v") as keyof typeof VERDICT | undefined;
  const og = new URLSearchParams();
  for (const k of ["v", "f", "p", "s", "z", "d", "e"]) {
    const val = get(k);
    if (val) og.set(k, val);
  }
  const image = { url: `/api/og${og.size ? `?${og}` : ""}`, width: 1200, height: 630, alt: "jevsolinera: ¿echo gasolina hoy o espero?" };

  const price = Number(get("p"));
  const title =
    v && v in VERDICT
      ? `${VERDICT[v]}${get("f") && FUEL[get("f")!] ? ` · ${FUEL[get("f")!]}` : ""}${price > 0 && get("s") ? ` a ${price.toFixed(3).replace(".", ",")} € en ${get("s")}` : ""}`
      : "jevsolinera — ¿echo gasolina hoy?";
  const description = "Si repostar hoy o esperar, y dónde está la gasolinera que más te conviene. Precios oficiales del Ministerio, decisión con IA.";

  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website", locale: "es_ES", siteName: "jevsolinera" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function Page() {
  return <Home />;
}
