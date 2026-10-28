"use client";

/** Shapes returned by the API routes, as consumed by client components, plus small browser helpers. */
import type { CardRow } from "@/lib/cards";
import type { DeviceInfo } from "@/lib/devices";
import type { ForecastDay, Readiness } from "@/lib/examPlan";
import { LATENCY_THRESHOLD_MS, MODE_RULES, type SelfRating, type StudyMode } from "@/lib/leitner";
import type { Settings } from "@/lib/settingsSchema";
import type { Stats } from "@/lib/stats";
import type { StudyItem } from "@/lib/studyQueue";

export type { CardRow, DeviceInfo, ForecastDay, Readiness, Settings, Stats, StudyItem, StudyMode, SelfRating };

export type EngineId = "ollama" | "google-ai-studio" | "heuristic";
export type Tier = "recall" | "application" | "synthesis";
export type Outcome = "promote" | "hesitation" | "reset";

export interface ReviewCard {
  id: string;
  deckId: string;
  conceptTitle: string;
  question: string;
  leitnerBox: number;
  difficultyTier: Tier;
  reviewCount: number;
  lastLatencyMs: number | null;
  nextReviewDate: string;
}

export interface CapStatus {
  used: number;
  limit: number;
  remaining: number;
  reached: boolean;
  resetsAt: string;
}

export interface SyncState {
  status: "synced" | "pending" | "offline" | "local";
  lastSyncedAt: string | null;
  error: string | null;
}

export interface DeckSummary {
  id: string;
  title: string;
  sourceType: "notes" | "sample";
  cardCount: number;
  dueNow: number;
  examDate: string | null;
  examLabel: string;
}

export interface DashboardData {
  identity: { name: string; mode: "auth0" | "demo"; picture: string | null };
  engine: { id: EngineId; label: string };
  aiKey: { saved: boolean };
  settings: Settings;
  sync: SyncState;
  devices: DeviceInfo[];
  thisDevice: string | null;
  boxes: { box: number; intervalDays: number; count: number }[];
  totals: {
    cards: number;
    dueNow: number;
    mastered: number;
    reviewedToday: number;
    streakDays: number;
    longestStreak: number;
    avgLatency7d: number | null;
    avgScore7d: number | null;
    minutesThisWeek: number;
    recallNow: number | null;
    totalReviews: number;
  };
  cap: CapStatus;
  dueCards: ReviewCard[];
  nextDue: { at: string; conceptTitle: string } | null;
  forecast: ForecastDay[];
  exam: {
    deckId: string;
    title: string;
    examDate: string;
    examLabel: string;
    daysLeft: number;
    readiness: Readiness | null;
  } | null;
  hasSimulatedHistory: boolean;
  decks: DeckSummary[];
  recentReviews: {
    id: string;
    conceptTitle: string;
    outcome: Outcome;
    score: number;
    latencyMs: number;
    boxBefore: number;
    boxAfter: number;
    reviewedAt: string;
    engine: string;
    mode: StudyMode;
  }[];
}

export interface StudyResponse {
  items: StudyItem[];
  cap: CapStatus;
  dueTotal: number;
  mode: string;
  settings: { askConfidence: boolean; showTimer: boolean };
}

export interface ReviewResponse {
  reviewLogId: string;
  replayed?: boolean;
  result: {
    mode: StudyMode;
    score: number;
    feedback: string;
    coveredKeyPoints: string[];
    missingKeyPoints: string[];
    outcome: Outcome;
    boxBefore: number;
    newBox: number;
    intervalDays: number;
    nextReviewDate: string;
    examAdjusted: boolean;
    difficultyTier: Tier;
    isFast: boolean;
    isAccurate: boolean;
    boxCapped: boolean;
    latencyThresholdMs: number | null;
    latencyMs: number;
    followUpQuestion: string | null;
    analogy: string | null;
    nextQuestion: string | null;
    correctAnswer: string | null;
    selfRating: SelfRating | null;
    engine: string;
  };
  reveal: { coreFact: string; expectedKeyPoints: string[] };
  retrieval: {
    method: "atlas-vector-search" | "in-app-cosine" | "none";
    scopedTo: "auth0" | "demo";
    concepts: { id: string; conceptTitle: string; score: number }[];
  };
  cap: CapStatus;
}

