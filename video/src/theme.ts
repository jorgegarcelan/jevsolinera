import { loadFont as loadSign } from "@remotion/google-fonts/BigShoulders";
import { loadFont as loadType } from "@remotion/google-fonts/CourierPrime";
import { loadFont as loadBody } from "@remotion/google-fonts/DMSans";
import { loadFont as loadNews } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadScript } from "@remotion/google-fonts/Yellowtail";
import { Easing } from "remotion";

// Mismo sistema visual que la web: gasolinera americana de los 60.
export const F = {
  sign: loadSign("normal", { weights: ["700", "800", "900"], subsets: ["latin"] }).fontFamily,
  script: loadScript("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  body: loadBody("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily,
  news: loadNews("normal", { weights: ["700", "900"], subsets: ["latin"] }).fontFamily,
  type: loadType("normal", { weights: ["400", "700"], subsets: ["latin"] }).fontFamily,
};

export const C = {
  canopy: "#16213a",
  cream: "#fbf5e6",
  bg: "#ede3cc",
  paper: "#f6f0df",
  red: "#a8251c",
  redDeep: "#7c1911",
  gold: "#c9a55b",
  ink: "#18223a",
  muted: "#6b6454",
  wait: "#276f60",
  any: "#2b3f66",
  chrome: "linear-gradient(180deg, #ffffff 0%, #dfe2e6 22%, #9aa0a8 48%, #eef0f2 62%, #b3b8bf 82%, #e9ebee 100%)",
};

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  pop: Easing.bezier(0.34, 1.56, 0.64, 1),
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
