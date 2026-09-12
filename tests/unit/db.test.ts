import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace, db, mutate, readState } from "../../src/lib/db";
import { PGlite } from "@electric-sql/pglite";
import type { Session } from "../../src/lib/types";
let directory: string, session: Session;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "nightkeeper-test-"));
  process.env.DATA_DIR = join(directory, "db");
  session = {
    token: "test",
    workspace: await createWorkspace(),
    identity: "clinician",
    csrf: "csrf",
    expires: Date.now() + 60000,
  };
});
afterAll(async () => {
  await (await db()).close();
  const reopened = await PGlite.create(join(directory, "db"));
  const saved = await reopened.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM workspaces",
  );
  expect(saved.rows[0].count).toBe(1);
  await reopened.close();
  await rm(directory, { recursive: true, force: true });
});
it("transaction rollback and idempotency", async () => {
  const before = await readState(session.workspace);
  await expect(
    mutate(session, "route", "bad", "hash", (s) => {
      s.tasks = [];
      throw Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect((await readState(session.workspace)).tasks.length).toBe(
    before.tasks.length,
  );
  const first = await mutate(session, "route", "good", "hash", (s) => {
    s.tasks[0].version++;
    return { version: s.tasks[0].version };
  });
  const replay = await mutate(session, "route", "good", "hash", () => {
    throw Error("should not execute");
  });
  expect(replay).toEqual(first);
  await expect(
    mutate(session, "route", "good", "other", () => ({})),
  ).rejects.toThrow("幂等键");
});
it("database rejects duplicate open task", async () => {
  await expect(
    mutate(session, "route", "duplicate", "hash", (s) => {
      s.tasks.push({ ...s.tasks[0], id: "duplicate" });
      return {};
    }),
  ).rejects.toThrow();
  expect((await readState(session.workspace)).tasks).toHaveLength(3);
});