export interface SettingsResponse {
  settings: Settings;
  devices: DeviceInfo[];
  sync: SyncState;
  thisDevice: string | null;
  capToday: number;
  capFromTomorrow: number;
}

export const LATENCY_THRESHOLD_S = LATENCY_THRESHOLD_MS / 1000;

export const TIER_LABEL: Record<Tier, string> = {
  recall: "Recall",
  application: "Application",
  synthesis: "Synthesis",
};

export const ENGINE_SHORT: Record<string, string> = {
  "on-device": "On-device Gemma 4",
  ollama: "Gemma 4 (Ollama)",
  "google-ai-studio": "Gemma 4",
  heuristic: "Offline grader",
  simulated: "Simulated",
  "answer-key": "Answer key",
  "self-rated": "Your own rating",
};

/** For sentences: "Graded by Gemma 4", "Graded by the offline grader". */
export function engineName(engine: string): string {
  if (engine === "heuristic") return "the offline grader";
  if (engine === "answer-key") return "the answer key";
  if (engine === "self-rated") return "your own rating";
  return ENGINE_SHORT[engine] ?? engine;
}

export interface ModeInfo {
  label: string;
  /** What you do, in a few words. */
  blurb: string;
  /** Typical time per card, for the session picker. */
  pace: string;
  /** Who grades it. */
  grader: string;
}

export const MODE_INFO: Record<StudyMode | "auto", ModeInfo> = {
  auto: { label: "Auto", blurb: "Taps for new cards, typing for the ones you know. It picks for you.", pace: "mixed", grader: "mixed" },
  choice: { label: "Multiple choice", blurb: "Pick one of four.", pace: "about 5 s a card", grader: "answer key" },
  truefalse: { label: "True or false", blurb: "One statement, two buttons.", pace: "about 4 s a card", grader: "answer key" },
  flip: { label: "Flip", blurb: "Think of the answer, flip the card, say how it went.", pace: "about 6 s a card", grader: "you" },
  cloze: { label: "Fill the gap", blurb: "Recall a key term or phrase.", pace: "about 8 s a card", grader: "answer key" },
  write: { label: "Write", blurb: "Answer in your own words.", pace: "about 20 s a card", grader: "Gemma" },
  voice: { label: "Say it", blurb: "Answer out loud. Your browser turns it into text.", pace: "about 15 s a card", grader: "Gemma" },
  teach: { label: "Teach it back", blurb: "Explain it to someone who's never heard of it.", pace: "about a minute a card", grader: "Gemma" },
  listen: { label: "Listen", blurb: "Hands-free. It reads the question, waits, then reads the answer.", pace: "about 15 s a card", grader: "you" },
};

export function modeTopBox(mode: StudyMode): number {
  return MODE_RULES[mode].topBox;
}

export interface AiKeyStatus {
  saved: boolean;
  hint: string | null;
  model: string;
  verified?: boolean;
}

export const GOOGLE_KEY_URL = "https://aistudio.google.com/api-keys";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

const DEVICE_KEY = "deepretain:device-id";

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Plain-HTTP testing on a LAN has no randomUUID.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** A random id for this browser, so the account can list the devices you study on. Nothing else is in it. */
export function deviceId(): string | null {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = randomId();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const device = typeof window === "undefined" ? null : deviceId();
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(device ? { "x-deepretain-device": device } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError((body.error as string) || `Request failed (${res.status})`, res.status, body);
  return body as T;
}

export function tzOffset(): number {
  return new Date().getTimezoneOffset();
}

export function tzName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** `tz=…&tzName=…` for API calls that need the learner's local calendar. */
export function zoneQuery(): string {
  const name = tzName();
  return `tz=${tzOffset()}${name ? `&tzName=${encodeURIComponent(name)}` : ""}`;
}

export function attemptId(): string {
  return randomId();
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [ms, unit] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return diff >= 0 ? "in a moment" : "just now";
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "six cards", "12 cards": words for small numbers, the way a person would write them. */
export function countWords(n: number, noun: string, plural = `${noun}s`): string {
  const word = n >= 0 && n <= 10 ? SMALL[n] : n.toLocaleString();
  return `${word} ${n === 1 ? noun : plural}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDate(dateKey: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}
