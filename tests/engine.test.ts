import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CARD = {
  conceptTitle: "ATP Synthase",
  coreFact: "ATP synthase uses the proton gradient across the inner mitochondrial membrane to make ATP.",
  expectedKeyPoints: ["uses the proton gradient", "inner mitochondrial membrane", "makes ATP"],
  currentQuestion: "What does ATP synthase do?",
  difficultyTier: "recall" as const,
  leitnerBox: 1,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const EVAL = {
  score: 90,
  feedback: "Nice.",
  coveredKeyPoints: CARD.expectedKeyPoints,
  missingKeyPoints: [],
  analogy: "It is like a water wheel. Protons are the water.",
  socraticFollowUp: "Why does the gradient matter?",
  nextQuestion: "If the membrane leaked protons, what would happen to ATP output?",
};

async function loadEngine() {
  vi.resetModules();
  return import("@/lib/engine");
}

function googleReply(body: unknown) {
  return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] });
}

describe("AI provider chain", () => {
  beforeEach(() => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.test");
    vi.stubEnv("OLLAMA_MODEL", "gemma4:e4b");
    vi.stubEnv("GOOGLE_AI_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses Ollama when it is up and promotes a fast accurate answer", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
      if (url.endsWith("/api/chat")) return jsonResponse({ message: { content: JSON.stringify(EVAL) } });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "uses the proton gradient across the inner membrane to make ATP", 5_000);

    expect(r.engine).toBe("ollama");
    expect(r.outcome).toBe("promote");
    expect(r.newBox).toBe(2);
    expect(r.difficultyTier).toBe("application");
    expect(r.nextQuestion).toBe(EVAL.nextQuestion);
    expect(r.followUpQuestion).toBeNull();
    expect(r.analogy).toBeNull();
  });

  it("returns a Socratic follow-up for slow accurate answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/api/tags")
          ? jsonResponse({ models: [{ name: "gemma4:e4b" }] })
          : jsonResponse({ message: { content: JSON.stringify(EVAL) } }),
      ),
    );
    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "answer", 20_000);
    expect(r.outcome).toBe("hesitation");
    expect(r.newBox).toBe(1);
    expect(r.followUpQuestion).toBe(EVAL.socraticFollowUp);
    expect(r.nextQuestion).toBeNull();
  });

  it("clamps scores and keeps the analogy to two sentences on a reset", async () => {
    const longAnalogy = { ...EVAL, score: 140 - 100, analogy: "One. Two. Three." };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/api/tags")
          ? jsonResponse({ models: [{ name: "gemma4:e4b" }] })
          : jsonResponse({ message: { content: JSON.stringify(longAnalogy) } }),
      ),
    );
    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "wrong", 3_000);
    expect(r.outcome).toBe("reset");
    expect(r.analogy).toBe("One. Two.");
  });

  it("uses the learner's own Google key before Ollama", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("generativelanguage.googleapis.com"))
        return jsonResponse({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(EVAL) + "\n```" }] } }] });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "answer", 5_000, { googleApiKey: "learner-key" });
    expect(r.engine).toBe("google-ai-studio");
    expect(r.score).toBe(90);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("x-goog-api-key")).toBe("learner-key");
  });

  it("never calls Google without a learner key", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
      if (url.endsWith("/api/chat")) return jsonResponse({ message: { content: JSON.stringify(EVAL) } });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "answer", 5_000, { googleApiKey: null });
    expect(r.engine).toBe("ollama");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("googleapis"))).toBe(false);
  });

  it("moves on to Ollama when Google rejects the learner's key", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("generativelanguage.googleapis.com"))
        return jsonResponse({ error: { message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }, 400);
      if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
      if (url.endsWith("/api/chat")) return jsonResponse({ message: { content: JSON.stringify(EVAL) } });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "answer", 5_000, { googleApiKey: "revoked-key" });
    expect(r.engine).toBe("ollama");
    // A rejected key is not retried in plain mode.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("googleapis"))).toHaveLength(1);
  });

  it("passes the learner's key to extraction and follow-up replies", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      return body.includes("NOTES:")
        ? googleReply({ concepts: [{ conceptTitle: "Mutex", coreFact: "One thread at a time.", initialQuestion: "What is a mutex?", expectedKeyPoints: ["one thread"] }] })
        : googleReply({ reply: "Right. The lock is the point." });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { extractConceptsFromNotes, replyToFollowUp } = await loadEngine();
    const x = await extractConceptsFromNotes("## Mutex\nA mutex lets one thread at a time into a critical section.", { googleApiKey: "k" });
    expect(x.engine).toBe("google-ai-studio");
    const f = await replyToFollowUp(CARD, "Why a lock?", "because", { googleApiKey: "k" });
    expect(f).toEqual({ reply: "Right. The lock is the point.", engine: "google-ai-studio" });
  });

  it("falls back to the heuristic engine when every provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
        if (url.endsWith("/api/chat")) return jsonResponse({ message: { content: "not json at all" } });
        return jsonResponse({ error: "quota" }, 429);
      }),
    );
    const { evaluateAndFollowUp, extractConceptsFromNotes } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "It uses the proton gradient across the inner mitochondrial membrane and makes ATP", 4_000, {
      googleApiKey: "test-key",
    });
    expect(r.engine).toBe("heuristic");
    expect(r.outcome).toBe("promote");

    const x = await extractConceptsFromNotes("## Glycolysis\nGlycolysis splits glucose into two pyruvate molecules in the cytoplasm and nets two ATP.", {
      googleApiKey: "test-key",
    });
    expect(x.engine).toBe("heuristic");
    expect(x.concepts[0].conceptTitle).toBe("Glycolysis");
  });

  it("normalizes extracted concepts from the model", async () => {
    const extraction = {
      concepts: [
        {
          conceptTitle: "  Glycolysis ",
          coreFact: "Splits glucose.",
          initialQuestion: "What does glycolysis do",
          expectedKeyPoints: ["a", "b", "c", "d", "e", "f"],
        },
        { conceptTitle: "glycolysis", coreFact: "dup", initialQuestion: "dup?", expectedKeyPoints: ["x"] },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/api/tags")
          ? jsonResponse({ models: [{ name: "gemma4:e4b" }] })
          : jsonResponse({ message: { content: JSON.stringify(extraction) } }),
      ),
    );
    const { extractConceptsFromNotes } = await loadEngine();
    const r = await extractConceptsFromNotes("notes");
    expect(r.engine).toBe("ollama");
    expect(r.concepts).toHaveLength(1);
    expect(r.concepts[0].conceptTitle).toBe("Glycolysis");
    expect(r.concepts[0].initialQuestion).toBe("What does glycolysis do?");
    expect(r.concepts[0].expectedKeyPoints).toHaveLength(5);
  });

  it("accepts a bare array of concepts from the model", async () => {
    const concepts = [
      { conceptTitle: "Mutex", coreFact: "One thread at a time.", initialQuestion: "What is a mutex?", expectedKeyPoints: ["one thread", "critical section"] },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/api/tags")
          ? jsonResponse({ models: [{ name: "gemma4:e4b" }] })
          : jsonResponse({ message: { content: JSON.stringify(concepts) } }),
      ),
    );
    const { extractConceptsFromNotes } = await loadEngine();
    const r = await extractConceptsFromNotes("notes");
    expect(r.engine).toBe("ollama");
    expect(r.concepts[0].conceptTitle).toBe("Mutex");
  });
});

