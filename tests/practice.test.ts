import { describe, expect, it } from "vitest";
import {
  BLANK,
  PRACTICE_VERSION,
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
  it("can blank the complete concept title instead of an arbitrary word", () => {
    const cloze = heuristicCloze(card)!;
    expect(cloze.answers).toEqual(["Glycolysis"]);
    expect(cloze.text).toBe(card.coreFact.replace("Glycolysis", BLANK));
  });

  it("prefers the hand-picked terms when they appear in the fact", () => {
    expect(heuristicCloze(card, ["pyruvate"])).toEqual({ text: card.coreFact.replace("pyruvate", BLANK), answers: ["pyruvate"] });
  });

  it("uses explicit phrases, acronyms, names and dates supported by the card", () => {
    const cases = [
      { coreFact: "The proton gradient drives ATP synthase in the membrane.", expectedKeyPoints: ["Key terms: ATP synthase, proton gradient"], answer: "ATP synthase" },
      { coreFact: "Cells capture energy as ATP during respiration.", expectedKeyPoints: ["energy captured as ATP"], answer: "ATP" },
      { coreFact: "Napoleon fought at Waterloo in 1815.", expectedKeyPoints: ["Napoleon fought at Waterloo"], answer: "Napoleon" },
      { coreFact: "They fought their final battle in 1815.", expectedKeyPoints: ["The final battle was in 1815"], answer: "1815" },
    ];
    for (const { answer, ...content } of cases) {
      const input = { ...card, conceptTitle: "Review", ...content };
      expect(heuristicCloze(input)?.answers, input.coreFact).toEqual([answer]);
      expect(heuristicCloze(input)).toEqual(heuristicCloze(input));
    }
  });

  it("doesn't select ordinary verbs, filler, or just the longest word", () => {
    for (const coreFact of ["They fought together and worked hard.", "It happens differently and unexpectedly.", "They eventually made something important."]) {
      expect(heuristicCloze({ ...card, conceptTitle: "Overview", coreFact, expectedKeyPoints: [coreFact] })).toBeNull();
    }
  });

  it("never creates repeated blanks or leaves the answer elsewhere", () => {
    const repeated = { ...card, coreFact: "Glycolysis starts the process; glycolysis finishes the process.", expectedKeyPoints: [] };
    expect(heuristicCloze(repeated, ["Glycolysis"])).toBeNull();
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

  it("protects acronyms, chemical charges, short terms and formula operators", () => {
    for (const [given, expected] of [["ADP", "ATP"], ["RNA", "DNA"], ["atps", "ATP"], ["ADP synthase", "ATP synthase"], ["NAD", "NAD+"], ["NAD", "NAD-"], ["H-", "H+"], ["H2", "H2O"], ["G", "ΔG"], ["cup", "cap"]]) {
      expect(fuzzyTermMatch(given, expected), `${given} / ${expected}`).toBe("wrong");
    }
    expect(fuzzyTermMatch("atp", "ATP")).toBe("exact");
    expect(fuzzyTermMatch("NAD+", "NAD+")).toBe("exact");
    expect(fuzzyTermMatch("ΔG", "ΔG")).toBe("exact");
    expect(fuzzyTermMatch("atp syntase", "ATP synthase")).toBe("typo");
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
    const stored = toStoredPractice(card, { cloze: { text: `Glycolysis takes place in the ${BLANK}.`, answers: ["cytoplasm"] } }, "google-ai-studio");
    const withPractice = { ...card, practice: stored };
    expect(storedPractice(withPractice)).toEqual(stored);
    expect(practiceVersion(withPractice)).toBe(`s:${cardSourceHash(card)}`);
    expect(resolvePractice(withPractice, siblings).cloze?.answers).toEqual(["cytoplasm"]);

    const edited = { ...withPractice, coreFact: `${card.coreFact} Edited.` };
    expect(storedPractice(edited)).toBeNull();
    expect(practiceVersion(edited)).toMatch(/^h:/);
  });

  it("rebuilds the heuristic items on request even when stored ones exist", () => {
    const stored = toStoredPractice(card, { cloze: { text: `Glycolysis takes place in the ${BLANK}.`, answers: ["cytoplasm"] } }, "ollama");
    const r = resolvePractice({ ...card, practice: stored }, siblings, { useStored: false });
    expect(r.source).toBe("heuristic");
    expect(r.cloze?.answers).not.toEqual(["cytoplasm"]);
  });

  it("retires legacy practice and rejects stored questions with unsupported answers", () => {
    const practice = toStoredPractice(card, { cloze: { text: `Glycolysis happens in the ${BLANK}.`, answers: ["cytoplasm"] } }, "ollama");
    expect(PRACTICE_VERSION).toBeGreaterThan(1);
    expect(storedPractice({ ...card, practice: { ...practice, v: 1 } })).toBeNull();
    expect(storedPractice({ ...card, practice: { ...practice, cloze: { text: `They ${BLANK}.`, answers: ["fought"] } } })).toBeNull();
    expect(storedPractice({ ...card, practice: { ...practice, cloze: { text: `The cytoplasm contains ${BLANK}.`, answers: ["cytoplasm"] } } })).toBeNull();
  });
});

describe("normalizePracticeItem", () => {
  it.each(["fought", "happened", "makes", "important", "they"])("rejects ordinary or grammatical answer %s even when it occurs in key points", (answer) => {
    const content = { ...card, coreFact: `They fought and happened to make important discoveries.`, expectedKeyPoints: [`they fought; happened; makes; important`] };
    expect(normalizePracticeItem({ cloze: { sentence: `A question with ${BLANK}.`, answer } }, content).cloze).toBeUndefined();
  });

  it("accepts a scientific phrase and rejects invented answers, duplicates and multiple gaps", () => {
    const content = { ...card, coreFact: "ATP synthase uses a proton gradient to produce ATP.", expectedKeyPoints: ["ATP synthase uses a proton gradient"] };
    expect(normalizePracticeItem({ cloze: { sentence: `The proton gradient drives ${BLANK}.`, answer: "ATP synthase" } }, content).cloze?.answers).toEqual(["ATP synthase"]);
    for (const cloze of [
      { sentence: `It uses ${BLANK}.`, answer: "chlorophyll" },
      { sentence: `ATP synthase drives ${BLANK}.`, answer: "ATP synthase" },
      { sentence: `${BLANK} uses ${BLANK}.`, answer: "ATP synthase" },
    ]) expect(normalizePracticeItem({ cloze }, content).cloze).toBeUndefined();
  });

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
