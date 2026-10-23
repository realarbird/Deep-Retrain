import { describe, expect, it } from "vitest";
import {
  BLANK,
  cardSourceHash,
  fuzzyTermMatch,
  gradeChoice,
  gradeCloze,
  gradeTrueFalse,
  heuristicChoice,
  heuristicCloze,
  heuristicTrueFalse,
  maskTerms,
  normalizePracticeItem,
  pickStatement,
  practiceVersion,
  resolvePractice,
  statementId,
  storedPractice,
  titleTerms,
  toStoredPractice,
} from "@/lib/practice";
import { curatedPractice } from "@/lib/sampleDecks";
import { SAMPLE_DECKS } from "@/lib/sampleDeckData";

const card = {
  _id: "card-1",
  conceptTitle: "Glycolysis",
  coreFact: "Glycolysis splits one glucose molecule into two pyruvate in the cytoplasm, netting 2 ATP and 2 NADH without needing oxygen.",
  expectedKeyPoints: ["occurs in the cytoplasm", "glucose is split into two pyruvate", "net gain of 2 ATP and 2 NADH"],
};
const siblings = [
  { conceptTitle: "Krebs Cycle", coreFact: "The Krebs cycle runs in the mitochondrial matrix and produces NADH and FADH2." },
  { conceptTitle: "Calvin Cycle", coreFact: "The Calvin cycle fixes carbon dioxide in the stroma." },
  { conceptTitle: "Electron Transport Chain", coreFact: "The electron transport chain pumps protons across the inner membrane." },
  { conceptTitle: "Fermentation", coreFact: "Fermentation regenerates NAD+ without oxygen." },
];

describe("masking", () => {
  it("hides the title and its distinctive words, including acronyms", () => {
    expect(titleTerms("TCP vs UDP")).toEqual(expect.arrayContaining(["TCP vs UDP", "TCP", "UDP"]));
    expect(maskTerms("TCP is reliable; UDP is not.", titleTerms("TCP vs UDP"))).toBe(`${BLANK} is reliable; ${BLANK} is not.`);
    expect(maskTerms(card.coreFact, titleTerms(card.conceptTitle))).not.toMatch(/glycolysis/i);
  });
});

describe("multiple choice", () => {
  it("asks which concept a masked fact describes, with four distinct titles", () => {
    const choice = heuristicChoice(card, siblings)!;
    expect(choice.options).toHaveLength(4);
    expect(new Set(choice.options).size).toBe(4);
    expect(choice.options[choice.answerIndex]).toBe("Glycolysis");
    expect(choice.question).not.toMatch(/glycolysis/i);
  });

  it("is deterministic, so the server can rebuild what it served", () => {
    expect(heuristicChoice(card, siblings)).toEqual(heuristicChoice(card, [...siblings].reverse()));
  });

  it("needs at least three deck mates", () => {
    expect(heuristicChoice(card, siblings.slice(0, 2))).toBeNull();
  });

  it("grades by the option text", () => {
    const choice = heuristicChoice(card, siblings)!;
    expect(gradeChoice(choice, "Glycolysis").correct).toBe(true);
    expect(gradeChoice(choice, "Krebs Cycle")).toEqual({ correct: false, correctText: "Glycolysis" });
  });
});

describe("fill the gap", () => {
  it("blanks a key-point term that isn't in the title", () => {
    const cloze = heuristicCloze(card)!;
    expect(cloze.text).toContain(BLANK);
    expect(cloze.answers[0]).not.toMatch(/glycolysis/i);
    expect(card.expectedKeyPoints.join(" ").toLowerCase()).toContain(cloze.answers[0].toLowerCase());
  });

  it("prefers the hand-picked terms when they appear in the fact", () => {
    expect(heuristicCloze(card, ["pyruvate"])).toEqual({ text: card.coreFact.replace("pyruvate", BLANK), answers: ["pyruvate"] });
  });

  it("forgives plurals, endings and small typos, but not wrong numbers", () => {
    expect(fuzzyTermMatch("Pyruvate", "pyruvate")).toBe("exact");
    expect(fuzzyTermMatch("the cytoplasm", "cytoplasm")).toBe("exact");
    expect(fuzzyTermMatch("pyruvates", "pyruvate")).toBe("stem");
    expect(fuzzyTermMatch("pyrovate", "pyruvate")).toBe("typo");
    expect(fuzzyTermMatch("nonnegative", "non-negative")).toBe("typo");
    expect(fuzzyTermMatch("3", "2")).toBe("wrong");
    expect(fuzzyTermMatch("mitochondria", "cytoplasm")).toBe("wrong");
    expect(fuzzyTermMatch("", "cytoplasm")).toBe("wrong");
  });

  it("scores exact, close and wrong answers", () => {
    const cloze = { text: `x ${BLANK}`, answers: ["cytoplasm", "cytosol"] };
    expect(gradeCloze(cloze, "cytosol").score).toBe(100);
    expect(gradeCloze(cloze, "cytoplasn").score).toBe(85);
    expect(gradeCloze(cloze, "nucleus")).toMatchObject({ score: 0, match: "wrong", expected: "cytoplasm" });
  });
});

