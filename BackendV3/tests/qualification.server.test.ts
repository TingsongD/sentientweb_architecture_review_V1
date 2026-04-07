import { describe, expect, it } from "vitest";
import { computeQualificationState } from "~/lib/qualification.server";

describe("computeQualificationState", () => {
  it("scores each pilot qualification criterion at 0.25", () => {
    const state = computeQualificationState({
      email: "buyer@acme.com",
      useCase: "Automate inbound demo qualification",
      role: "VP Sales",
      icpFit: "match",
    });

    expect(state.qualificationScore).toBe(1);
    expect(state.bookingEligible).toBe(true);
    expect(state.missingFields).toEqual([]);
  });

  it("returns missing fields and blocks booking when requirements are incomplete", () => {
    const state = computeQualificationState({
      email: "founder@gmail.com",
      role: "CEO",
      icpFit: "unknown",
    });

    expect(state.qualificationScore).toBe(0.25);
    expect(state.bookingEligible).toBe(false);
    expect(state.missingFields).toEqual([
      "companyDomain",
      "useCase",
      "icpMatch",
    ]);
  });
});
