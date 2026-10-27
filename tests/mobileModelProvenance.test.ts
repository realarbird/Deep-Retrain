import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { LOCAL_MODEL_ID, LOCAL_MODEL_SHA256, mobileOperationSchema } from "@/lib/mobileSyncSchema";
const provenance = { modelId: LOCAL_MODEL_ID, modelSha256: LOCAL_MODEL_SHA256 };
const mac = { modelId: "ollama:gemma4:e4b", modelSha256: "370c2879f17648d337b0ab4e208fdce348e24d1060064e93d7645daafd56d39c" };
function review(mode: string, model: { modelId: string | null; modelSha256: string | null }) {
  return { id: randomUUID(), type: "review", occurredAt: new Date().toISOString(), payload: { cardId: "a".repeat(24), reviewLogId: "b".repeat(24), mode, answer: { answer: "A study answer" }, latencyMs: 1234, attemptId: randomUUID(), score: 90, feedback: "Accurate", tzOffsetMinutes: 0, ...model } };
}
describe("local model provenance", () => {
  it("accepts the exact pinned Android and Mac weight artifacts", () => {
    expect(mobileOperationSchema.safeParse(review("write", provenance)).success).toBe(true);
    expect(mobileOperationSchema.safeParse(review("teach", mac)).success).toBe(true);
    expect(mobileOperationSchema.safeParse(review("write", { ...mac, modelSha256: "4c27e0f5b5adf02ac956c7322bd2ee7636fe3f45a8512c9aba5385242cb6e09a" })).success).toBe(true);
  });
  it("rejects an unknown or mismatched digest and does not trust a mutable tag alone", () => {
    for (const model of [{ ...mac, modelSha256: LOCAL_MODEL_SHA256 }, { ...provenance, modelSha256: "0".repeat(64) }, { ...mac, modelId: "ollama:gemma4:latest" }]) expect(mobileOperationSchema.safeParse(review("write", model)).success).toBe(false);
  });
  it.each(["choice", "cloze", "truefalse", "flip", "listen"])("allows null provenance for deterministic %s", mode => {
    expect(mobileOperationSchema.safeParse(review(mode, { modelId: null, modelSha256: null })).success).toBe(true);
  });
  it.each(["write", "voice", "teach"])("requires provenance for model-graded %s", mode => {
    expect(mobileOperationSchema.safeParse(review(mode, { modelId: null, modelSha256: null })).success).toBe(false);
  });
  it("requires either both null values or a valid model/digest pair", () => {
    expect(mobileOperationSchema.safeParse(review("flip", { modelId: null, modelSha256: LOCAL_MODEL_SHA256 })).success).toBe(false);
    expect(mobileOperationSchema.safeParse(review("flip", { modelId: LOCAL_MODEL_ID, modelSha256: null })).success).toBe(false);
  });
});
