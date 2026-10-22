/** Local / self-hosted Gemma 4 via the Ollama REST API. */

const STATUS_TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 1_500;

interface OllamaStatus {
  reachable: boolean;
  models: string[];
  checkedAt: number;
}

let status: OllamaStatus | null = null;

export function ollamaBaseUrl(): string | null {
  const url = process.env.OLLAMA_BASE_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

export function ollamaChatModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || "gemma4:e4b";
}

export function ollamaEmbedModel(): string {
  return process.env.OLLAMA_EMBED_MODEL?.trim() || "all-minilm";
}

function sameModel(installed: string, wanted: string): boolean {
  const norm = (m: string) => (m.includes(":") ? m : `${m}:latest`);
  return norm(installed) === norm(wanted);
}

export async function getOllamaStatus(force = false): Promise<OllamaStatus> {
  if (!force && status && Date.now() - status.checkedAt < STATUS_TTL_MS) return status;

  const base = ollamaBaseUrl();
  if (!base) return (status = { reachable: false, models: [], checkedAt: Date.now() });

  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { models?: { name: string }[] };
    status = { reachable: true, models: (json.models ?? []).map((m) => m.name), checkedAt: Date.now() };
  } catch {
    status = { reachable: false, models: [], checkedAt: Date.now() };
  }
  return status;
}

export async function ollamaHasModel(model: string): Promise<boolean> {
  const s = await getOllamaStatus();
  return s.reachable && s.models.some((m) => sameModel(m, model));
}

/** Mark Ollama as down after a hard failure so the next call skips straight to the fallback. */
export function markOllamaDown(): void {
  status = { reachable: false, models: [], checkedAt: Date.now() };
}

export async function ollamaChatJson(
  system: string,
  user: string,
  jsonSchema: object,
  {
    timeoutMs = 90_000,
    temperature = 0.2,
    maxTokens = 1_000,
  }: { timeoutMs?: number; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const base = ollamaBaseUrl();
  if (!base) throw new Error("OLLAMA_BASE_URL is not set");

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    body: JSON.stringify({
      model: ollamaChatModel(),
      stream: false,
      format: jsonSchema,
      keep_alive: "30m",
      options: { temperature, num_predict: maxTokens },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama chat failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { message?: { content?: string }; error?: string };
  if (json.error) throw new Error(`Ollama error: ${json.error}`);
  return json.message?.content ?? "";
}

export async function ollamaEmbed(texts: string[], { timeoutMs = 20_000 } = {}): Promise<number[][]> {
  const base = ollamaBaseUrl();
  if (!base) throw new Error("OLLAMA_BASE_URL is not set");

  const res = await fetch(`${base}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    body: JSON.stringify({ model: ollamaEmbedModel(), input: texts }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: HTTP ${res.status}`);
  const json = (await res.json()) as { embeddings?: number[][] };
  if (!json.embeddings || json.embeddings.length !== texts.length) throw new Error("Ollama embed returned no vectors");
  return json.embeddings;
}

const WARM_INTERVAL_MS = 10 * 60_000;
let lastWarm = 0;

/** Load the chat model into memory ahead of the first review so grading isn't paying cold-start time. */
export function warmOllama(): void {
  const base = ollamaBaseUrl();
  if (!base || Date.now() - lastWarm < WARM_INTERVAL_MS) return;
  lastWarm = Date.now();
  fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: ollamaChatModel(), keep_alive: "30m" }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => {
    lastWarm = 0;
  });
}
