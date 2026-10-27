import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const deviceSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: "" },
    kind: { type: String, enum: ["phone", "tablet", "desktop"], default: "desktop" },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

/**
 * One row per learner. For signed-in learners the settings, devices and
 * progress here mirror their Auth0 `app_metadata` (Auth0 is the source of
 * truth); for Demo Mode this is the only copy.
 */
const userProfileSchema = new Schema(
  {
    auth0Id: { type: String, required: true, unique: true },
    mobileSyncSequence: { type: Number, default: 0 },
    name: { type: String, default: "" },
    email: { type: String, default: null },
    isDemo: { type: Boolean, default: false },
    lastActiveAt: { type: Date, default: () => new Date() },
    settings: { type: Schema.Types.Mixed, default: null },
    devices: { type: [deviceSchema], default: [] },
    progress: { type: Schema.Types.Mixed, default: null },
    progressSyncedAt: { type: Date, default: null },
    draft: {
      type: new Schema(
        {
          title: { type: String, default: "" },
          text: { type: String, default: "" },
          updatedAt: { type: Date, default: () => new Date() },
          deviceLabel: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: null,
    },
    sync: {
      type: new Schema(
        {
          pending: { type: Boolean, default: false },
          lastSyncedAt: { type: Date, default: null },
          lastError: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

export const UserProfile: Model<InferSchemaType<typeof userProfileSchema>> =
  mongoose.models.UserProfile || mongoose.model("UserProfile", userProfileSchema);
