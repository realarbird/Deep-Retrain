import mongoose, { Schema } from "mongoose";

/** Permanent idempotency ledger. A receipt and its effects commit in the same transaction. */
const schema = new Schema({
  auth0Id: { type: String, required: true },
  operationId: { type: String, required: true },
  requestHash: { type: String, required: true },
  operation: { type: Schema.Types.Mixed, required: true },
  result: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });
schema.index({ auth0Id: 1, operationId: 1 }, { unique: true });
export const MobileSyncReceipt = mongoose.models.MobileSyncReceipt || mongoose.model("MobileSyncReceipt", schema);
