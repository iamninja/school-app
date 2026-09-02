"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import {
  deleteCredential,
  getCredentialStatus,
  setCredential,
  type CredentialStatus,
  type IntegrationEnvironment,
} from "@/lib/integrations/credentials";
import {
  verifyReceiptMark,
  type MyDataResult,
  type MyDataVerification,
} from "@/lib/mydata/client";
import type {
  BusinessProfile,
  BusinessProfileInput,
  IntegrationSettings,
} from "@/lib/types/database";

/**
 * IMPORTANT: every exported async function in this file is a publicly
 * callable HTTP endpoint. Nothing that returns a decrypted credential may
 * ever be exported from here - that lives in lib/integrations/credentials.ts,
 * which is server-only and not a "use server" module.
 * tests/business-settings-actions.test.ts asserts this file's export list.
 */

async function requireTeacherSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  return supabase;
}

export async function getBusinessSettingsAction(): Promise<{
  profile: BusinessProfile | null;
  integrations: IntegrationSettings[];
  credentialStatuses: Record<string, CredentialStatus>;
}> {
  const supabase = await requireTeacherSession();

  const [{ data: profile, error: profileError }, { data: integrations, error: integrationsError }] =
    await Promise.all([
      supabase
        .from("business_profile")
        .select(
          "id, business_name, afm, doy, activity_code, address, city, postal_code, phone, updated_at",
        )
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("integration_settings")
        .select("provider, active_environment, enabled, updated_at"),
    ]);

  if (profileError) {
    throw profileError;
  }
  if (integrationsError) {
    throw integrationsError;
  }

  // Status only - never a decrypted value. Keyed
  // "<provider>:<credentialKey>:<environment>" for the UI to look up.
  const credentialStatuses: Record<string, CredentialStatus> = {};
  for (const integration of integrations ?? []) {
    for (const environment of ["sandbox", "production"] as const) {
      for (const credentialKey of ["user_id", "subscription_key"]) {
        credentialStatuses[
          `${integration.provider}:${credentialKey}:${environment}`
        ] = await getCredentialStatus(
          integration.provider,
          credentialKey,
          environment,
        );
      }
    }
  }

  return {
    profile: (profile as BusinessProfile | null) ?? null,
    integrations: (integrations ?? []) as IntegrationSettings[],
    credentialStatuses,
  };
}

export async function updateBusinessProfileAction(
  data: BusinessProfileInput,
): Promise<BusinessProfile> {
  const supabase = await requireTeacherSession();

  const { data: updated, error } = await supabase
    .from("business_profile")
    .upsert(
      {
        id: 1,
        business_name: data.businessName?.trim() || null,
        afm: data.afm?.trim() || null,
        doy: data.doy?.trim() || null,
        activity_code: data.activityCode?.trim() || null,
        address: data.address?.trim() || null,
        city: data.city?.trim() || null,
        postal_code: data.postalCode?.trim() || null,
        phone: data.phone?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select(
      "id, business_name, afm, doy, activity_code, address, city, postal_code, phone, updated_at",
    )
    .single();

  if (error) {
    throw error;
  }

  return updated as BusinessProfile;
}

export async function updateIntegrationSettingsAction(
  provider: string,
  data: { activeEnvironment: IntegrationEnvironment; enabled: boolean },
): Promise<IntegrationSettings> {
  const supabase = await requireTeacherSession();

  const { data: updated, error } = await supabase
    .from("integration_settings")
    .update({
      active_environment: data.activeEnvironment,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", provider)
    .select("provider, active_environment, enabled, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return updated as IntegrationSettings;
}

export async function setCredentialAction(
  provider: string,
  credentialKey: string,
  environment: IntegrationEnvironment,
  plaintextValue: string,
): Promise<CredentialStatus> {
  // The service-role client used underneath bypasses RLS completely, so
  // this gate is the only authorization on this path - not ceremony.
  await requireTeacherSession();

  await setCredential(provider, credentialKey, environment, plaintextValue);
  return getCredentialStatus(provider, credentialKey, environment);
}

export async function deleteCredentialAction(
  provider: string,
  credentialKey: string,
  environment: IntegrationEnvironment,
): Promise<CredentialStatus> {
  await requireTeacherSession();

  await deleteCredential(provider, credentialKey, environment);
  return getCredentialStatus(provider, credentialKey, environment);
}

/**
 * Read-only lookup of an arbitrary MARK against AADE's RequestTransmittedDocs
 * - a diagnostic tool, not tied to any receipt row. Never writes to
 * `receipts` or `mydata_submission_log`: for when a receipt's own stored
 * MARK doesn't match what actually needs checking (e.g. a MARK from a
 * duplicate/orphaned submission), so there's nothing to undo afterward.
 */
export async function checkMyDataMarkAction(
  mark: string,
  environment: IntegrationEnvironment,
): Promise<MyDataResult & { verification?: MyDataVerification }> {
  await requireTeacherSession();

  return verifyReceiptMark(mark, environment);
}
