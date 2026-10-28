/**
 * Grading for the modes that don't need a model (answer key and self-rating),
 * the feedback they show, and the question a card carries into its next review.
 */
import { heuristicQuestion } from "@/lib/ai/heuristic";
import type { OutcomeResult, SelfRating } from "@/lib/leitner";
import {
  gradeChoice,
  gradeCloze,
  gradeTrueFalse,
  practiceQuestion,
  type ChoicePractice,
  type ClozePractice,
  type PracticeCard,
  type TrueFalsePractice,
} from "@/lib/practice";

export interface KeyGrade {
  score: number;
  correct: boolean;
  feedback: string;
  /** Shown after answering: the right option, the missing term, or whether the statement was true. */
  correctAnswer: string;
  /** What the learner gave, as stored in the review log. */
  given: string;
}

export function gradeChoiceAttempt(choice: ChoicePractice, given: string): KeyGrade {
  const { correct, correctText } = gradeChoice(choice, given);
  return {
    score: correct ? 100 : 0,
    correct,
    feedback: correct ? `Right: “${correctText}”.` : `Not quite. The answer was “${correctText}”.`,
    correctAnswer: correctText,
    given,
  };
}

export function gradeTrueFalseAttempt(tf: TrueFalsePractice, statementId: string, answer: boolean): KeyGrade | null {
  const graded = gradeTrueFalse(tf, statementId, answer);
  if (!graded) return null;
  const { correct, isTrue, statement } = graded;
  const feedback = correct
    ? isTrue
      ? "Right, that one is true."
      : "Right, that one was false."
    : isTrue
      ? "That one was actually true."
      : "That one was false.";
  return { score: correct ? 100 : 0, correct, feedback, correctAnswer: isTrue ? "True" : "False", given: `${answer ? "True" : "False"}: ${statement}` };
}

export function gradeClozeAttempt(cloze: ClozePractice, given: string): KeyGrade {
  const { score, match, expected } = gradeCloze(cloze, given);
  const feedback =
    match === "exact"
      ? `Exactly: “${expected}”.`
      : match === "stem"
        ? `Right. The card says “${expected}”.`
        : match === "typo"
          ? `Close enough. It's spelled “${expected}”.`
          : given.trim()
            ? `The missing term was “${expected}”.`
            : `It was “${expected}”.`;
  return { score, correct: match !== "wrong", feedback, correctAnswer: expected, given };
}

export function selfRatedFeedback(rating: SelfRating): string {
  switch (rating) {
    case "again":
      return "Marked as forgotten. It starts over tomorrow.";
    case "hard":
      return "Marked as hard, so it stays where it is.";
    case "good":
      return "Marked as known.";
    case "easy":
      return "Marked as easy.";
  }
}

export interface NextQuestionCard extends PracticeCard {
  currentQuestion: string;
  initialQuestion: string;
}

/**
 * A reset goes back to the first question. A promotion into a harder tier
 * gets a harder question: Gemma's own when it graded the answer, a stored one
 * otherwise, then a template. Anything else keeps the question it had.
 */
export function chooseNextQuestion(card: NextQuestionCard, decision: OutcomeResult, modelNextQuestion: string | null): string {
  if (decision.outcome === "reset") return card.initialQuestion;
  if (decision.outcome !== "promote" || decision.boxCapped) return card.currentQuestion;
  if (modelNextQuestion) return modelNextQuestion;
  if (decision.difficultyTier === "recall") return card.currentQuestion;
  return practiceQuestion(card, decision.difficultyTier) ?? heuristicQuestion(card.conceptTitle, decision.difficultyTier, []);
}
