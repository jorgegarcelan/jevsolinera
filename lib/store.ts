// Almacén clave-valor mínimo para el registro de predicciones.
// - Producción: Upstash Redis (Vercel → Storage → Upstash for Redis). La integración crea
//   KV_REST_API_URL y KV_REST_API_TOKEN; hablamos con su API REST, sin dependencias.
// - Desarrollo sin Redis: un JSON en .data/store.json.
// - Vercel sin Redis: no hay dónde guardar → registro desactivado (null).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Cmd = (string | number)[];

const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeKind: "redis" | "file" | null = URL_ && TOKEN ? "redis" : process.env.VERCEL ? null : "file";

export interface Store {
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string): Promise<void>;
  /** Solo si no existe. Devuelve true si lo ha escrito. */
  setnx(key: string, value: string): Promise<boolean>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrangeByScore(key: string, min: number, max: number): Promise<string[]>;
}

// ---------- Upstash Redis (REST) ----------

async function pipeline(cmds: Cmd[]) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const err = out.find((r) => r.error);
  if (err) throw new Error(`Redis: ${err.error}`);
  return out.map((r) => r.result);
}

const redis: Store = {
  async get(key) {
    return ((await pipeline([["GET", key]]))[0] as string | null) ?? null;
  },
  async mget(keys) {
    if (!keys.length) return [];
    return (await pipeline([["MGET", ...keys]]))[0] as (string | null)[];
  },
  async set(key, value) {
    await pipeline([["SET", key, value]]);
  },
  async setnx(key, value) {
    return (await pipeline([["SET", key, value, "NX"]]))[0] === "OK";
  },
  async zadd(key, score, member) {
    await pipeline([["ZADD", key, score, member]]);
  },
  async zrangeByScore(key, min, max) {
    return (await pipeline([["ZRANGE", key, min, max, "BYSCORE"]]))[0] as string[];
  },
};

// ---------- Archivo local (solo desarrollo) ----------

const FILE = path.join(process.cwd(), ".data", "store.json");
type FileData = { kv: Record<string, string>; z: Record<string, Record<string, number>> };
let queue: Promise<unknown> = Promise.resolve();

async function readData(): Promise<FileData> {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return { kv: {}, z: {} };
  }
}

// Serializa las escrituras para no pisarnos entre peticiones simultáneas.
function withData<T>(fn: (d: FileData) => T, write: boolean): Promise<T> {
  const run = queue.then(async () => {
    const d = await readData();
    const out = fn(d);
    if (write) {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(d));
    }
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

const file: Store = {
  get: (key) => withData((d) => d.kv[key] ?? null, false),
  mget: (keys) => withData((d) => keys.map((k) => d.kv[k] ?? null), false),
  set: (key, value) => withData((d) => void (d.kv[key] = value), true),
  setnx: (key, value) =>
    withData((d) => {
      if (key in d.kv) return false;
      d.kv[key] = value;
      return true;
    }, true),
  zadd: (key, score, member) => withData((d) => void ((d.z[key] ??= {})[member] = score), true),
  zrangeByScore: (key, min, max) =>
    withData(
      (d) =>
        Object.entries(d.z[key] ?? {})
          .filter(([, s]) => s >= min && s <= max)
          .sort((a, b) => a[1] - b[1])
          .map(([m]) => m),
      false,
    ),
};

export const store: Store | null = storeKind === "redis" ? redis : storeKind === "file" ? file : null;
