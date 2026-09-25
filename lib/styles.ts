export const STYLES = [
  { id: "sixties", label: "Americana 60s" },
  { id: "neo", label: "Neo-Brutalism" },
  { id: "util", label: "Utilitarian" },
  { id: "bento", label: "Bento" },
  { id: "retro", label: "Mid-Century" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];
export const STYLE_IDS = STYLES.map((s) => s.id) as StyleId[];
export const DEFAULT_STYLE: StyleId = "sixties";