describe("true or false", () => {
  it("builds a false statement from a deck mate's fact with the names swapped", () => {
    const tf = heuristicTrueFalse(card, siblings)!;
    expect(tf.statements[0]).toBe(card.coreFact);
    expect(tf.statements[1]).toMatch(/Glycolysis/);
    expect(tf.statements[1]).not.toBe(card.coreFact);
  });

  it("serves one statement by id and grades it", () => {
    const tf = heuristicTrueFalse(card, siblings)!;
    const served = pickStatement({ ...card, reviewCount: 0 }, tf);
    const isTrue = served.statement === tf.statements[0];
    expect(gradeTrueFalse(tf, served.statementId, isTrue)?.correct).toBe(true);
    expect(gradeTrueFalse(tf, served.statementId, !isTrue)?.correct).toBe(false);
    expect(gradeTrueFalse(tf, "00000000", true)).toBeNull();
    expect(statementId(served.statement)).toBe(served.statementId);
  });
});

describe("stored practice", () => {
  it("is used only while the card reads the same", () => {
    const stored = toStoredPractice(card, { cloze: { text: `${BLANK} happens`, answers: ["x"] } }, "google-ai-studio");
    const withPractice = { ...card, practice: stored };
    expect(storedPractice(withPractice)).toEqual(stored);
    expect(practiceVersion(withPractice)).toBe(`s:${cardSourceHash(card)}`);
    expect(resolvePractice(withPractice, siblings).cloze?.answers).toEqual(["x"]);

    const edited = { ...withPractice, coreFact: `${card.coreFact} Edited.` };
    expect(storedPractice(edited)).toBeNull();
    expect(practiceVersion(edited)).toMatch(/^h:/);
  });

  it("rebuilds the heuristic items on request even when stored ones exist", () => {
    const stored = toStoredPractice(card, { cloze: { text: `${BLANK} happens`, answers: ["x"] } }, "ollama");
    const r = resolvePractice({ ...card, practice: stored }, siblings, { useStored: false });
    expect(r.source).toBe("heuristic");
    expect(r.cloze?.answers).not.toEqual(["x"]);
  });
});

describe("normalizePracticeItem", () => {
  it("keeps good parts and drops bad ones", () => {
    const parts = normalizePracticeItem(
      {
        choice: { question: "Where does glycolysis happen", correct: "In the cytoplasm", distractors: ["In the nucleus", "In the nucleus", "All of the above", "In the stroma"] },
        cloze: { sentence: "Glycolysis happens in the ___.", answer: "cytoplasm", alternatives: ["cytosol"] },
        trueFalse: { trueStatement: "It makes pyruvate.", falseStatement: "It makes pyruvate." },
        application: "A cell has no oxygen. What still runs",
        synthesis: "",
      },
      card,
    );
    // Only two usable distractors after removing the duplicate and "all of the above".
    expect(parts.choice).toBeUndefined();
    expect(parts.cloze).toEqual({ text: `Glycolysis happens in the ${BLANK}.`, answers: ["cytoplasm", "cytosol"] });
    expect(parts.trueFalse).toBeUndefined();
    expect(parts.questions).toEqual({ application: "A cell has no oxygen. What still runs?" });
  });

  it("shuffles the correct answer into four options and strips em dashes", () => {
    const parts = normalizePracticeItem(
      {
        choice: { question: "Where does it happen — exactly?", correct: "Cytoplasm", distractors: ["Nucleus", "Stroma", "Matrix"] },
      },
      card,
    );
    expect(parts.choice?.options).toHaveLength(4);
    expect(parts.choice?.options[parts.choice.answerIndex]).toBe("Cytoplasm");
    expect(parts.choice?.question).toBe("Where does it happen, exactly?");
  });
});

describe("sample decks", () => {
  it("have curated cloze and true/false items for every concept", () => {
    for (const deck of Object.values(SAMPLE_DECKS)) {
      for (const concept of deck.concepts) {
        const practice = curatedPractice(concept);
        expect(practice.cloze, concept.conceptTitle).toBeDefined();
        expect(concept.clozeTerms.some((t) => practice.cloze!.answers.includes(t)), concept.conceptTitle).toBe(true);
        expect(practice.trueFalse?.statements[1]).toBe(concept.falseStatement);
        expect(practice.questions?.application).toBe(concept.applicationQuestion);
        expect(storedPractice({ _id: "x", ...concept, practice })).not.toBeNull();
      }
    }
  });
});
