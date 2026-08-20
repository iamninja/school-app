import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { rememberSecretForScrubbing } from "@/lib/secret-registry";

/**
 * AES-256-GCM encryption for integration credentials stored in
 * private.integration_credentials.
 *
 * THREAT MODEL - what this does and doesn't buy:
 *
 * The key lives in the app's environment (Vercel), the ciphertext lives in
 * Postgres (Supabase). Those are different trust domains, so a
 * Supabase-only compromise - a leaked backup, a PITR restore, someone
 * running `db dump` onto a laptop, an accidental future GRANT - yields
 * ciphertext that is useless without the key.
 *
 * It does NOT protect against app-server compromise. Anyone who can run
 * code in the Next.js server reads both BUSINESS_SECRETS_KEY and
 * SUPABASE_SERVICE_ROLE_KEY from the same environment. That's an accepted
 * limit, not an oversight: defending against it needs an external KMS/HSM,
 * which isn't proportionate for a single-operator business.
 */

const VERSION = "v1";
const IV_BYTES = 12; // GCM standard
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = process.env.BUSINESS_SECRETS_KEY;
  if (!raw) {
    throw new Error(
      "BUSINESS_SECRETS_KEY is not set - generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    // Deliberately doesn't echo the key or its real length - an error
    // message is exactly the kind of thing that ends up in a log.
    throw new Error(
      "BUSINESS_SECRETS_KEY must decode to 32 bytes of base64 (AES-256)",
    );
  }

  cachedKey = key;
  return key;
}

/**
 * Binds ciphertext to the row it belongs to. Without this, a blob is
 * portable between rows: anyone who can write the table could promote the
 * sandbox credential into the production row and have it decrypt cleanly.
 */
function aad(context: SecretContext): Buffer {
  return Buffer.from(
    `${VERSION}|${context.provider}|${context.credentialKey}|${context.environment}`,
    "utf8",
  );
}

export interface SecretContext {
  provider: string;
  credentialKey: string;
  environment: string;
}

export function encryptSecret(
  plaintext: string,
  context: SecretContext,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(aad(context));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(
  stored: string,
  context: SecretContext,
): string {
  const parts = stored.split(":");

  // Fails closed. The tempting alternative - "no known prefix, so treat it
  // as a legacy plaintext value and return it" - would turn this column
  // into a plaintext passthrough and skip tag verification entirely.
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored secret is not in a recognised encrypted format");
  }

  const iv = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("Stored secret has a malformed IV or authentication tag");
  }

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAAD(aad(context));
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  rememberSecretForScrubbing(plaintext);
  return plaintext;
}

/** Constant-time compare, for any future credential-verification path. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
