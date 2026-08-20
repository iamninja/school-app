import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * The single most important property in the business-settings feature:
 * private.integration_credentials must be unreachable from any
 * browser-obtainable credential. This project issues authenticated JWTs to
 * students and parents, so "a teacher session can't read it" is necessary
 * but not sufficient - an anon client must be blocked too.
 *
 * Note on assertion shape: with no grants, PostgREST returns a
 * permission-denied error, NOT an empty result set. Asserting
 * `data` is empty would also pass on a typo'd table name, a missing
 * fixture, or a stale schema cache - i.e. it would pass for the wrong
 * reasons. So each case asserts the *error*, and the fixture is proven
 * real first via the service-role client.
 */
describe("RLS: business settings", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;

  const credentialRow = {
    provider: "aade_mydata",
    credential_key: "subscription_key",
    environment: "sandbox",
    encrypted_value: "v1:fake:fake:fake",
    last_four: "9999",
  };

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);

    await serviceClient().rpc("set_integration_credential", {
      p_provider: credentialRow.provider,
      p_credential_key: credentialRow.credential_key,
      p_environment: credentialRow.environment,
      p_encrypted_value: credentialRow.encrypted_value,
      p_last_four: credentialRow.last_four,
    });
  }, 30000);

  afterAll(async () => {
    await serviceClient().rpc("delete_integration_credential", {
      p_provider: credentialRow.provider,
      p_credential_key: credentialRow.credential_key,
      p_environment: credentialRow.environment,
    });
    await cleanupFixtures(fixtures);
  }, 30000);

  it("proves the fixture row really exists (guards every assertion below)", async () => {
    const { data, error } = await serviceClient().rpc(
      "get_integration_credential_status",
      {
        p_provider: credentialRow.provider,
        p_credential_key: credentialRow.credential_key,
        p_environment: credentialRow.environment,
      },
    );

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].last_four).toBe("9999");
  });

  it("blocks a signed-in teacher from reading integration_credentials", async () => {
    const { data, error } = await teacherA
      .schema("private")
      .from("integration_credentials")
      .select("encrypted_value");

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("blocks a signed-in teacher from calling the credential RPCs", async () => {
    // The SECURITY DEFINER functions are the only route into the table, so
    // EXECUTE being service_role-only is what actually holds the line here.
    const read = await teacherA.rpc("get_integration_credential_secret", {
      p_provider: credentialRow.provider,
      p_credential_key: credentialRow.credential_key,
      p_environment: credentialRow.environment,
    });
    expect(read.error).not.toBeNull();

    const write = await teacherA.rpc("set_integration_credential", {
      p_provider: credentialRow.provider,
      p_credential_key: credentialRow.credential_key,
      p_environment: credentialRow.environment,
      p_encrypted_value: "v1:tampered:tampered:tampered",
      p_last_four: "0000",
    });
    expect(write.error).not.toBeNull();

    const remove = await teacherA.rpc("delete_integration_credential", {
      p_provider: credentialRow.provider,
      p_credential_key: credentialRow.credential_key,
      p_environment: credentialRow.environment,
    });
    expect(remove.error).not.toBeNull();

    // And the row is genuinely untouched, not just reported as failed.
    const { data } = await serviceClient().rpc(
      "get_integration_credential_status",
      {
        p_provider: credentialRow.provider,
        p_credential_key: credentialRow.credential_key,
        p_environment: credentialRow.environment,
      },
    );
    expect(data?.[0]?.last_four).toBe("9999");
  });

  it("blocks a signed-out anon client from reading credentials", async () => {
    const anon = createClient(
      process.env.LOCAL_SUPABASE_URL!,
      process.env.LOCAL_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const viaRpc = await anon.rpc("get_integration_credential_secret", {
      p_provider: credentialRow.provider,
      p_credential_key: credentialRow.credential_key,
      p_environment: credentialRow.environment,
    });
    expect(viaRpc.error).not.toBeNull();

    // The table itself isn't routable either - PostgREST won't serve any
    // schema outside [api] schemas, so this fails before RLS is consulted.
    const viaTable = await anon
      .schema("private")
      .from("integration_credentials")
      .select("encrypted_value");
    expect(viaTable.error).not.toBeNull();
  });

  it("lets a teacher read and write the non-secret business profile", async () => {
    const updated = await teacherA
      .from("business_profile")
      .upsert(
        { id: 1, business_name: "Modus RLS Test", afm: "123456789" },
        { onConflict: "id" },
      )
      .select("business_name, afm")
      .single();

    expect(updated.error).toBeNull();
    expect(updated.data?.business_name).toBe("Modus RLS Test");
  });

  it("lets a teacher read and update non-secret integration settings", async () => {
    const updated = await teacherA
      .from("integration_settings")
      .update({ active_environment: "sandbox", enabled: true })
      .eq("provider", "aade_mydata")
      .select("provider, active_environment, enabled")
      .single();

    expect(updated.error).toBeNull();
    expect(updated.data?.enabled).toBe(true);
    expect(updated.data?.active_environment).toBe("sandbox");
  });
});