describe("practice items and explanations", () => {
  beforeEach(() => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.test");
    vi.stubEnv("OLLAMA_MODEL", "gemma4:e4b");
    vi.stubEnv("GOOGLE_AI_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const cards = [
    { _id: "a", conceptTitle: "ATP Synthase", coreFact: CARD.coreFact, expectedKeyPoints: CARD.expectedKeyPoints },
    { _id: "b", conceptTitle: "Glycolysis", coreFact: "Glycolysis splits glucose into pyruvate in the cytoplasm.", expectedKeyPoints: ["splits glucose"] },
  ];
  const batch = {
    items: [
      {
        id: "c1",
        choice: { question: "What powers ATP synthase?", correct: "A proton gradient", distractors: ["Sunlight", "Glucose directly", "Oxygen gas"] },
        cloze: { sentence: "ATP synthase uses the proton ____ to make ATP.", answer: "gradient", alternatives: [] },
        trueFalse: { trueStatement: "It makes ATP.", falseStatement: "It makes glucose." },
        application: "A membrane starts leaking protons. What happens to ATP output",
        synthesis: "How is ATP synthase like a water wheel?",
      },
      { id: "c9", choice: { question: "Ignored?", correct: "x", distractors: ["a", "b", "c"] } },
    ],
  };

  it("asks Gemma for a batch and keeps only items that match a card", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
      expect(String(init?.body)).toContain("CARD c2");
      return jsonResponse({ message: { content: JSON.stringify(batch) } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { generatePractice } = await loadEngine();
    const { items, engine } = await generatePractice(cards, {}, { related: ["Krebs Cycle"] });
    expect(engine).toBe("ollama");
    expect([...items.keys()]).toEqual(["a"]);
    const a = items.get("a")!;
    expect(a.choice?.options).toContain("A proton gradient");
    expect(a.cloze?.answers).toEqual(["gradient"]);
    expect(a.questions?.application).toMatch(/\?$/);
  });

  it("returns nothing when only the offline engine is available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "down" }, 500)));
    const { generatePractice } = await loadEngine();
    const r = await generatePractice(cards, { googleApiKey: "k" });
    expect(r.engine).toBe("heuristic");
    expect(r.items.size).toBe(0);
  });

  it("uses the teach-back rubric and a 90 second limit for Teach it back", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
        bodies.push(String(init?.body));
        return jsonResponse({ message: { content: JSON.stringify(EVAL) } });
      }),
    );
    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "a long explanation", 60_000, { mode: "teach" });
    expect(r.outcome).toBe("promote");
    expect(r.latencyThresholdMs).toBe(90_000);
    expect(bodies[0]).toContain("explain a concept to someone who has never heard of it");
  });

  it("marks against the card's own time", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
        bodies.push(String(init?.body));
        return jsonResponse({ message: { content: JSON.stringify(EVAL) } });
      }),
    );
    const { evaluateAndFollowUp } = await loadEngine();
    // 20 seconds is slow for Write's base time, but inside this card's 31.
    const r = await evaluateAndFollowUp(CARD, "answer", 20_000, { latencyThresholdMs: 31_000 });
    expect(r).toMatchObject({ outcome: "promote", latencyThresholdMs: 31_000, nextQuestion: EVAL.nextQuestion, followUpQuestion: null });
    expect(bodies[0]).toContain("longer than 31s");
    expect(bodies[0]).not.toContain("socraticFollowUp");
  });

  it("tells the grader a voice answer was transcribed", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma4:e4b" }] });
        bodies.push(String(init?.body));
        return jsonResponse({ message: { content: JSON.stringify({ ...EVAL, feedback: "Good — clear." }) } });
      }),
    );
    const { evaluateAndFollowUp } = await loadEngine();
    const r = await evaluateAndFollowUp(CARD, "spoken words", 14_000, { mode: "voice" });
    expect(r.outcome).toBe("promote");
    expect(bodies[0]).toContain("transcribed by speech recognition");
    expect(r.feedback).toBe("Good, clear.");
  });

  it("explains a missed card in two sentences, with an offline fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/api/tags")
          ? jsonResponse({ models: [{ name: "gemma4:e4b" }] })
          : jsonResponse({ message: { content: JSON.stringify({ analogy: "It is a mill. Water turns it. Third." }) } }),
      ),
    );
    const { explainDifferently } = await loadEngine();
    expect(await explainDifferently(CARD, "Q?", "no idea")).toEqual({ analogy: "It is a mill. Water turns it.", engine: "ollama" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    const offline = await (await loadEngine()).explainDifferently(CARD, "Q?", "no idea");
    expect(offline.engine).toBe("heuristic");
    expect(offline.analogy.length).toBeGreaterThan(10);
  });
});
