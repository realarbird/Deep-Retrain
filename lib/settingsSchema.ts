/**
 * Study preferences. They follow the learner's account: Auth0 `app_metadata`
 * holds the copy every device reads, MongoDB keeps a mirror (and is the only
 * copy in Demo Mode). This file is pure so the browser can use it too.
 */
import { z } from "zod";
import { STUDY_MODES } from "@/lib/leitner";
import { DATE_KEY_PATTERN } from "@/lib/timezone";

export const CAP_MIN = 5;
export const CAP_MAX = 25;
export const DEFAULT_CAP = 15;

export const DEFAULT_MODES = ["auto", ...STUDY_MODES] as const;
export type DefaultMode = (typeof DEFAULT_MODES)[number];
export const SESSION_SIZES = [5, 10, 15, "all"] as const;
export type SessionSize = (typeof SESSION_SIZES)[number];
export const THEMES = ["system", "light", "dark"] as const;
export type ThemeSetting = (typeof THEMES)[number];
/** "More time on every card", in percent, like extra time in an exam. */
export const EXTRA_TIME = [0, 25, 50, 100] as const;
export type ExtraTime = (typeof EXTRA_TIME)[number];
const extraTimeSchema = z.union([z.literal(0), z.literal(25), z.literal(50), z.literal(100)]);

const speechSchema = z.object({
  rate: z.number().min(0.6).max(1.4),
  pauseSec: z.number().int().min(2).max(15),
});

export const settingsSchema = z.object({
  v: z.literal(1),
  dailyCap: z.number().int().min(CAP_MIN).max(CAP_MAX),
  /** When the cap was raised today, the old cap holds until tomorrow. */
  capPrev: z.number().int().min(CAP_MIN).max(CAP_MAX).nullable(),
  capChangedOn: z.string().regex(DATE_KEY_PATTERN).nullable(),
  defaultMode: z.enum(DEFAULT_MODES),
  /** What Auto mode uses for cards in box 3 and up. */
  freeRecall: z.enum(["write", "voice"]),
  sessionSize: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal("all")]),
  showTimer: z.boolean(),
  /** Added to every card's time to answer. */
  extraTime: extraTimeSchema,
  askConfidence: z.boolean(),
  handwriting: z.boolean(),
  speech: speechSchema,
  theme: z.enum(THEMES),
  reduceMotion: z.boolean(),
  updatedAt: z.string().nullable(),
});
export type Settings = z.infer<typeof settingsSchema>;

/** What a learner can change. Everything is optional; unknown keys are refused. */
export const settingsPatchSchema = z
  .object({
    dailyCap: z.number().int().min(CAP_MIN).max(CAP_MAX),
    defaultMode: z.enum(DEFAULT_MODES),
    freeRecall: z.enum(["write", "voice"]),
    sessionSize: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal("all")]),
    showTimer: z.boolean(),
    extraTime: extraTimeSchema,
    askConfidence: z.boolean(),
    handwriting: z.boolean(),
    speech: speechSchema.partial(),
    theme: z.enum(THEMES),
    reduceMotion: z.boolean(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export function clampCap(n: number): number {
  return Math.min(CAP_MAX, Math.max(CAP_MIN, Math.round(n)));
}

export function defaultSettings(cap = DEFAULT_CAP): Settings {
  return {
    v: 1,
    dailyCap: clampCap(cap),
    capPrev: null,
    capChangedOn: null,
    defaultMode: "auto",
    freeRecall: "write",
    sessionSize: 10,
    showTimer: true,
    extraTime: 0,
    askConfidence: false,
    handwriting: true,
    speech: { rate: 1, pauseSec: 5 },
    theme: "system",
    reduceMotion: false,
    updatedAt: null,
  };
}

/** Read stored settings, keeping every valid field and defaulting the rest. */
export function parseSettings(raw: unknown, defaults: Settings = defaultSettings()): Settings {
  if (!raw || typeof raw !== "object") return defaults;
  const input = raw as Record<string, unknown>;
  const whole = settingsSchema.safeParse({ ...defaults, ...input, speech: { ...defaults.speech, ...(input.speech as object) } });
  if (whole.success) return whole.data;

  const out: Record<string, unknown> = { ...defaults };
  for (const [key, schema] of Object.entries(settingsSchema.shape)) {
    if (input[key] === undefined) continue;
    const field = (schema as z.ZodType).safeParse(key === "speech" ? { ...defaults.speech, ...(input.speech as object) } : input[key]);
    if (field.success) out[key] = field.data;
  }
  return settingsSchema.parse(out);
}

/** Today's cap. Raising the cap waits until tomorrow, so it can't be used to keep cramming. */
export function effectiveDailyCap(settings: Settings, todayKey: string): number {
  const { dailyCap, capPrev, capChangedOn } = settings;
  return capChangedOn === todayKey && capPrev !== null && capPrev < dailyCap ? capPrev : dailyCap;
}

export function applySettingsPatch(current: Settings, patch: SettingsPatch, todayKey: string, now: Date): Settings {
  const { speech, ...rest } = patch;
  const next: Settings = {
    ...current,
    ...rest,
    speech: { ...current.speech, ...(speech ?? {}) },
    updatedAt: now.toISOString(),
  };
  if (patch.dailyCap !== undefined && patch.dailyCap !== current.dailyCap) {
    const today = effectiveDailyCap(current, todayKey);
    if (patch.dailyCap > today) {
      next.capPrev = today;
      next.capChangedOn = todayKey;
    } else {
      next.capPrev = null;
      next.capChangedOn = null;
    }
  }
  return next;
}

/** The newer of two copies by `updatedAt`. A copy with a timestamp beats one without. */
export function newerSettings(a: Settings | null, b: Settings | null): Settings | null {
  if (!a) return b;
  if (!b) return a;
  return (a.updatedAt ?? "") >= (b.updatedAt ?? "") ? a : b;
}
