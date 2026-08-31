import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const schoolRequestAttemptsTable = pgTable("school_request_attempts", {
  scope: text("scope").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.scope, table.actor, table.action, table.attemptedAt] }),
  index("school_request_attempts_lookup_idx").on(table.scope, table.actor, table.action, table.attemptedAt),
]);

export interface SchoolOutreachOutcome {
  packageVersion: string;
  schoolId: string;
  schoolName: string;
  recipient: string;
  recipientSourceUrl: string;
  result: "sent" | "failed";
  providerMessageId: string | null;
  sentAt: string;
}

export const schoolOutreachRequestsTable = pgTable("school_outreach_requests", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  username: text("username").notNull(),
  requestHash: text("request_hash").notNull(),
  schools: jsonb("schools").$type<Array<{ schoolId: string; email: string }>>().notNull(),
  outcomes: jsonb("outcomes").$type<SchoolOutreachOutcome[]>(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("school_outreach_requests_owner_idx").on(table.username, table.createdAt),
]);