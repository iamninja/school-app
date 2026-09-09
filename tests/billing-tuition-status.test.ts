import { describe, expect, it } from "vitest";
import { deriveTuitionStatus } from "@/lib/billing/tuition-status";

describe("deriveTuitionStatus", () => {
  it("badges a flat 0 monthly amount as scholarship when not billed per lesson", () => {
    expect(
      deriveTuitionStatus({ balance: 0, monthlyAmount: 0 }),
    ).toBe("scholarship");
  });

  it("does not badge a per-lesson family as scholarship, even at balance 0", () => {
    expect(
      deriveTuitionStatus({ balance: 0, monthlyAmount: 0, billsPerLesson: true }),
    ).toBe("clear");
  });

  it("shows due, not scholarship, for a per-lesson family that owes money", () => {
    expect(
      deriveTuitionStatus({ balance: 120, monthlyAmount: 0, billsPerLesson: true }),
    ).toBe("due");
  });

  it("shows credit for a per-lesson family with a negative balance", () => {
    expect(
      deriveTuitionStatus({ balance: -20, monthlyAmount: 0, billsPerLesson: true }),
    ).toBe("credit");
  });

  it("never returns past_due for a per-lesson-only family (no monthly reference)", () => {
    expect(
      deriveTuitionStatus({ balance: 10000, monthlyAmount: 0, billsPerLesson: true }),
    ).toBe("due");
  });

  it("keeps the existing monthly-billing behaviour unchanged", () => {
    expect(deriveTuitionStatus({ balance: -10, monthlyAmount: 100 })).toBe("credit");
    expect(deriveTuitionStatus({ balance: 0, monthlyAmount: 100 })).toBe("clear");
    expect(deriveTuitionStatus({ balance: 100, monthlyAmount: 100 })).toBe("due");
    expect(deriveTuitionStatus({ balance: 150, monthlyAmount: 100 })).toBe("past_due");
  });
});
