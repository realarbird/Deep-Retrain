import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const studyDeckSchema = new Schema(
  {
    auth0Id: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    sourceType: { type: String, enum: ["notes", "sample"], default: "notes" },
    sampleKey: { type: String, default: null },
    cardCount: { type: Number, default: 0 },
    engine: { type: String, enum: ["ollama", "google-ai-studio", "heuristic", "curated"], default: "curated" },
    /** Local calendar date of the exam (YYYY-MM-DD), or null. */
    examDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    examLabel: { type: String, default: "", trim: true, maxlength: 60 },
  },
  { timestamps: true },
);

export type StudyDeckDoc = InferSchemaType<typeof studyDeckSchema> & { _id: mongoose.Types.ObjectId };

export const StudyDeck: Model<InferSchemaType<typeof studyDeckSchema>> =
  mongoose.models.StudyDeck || mongoose.model("StudyDeck", studyDeckSchema);
