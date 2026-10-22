/**
 * AES-256-GCM sealing for secrets we hand to third parties (the learner's
 * AI Studio key is stored in Auth0 only in this form).
 *
 * The data key is derived from AUTH0_SECRET with HKDF, so Auth0 never holds
 * anything it can decrypt. Each sealed value is bound to a context string
 * (the learner's Auth0 `sub`) as associated data: copied onto another account,
 * it fails to open.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const INFO = "deepretain/google-ai-key/v1";

function dataKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "deepretain", INFO, 32));
}

function serverSecret(): string {
  const secret = process.env.AUTH0_SECRET?.trim();
  if (!secret) throw new Error("AUTH0_SECRET is not set");
  return secret;
}

export function sealSecret(plaintext: string, context: string, secret = serverSecret()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dataKey(secret), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, ...[iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64url"))].join(".");
}

/** Returns null for anything that was not sealed with this secret and context. */
export function openSecret(sealed: string, context: string, secret = serverSecret()): string | null {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", dataKey(secret), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
