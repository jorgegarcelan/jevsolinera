import type { Metadata, Viewport } from "next";
import {
  Archivo_Black,
  Barlow,
  Big_Shoulders,
  Barlow_Condensed,
  DM_Mono,
  DM_Sans,
  Inter,
  JetBrains_Mono,
  Shrikhand,
  Space_Grotesk,
  Space_Mono,
  Yellowtail,
} from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./themes.css";
import { DEFAULT_STYLE, STYLE_IDS } from "@/lib/styles";

// Fuentes de los 4 estilos en prueba. Cuando elijamos uno, sobran las demás.
const archivoBlack = Archivo_Black({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--f-archivo-black" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-space-grotesk" });
const spaceMono = Space_Mono({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--f-space-mono" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], display: "swap", preload: false, weight: ["500", "700", "800"], variable: "--f-barlow-condensed" });
const barlow = Barlow({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"], variable: "--f-barlow" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-jetbrains" });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-inter" });
const shrikhand = Shrikhand({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--f-shrikhand" });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-dm-sans" });
const yellowtail = Yellowtail({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--f-yellowtail" });
const bigShoulders = Big_Shoulders({ subsets: ["latin"], display: "swap", preload: false, variable: "--f-big-shoulders" });
const dmMono = DM_Mono({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500"], variable: "--f-dm-mono" });

const fontVars = [archivoBlack, spaceGrotesk, spaceMono, barlowCondensed, barlow, jetbrains, inter, shrikhand, dmSans, dmMono, yellowtail, bigShoulders]
  .map((x) => x.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "jevsolinera — ¿echo gasolina hoy?",
  description:
    "Te dice si repostar hoy o esperar, y dónde está la gasolinera que más te conviene cerca de ti. Precios oficiales del Ministerio, decisión con Jev.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Aplica el estilo guardado (o ?estilo=) antes de pintar, para que no parpadee.
const applyStyle = `try{var ok=${JSON.stringify(STYLE_IDS)};var q=new URLSearchParams(location.search).get("estilo");var s=ok.indexOf(q)>-1?q:localStorage.getItem("jevsolinera:style");if(ok.indexOf(s)>-1)document.documentElement.dataset.style=s}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-style={DEFAULT_STYLE} className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
