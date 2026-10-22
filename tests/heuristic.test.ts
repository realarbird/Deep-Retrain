import { describe, expect, it } from "vitest";
import {
  heuristicEvaluate,
  heuristicExtract,
  heuristicFollowUpReply,
  tokenize,
} from "@/lib/ai/heuristic";

const NOTES = `# Cellular Respiration

Cellular respiration converts glucose into ATP. Glycolysis happens in the cytoplasm and yields 2 ATP.
The Krebs cycle runs in the mitochondrial matrix and produces NADH and FADH2.

## Electron Transport Chain

The electron transport chain on the inner mitochondrial membrane pumps protons to build a gradient.
ATP synthase uses the proton gradient to make most of the cell's ATP. Oxygen is the final electron acceptor.

## Photosynthesis
- Light reactions in the thylakoid membrane split water and release oxygen.
- The Calvin cycle in the stroma fixes carbon dioxide into sugar using ATP and NADPH.
`;

describe("tokenize", () => {
  it("lowercases, drops stopwords, and lightly stems", () => {
    expect(tokenize("The Proton gradients are pumped")).toEqual(["proton", "gradient", "pump"]);
  });
});

describe("heuristicExtract", () => {
  const concepts = heuristicExtract(NOTES);

  it("creates one concept per section", () => {
    expect(concepts.map((c) => c.conceptTitle)).toEqual([
      "Cellular Respiration",
      "Electron Transport Chain",
      "Photosynthesis",
    ]);
  });

  it("fills every required field", () => {
    for (const c of concepts) {
      expect(c.coreFact.length).toBeGreaterThan(20);
      expect(c.initialQuestion).toMatch(/\?$/);
      expect(c.expectedKeyPoints.length).toBeGreaterThanOrEqual(2);
      expect(c.expectedKeyPoints.length).toBeLessThanOrEqual(5);
    }
  });

  it("chunks heading-less notes by paragraph", () => {
    const flat = heuristicExtract(
      "Hash tables map keys to buckets using a hash function. Collisions are resolved by chaining or probing.\n\nBinary search halves a sorted array each step. It runs in logarithmic time.",
    );
    expect(flat).toHaveLength(2);
  });

  it("caps output at 12 concepts", () => {
    const many = Array.from({ length: 20 }, (_, i) => `## Topic ${i}\nTopic ${i} explains an idea about item number ${i} in detail.`).join("\n\n");
    expect(heuristicExtract(many)).toHaveLength(12);
  });
});

describe("heuristicEvaluate", () => {
  const card = {
    conceptTitle: "Electron Transport Chain",
    coreFact: "The ETC pumps protons across the inner mitochondrial membrane; ATP synthase uses the gradient to make ATP.",
    expectedKeyPoints: [
      "pumps protons across the inner mitochondrial membrane",
      "ATP synthase uses the proton gradient",
      "oxygen is the final electron acceptor",
    ],
    currentQuestion: "How does the electron transport chain produce ATP?",
    difficultyTier: "recall" as const,
  };

  it("scores a complete answer as accurate", () => {
    const r = heuristicEvaluate(
      card,
      "It pumps protons across the inner mitochondrial membrane, then ATP synthase uses that proton gradient. Oxygen is the final electron acceptor.",
      [],
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.missingKeyPoints).toHaveLength(0);
  });

  it("scores a vague answer as inaccurate and names what is missing", () => {
    const r = heuristicEvaluate(card, "It makes energy somehow.", []);
    expect(r.score).toBeLessThan(80);
    expect(r.missingKeyPoints.length).toBeGreaterThan(0);
    expect(r.analogy.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(r.socraticFollowUp).toMatch(/\?$/);
    expect(r.nextQuestion).toMatch(/\?$/);
  });

  it("uses related concepts in synthesis questions", () => {
    const r = heuristicEvaluate({ ...card, difficultyTier: "application" }, "protons gradient synthase oxygen acceptor membrane", [
      { conceptTitle: "Krebs Cycle", coreFact: "Produces NADH." },
    ]);
    expect(r.nextQuestion).toContain("Krebs Cycle");
  });
});

describe("heuristicFollowUpReply", () => {
  it("returns a short reply", () => {
    const reply = heuristicFollowUpReply({ conceptTitle: "X", coreFact: "X does Y because of Z." }, "Because of Z");
    expect(reply.reply.length).toBeGreaterThan(10);
  });
});
