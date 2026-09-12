import { createHash, randomUUID } from "node:crypto";
import type {
  Consent,
  Evaluation,
  Evidence,
  Identity,
  Patient,
  State,
  Task,
  TaskType,
} from "./types";

export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new DomainError(status, message);
}
export const day = (offset: number) =>
  new Date(Date.UTC(2026, 7, 15 + offset)).toISOString().slice(0, 10);
export function localDate(clock: string) {
  return new Date(new Date(clock).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
}
export function previousDate(date: string, n: number) {
  return new Date(Date.parse(date + "T00:00:00Z") - n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function roleOf(identity: Identity) {
  return identity === "admin"
    ? "ADMIN"
    : identity === "clinician" || identity === "reviewer"
      ? "CLINICIAN"
      : "PATIENT";
}
export function canRead(identity: Identity, id: string) {
  return identity === "clinician"
    ? ["S01", "S02", "S03"].includes(id)
    : identity === "reviewer"
      ? id === "S01"
      : identity === id;
}
export function latest<T extends { date: string; revision: number }>(
  items: T[],
  date: string,
) {
  return items
    .filter((x) => x.date === date)
    .sort((a, b) => b.revision - a.revision)[0];
}
export function consent(patient: Patient, scope: Consent["scope"]) {
  return (
    patient.consents.filter((c) => c.scope === scope).at(-1)?.status ===
    "GRANTED"
  );
}
export function baseline(patient: Patient) {
  const rows = Array.from({ length: 14 }, (_, i) =>
    latest(patient.observations, day(i)),
  ).filter((x) => x?.quality === "VALID" && x.sleep !== null);
  const values = rows.map((x) => x!.sleep!).sort((a, b) => a - b);
  const n = values.length;
  return {
    median:
      n >= 10
        ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2
        : null,
    validDays: n,
    status: n >= 10 ? ("READY" as const) : ("INSUFFICIENT" as const),
    sourceIds: rows.map((x) => x!.id),
  };
}
export function evaluate(
  patient: Patient,
  target: string,
  clock: string,
): Omit<Evaluation, "id" | "hash">[] {
  const dates = [2, 1, 0].map((n) => previousDate(target, n));
  const obs = dates.map((d) => latest(patient.observations, d));
  const reports = dates.map((d) => latest(patient.reports, d));
  const enough =
    patient.baseline.median !== null &&
    obs.every((o) => o?.quality === "VALID" && o.sleep !== null) &&
    reports.every((r) => r && r.energy !== null);
  const change =
    enough &&
    obs.every(
      (o, i) =>
        patient.baseline.median! - o!.sleep! >= 120 && reports[i]!.energy! >= 3,
    );
  const evidence: Evidence[] = dates.flatMap((d, i) =>
    obs[i] && reports[i]
      ? [
          {
            sourceId: obs[i]!.id,
            date: d,
            label: "睡眠",
            value: `${obs[i]!.sleep ?? "缺失"} 分钟`,
            baseline: `${patient.baseline.median ?? "不足"} 分钟`,
          },
          {
            sourceId: reports[i]!.id,
            date: d,
            label: "精力自报",
            value: String(reports[i]!.energy ?? "未填"),
          },
        ]
      : [],
  );
  const meds = dates.slice(1).map((d) => latest(patient.medications, d));
  return [
    {
      patientId: patient.id,
      type: "CHANGE_REVIEW",
      targetDate: target,
      result: !enough ? "INSUFFICIENT" : change ? "TRIGGERED" : "NOT_TRIGGERED",
      evidence,
    },
    {
      patientId: patient.id,
      type: "MEDICATION_REVIEW",
      targetDate: target,
      result: meds.some((m) => !m)
        ? "INSUFFICIENT"
        : meds.every((m) => m.status === "NOT_TAKEN")
          ? "TRIGGERED"
          : "NOT_TRIGGERED",
      evidence: meds
        .filter(Boolean)
        .map((m) => ({
          sourceId: m!.id,
          date: m!.date,
          label: "服药自报",
          value:
            m!.status === "NOT_TAKEN"
              ? "明确未服"
              : m!.status === "TAKEN"
                ? "自报已服"
                : "不确定",
        })),
    },
    {
      patientId: patient.id,
      type: "DATA_QUALITY",
      targetDate: target,
      result:
        Date.parse(clock) - Date.parse(patient.lastSyncAt) > 48 * 3600000
          ? "TRIGGERED"
          : "NOT_TRIGGERED",
      evidence: [
        {
          sourceId: `sync:${patient.id}:${patient.lastSyncAt}`,
          date: localDate(patient.lastSyncAt),
          label: "最后同步",
          value: patient.lastSyncAt,
        },
      ],
    },
  ];
}
export function audit(
  state: State,
  actor: string,
  action: string,
  entityId: string,
) {
  state.audit.push({
    id: randomUUID(),
    at: state.clock,
    actor,
    action,
    entityId,
  });
}
export function newTask(
  state: State,
  patientId: string,
  type: TaskType,
  evidence: Evidence[],
  evaluationId?: string,
) {
  const existing = state.tasks.find(
    (t) =>
      t.patientId === patientId && t.type === type && t.status !== "CLOSED",
  );
  if (existing) {
    existing.lastSeenAt = state.clock;
    if (evaluationId && !existing.evaluationIds.includes(evaluationId))
      existing.evaluationIds.push(evaluationId);
    existing.version++;
    return existing;
  }
  const predecessor = state.tasks
    .filter((t) => t.patientId === patientId && t.type === type)
    .at(-1);
  const task: Task = {
    id: randomUUID(),
    patientId,
    type,
    status: "OPEN",
    owner: null,
    version: 1,
    firstSeenAt: state.clock,
    lastSeenAt: state.clock,
    evidence: structuredClone(evidence),
    evaluationIds: evaluationId ? [evaluationId] : [],
    ruleVersion: "demo-v0.1",
    needsReview: false,
    recovered: false,
    followups: [],
    summaries: [],
    predecessorTaskId: predecessor?.id,
  };
  state.tasks.push(task);
  audit(state, "rules", "TASK_CREATED", task.id);
  return task;
}
export function runRules(state: State, patientId?: string) {
  const target = previousDate(localDate(state.clock), 1);
  for (const patient of state.patients.filter(
    (p) => !patientId || p.id === patientId,
  ))
    for (const result of evaluate(patient, target, state.clock)) {
      const hash = createHash("sha256")
        .update(JSON.stringify(result))
        .digest("hex");
      if (
        state.evaluations.some(
          (e) =>
            e.patientId === patient.id &&
            e.type === result.type &&
            e.targetDate === target &&
            e.hash === hash &&
            !e.superseded,
        )
      )
        continue;
      const old = state.evaluations.filter(
        (e) =>
          e.patientId === patient.id &&
          e.type === result.type &&
          e.targetDate === target &&
          !e.superseded,
      );
      for (const e of old) e.superseded = true;
      if (old.length)
        for (const task of state.tasks.filter(
          (t) => t.patientId === patient.id && t.type === result.type,
        )) {
          task.needsReview = true;
          task.version++;
        }
      const evaluation: Evaluation = { ...result, id: randomUUID(), hash };
      state.evaluations.push(evaluation);
      if (result.result === "TRIGGERED")
        newTask(state, patient.id, result.type, result.evidence, evaluation.id);
      if (
        result.type === "DATA_QUALITY" &&
        result.result === "NOT_TRIGGERED" &&
        patient.observations.some(
          (o) => o.date === localDate(state.clock) && o.quality === "VALID",
        )
      ) {
        for (const task of state.tasks.filter(
          (t) =>
            t.patientId === patient.id &&
            t.type === "DATA_QUALITY" &&
            t.status !== "CLOSED",
        )) {
          task.recovered = true;
          task.version++;
        }
      }
    }
}
export function seedState(): State {
  const state: State = {
    clock: "2026-09-12T04:00:00Z",
    patients: [],
    tasks: [],
    evaluations: [],
    audit: [],
    revision: 1,
  };
  for (const [index, scenario] of [
    "状态平稳",
    "多维变化",
    "设备掉线",
  ].entries()) {
    const id = `S0${index + 1}`;
    const patient: Patient = {
      id,
      code: `NK-${id}`,
      scenario,
      timezone: "Asia/Shanghai",
      lastSyncAt: index === 2 ? "2026-09-09T03:00:00Z" : "2026-09-12T03:00:00Z",
      baseline: {
        median: null,
        validDays: 0,
        status: "INSUFFICIENT",
        sourceIds: [],
      },
      observations: [],
      reports: [],
      medications: [],
      consents: [
        {
          scope: "WEARABLE",
          status: "GRANTED",
          at: "2026-08-15T00:00:00Z",
          revision: 1,
        },
        {
          scope: "SELF_REPORT",
          status: "GRANTED",
          at: "2026-08-15T00:00:00Z",
          revision: 1,
        },
      ],
    };
    for (let i = 0; i < 28; i++) {
      const date = day(i),
        changed = index === 1 && i >= 25,
        missing = index === 2 && i >= 25;
      patient.observations.push({
        id: `${id}:observation:${date}:1`,
        date,
        sleep: missing ? null : changed ? 300 : 480,
        steps: missing ? null : changed ? 8400 : 6000,
        heartRate: missing ? null : changed ? 71 : 62,
        quality: missing ? "MISSING" : "VALID",
        coverageMinutes: missing ? 0 : 1440,
        revision: 1,
      });
      patient.reports.push({
        id: `${id}:ema:${date}:1`,
        date,
        mood: 2,
        energy: changed ? 4 : 2,
        reducedSleepNeed: changed ? 3 : 0,
        distress: 1,
        revision: 1,
      });
      patient.medications.push({
        id: `${id}:med:${date}:1`,
        date,
        status: index === 1 && i >= 26 ? "NOT_TAKEN" : "TAKEN",
        reasonCode: index === 1 && i >= 26 ? "FORGOT" : "NONE",
        revision: 1,
      });
    }
    patient.baseline = baseline(patient);
    state.patients.push(patient);
  }
  runRules(state);
  return state;
}
export function transition(
  state: State,
  task: Task,
  identity: Identity,
  body: {
    action: string;
    expectedVersion: number;
    reason?: string;
    outcome?: string;
    nextFollowupAt?: string;
  },
) {
  check(roleOf(identity) === "CLINICIAN", 403, "需要医护身份");
  check(task.version === body.expectedVersion, 409, "任务已更新，请刷新后重试");
  if (body.action === "CLAIM") {
    check(task.status === "OPEN", 422, "仅待认领任务可认领");
    task.owner = identity;
    task.status = "IN_REVIEW";
  } else {
    check(task.owner === identity, 403, "仅任务负责人可处理");
    if (body.action === "WAIT") {
      check(task.status === "IN_REVIEW", 422, "当前状态不可等待回访");
      check(
        body.nextFollowupAt &&
          Date.parse(body.nextFollowupAt) > Date.parse(state.clock),
        422,
        "请选择未来回访时间",
      );
      task.status = "WAITING_FOLLOWUP";
      task.nextFollowupAt = body.nextFollowupAt;
    } else if (body.action === "RESUME") {
      check(task.status === "WAITING_FOLLOWUP", 422, "当前状态不可恢复");
      task.status = "IN_REVIEW";
    } else if (body.action === "CLOSE") {
      check(task.status === "IN_REVIEW", 422, "请先认领并核实任务");
      check(
        task.followups.length && body.reason?.trim() && body.outcome,
        422,
        "关闭需要随访记录、结果和理由",
      );
      check(
        body.outcome !== "UNREACHABLE_AFTER_ATTEMPTS" ||
          task.followups.some((f) => f.contactResult === "NOT_REACHED"),
        422,
        "需有未联系成功的尝试记录",
      );
      task.status = "CLOSED";
      task.outcome = body.outcome;
      task.closeReason = body.reason;
    } else throw new DomainError(422, "不支持的操作");
  }
  task.version++;
  audit(state, identity, `TASK_${body.action}`, task.id);
  return task;
}
