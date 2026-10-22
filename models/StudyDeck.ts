import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const studyDeckSchema = new Schema(
  {
    auth0Id: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    sourceType: { type: String, enum: ["notes", "sample"], default: "notes" },
    sampleKey: { type: String, default: null },
    cardCount: { type: Number, default: 0 },
    engine: { type: String, enum: ["ollama", "google-ai-studio", "heuristic", "curated"], default: "curated" },
  },
  { timestamps: true },
);

export type StudyDeckDoc = InferSchemaType<typeof studyDeckSchema> & { _id: mongoose.Types.ObjectId };

export const StudyDeck: Model<InferSchemaType<typeof studyDeckSchema>> =
  mongoose.models.StudyDeck || mongoose.model("StudyDeck", studyDeckSchema);
