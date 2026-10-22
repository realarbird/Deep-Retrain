import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const reviewLogSchema = new Schema(
  {
    auth0Id: { type: String, required: true },
    cardId: { type: Schema.Types.ObjectId, ref: "ConceptCard", required: true },
    deckId: { type: Schema.Types.ObjectId, ref: "StudyDeck", required: true },
    conceptTitle: { type: String, default: "" },
    question: { type: String, default: "" },
    userAnswer: { type: String, default: "" },
    score: { type: Number, required: true },
    responseLatencyMs: { type: Number, required: true },
    outcome: { type: String, enum: ["promote", "hesitation", "reset"], required: true },
    boxBefore: { type: Number, required: true },
    boxAfter: { type: Number, required: true },
    difficultyTier: { type: String, enum: ["recall", "application", "synthesis"], required: true },
    feedback: { type: String, default: "" },
    followUpQuestion: { type: String, default: null },
    followUpAnswer: { type: String, default: null },
    followUpReply: { type: String, default: null },
    analogy: { type: String, default: null },
    retrievedConceptIds: [{ type: Schema.Types.ObjectId, ref: "ConceptCard" }],
    engine: { type: String, enum: ["ollama", "google-ai-studio", "heuristic", "simulated"], required: true },
    simulated: { type: Boolean, default: false },
    reviewedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

reviewLogSchema.index({ auth0Id: 1, reviewedAt: -1 });
reviewLogSchema.index({ cardId: 1, reviewedAt: -1 });

export type ReviewLogDoc = InferSchemaType<typeof reviewLogSchema> & { _id: mongoose.Types.ObjectId };

export const ReviewLog: Model<InferSchemaType<typeof reviewLogSchema>> =
  mongoose.models.ReviewLog || mongoose.model("ReviewLog", reviewLogSchema);
