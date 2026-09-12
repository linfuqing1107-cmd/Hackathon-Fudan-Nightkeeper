import { describe, it, expect } from "vitest";
import {
  baseline,
  canRead,
  evaluate,
  runRules,
  seedState,
  transition,
} from "../../src/lib/domain";
describe("deterministic synthetic scenarios", () => {
  it("S01 stable, S02 two distinct tasks, S03 quality only", () => {
    const s = seedState();
    expect(s.tasks.filter((t) => t.patientId === "S01")).toHaveLength(0);
    expect(
      s.tasks
        .filter((t) => t.patientId === "S02")
        .map((t) => t.type)
        .sort(),
    ).toEqual(["CHANGE_REVIEW", "MEDICATION_REVIEW"]);
    expect(
      s.tasks.filter((t) => t.patientId === "S03").map((t) => t.type),
    ).toEqual(["DATA_QUALITY"]);
  });
  it("replay creates no new evaluations or tasks", () => {
    const s = seedState(),
      n = s.evaluations.length;
    runRules(s);
    expect(s.tasks).toHaveLength(3);
    expect(s.evaluations).toHaveLength(n);
  });
  it.each([119, 120])("sleep boundary %i minutes", (delta) => {
    const s = seedState(),
      p = s.patients[1];
    p.observations
      .filter((o) => o.date >= "2026-09-09")
      .forEach((o) => (o.sleep = 480 - delta));
    expect(evaluate(p, "2026-09-11", s.clock)[0].result).toBe(
      delta === 120 ? "TRIGGERED" : "NOT_TRIGGERED",
    );
  });
  it("missing sleep is insufficient, never zero", () => {
    const s = seedState(),
      p = s.patients[1];
    p.observations.at(-1)!.sleep = null;
    expect(evaluate(p, "2026-09-11", s.clock)[0].result).toBe("INSUFFICIENT");
  });
  it("missing EMA is insufficient and low energy does not trigger", () => {
    const s = seedState(),
      p = s.patients[1];
    p.reports.at(-1)!.energy = null;
    expect(evaluate(p, "2026-09-11", s.clock)[0].result).toBe("INSUFFICIENT");
    p.reports.at(-1)!.energy = 2;
    expect(evaluate(p, "2026-09-11", s.clock)[0].result).toBe("NOT_TRIGGERED");
  });
  it("48h exact does not trigger, 48h+1s does", () => {
    const s = seedState(),
      p = s.patients[0];
    p.lastSyncAt = "2026-09-10T04:00:00Z";
    expect(evaluate(p, "2026-09-11", s.clock)[2].result).toBe("NOT_TRIGGERED");
    p.lastSyncAt = "2026-09-10T03:59:59Z";
    expect(evaluate(p, "2026-09-11", s.clock)[2].result).toBe("TRIGGERED");
  });
  it("unknown medication is not missing a dose", () => {
    const s = seedState(),
      p = s.patients[1];
    p.medications.at(-1)!.status = "UNKNOWN";
    expect(evaluate(p, "2026-09-11", s.clock)[1].result).toBe("NOT_TRIGGERED");
  });
  it("baseline requires 10 valid days and excludes observation period", () => {
    const p = seedState().patients[0];
    p.observations.slice(0, 5).forEach((o) => (o.quality = "MISSING"));
    expect(baseline(p).status).toBe("INSUFFICIENT");
    p.observations[4].quality = "VALID";
    expect(baseline(p).median).toBe(480);
    p.observations.at(-1)!.sleep = 0;
    expect(baseline(p).median).toBe(480);
  });
  it("revisions preserve snapshots and supersede evaluations", () => {
    const s = seedState(),
      p = s.patients[1],
      t = s.tasks.find((t) => t.type === "CHANGE_REVIEW")!;
    const evidence = JSON.stringify(t.evidence);
    p.reports.push({
      ...p.reports.at(-1)!,
      id: "revised",
      revision: 2,
      energy: 0,
    });
    runRules(s);
    expect(t.needsReview).toBe(true);
    expect(JSON.stringify(t.evidence)).toBe(evidence);
    expect(t.status).toBe("OPEN");
    expect(s.evaluations.some((e) => e.superseded)).toBe(true);
  });
});
describe("task boundaries", () => {
  it("claim, record, wait, resume, close", () => {
    const s = seedState(),
      t = s.tasks[0];
    transition(s, t, "clinician", { action: "CLAIM", expectedVersion: 1 });
    expect(t.status).toBe("IN_REVIEW");
    expect(() =>
      transition(s, t, "clinician", {
        action: "CLOSE",
        expectedVersion: t.version,
        reason: "核实",
        outcome: "RESOLVED",
      }),
    ).toThrow();
    t.followups.push({
      id: "f",
      at: s.clock,
      author: "clinician",
      contactResult: "REACHED",
      reason: "核实",
      text: "已确认",
    });
    transition(s, t, "clinician", {
      action: "WAIT",
      expectedVersion: t.version,
      nextFollowupAt: "2026-09-13T01:00:00Z",
    });
    transition(s, t, "clinician", {
      action: "RESUME",
      expectedVersion: t.version,
    });
    transition(s, t, "clinician", {
      action: "CLOSE",
      expectedVersion: t.version,
      reason: "已核实",
      outcome: "RESOLVED",
    });
    expect(t.status).toBe("CLOSED");
  });
  it("stale version, wrong owner and direct closure are rejected", () => {
    const s = seedState(),
      t = s.tasks[0];
    expect(() =>
      transition(s, t, "clinician", { action: "CLOSE", expectedVersion: 1 }),
    ).toThrow();
    transition(s, t, "clinician", { action: "CLAIM", expectedVersion: 1 });
    expect(() =>
      transition(s, t, "reviewer", {
        action: "WAIT",
        expectedVersion: t.version,
        nextFollowupAt: "2026-09-13T01:00:00Z",
      }),
    ).toThrow();
    expect(() =>
      transition(s, t, "clinician", { action: "CLAIM", expectedVersion: 1 }),
    ).toThrow();
  });
  it("administrator has no patient access, reviewer only S01", () => {
    expect(canRead("admin", "S02")).toBe(false);
    expect(canRead("reviewer", "S01")).toBe(true);
    expect(canRead("reviewer", "S02")).toBe(false);
    expect(canRead("S01", "S02")).toBe(false);
  });
});
