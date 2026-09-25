// Captura la web en tamaño móvil para la escena "la app" del vídeo.
// Uso (con la web en marcha en :3217): node scripts/capture.mjs
import puppeteer from "puppeteer-core";

const URL = process.env.URL ?? "http://localhost:3217/?lugar=Chamber%C3%AD%2C%20Madrid";
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
await page.goto(URL, { waitUntil: "networkidle2", timeout: 90_000 });
await page.waitForSelector(".sign", { timeout: 90_000 });
await page.waitForSelector(".press .stamp", { timeout: 30_000 }).catch(() => {});
// Fuera el indicador de desarrollo de Next.
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
// Que terminen de girar los contadores y carguen las teselas del mapa.
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: "public/app-full.png", fullPage: true });
// Posiciones de cada sección (en px CSS) para saber dónde parar el desplazamiento.
const marks = await page.evaluate(() =>
  Object.fromEntries(
    [".service", ".pump-stage", ".sign", ".roadmap", ".board", ".receipt-wrap", ".press"].map((s) => {
      const el = document.querySelector(s);
      return [s, el ? Math.round(el.getBoundingClientRect().top + scrollY) : null];
    }),
  ),
);
const height = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(JSON.stringify({ height, marks }));
await browser.close();
