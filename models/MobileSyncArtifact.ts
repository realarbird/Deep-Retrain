import mongoose, { Schema } from "mongoose";

/** User-owned local outputs and attempts which could not safely change canonical progress. */
const schema = new Schema({
  auth0Id: { type: String, required: true, index: true },
  operationId: { type: String, required: true },
  cardId: { type: Schema.Types.ObjectId, default: null },
  reviewLogId: { type: Schema.Types.ObjectId, default: null },
  kind: { type: String, enum: ["analogy", "followUp", "conflict", "rejected"], required: true },
  input: { type: String, default: "" },
  output: { type: String, default: "" },
  engine: { type: String, default: "on-device" },
  modelId: { type: String, default: null },
  modelSha256: { type: String, default: null },
  occurredAt: { type: Date, required: true },
  /** Includes the original local answer or draft, never discarded on a conflict. */
  operation: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true });
schema.index({ auth0Id: 1, operationId: 1, kind: 1 }, { unique: true });
export const MobileSyncArtifact = mongoose.models.MobileSyncArtifact || mongoose.model("MobileSyncArtifact", schema);
