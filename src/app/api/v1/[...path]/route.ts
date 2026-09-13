import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { openapi } from "@/lib/openapi";
import {
  getSession,
  saveSession,
  createWorkspace,
  readState,
  mutate,
  db,
} from "@/lib/db";
import {
  audit,
  canRead,
  check,
  consent,
  DomainError,
  latest,
  localDate,
  newTask,
  previousDate,
  roleOf,
  runRules,
  seedState,
  transition,
} from "@/lib/domain";
import * as schemas from "@/lib/contracts";
import type { Patient, Session, State, Task } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const sessionCookieName = process.env.NIGHTKEEPER_DEMO === "true" ? "nk_demo_session" : "nk_session";
function patientAccess(state: State, session: Session, id: string): Patient {
  check(canRead(session.identity, id), 404, "未找到资源");
  const p = state.patients.find((p) => p.id === id);
  check(p, 404, "未找到资源");
  return p;
}
function taskAccess(state: State, session: Session, id: string): Task {
  check(roleOf(session.identity) === "CLINICIAN", 403, "需要医护身份");
  const t = state.tasks.find((t) => t.id === id);
  check(t && canRead(session.identity, t.patientId), 404, "未找到资源");
  return t;
}
const limits = new Map<string, { at: number; count: number }>();
async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const requestId = randomUUID();
  const ok = (data: unknown, status = 200) =>
    NextResponse.json(
      { data, meta: { requestId } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const route = (await context.params).path.join("/");
    check(
      /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(
        req.headers.get("host") || "",
      ) && process.env.DEMO_MODE !== "false",
      403,
      "此版本仅开放本地合成演示",
    );
    if (route === "health" && req.method === "GET") {
      await db();
      return ok({ liveness: true, readiness: true, mode: "LOCAL_SYNTHETIC" });
    }
    if (route === "openapi" && req.method === "GET")
      return NextResponse.json(openapi(sessionCookieName));
    const write = req.method !== "GET";
    if (write) {
      const origin = req.headers.get("origin");
      check(
        origin && origin === `http://${req.headers.get("host")}`,
        403,
        "来源校验失败",
      );
    }
    const token = req.cookies.get(sessionCookieName)?.value;
    let session = await getSession(token);
    const limitKey = token || "anonymous";
    for (const [key, value] of limits)
      if (Date.now() - value.at > 60000) limits.delete(key);
    const limit = limits.get(limitKey);
    if (!limit || Date.now() - limit.at > 60000)
      limits.set(limitKey, { at: Date.now(), count: 1 });
    else {
      limit.count++;
      check(limit.count <= 180, 429, "请求过于频繁，请稍后重试");
    }
    let body: unknown = {};
    if (write) {
      check(
        Number(req.headers.get("content-length") || 0) < 32768,
        413,
        "请求过大",
      );
      const text = await req.text();
      check(text.length < 32768, 413, "请求过大");
      try {
        body = JSON.parse(text || "{}");
      } catch {
        throw new DomainError(422, "请求必须是JSON");
      }
    }
    if (route === "demo/session" && req.method === "POST") {
      const { identityCode } = schemas.identitySchema.parse(body);
      if (session)
        check(
          req.headers.get("x-csrf-token") === session.csrf,
          403,
          "会话校验失败",
        );
      session = {
        token: session?.token || randomUUID(),
        workspace: session?.workspace || (await createWorkspace()),
        identity: identityCode,
        csrf: randomUUID(),
        expires: Date.now() + 86400000,
      };
      await saveSession(session);
      const res = ok({
        identity: session.identity,
        role: roleOf(session.identity),
        csrf: session.csrf,
      });
      res.cookies.set(sessionCookieName, session.token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      });
      return res;
    }
    check(session, 401, "请进入演示空间");
    if (write)
      check(
        req.headers.get("x-csrf-token") === session.csrf,
        403,
        "会话校验失败，请刷新",
      );
    const parts = route.split("/");
    if (req.method === "GET") {
      if (route === "session")
        return ok({
          identity: session.identity,
          role: roleOf(session.identity),
          csrf: session.csrf,
        });
      const state = await readState(session.workspace);
      if (route === "view")
        return ok({
          clock: state.clock,
          identity: session.identity,
          role: roleOf(session.identity),
          csrf: session.csrf,
          revision: state.revision,
          patients: state.patients.filter((p) =>
            canRead(session!.identity, p.id),
          ),
          tasks:
            roleOf(session.identity) === "CLINICIAN"
              ? state.tasks.filter((t) =>
                  canRead(session!.identity, t.patientId),
                )
              : [],
          audit: state.audit
            .filter(
              (a) =>
                session!.identity === "admin" ||
                state.tasks.some(
                  (t) =>
                    t.id === a.entityId &&
                    canRead(session!.identity, t.patientId),
                ),
            )
            .slice(-50),
        });
      if (route === "patients") {
        check(roleOf(session.identity) === "CLINICIAN", 403, "需要医护身份");
        return ok(
          state.patients
            .filter((p) => canRead(session!.identity, p.id))
            .map((p) => ({
              id: p.id,
              code: p.code,
              baselineStatus: p.baseline.status,
              lastSyncAt: p.lastSyncAt,
              openTaskCount: state.tasks.filter(
                (t) => t.patientId === p.id && t.status !== "CLOSED",
              ).length,
            })),
        );
      }
      if (parts[0] === "patients" && parts.length <= 3) {
        const p = patientAccess(state, session, parts[1]);
        if (parts[2] === "consents") return ok(p.consents);
        if (!parts[2] || parts[2] === "timeline") return ok(p);
      }
      if (route === "tasks") {
        check(roleOf(session.identity) === "CLINICIAN", 403, "需要医护身份");
        return ok(
          state.tasks.filter((t) => canRead(session!.identity, t.patientId)),
        );
      }
      if (parts[0] === "tasks" && parts.length === 2)
        return ok(taskAccess(state, session, parts[1]));
      throw new DomainError(404, "未找到接口");
    }
    const key = req.headers.get("idempotency-key");
    check(key && key.length <= 128, 422, "缺少幂等键");
    const hash = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const actor = session;
    const result = await mutate(
      actor,
      `${req.method}:${route}`,
      key,
      hash,
      (state) => {
        if (route === "demo/reset" && req.method === "POST") {
          check(actor.identity === "admin", 403, "需要管理员身份");
          schemas.resetSchema.parse(body);
          const revision = state.revision;
          const oldAudit = state.audit;
          Object.assign(state, seedState(), { revision });
          state.audit = [...oldAudit, ...state.audit];
          audit(state, actor.identity, "DEMO_RESET", "workspace");
          return { reset: true };
        }
        if (route === "demo/recover" && req.method === "POST") {
          check(actor.identity === "admin", 403, "需要管理员身份");
          const { patientId } = schemas.recoverSchema.parse(body);
          const p = state.patients.find((p) => p.id === patientId)!;
          check(consent(p, "WEARABLE"), 403, "穿戴授权已撤回");
          p.lastSyncAt = state.clock;
          const date = localDate(state.clock);
          p.observations.push({
            id: randomUUID(),
            date,
            sleep: 480,
            steps: 6000,
            heartRate: 62,
            coverageMinutes: 1440,
            quality: "VALID",
            revision: (latest(p.observations, date)?.revision || 0) + 1,
          });
          runRules(state, p.id);
          audit(state, actor.identity, "SYNC_RECOVERED", p.id);
          return { recovered: true };
        }
        if (parts[0] === "patients") {
          const p = patientAccess(state, actor, parts[1]);
          check(actor.identity === p.id, 403, "仅患者本人可提交");
          if (parts[2] === "consents" && req.method === "POST") {
            const data = schemas.consentSchema.parse(body);
            p.consents.push({
              scope: data.scope,
              status: data.action === "GRANT" ? "GRANTED" : "REVOKED",
              at: state.clock,
              revision:
                p.consents.filter((c) => c.scope === data.scope).length + 1,
            });
            audit(state, actor.identity, `CONSENT_${data.action}`, p.id);
            return p.consents;
          }
          if (parts[2] === "help-requests" && req.method === "POST") {
            schemas.helpSchema.parse(body);
            const t = newTask(state, p.id, "HELP_REQUEST", [
              {
                sourceId: randomUUID(),
                date: localDate(state.clock),
                label: "患者主动请求",
                value: "希望获得联系",
              },
            ]);
            audit(state, actor.identity, "HELP_REQUEST", t.id);
            return { taskId: t.id, demoNotice: "演示请求，未联系真实医护" };
          }
          check(consent(p, "SELF_REPORT"), 403, "自报授权已撤回，请先重新授权");
          const date = parts[3];
          check(
            date &&
              /^\d{4}-\d{2}-\d{2}$/.test(date) &&
              date <= localDate(state.clock) &&
              date >= previousDate(localDate(state.clock), 6),
            422,
            "只允许填写演示当天及最近7日",
          );
          if (parts[2] === "daily-reports" && req.method === "PUT") {
            const data = schemas.reportSchema.parse(body);
            const prev = latest(p.reports, date);
            check(
              (prev?.revision || 0) === data.expectedVersion,
              409,
              "反馈已更新，请刷新",
            );
            const report = {
              id: randomUUID(),
              date,
              mood: data.mood,
              energy: data.energy,
              reducedSleepNeed: data.reducedSleepNeed,
              distress: data.distress,
              revision: data.expectedVersion + 1,
            };
            p.reports.push(report);
            runRules(state, p.id);
            audit(state, actor.identity, "EMA_SUBMITTED", p.id);
            return report;
          }
          if (parts[2] === "medication-reports" && req.method === "PUT") {
            const data = schemas.medSchema.parse(body);
            check(
              (latest(p.medications, date)?.revision || 0) ===
                data.expectedVersion,
              409,
              "反馈已更新，请刷新",
            );
            const report = {
              id: randomUUID(),
              date,
              status: data.status,
              reasonCode: data.reasonCode,
              revision: data.expectedVersion + 1,
            };
            p.medications.push(report);
            runRules(state, p.id);
            audit(state, actor.identity, "MEDICATION_SUBMITTED", p.id);
            return report;
          }
        }
        if (parts[0] === "tasks" && req.method === "POST") {
          const t = taskAccess(state, actor, parts[1]);
          if (parts[2] === "transitions")
            return transition(
              state,
              t,
              actor.identity,
              schemas.transitionSchema.parse(body),
            );
          if (parts[2] === "followups") {
            check(
              t.owner === actor.identity && t.status === "IN_REVIEW",
              403,
              "请先认领或恢复核实",
            );
            const data = schemas.followupSchema.parse(body);
            const f = {
              ...data,
              id: randomUUID(),
              at: state.clock,
              author: actor.identity,
            };
            t.followups.push(f);
            t.version++;
            audit(state, actor.identity, "FOLLOWUP_ADDED", t.id);
            return f;
          }
          if (parts[2] === "summaries") {
            schemas.emptySchema.parse(body);
            const s = {
              id: randomUUID(),
              mode: "TEMPLATE" as const,
              status: "DRAFT" as const,
              text:
                t.evidence
                  .map(
                    (e) =>
                      `${e.date} ${e.label}：${e.value}${e.baseline ? `，个人基线 ${e.baseline}` : ""}。`,
                  )
                  .join("\n") +
                "\n待核实：请结合患者自报、设备状态及随访访谈确认变化原因。",
              sourceIds: t.evidence.map((e) => e.sourceId),
              at: state.clock,
            };
            t.summaries.push(s);
            t.version++;
            audit(state, actor.identity, "TEMPLATE_SUMMARY_CREATED", t.id);
            return s;
          }
          if (parts[2] === "summary-review") {
            const data = schemas.reviewSchema.parse(body);
            check(t.version === data.expectedVersion, 409, "任务已更新");
            const s = t.summaries.at(-1);
            check(s && s.status === "DRAFT", 422, "没有待审阅摘要");
            s.status = data.decision === "ACCEPT" ? "REVIEWED" : "REJECTED";
            s.reviewer = actor.identity;
            t.version++;
            audit(state, actor.identity, "SUMMARY_REVIEWED", t.id);
            return s;
          }
        }
        throw new DomainError(404, "未找到接口");
      },
    );
    return ok(result);
  } catch (error) {
    const status =
      error instanceof DomainError
        ? error.status
        : error instanceof ZodError
          ? 422
          : 503;
    return NextResponse.json(
      {
        error: {
          code: status === 422 ? "VALIDATION_ERROR" : `HTTP_${status}`,
          message:
            error instanceof DomainError
              ? error.message
              : error instanceof ZodError
                ? "填写内容不符合要求"
                : "服务暂不可用，请稍后重试",
          requestId,
        },
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = handler;
export const POST = handler;
export const PUT = handler;
