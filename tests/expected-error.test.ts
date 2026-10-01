import { describe, expect, it } from "vitest";
import {
  EXPECTED_ERROR_DIGEST_PREFIX,
  ExpectedError,
  getErrorMessage,
} from "@/lib/expected-error";

// What a production client receives for ANY error thrown from a server
// action: a generic Error whose message is replaced and whose digest is
// whatever the server put on the thrown error. Reproduced here so the test
// does not depend on a production build.
function asReceivedByProductionClient(thrown: Error & { digest?: string }) {
  const received = new Error(
    "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
  ) as Error & { digest?: string };
  received.digest = thrown.digest;
  return received;
}

describe("ExpectedError", () => {
  it("is still an Error carrying its message (server-side callers and Sentry's instanceof check rely on it)", () => {
    const error = new ExpectedError("Pick a family");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExpectedError);
    expect(error.message).toBe("Pick a family");
  });

  it("carries its message in a prefixed digest so it can cross the production boundary", () => {
    const error = new ExpectedError("Pick a family");

    expect(error.digest.startsWith(EXPECTED_ERROR_DIGEST_PREFIX)).toBe(true);
    expect(error.digest).toBe(
      EXPECTED_ERROR_DIGEST_PREFIX + encodeURIComponent("Pick a family"),
    );
  });

  it("caps an over-long message in the digest at 1000 characters", () => {
    const error = new ExpectedError("x".repeat(5000));

    expect(decodeURIComponent(error.digest.slice(EXPECTED_ERROR_DIGEST_PREFIX.length))).toHaveLength(1000);
    // The error's own message is untouched.
    expect(error.message).toHaveLength(5000);
  });

  it("tolerates being constructed with no message", () => {
    const error = new ExpectedError();

    expect(error.message).toBe("");
    expect(getErrorMessage(asReceivedByProductionClient(error), "fallback")).toBe("");
  });
});

describe("getErrorMessage", () => {
  it("returns the real message of an ExpectedError after production masking", () => {
    const thrown = new ExpectedError(
      "Πληρωμές άνω των 500 € δεν επιτρέπονται σε μετρητά – επιλέξτε κάρτα, έμβασμα ή IRIS.",
    );

    const received = asReceivedByProductionClient(thrown);

    // The masked message is what the user would have seen before this fix.
    expect(received.message).toMatch(/omitted in production builds/);
    expect(getErrorMessage(received, "fallback")).toBe(thrown.message);
  });

  it("round-trips Greek text, symbols and URL-special characters exactly", () => {
    const message = `Αποτυχία: 100% & "quotes", a/b?c=d #1 – €40,50 (άρθρο 27)`;

    expect(
      getErrorMessage(asReceivedByProductionClient(new ExpectedError(message)), "x"),
    ).toBe(message);
  });

  it("works unmasked too (development / server-side), where the message is already real", () => {
    expect(getErrorMessage(new ExpectedError("Pick a family"), "fallback")).toBe(
      "Pick a family",
    );
  });

  it("does NOT reveal the message of an unexpected error - its production digest is just a hash", () => {
    const masked = new Error("An error occurred in the Server Components render.") as Error & {
      digest?: string;
    };
    masked.digest = "2813569201"; // what Next generates for a normal throw

    expect(getErrorMessage(masked, "fallback")).toBe(masked.message);
  });

  it("falls back to the Error's message when there is no digest", () => {
    expect(getErrorMessage(new Error("Network down"), "fallback")).toBe("Network down");
  });

  it("falls back to the caller's text for anything that is not an Error", () => {
    expect(getErrorMessage("boom", "fallback")).toBe("fallback");
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
    expect(getErrorMessage({ message: "not an Error" }, "fallback")).toBe("fallback");
  });

  it("survives a malformed digest by falling back to the error's own message", () => {
    const broken = new Error("generic") as Error & { digest?: string };
    broken.digest = `${EXPECTED_ERROR_DIGEST_PREFIX}%E0%A4%A`; // invalid percent-encoding

    expect(getErrorMessage(broken, "fallback")).toBe("generic");
  });
});
