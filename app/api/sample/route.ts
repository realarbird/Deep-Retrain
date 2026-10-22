import { NextResponse } from "next/server";
import { readJson, withIdentity } from "@/lib/api";
import { seedSampleDeck } from "@/lib/sampleDecks";
import { sampleBodySchema } from "@/lib/validation";

/** One-click sample deck (AP Biology or CS) with a few cards due immediately. */
export const POST = withIdentity(async (identity, request: Request) => {
  const { deck, tzOffsetMinutes } = sampleBodySchema.parse(await readJson(request));
  const seeded = await seedSampleDeck(identity, deck, tzOffsetMinutes);
  return NextResponse.json({ ...seeded, deckId: String(seeded.deckId) }, { status: 201 });
});
