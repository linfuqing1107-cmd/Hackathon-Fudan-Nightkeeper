import { z } from "zod";
import * as c from "./contracts";
const definitions: [string, string, z.ZodType | null, string][] = [
  [
    "/demo/session",
    "post",
    c.identitySchema,
    "Create or switch a local synthetic identity",
  ],
  ["/session", "get", null, "Current identity and CSRF token"],
  ["/view", "get", null, "Role-filtered local workspace snapshot"],
  ["/patients", "get", null, "Assigned patient list"],
  ["/patients/{id}", "get", null, "Authorized patient details"],
  [
    "/patients/{id}/timeline",
    "get",
    null,
    "Bounded synthetic timeline (28 days)",
  ],
  ["/patients/{id}/consents", "get", null, "Consent history"],
  [
    "/patients/{id}/consents",
    "post",
    c.consentSchema,
    "Append consent revision",
  ],
  [
    "/patients/{id}/daily-reports/{date}",
    "put",
    c.reportSchema,
    "Submit or revise daily report",
  ],
  [
    "/patients/{id}/medication-reports/{date}",
    "put",
    c.medSchema,
    "Submit medication self-report",
  ],
  [
    "/patients/{id}/help-requests",
    "post",
    c.helpSchema,
    "Record simulated contact request; no real dispatch",
  ],
  ["/tasks", "get", null, "Assigned task list"],
  ["/tasks/{id}", "get", null, "Task and frozen evidence"],
  [
    "/tasks/{id}/transitions",
    "post",
    c.transitionSchema,
    "Claim, wait, resume or close",
  ],
  [
    "/tasks/{id}/followups",
    "post",
    c.followupSchema,
    "Append a follow-up record",
  ],
  [
    "/tasks/{id}/summaries",
    "post",
    c.emptySchema,
    "Synchronously generate a TEMPLATE draft",
  ],
  [
    "/tasks/{id}/summary-review",
    "post",
    c.reviewSchema,
    "Review latest draft using task version",
  ],
  [
    "/demo/reset",
    "post",
    c.resetSchema,
    "Reset current synthetic workspace (admin)",
  ],
  [
    "/demo/recover",
    "post",
    c.recoverSchema,
    "Simulate recovery, respecting wearable consent (admin)",
  ],
  ["/health", "get", null, "Local service readiness"],
];
export function openapi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, method, schema, summary] of definitions) {
    const parameters: unknown[] = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    if (schema && path !== "/demo/session")
      parameters.push(
        {
          name: "X-CSRF-Token",
          in: "header",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", maxLength: 128 },
        },
      );
    paths[path] ??= {};
    paths[path][method] = {
      summary,
      parameters,
      security:
        path === "/health" || path === "/demo/session"
          ? []
          : [{ sessionCookie: [] }],
      ...(schema
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: z.toJSONSchema(schema) },
              },
            },
          }
        : {}),
      responses: {
        "200": {
          description: "Success envelope",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Envelope" },
            },
          },
        },
        "401": { description: "No session" },
        "403": { description: "Forbidden role, CSRF, origin, or consent" },
        "404": { description: "Absent or outside assignment" },
        "409": { description: "Version/idempotency conflict" },
        "422": { description: "Invalid data or transition" },
        "429": { description: "Rate limited" },
        "503": { description: "Storage unavailable" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Nightkeeper Local Demo API",
      version: "0.2.0",
      description:
        "Implemented subset only. Local synthetic data; not a clinical API. Response entities follow src/lib/types.ts; response validation remains a later task.",
    },
    servers: [{ url: "/api/v1" }],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: "apiKey", in: "cookie", name: "nk_session" },
      },
      schemas: {
        Envelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: {},
            meta: {
              type: "object",
              required: ["requestId"],
              properties: { requestId: { type: "string" } },
            },
          },
        },
      },
    },
  };
}
