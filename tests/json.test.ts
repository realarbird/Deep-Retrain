import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJsonObject, parseModelJson } from "@/lib/ai/json";

describe("extractJsonObject", () => {
  it("pulls JSON out of a fenced block", () => {
    expect(extractJsonObject('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it("finds the first balanced object in surrounding prose", () => {
    const raw = 'Sure! Here you go: {"a": {"b": "x}y"}, "c": [1,2]} Hope that helps {"d":2}';
    expect(extractJsonObject(raw)).toBe('{"a": {"b": "x}y"}, "c": [1,2]}');
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("parseModelJson", () => {
  const schema = z.object({ score: z.number(), feedback: z.string() });

  it("validates against a schema", () => {
    expect(parseModelJson('{"score": 88, "feedback": "ok"}', schema)).toEqual({ score: 88, feedback: "ok" });
  });

  it("tolerates trailing commas", () => {
    expect(parseModelJson('{"score": 88, "feedback": "ok",}', schema)).toEqual({ score: 88, feedback: "ok" });
  });

  it("throws on schema mismatch", () => {
    expect(() => parseModelJson('{"score": "high"}', schema)).toThrow();
  });
});

describe("top-level arrays", () => {
  it("returns a whole top-level array", () => {
    expect(extractJsonObject('[{"a":1},{"b":[2]}] trailing')).toBe('[{"a":1},{"b":[2]}]');
  });

  it("still prefers the object when prose comes first", () => {
    expect(extractJsonObject('Here: {"a":[1,2]}')).toBe('{"a":[1,2]}');
  });
});
