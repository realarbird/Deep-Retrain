import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export { EMBEDDING_DIMENSIONS } from "@/lib/ai/types";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai/types";

const conceptCardSchema = new Schema(
  {
    auth0Id: { type: String, required: true, index: true },
    deckId: { type: Schema.Types.ObjectId, ref: "StudyDeck", required: true },
    conceptTitle: { type: String, required: true, trim: true },
    coreFact: { type: String, required: true },
    initialQuestion: { type: String, required: true },
    currentQuestion: { type: String, required: true },
    expectedKeyPoints: { type: [String], default: [] },
    leitnerBox: { type: Number, min: 1, max: 5, default: 1 },
    nextReviewDate: { type: Date, required: true, default: () => new Date() },
    latencyHistory: { type: [Number], default: [] },
    difficultyTier: {
      type: String,
      enum: ["recall", "application", "synthesis"],
      default: "recall",
    },
    embedding: {
      type: [Number],
      default: [],
      validate: {
        validator: (v: number[]) => v.length === 0 || v.length === EMBEDDING_DIMENSIONS,
        message: `embedding must have ${EMBEDDING_DIMENSIONS} dimensions`,
      },
    },
    embeddingModel: { type: String, default: "" },
    reviewCount: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    lastScore: { type: Number, default: null },
    lastReviewedAt: { type: Date, default: null },
    source: { type: String, enum: ["ingest", "sample"], default: "ingest" },
  },
  { timestamps: true },
);

conceptCardSchema.index({ auth0Id: 1, nextReviewDate: 1 });
conceptCardSchema.index({ auth0Id: 1, deckId: 1 });

export type ConceptCardDoc = InferSchemaType<typeof conceptCardSchema> & { _id: mongoose.Types.ObjectId };

export const ConceptCard: Model<InferSchemaType<typeof conceptCardSchema>> =
  mongoose.models.ConceptCard || mongoose.model("ConceptCard", conceptCardSchema);
