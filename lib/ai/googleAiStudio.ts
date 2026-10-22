/**
 * Hosted model through the Google AI Studio (Gemini API) `generateContent`
 * endpoint, called with the signed-in learner's own free API key.
 *
 * The default, Gemini 3.5 Flash-Lite, is the lowest-latency model on the free
 * tier. Requests send a system instruction, JSON mode with a response schema,
 * and a thinking level (minimal for grading). Models that reject those options
 * get a retry in plain mode, and a model the key can't reach (HTTP 404) hands
 * over to the next one in the list. Both are remembered for this process.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRY_DELAY_MS = 1_200;

export const DEFAULT_GOOGLE_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_GOOGLE_MODELS = ["gemini-3.1-flash-lite"];

/** `model|thinkingLevel` combinations that rejected structured options. */
const plainModeKeys = new Set<string>();
/** Models that answered 404 (retired, or not offered to free keys). */
const missingModels = new Set<string>();

/** Models to try, in order. `GOOGLE_AI_MODEL` pins a single model. */
export function googleModels(): string[] {
  const pinned = process.env.GOOGLE_AI_MODEL?.trim();
  return pinned ? [pinned] : [DEFAULT_GOOGLE_MODEL, ...FALLBACK_GOOGLE_MODELS];
}

export function googleModel(): string {
  return googleModels().find((m) => !missingModels.has(m)) ?? googleModels()[0];
}

export type ThinkingLevel = "minimal" | "low" | "high";

/** The key itself was rejected, as opposed to a model or quota problem. */
export class GoogleKeyError extends Error {}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  error?: { message?: string };
}

/** Gemini 3+ is tuned for its default temperature; lower values can make it loop. */
function usesDefaultTemperature(model: string): boolean {
  return /^gemini-([3-9]|\d{2})/.test(model);
}

function buildBody(
  model: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
  plain: boolean,
  jsonSchema?: object,
  thinkingLevel: ThinkingLevel = "minimal",
) {
  const sampling = usesDefaultTemperature(model) ? {} : { temperature };
  if (plain) {
    return {
      contents: [{ role: "user", parts: [{ text: `${system}\n\nReturn ONLY a JSON object, no prose and no code fences.\n\n${user}` }] }],
      generationConfig: { ...sampling, maxOutputTokens: maxTokens },
    };
  }
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      ...sampling,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
      ...(jsonSchema ? { responseJsonSchema: jsonSchema } : {}),
      thinkingConfig: { thinkingLevel },
    },
  };
}

function isKeyRejection(status: number, detail: string): boolean {
  return status === 401 || status === 403 || (status === 400 && /API_KEY_INVALID|API key not valid|API key expired/i.test(detail));
}

export async function googleGenerateJson(
  system: string,
  user: string,
  {
    apiKey,
    timeoutMs = 60_000,
    temperature = 0.2,
    maxTokens = 4_096,
    jsonSchema,
    thinkingLevel,
  }: {
    apiKey: string;
    timeoutMs?: number;
    temperature?: number;
    maxTokens?: number;
    jsonSchema?: object;
    thinkingLevel?: ThinkingLevel;
  },
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new GoogleKeyError("No Google AI Studio key");
  const level = thinkingLevel ?? "minimal";
  const deadline = Date.now() + timeoutMs;
  let retried = false;

  for (;;) {
    const model = googleModel();
    const modeKey = `${model}|${level}`;
    const plain = plainModeKeys.has(modeKey);
    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      cache: "no-store",
      body: JSON.stringify(buildBody(model, system, user, temperature, maxTokens, plain, jsonSchema, level)),
    });

    if (res.ok) {
      const json = (await res.json()) as GenerateResponse;
      // Thinking models return their reasoning as `thought` parts; only the answer parts hold the JSON.
      const text =
        json.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("") ?? "";
      if (!text) throw new Error("Google AI Studio returned an empty response");
      return text;
    }

    const detail = await res.text().catch(() => "");
    if (isKeyRejection(res.status, detail)) {
      throw new GoogleKeyError(`Google AI Studio rejected the key: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    if (res.status === 404 && googleModels().some((m) => m !== model && !missingModels.has(m))) {
      console.warn(`[google-ai-studio] ${model} is not available; trying the next model`);
      missingModels.add(model);
      continue;
    }
    if (res.status === 400 && !plain) {
      console.warn(`[google-ai-studio] ${model} rejected structured options (${level} thinking); retrying in plain mode`);
      plainModeKeys.add(modeKey);
      continue;
    }
    const transient = res.status === 429 || res.status >= 500;
    if (transient && !retried && Date.now() + RETRY_DELAY_MS < deadline) {
      retried = true;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    throw new Error(`Google AI Studio failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
  }
}

/** Check a key against the model list before saving it. `unknown` means Google couldn't be reached. */
export async function verifyGoogleKey(apiKey: string): Promise<"valid" | "invalid" | "unknown"> {
  try {
    const res = await fetch(`${API_BASE}?pageSize=1`, {
      headers: { "x-goog-api-key": apiKey.trim() },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (res.ok) return "valid";
    if (isKeyRejection(res.status, await res.text().catch(() => ""))) return "invalid";
    return "unknown";
  } catch {
    return "unknown";
  }
}
