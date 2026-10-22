import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userProfileSchema = new Schema(
  {
    auth0Id: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    email: { type: String, default: null },
    isDemo: { type: Boolean, default: false },
    lastActiveAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export const UserProfile: Model<InferSchemaType<typeof userProfileSchema>> =
  mongoose.models.UserProfile || mongoose.model("UserProfile", userProfileSchema);
