/**
 * Background job: ask Gemma for practice items (multiple choice, cloze,
 * true/false, harder questions) for cards that don't have them yet. Runs after
 * the response is sent, one job per learner at a time, and never overwrites a
 * card that was edited while Gemma was writing.
 */
import { getGoogleApiKey } from "@/lib/aiKey";
import { activeEngine, generatePractice } from "@/lib/engine";
import type { Identity } from "@/lib/identity";
import { storedPractice, toStoredPractice } from "@/lib/practice";
import { ConceptCard } from "@/models/ConceptCard";

const BATCH = 8;
const MAX_CARDS_PER_JOB = 24;
const inFlight = new Set<string>();

export async function fillPractice(identity: Identity, cardIds: string[]): Promise<number> {
  const ids = [...new Set(cardIds)].slice(0, MAX_CARDS_PER_JOB);
  if (!ids.length || inFlight.has(identity.userId)) return 0;
  inFlight.add(identity.userId);
  try {
    const googleApiKey = await getGoogleApiKey(identity);
    if ((await activeEngine({ googleApiKey })) === "heuristic") return 0;

    const cards = await ConceptCard.find({ auth0Id: identity.userId, _id: { $in: ids } })
      .select("deckId conceptTitle coreFact expectedKeyPoints practice")
      .lean();
    const todo = cards.filter((c) => !storedPractice(c));
    if (!todo.length) return 0;

    const deckIds = [...new Set(todo.map((c) => String(c.deckId)))];
    const deckTitles = await ConceptCard.find({ auth0Id: identity.userId, deckId: { $in: deckIds } })
      .select("conceptTitle")
      .limit(200)
      .lean();

    let written = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const own = new Set(batch.map((c) => c.conceptTitle));
      const related = [...new Set(deckTitles.map((c) => c.conceptTitle).filter((t) => !own.has(t)))].slice(0, 12);
      const { items, engine } = await generatePractice(batch, { googleApiKey }, { related });
      if (engine === "heuristic") break;
      for (const card of batch) {
        const parts = items.get(String(card._id));
        if (!parts) continue;
        // Only if the card still reads the way it did when Gemma saw it.
        const res = await ConceptCard.updateOne(
          {
            _id: card._id,
            auth0Id: identity.userId,
            conceptTitle: card.conceptTitle,
            coreFact: card.coreFact,
            expectedKeyPoints: card.expectedKeyPoints,
          },
          { $set: { practice: toStoredPractice(card, parts, engine) } },
        );
        written += res.modifiedCount;
      }
    }
    return written;
  } finally {
    inFlight.delete(identity.userId);
  }
}
