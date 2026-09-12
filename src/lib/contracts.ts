import { z } from "zod";
const score = z.number().int().min(0).max(4).nullable();
export const identitySchema = z.strictObject({
  identityCode: z.enum(["clinician", "reviewer", "admin", "S01", "S02", "S03"]),
});
export const reportSchema = z.strictObject({
  mood: score,
  energy: score,
  reducedSleepNeed: score,
  distress: score,
  expectedVersion: z.number().int().min(0),
});
export const medSchema = z.strictObject({
  status: z.enum(["TAKEN", "NOT_TAKEN", "UNKNOWN"]),
  reasonCode: z.enum(["NONE", "FORGOT", "SIDE_EFFECT", "RAN_OUT", "OTHER"]),
  expectedVersion: z.number().int().min(0),
});
export const transitionSchema = z.strictObject({
  action: z.enum(["CLAIM", "WAIT", "RESUME", "CLOSE"]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000).optional(),
  outcome: z
    .enum([
      "RESOLVED",
      "REFERRED",
      "FALSE_SIGNAL",
      "UNREACHABLE_AFTER_ATTEMPTS",
    ])
    .optional(),
  nextFollowupAt: z.iso.datetime({ offset: true }).optional(),
});
export const followupSchema = z.strictObject({
  contactResult: z.enum(["REACHED", "NOT_REACHED"]),
  reason: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(2000),
});
export const consentSchema = z.strictObject({
  scope: z.enum(["WEARABLE", "SELF_REPORT"]),
  action: z.enum(["GRANT", "REVOKE"]),
});
export const helpSchema = z.strictObject({
  reasonCode: z.enum(["CONTACT_REQUEST"]),
});
export const reviewSchema = z.strictObject({
  decision: z.enum(["ACCEPT", "REJECT"]),
  expectedVersion: z.number().int().positive(),
});
export const emptySchema = z.strictObject({});
export const resetSchema = z.strictObject({
  scenarioSet: z.literal("all"),
  seed: z.literal(42),
});
export const recoverSchema = z.strictObject({
  patientId: z.enum(["S01", "S02", "S03"]),
});
