import { connection, NextResponse } from "next/server";
import { googleConfigured, googleGemmaModel } from "@/lib/ai/googleAiStudio";
import { getOllamaStatus, ollamaChatModel, ollamaEmbedModel } from "@/lib/ai/ollama";
import { ENGINE_LABELS } from "@/lib/ai/types";
import { auth0Configured } from "@/lib/auth0";
import { connectDB } from "@/lib/db";
import { activeEngine } from "@/lib/gemma";
import { demoModeEnabled } from "@/lib/identity";

/** Liveness + dependency report. Always 200 so Render's health check only tracks the web process. */
export async function GET() {
  await connection();

  let mongo: "connected" | "unconfigured" | "error" = "unconfigured";
  if (process.env.MONGODB_URI) {
    try {
      await connectDB();
      mongo = "connected";
    } catch {
      mongo = "error";
    }
  }

  const ollama = await getOllamaStatus();
  const engine = await activeEngine();

  return NextResponse.json({
    ok: true,
    mongo,
    ai: {
      active: engine,
      label: ENGINE_LABELS[engine],
      ollama: {
        reachable: ollama.reachable,
        chatModel: ollamaChatModel(),
        chatModelInstalled: ollama.models.some((m) => m.split(":")[0] === ollamaChatModel().split(":")[0]),
        embedModel: ollamaEmbedModel(),
      },
      googleAiStudio: { configured: googleConfigured(), model: googleGemmaModel() },
    },
    auth: { auth0: auth0Configured, demoMode: demoModeEnabled() },
  });
}
