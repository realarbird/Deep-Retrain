"use client";

/** Shapes returned by the API routes, as consumed by client components. */

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

export interface DashboardData {
  identity: { name: string; mode: "auth0" | "demo"; picture: string | null };
  engine: { id: EngineId; label: string };
  aiKey: { saved: boolean };
  boxes: { box: number; intervalDays: number; count: number }[];
  totals: {
    cards: number;
    dueNow: number;
    mastered: number;
    reviewedToday: number;
    streakDays: number;
    avgLatency7d: number | null;
    avgScore7d: number | null;
  };
  cap: CapStatus;
  dueCards: ReviewCard[];
  nextDue: { at: string; conceptTitle: string } | null;
  latencyTrend?: { date: string; avgSeconds: number | null; movingAvgSeconds: number | null; reviews: number }[];
  hasSimulatedHistory: boolean;
  decks: { id: string; title: string; sourceType: "notes" | "sample"; cardCount: number }[];
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
  }[];
}

export interface ReviewResponse {
  reviewLogId: string;
  result: {
    score: number;
    feedback: string;
    coveredKeyPoints: string[];
    missingKeyPoints: string[];
    outcome: Outcome;
    boxBefore: number;
    newBox: number;
    intervalDays: number;
    nextReviewDate: string;
    difficultyTier: Tier;
    isFast: boolean;
    isAccurate: boolean;
    latencyMs: number;
    followUpQuestion: string | null;
    analogy: string | null;
    nextQuestion: string | null;
    engine: EngineId;
  };
  reveal: { coreFact: string; expectedKeyPoints: string[] };
  retrieval: {
    method: "atlas-vector-search" | "in-app-cosine" | "none";
    scopedTo: "auth0" | "demo";
    concepts: { id: string; conceptTitle: string; score: number }[];
  };
  cap: CapStatus;
}

export const LATENCY_THRESHOLD_S = 12;

export const TIER_LABEL: Record<Tier, string> = {
  recall: "Recall",
  application: "Application",
  synthesis: "Synthesis",
};

export const ENGINE_SHORT: Record<string, string> = {
  ollama: "Gemma 4 (Ollama)",
  "google-ai-studio": "Gemma 4",
  heuristic: "Offline grader",
  simulated: "Simulated",
};

/** For sentences: "Graded by Gemma 4", "Graded by the offline grader". */
export function engineName(engine: string): string {
  return engine === "heuristic" ? "the offline grader" : (ENGINE_SHORT[engine] ?? engine);
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

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
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
