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

async function loadGemma() {
  vi.resetModules();
  return import("@/lib/gemma");
}

describe("gemma provider chain", () => {
  beforeEach(() => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.test");
    vi.stubEnv("OLLAMA_MODEL", "gemma2:9b");
    vi.stubEnv("GEMINI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses Ollama when it is up and promotes a fast accurate answer", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma2:9b" }] });
      if (url.endsWith("/api/chat")) return jsonResponse({ message: { content: JSON.stringify(EVAL) } });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { evaluateAndFollowUp } = await loadGemma();
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
          ? jsonResponse({ models: [{ name: "gemma2:9b" }] })
          : jsonResponse({ message: { content: JSON.stringify(EVAL) } }),
      ),
    );
    const { evaluateAndFollowUp } = await loadGemma();
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
          ? jsonResponse({ models: [{ name: "gemma2:9b" }] })
          : jsonResponse({ message: { content: JSON.stringify(longAnalogy) } }),
      ),
    );
    const { evaluateAndFollowUp } = await loadGemma();
    const r = await evaluateAndFollowUp(CARD, "wrong", 3_000);
    expect(r.outcome).toBe("reset");
    expect(r.analogy).toBe("One. Two.");
  });

  it("falls back to Google AI Studio when Ollama is unreachable", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("ollama.test")) throw new TypeError("fetch failed");
      if (url.includes("generativelanguage.googleapis.com"))
        return jsonResponse({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(EVAL) + "\n```" }] } }] });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { evaluateAndFollowUp } = await loadGemma();
    const r = await evaluateAndFollowUp(CARD, "answer", 5_000);
    expect(r.engine).toBe("google-ai-studio");
    expect(r.score).toBe(90);
  });

  it("falls back to the heuristic engine when every provider fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "gemma2:9b" }] });
        if (url.endsWith("/api/chat")) return jsonResponse({ message: { content: "not json at all" } });
        return jsonResponse({ error: "quota" }, 429);
      }),
    );
    const { evaluateAndFollowUp, extractConceptsFromNotes } = await loadGemma();
    const r = await evaluateAndFollowUp(CARD, "It uses the proton gradient across the inner mitochondrial membrane and makes ATP", 4_000);
    expect(r.engine).toBe("heuristic");
    expect(r.outcome).toBe("promote");

    const x = await extractConceptsFromNotes("## Glycolysis\nGlycolysis splits glucose into two pyruvate molecules in the cytoplasm and nets two ATP.");
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
          ? jsonResponse({ models: [{ name: "gemma2:9b" }] })
          : jsonResponse({ message: { content: JSON.stringify(extraction) } }),
      ),
    );
    const { extractConceptsFromNotes } = await loadGemma();
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
          ? jsonResponse({ models: [{ name: "gemma2:9b" }] })
          : jsonResponse({ message: { content: JSON.stringify(concepts) } }),
      ),
    );
    const { extractConceptsFromNotes } = await loadGemma();
    const r = await extractConceptsFromNotes("notes");
    expect(r.engine).toBe("ollama");
    expect(r.concepts[0].conceptTitle).toBe("Mutex");
  });
});
