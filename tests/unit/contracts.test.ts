import { it, expect } from "vitest";
import { reportSchema, transitionSchema } from "../../src/lib/contracts";
import { openapi } from "../../src/lib/openapi";
it("rejects unknown fields and invalid score ranges", () => {
  expect(
    reportSchema.safeParse({
      mood: 5,
      energy: 2,
      reducedSleepNeed: 0,
      distress: 0,
      expectedVersion: 0,
    }).success,
  ).toBe(false);
  expect(
    reportSchema.safeParse({
      mood: null,
      energy: 2,
      reducedSleepNeed: 0,
      distress: 0,
      expectedVersion: 0,
      patientId: "S02",
    }).success,
  ).toBe(false);
});
it("accepts skipped answers and guards transition version", () => {
  expect(
    reportSchema.safeParse({
      mood: null,
      energy: 2,
      reducedSleepNeed: null,
      distress: 0,
      expectedVersion: 0,
    }).success,
  ).toBe(true);
  expect(
    transitionSchema.safeParse({ action: "CLAIM", expectedVersion: 0 }).success,
  ).toBe(false);
});
it("publishes implemented routes and request schemas", () => {
  const spec = openapi();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.paths["/tasks/{id}/transitions"].post).toHaveProperty(
    "requestBody",
  );
  expect(spec.paths["/devices/{id}/observations:batch"]).toBeUndefined();
});
