import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function load() {
  vi.resetModules();
  return import("@/lib/ai/googleAiStudio");
}

describe("googleGenerateJson", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_GEMMA_MODEL", "gemma-4-26b-a4b-it");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a system instruction, JSON mode and minimal thinking, and drops thought parts", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({
        candidates: [
          { content: { parts: [{ text: "Let me think {not json}", thought: true }, { text: '{"score":90}' }] } },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    expect(await googleGenerateJson("SYSTEM", "USER")).toBe('{"score":90}');
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.systemInstruction.parts[0].text).toBe("SYSTEM");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
  });

  it("falls back to plain mode when a model rejects the structured options", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "Thinking level is not supported" } }, 400))
      .mockResolvedValueOnce(json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    expect(await googleGenerateJson("SYSTEM", "USER")).toBe('{"ok":true}');
    const plainBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(plainBody.systemInstruction).toBeUndefined();
    expect(plainBody.contents[0].parts[0].text).toContain("SYSTEM");
  });

  it("retries a transient 500 once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "Internal error encountered." } }, 500))
      .mockResolvedValueOnce(json({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    expect(await googleGenerateJson("S", "U")).toBe('{"ok":1}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second transient failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "busy" } }, 503)));
    const { googleGenerateJson } = await load();
    await expect(googleGenerateJson("S", "U")).rejects.toThrow(/HTTP 503/);
  });
});
