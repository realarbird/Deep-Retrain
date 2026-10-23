import { after, connection, NextResponse } from "next/server";
import { ZodError } from "zod";
import { connectDB, DatabaseNotConfiguredError } from "@/lib/db";
import { getIdentity, type Identity } from "@/lib/identity";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function requireIdentity(): Promise<Identity> {
  const identity = await getIdentity();
  if (!identity) throw new HttpError(401, "Sign in or enter Demo Mode to continue.");
  return identity;
}

/** Resolve the caller, connect to MongoDB, and turn thrown errors into JSON responses. */
export function withIdentity<Args extends unknown[]>(
  handler: (identity: Identity, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    // Every API route reads the session cookie, so opt out of build-time prerendering.
    // Kept outside the try so Next's prerender bail-out isn't swallowed as an error.
    await connection();
    try {
      const identity = await requireIdentity();
      await connectDB();
      return await handler(identity, ...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  if (err instanceof DatabaseNotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

/**
 * Run work after the response is sent (Auth0 sync, practice generation).
 * Errors are logged, never thrown. Outside a request (tests, scripts) it just
 * runs in the background.
 */
export function safeAfter(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.warn(`[after:${label}]`, (err as Error).message);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
