// Cliente mínimo de TypeSafe System One (Jev). Docs: https://docs.typesafe.ai/api

type Text = string | Record<string, unknown> | unknown[];

export type Question =
  | { type: "noul"; instructions: Text; criteria?: { true?: Text; false?: Text } }
  | { type: "choice"; instructions: Text; criteria: Record<string, Text | null> }
  | { type: "score"; instructions: Text; criteria: Text[] };

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; legend: Record<string, string>; confidence: number };

export interface JevResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

export const hasJev = () => !!process.env.TYPESAFE_API_KEY;

export async function askJev(state: Text, questions: Record<string, Question>): Promise<JevResponse> {
  const body = JSON.stringify({ state, questions, model: process.env.JEV_MODEL || "jev-latest" });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return res.json();
    // 429 / 529: saturado → backoff corto y reintento.
    if ((res.status === 429 || res.status === 529) && attempt < 2) {
      const after = Number(res.headers.get("retry-after")) || 0.6 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(after, 3) * 1000));
      continue;
    }
    throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}
