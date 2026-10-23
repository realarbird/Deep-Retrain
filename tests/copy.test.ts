import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The UI should read like a person wrote it. These files hold every string a
 * learner sees (components, pages, feedback written by the offline grader,
 * sample decks, grading copy), so they're checked for the usual tells.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const DIRS = ["components", "app"];
const FILES = ["lib/ai/heuristic.ts", "lib/sampleDeckData.ts", "lib/reviewFlow.ts", "lib/client.ts", "lib/account.ts", "lib/ai/prompts.ts"];
const BANNED = [
  /—/,
  /\bunlock\b/i,
  /\bsupercharge/i,
  /\bseamless/i,
  /\beffortless/i,
  /\belevate\b/i,
  /\bempower/i,
  /\brevolutioni[sz]e/i,
  /game[- ]chang/i,
  /\bdelve\b/i,
  /cutting[- ]edge/i,
  /\bunleash/i,
  /harness the power/i,
  /\blevel up\b/i,
  /\bjourney\b/i,
  /✨|🚀|🎉|💡/u,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
}

describe("copy", () => {
  const files = [...DIRS.flatMap((d) => walk(path.join(ROOT, d))), ...FILES.map((f) => path.join(ROOT, f))];

  it("checks a meaningful set of files", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("has no em dashes, hype words or emoji in learner-facing text", () => {
    const problems: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          for (const pattern of BANNED) {
            // Prompts tell the model not to use em dashes; that one line is allowed to name them.
            if (pattern.source === "—" && /No em dashes/.test(line)) continue;
            if (pattern.test(line)) problems.push(`${path.relative(ROOT, file)}:${i + 1} ${pattern} ${line.trim().slice(0, 80)}`);
          }
        });
    }
    expect(problems).toEqual([]);
  });
});
