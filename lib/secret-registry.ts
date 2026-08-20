/**
 * In-memory record of secrets this process has decrypted, so Sentry's
 * beforeSend can redact any that leaked into an error message or
 * breadcrumb by value rather than by key name.
 *
 * Deliberately separate from lib/secrets.ts, which imports node:crypto:
 * lib/sentry-scrub.ts is loaded by the BROWSER Sentry SDK too
 * (instrumentation-client.ts), so it must not pull crypto into the client
 * bundle. On the browser this registry simply stays empty - nothing
 * decrypts there - which is correct and costs nothing.
 */

const MAX_TRACKED_SECRETS = 32;
// Short values would cause absurd over-redaction of unrelated text.
const MIN_TRACKED_LENGTH = 8;

const knownSecrets: string[] = [];

export function rememberSecretForScrubbing(secret: string) {
  if (secret.length < MIN_TRACKED_LENGTH || knownSecrets.includes(secret)) {
    return;
  }
  knownSecrets.push(secret);
  // Bounded so a long-lived server process can't grow this without limit.
  if (knownSecrets.length > MAX_TRACKED_SECRETS) {
    knownSecrets.shift();
  }
}

/** Replaces any known decrypted secret found in `text` with a placeholder. */
export function redactKnownSecrets(text: string): string {
  let result = text;
  for (const secret of knownSecrets) {
    if (result.includes(secret)) {
      result = result.split(secret).join("[redacted-secret]");
    }
  }
  return result;
}

/** Test-only: clears the tracked-secret list between cases. */
export function __resetKnownSecretsForTests() {
  knownSecrets.length = 0;
}
