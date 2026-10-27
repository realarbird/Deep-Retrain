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
    engine: {
      type: String,
      enum: ["ollama", "google-ai-studio", "heuristic", "simulated", "answer-key", "self-rated", "on-device"],
      required: true,
    },
    modelId: { type: String, default: null },
    modelSha256: { type: String, default: null },
    operationId: { type: String, default: null },
    rawAnswer: { type: Schema.Types.Mixed, default: null },
    coveredKeyPoints: { type: [String], default: [] },
    missingKeyPoints: { type: [String], default: [] },
    simulated: { type: Boolean, default: false },
    reviewedAt: { type: Date, required: true, default: () => new Date() },
    /** How the card was answered. Older logs have no field and count as "write". */
    mode: {
      type: String,
      enum: ["write", "voice", "teach", "flip", "listen", "choice", "truefalse", "cloze"],
      default: "write",
    },
    selfRating: { type: String, enum: ["again", "hard", "good", "easy", null], default: null },
    /** 1 = guessing, 2 = unsure, 3 = sure. Only asked when the learner turns it on. */
    confidence: { type: Number, min: 1, max: 3, default: null },
    /** Time to the first keystroke, for typed answers. */
    thinkMs: { type: Number, default: null },
    sessionId: { type: String, default: null },
    /** Client-generated id so a retried submit replays instead of moving the card twice. */
    attemptId: { type: String, default: undefined },
    device: {
      type: new Schema({ kind: String, label: String }, { _id: false }),
      default: null,
    },
    /** The daily cap in force when this review was logged. */
    capLimit: { type: Number, default: null },
    boxCapped: { type: Boolean, default: false },
    examAdjusted: { type: Boolean, default: false },
    /** The response sent for this review, replayed if the same attempt is submitted again. */
    replay: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

reviewLogSchema.index({ auth0Id: 1, reviewedAt: -1 });
reviewLogSchema.index({ cardId: 1, reviewedAt: -1 });
reviewLogSchema.index(
  { auth0Id: 1, attemptId: 1 },
  { unique: true, partialFilterExpression: { attemptId: { $type: "string" } } },
);

export type ReviewLogDoc = InferSchemaType<typeof reviewLogSchema> & { _id: mongoose.Types.ObjectId };

export const ReviewLog: Model<InferSchemaType<typeof reviewLogSchema>> =
  mongoose.models.ReviewLog || mongoose.model("ReviewLog", reviewLogSchema);
