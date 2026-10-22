import type { z } from "zod";

/**
 * Find the first balanced JSON value in model output, ignoring brackets inside
 * strings. A top-level array is returned whole; otherwise the first `{...}` object.
 */
export function extractJsonObject(raw: string): string | null {
  const text = raw.replace(/```(?:json)?/gi, "");
  const trimmed = text.trimStart();
  const start = trimmed.startsWith("[") ? text.indexOf("[") : text.indexOf("{");
  if (start === -1) return null;
  const open = text[start];
  const close = open === "[" ? "]" : "}";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseModelJson<T extends z.ZodType>(raw: string, schema: T): z.infer<T> {
  const candidate = extractJsonObject(raw);
  if (!candidate) throw new Error("Model output contained no JSON object");

  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    value = JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
  }
  return schema.parse(value);
}
