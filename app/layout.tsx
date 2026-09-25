import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Courier_Prime, DM_Sans, Playfair_Display, Yellowtail } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const bigShoulders = Big_Shoulders({ subsets: ["latin"], display: "swap", variable: "--f-big-shoulders" });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--f-dm-sans" });
const courier = Courier_Prime({ subsets: ["latin"], display: "swap", weight: ["400", "700"], variable: "--f-courier" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", weight: ["700", "900"], style: ["normal", "italic"], variable: "--f-playfair" });
const yellowtail = Yellowtail({ subsets: ["latin"], display: "swap", weight: "400", variable: "--f-yellowtail" });

const site = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT ?? 3000}`;

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "jevsolinera — ¿echo gasolina hoy?",
  description:
    "Te dice si repostar hoy o esperar, y dónde está la gasolinera que más te conviene cerca de ti. Precios oficiales del Ministerio, decisión con Jev.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16213a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${bigShoulders.variable} ${dmSans.variable} ${yellowtail.variable} ${courier.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
