/**
 * Hosted Gemma through the Google AI Studio (Gemini API) `generateContent`
 * endpoint. Used on cloud deploys where no Ollama server is reachable.
 *
 * Gemma 4 models accept a system instruction, JSON mode with a response schema,
 * and a thinking level; minimal thinking cuts grading latency several-fold. Models
 * that reject those options get a retry in plain mode (system prompt folded into
 * the user turn), remembered per model and thinking level for this process.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRY_DELAY_MS = 1_200;

/** `model|thinkingLevel` combinations that rejected structured options. */
const plainModeKeys = new Set<string>();

export function googleGemmaModel(): string {
  return process.env.GOOGLE_GEMMA_MODEL?.trim() || "gemma-4-26b-a4b-it";
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Gemma 4 on AI Studio accepts only these two levels. */
export type ThinkingLevel = "minimal" | "high";

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  error?: { message?: string };
}

function buildBody(
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  plain: boolean,
  jsonSchema?: object,
  thinkingLevel: ThinkingLevel = "minimal",
) {
  if (plain) {
    return {
      contents: [{ role: "user", parts: [{ text: `${system}\n\nReturn ONLY a JSON object, no prose and no code fences.\n\n${user}` }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
  }
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
      ...(jsonSchema ? { responseJsonSchema: jsonSchema } : {}),
      thinkingConfig: { thinkingLevel },
    },
  };
}

export async function googleGenerateJson(
  system: string,
  user: string,
  {
    timeoutMs = 60_000,
    temperature = 0.2,
    maxTokens = 4_096,
    jsonSchema,
    thinkingLevel,
  }: { timeoutMs?: number; temperature?: number; maxTokens?: number; jsonSchema?: object; thinkingLevel?: ThinkingLevel } = {},
): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = googleGemmaModel();
  const level = thinkingLevel ?? "minimal";
  const modeKey = `${model}|${level}`;
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 0; ; attempt++) {
    const plain = plainModeKeys.has(modeKey);
    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      cache: "no-store",
      body: JSON.stringify(buildBody(system, user, temperature, maxTokens, plain, jsonSchema, level)),
    });

    if (res.ok) {
      const json = (await res.json()) as GenerateResponse;
      // Gemma 4 returns its reasoning as `thought` parts; only the answer parts hold the JSON.
      const text =
        json.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("") ?? "";
      if (!text) throw new Error("Google AI Studio returned an empty response");
      return text;
    }

    const detail = await res.text().catch(() => "");
    if (res.status === 400 && !plain) {
      console.warn(`[google-ai-studio] ${model} rejected structured options (${level} thinking); retrying in plain mode`);
      plainModeKeys.add(modeKey);
      continue;
    }
    const transient = res.status === 429 || res.status >= 500;
    if (transient && attempt === 0 && Date.now() + RETRY_DELAY_MS < deadline) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    throw new Error(`Google AI Studio failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
  }
}
