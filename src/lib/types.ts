export type Role = "CLINICIAN" | "PATIENT" | "ADMIN";
export type Identity =
  "clinician" | "reviewer" | "admin" | "S01" | "S02" | "S03";
export type TaskType =
  "CHANGE_REVIEW" | "MEDICATION_REVIEW" | "DATA_QUALITY" | "HELP_REQUEST";
export type TaskStatus = "OPEN" | "IN_REVIEW" | "WAITING_FOLLOWUP" | "CLOSED";
export type Medication = "TAKEN" | "NOT_TAKEN" | "UNKNOWN";
export interface Report {
  id: string;
  date: string;
  mood: number | null;
  energy: number | null;
  reducedSleepNeed: number | null;
  distress: number | null;
  revision: number;
}
export interface MedReport {
  id: string;
  date: string;
  status: Medication;
  reasonCode: string;
  revision: number;
}
export interface Observation {
  id: string;
  date: string;
  sleep: number | null;
  steps: number | null;
  heartRate: number | null;
  quality: "VALID" | "MISSING" | "PARTIAL";
  coverageMinutes: number;
  revision: number;
}
export interface Consent {
  scope: "WEARABLE" | "SELF_REPORT";
  status: "GRANTED" | "REVOKED";
  at: string;
  revision: number;
}
export interface Patient {
  id: string;
  code: string;
  scenario: string;
  lastSyncAt: string;
  timezone: string;
  baseline: {
    median: number | null;
    validDays: number;
    status: "READY" | "INSUFFICIENT";
    sourceIds: string[];
  };
  observations: Observation[];
  reports: Report[];
  medications: MedReport[];
  consents: Consent[];
}
export interface Evidence {
  sourceId: string;
  date: string;
  label: string;
  value: string;
  baseline?: string;
}
export interface Evaluation {
  id: string;
  patientId: string;
  type: TaskType;
  targetDate: string;
  hash: string;
  result: "TRIGGERED" | "NOT_TRIGGERED" | "INSUFFICIENT";
  evidence: Evidence[];
  superseded?: boolean;
}
export interface Followup {
  id: string;
  at: string;
  author: string;
  contactResult: "REACHED" | "NOT_REACHED";
  reason: string;
  text: string;
}
export interface Summary {
  id: string;
  mode: "TEMPLATE";
  status: "DRAFT" | "REVIEWED" | "REJECTED";
  text: string;
  sourceIds: string[];
  at: string;
  reviewer?: string;
}
export interface Task {
  id: string;
  patientId: string;
  type: TaskType;
  status: TaskStatus;
  owner: string | null;
  version: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidence: Evidence[];
  evaluationIds: string[];
  ruleVersion: string;
  needsReview: boolean;
  recovered: boolean;
  followups: Followup[];
  summaries: Summary[];
  nextFollowupAt?: string;
  outcome?: string;
  closeReason?: string;
  predecessorTaskId?: string;
}
export interface Audit {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityId: string;
}
export interface State {
  clock: string;
  patients: Patient[];
  tasks: Task[];
  evaluations: Evaluation[];
  audit: Audit[];
  revision: number;
}
export interface Session {
  token: string;
  workspace: string;
  identity: Identity;
  csrf: string;
  expires: number;
}
export interface View {
  clock: string;
  patients: Patient[];
  tasks: Task[];
  audit: Audit[];
  identity: Identity;
  role: Role;
  csrf: string;
  revision: number;
}
export const typeLabels: Record<TaskType, string> = {
  CHANGE_REVIEW: "多维变化核实",
  MEDICATION_REVIEW: "服药反馈核实",
  DATA_QUALITY: "数据质量核实",
  HELP_REQUEST: "主动联系请求",
};
export const statusLabels: Record<TaskStatus, string> = {
  OPEN: "待认领",
  IN_REVIEW: "核实中",
  WAITING_FOLLOWUP: "待回访",
  CLOSED: "已关闭",
};
