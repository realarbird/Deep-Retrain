import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const OK = (text: string) => json({ candidates: [{ content: { parts: [{ text }] } }] });

async function load() {
  vi.resetModules();
  return import("@/lib/ai/googleAiStudio");
}

describe("googleGenerateJson", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_AI_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calls Gemma 4 26B A4B with the learner's key, JSON mode and thinking off, and drops thought parts", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({
        candidates: [
          { content: { parts: [{ text: "Let me think {not json}", thought: true }, { text: '{"score":90}' }] } },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    expect(await googleGenerateJson("SYSTEM", "USER", { apiKey: "learner-key" })).toBe('{"score":90}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/models/gemma-4-26b-a4b-it:generateContent");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("learner-key");
    const body = JSON.parse(String(init?.body));
    expect(body.systemInstruction.parts[0].text).toBe("SYSTEM");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
    expect(body.generationConfig.temperature).toBe(0.2);
  });

  it("keeps Gemma's thinking off when a task asks for low thinking", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => OK("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    await googleGenerateJson("S", "U", { apiKey: "k", thinkingLevel: "low" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "minimal",
    });
  });

  it("leaves the temperature and thinking level alone for a pinned Gemini 3 model", async () => {
    vi.stubEnv("GOOGLE_AI_MODEL", "gemini-3.5-flash-lite");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => OK("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    await googleGenerateJson("S", "U", { apiKey: "k", temperature: 0.2, thinkingLevel: "low" });
    expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-3.5-flash-lite:");
    const config = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).generationConfig;
    // Gemini 3+ keeps its default temperature.
    expect(config.temperature).toBeUndefined();
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("falls back to plain mode when a model rejects the structured options", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "Thinking level is not supported" } }, 400))
      .mockResolvedValueOnce(OK('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    expect(await googleGenerateJson("SYSTEM", "USER", { apiKey: "k" })).toBe('{"ok":true}');
    const plainBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(plainBody.systemInstruction).toBeUndefined();
    expect(plainBody.contents[0].parts[0].text).toContain("SYSTEM");
  });

  it("tries the next model when the default one is not available", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "models/gemma-4-26b-a4b-it is not found" } }, 404))
      .mockResolvedValueOnce(OK('{"ok":2}'));
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson, googleModel } = await load();

    expect(await googleGenerateJson("S", "U", { apiKey: "k" })).toBe('{"ok":2}');
    expect(fetchMock.mock.calls[1][0]).toContain("/models/gemma-4-31b-it:");
    expect(googleModel()).toBe("gemma-4-31b-it");
  });

  it("reports a rejected key without retrying", async () => {
    const fetchMock = vi.fn(async () =>
      json({ error: { message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }, 400),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson, GoogleKeyError } = await load();

    await expect(googleGenerateJson("S", "U", { apiKey: "bad" })).rejects.toBeInstanceOf(GoogleKeyError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 500 once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "Internal error encountered." } }, 500))
      .mockResolvedValueOnce(OK('{"ok":1}'));
    vi.stubGlobal("fetch", fetchMock);
    const { googleGenerateJson } = await load();

    expect(await googleGenerateJson("S", "U", { apiKey: "k" })).toBe('{"ok":1}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second transient failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "busy" } }, 503)));
    const { googleGenerateJson } = await load();
    await expect(googleGenerateJson("S", "U", { apiKey: "k" })).rejects.toThrow(/HTTP 503/);
  });
});

describe("verifyGoogleKey", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells valid, rejected and unreachable apart", async () => {
    const { verifyGoogleKey } = await load();

    vi.stubGlobal("fetch", vi.fn(async () => json({ models: [] })));
    expect(await verifyGoogleKey("good")).toBe("valid");

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "API key not valid." } }, 400)));
    expect(await verifyGoogleKey("bad")).toBe("invalid");

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await verifyGoogleKey("offline")).toBe("unknown");
  });
});
