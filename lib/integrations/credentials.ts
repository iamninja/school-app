import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

/**
 * Reads and writes private.integration_credentials.
 *
 * This file deliberately has NO "use server" directive and is NOT part of
 * app/protected/teacher/business-settings-actions.ts. Every exported async
 * function in a "use server" module is registered as a callable HTTP
 * endpoint whether or not any client component imports it - so putting
 * getDecryptedCredential() there would ship a public, unauthenticated
 * plaintext-credential oracle. `server-only` makes importing this from a
 * client component a build error rather than a silent leak.
 *
 * Callers in app/ must do their own authorization (requireTeacher) before
 * calling anything here: the service-role client bypasses RLS entirely, so
 * on this path the app is the only authorization boundary there is.
 */

export const INTEGRATION_REGISTRY = {
  aade_mydata: {
    label: "AADE myDATA",
    credentialKeys: ["user_id", "subscription_key"],
  },
} as const;

export type IntegrationProvider = keyof typeof INTEGRATION_REGISTRY;
export type IntegrationEnvironment = "sandbox" | "production";

/**
 * private.integration_credentials is reached exclusively through
 * SECURITY DEFINER functions in `public`, never queried directly:
 * PostgREST refuses to route to any schema outside [api] schemas at all
 * (PGRST106), even for service_role. That's the isolation we want, and
 * these functions are the deliberate, narrow way in - EXECUTE on them is
 * granted only to service_role.
 */

/**
 * Validates provider/credentialKey against the compile-time registry
 * rather than trusting caller-supplied strings straight into a query.
 */
export function assertValidCredentialRef(
  provider: string,
  credentialKey: string,
): asserts provider is IntegrationProvider {
  const entry = INTEGRATION_REGISTRY[provider as IntegrationProvider];
  if (!entry) {
    throw new Error(`Unknown integration provider: ${provider}`);
  }
  if (!(entry.credentialKeys as readonly string[]).includes(credentialKey)) {
    throw new Error(
      `Unknown credential "${credentialKey}" for provider ${provider}`,
    );
  }
}

export interface CredentialStatus {
  hasValue: boolean;
  lastFour: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
}

/** Never returns the secret itself - only enough for the UI to show state. */
export async function getCredentialStatus(
  provider: string,
  credentialKey: string,
  environment: IntegrationEnvironment,
): Promise<CredentialStatus> {
  assertValidCredentialRef(provider, credentialKey);

  const { data, error } = await createServiceRoleClient().rpc(
    "get_integration_credential_status",
    {
      p_provider: provider,
      p_credential_key: credentialKey,
      p_environment: environment,
    },
  );

  if (error) {
    throw error;
  }

  const row = (data ?? [])[0];
  return {
    hasValue: Boolean(row),
    lastFour: row?.last_four ?? null,
    updatedAt: row?.updated_at ?? null,
    lastUsedAt: row?.last_used_at ?? null,
  };
}

export async function setCredential(
  provider: string,
  credentialKey: string,
  environment: IntegrationEnvironment,
  plaintextValue: string,
): Promise<void> {
  assertValidCredentialRef(provider, credentialKey);

  const trimmed = plaintextValue.trim();
  if (!trimmed) {
    throw new Error("Credential value cannot be empty");
  }

  const context = { provider, credentialKey, environment };
  const { error } = await createServiceRoleClient().rpc(
    "set_integration_credential",
    {
      p_provider: provider,
      p_credential_key: credentialKey,
      p_environment: environment,
      p_encrypted_value: encryptSecret(trimmed, context),
      p_last_four: trimmed.slice(-4),
    },
  );

  if (error) {
    throw error;
  }
}

export async function deleteCredential(
  provider: string,
  credentialKey: string,
  environment: IntegrationEnvironment,
): Promise<void> {
  assertValidCredentialRef(provider, credentialKey);

  const { error } = await createServiceRoleClient().rpc(
    "delete_integration_credential",
    {
      p_provider: provider,
      p_credential_key: credentialKey,
      p_environment: environment,
    },
  );

  if (error) {
    throw error;
  }
}

/**
 * Returns the decrypted credential for the provider's CURRENTLY ACTIVE
 * environment. There is deliberately no `environment` parameter: two
 * sources of truth for which environment is live is how you end up filing
 * real tax documents from a test path, or filing nothing when you thought
 * you had. It resolves from integration_settings and never falls back to
 * the other environment's row.
 *
 * Server-side integration code only. Never log or interpolate the result.
 */
export async function getDecryptedCredential(
  provider: string,
  credentialKey: string,
): Promise<string> {
  const environment = await getActiveEnvironmentFor(provider);
  return getDecryptedCredentialForEnvironment(
    provider,
    credentialKey,
    environment,
  );
}

async function getActiveEnvironmentFor(
  provider: string,
): Promise<IntegrationEnvironment> {
  const { data: settings, error } = await createServiceRoleClient()
    .from("integration_settings")
    .select("active_environment, enabled")
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw error;
  if (!settings) {
    throw new Error(`Integration ${provider} is not configured`);
  }
  if (!settings.enabled) {
    throw new Error(`Integration ${provider} is disabled`);
  }

  return settings.active_environment as IntegrationEnvironment;
}

/**
 * Same as getDecryptedCredential, but for a caller-specified environment
 * rather than whichever one is currently active - for operations on a
 * PAST fact tied to a specific environment (e.g. verifying an already
 * -filed receipt), where the active environment may have moved on since.
 */
export async function getDecryptedCredentialForEnvironment(
  provider: string,
  credentialKey: string,
  environment: IntegrationEnvironment,
): Promise<string> {
  assertValidCredentialRef(provider, credentialKey);

  // Also stamps last_used_at, so a stale credential is visible as such in
  // the UI without a second round trip.
  const { data, error } = await createServiceRoleClient().rpc(
    "get_integration_credential_secret",
    {
      p_provider: provider,
      p_credential_key: credentialKey,
      p_environment: environment,
    },
  );

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      `No "${credentialKey}" credential set for ${provider} in the ${environment} environment`,
    );
  }

  return decryptSecret(data, { provider, credentialKey, environment });
}
