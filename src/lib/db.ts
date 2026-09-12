import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Session, State } from "./types";
import { seedState } from "./domain";

const globals = globalThis as typeof globalThis & {
  nightkeeperDb?: Promise<PGlite>;
};
export async function db() {
  globals.nightkeeperDb ??= (async () => {
    const dataDir =
      process.env.DATA_DIR || path.join(process.cwd(), ".data/nightkeeper");
    if (!dataDir.startsWith("memory:"))
      await mkdir(path.dirname(dataDir), { recursive: true });
    const pg = await PGlite.create(dataDir);
    await pg.exec(`CREATE TABLE IF NOT EXISTS workspaces(id text PRIMARY KEY, state jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token text PRIMARY KEY, data jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency(workspace text NOT NULL, actor text NOT NULL, route text NOT NULL, key text NOT NULL, hash text NOT NULL, response jsonb NOT NULL, expires bigint NOT NULL, PRIMARY KEY(workspace,actor,route,key));
      CREATE TABLE IF NOT EXISTS task_constraints(id text PRIMARY KEY, workspace text NOT NULL, patient text NOT NULL, kind text NOT NULL, status text NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_task ON task_constraints(workspace,patient,kind) WHERE status <> 'CLOSED';`);
    return pg;
  })();
  return globals.nightkeeperDb;
}
export async function getSession(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;
  const pg = await db();
  const row = (
    await pg.query<{ data: Session }>(
      "SELECT data FROM sessions WHERE token=$1",
      [token],
    )
  ).rows[0];
  return row && row.data.expires > Date.now() ? row.data : null;
}
export async function saveSession(session: Session) {
  await (
    await db()
  ).query(
    "INSERT INTO sessions(token,data) VALUES($1,$2) ON CONFLICT(token) DO UPDATE SET data=$2",
    [session.token, JSON.stringify(session)],
  );
}
export async function createWorkspace() {
  const id = randomUUID();
  await (
    await db()
  ).query("INSERT INTO workspaces(id,state) VALUES($1,$2)", [
    id,
    JSON.stringify(seedState()),
  ]);
  return id;
}
export async function readState(workspace: string) {
  return (
    await (
      await db()
    ).query<{ state: State }>("SELECT state FROM workspaces WHERE id=$1", [
      workspace,
    ])
  ).rows[0].state;
}
export async function mutate<T>(
  session: Session,
  route: string,
  key: string,
  hash: string,
  fn: (state: State) => T,
): Promise<T> {
  return (await db()).transaction(async (tx) => {
    const row = (
      await tx.query<{ state: State }>(
        "SELECT state FROM workspaces WHERE id=$1 FOR UPDATE",
        [session.workspace],
      )
    ).rows[0];
    const cache = (
      await tx.query<{ hash: string; response: T; expires: string }>(
        "SELECT hash,response,expires FROM idempotency WHERE workspace=$1 AND actor=$2 AND route=$3 AND key=$4",
        [session.workspace, session.identity, route, key],
      )
    ).rows[0];
    if (cache && Number(cache.expires) > Date.now()) {
      if (cache.hash !== hash) {
        const { DomainError } = await import("./domain");
        throw new DomainError(409, "相同幂等键包含不同内容");
      }
      return cache.response;
    }
    const state = row.state,
      result = fn(state);
    state.revision++;
    await tx.query("DELETE FROM task_constraints WHERE workspace=$1", [
      session.workspace,
    ]);
    for (const task of state.tasks)
      await tx.query("INSERT INTO task_constraints VALUES($1,$2,$3,$4,$5)", [
        task.id,
        session.workspace,
        task.patientId,
        task.type,
        task.status,
      ]);
    await tx.query("UPDATE workspaces SET state=$2 WHERE id=$1", [
      session.workspace,
      JSON.stringify(state),
    ]);
    await tx.query(
      "INSERT INTO idempotency VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(workspace,actor,route,key) DO UPDATE SET hash=$5,response=$6,expires=$7",
      [
        session.workspace,
        session.identity,
        route,
        key,
        hash,
        JSON.stringify(result),
        Date.now() + 86400000,
      ],
    );
    return result;
  });
}
