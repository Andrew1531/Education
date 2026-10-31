import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull().default(""),
  // Evaluation profile — what the user entered in the credential evaluator
  country: text("country"),
  institution: text("institution"),
  degree: text("degree"),
  field: text("field"),
  purpose: text("purpose"),
  // Null means a legacy profile; [] means the owner explicitly removed all awards.
  qualifications: jsonb("qualifications").$type<unknown[]>(),
  // NACES agencies the user has marked as contacted: { [agencyName]: "YYYY-MM-DD" }
  contactedAgencies: jsonb("contacted_agencies").$type<Record<string, string>>(),
  // Roadmap step checkboxes: boolean[] indexed by step position
  roadmapSteps: jsonb("roadmap_steps").$type<boolean[]>(),
  // User-owned saved job and school research records. Route validation caps this
  // at 100 entries; the startup migration also installs a database constraint.
  opportunities: jsonb("opportunities").$type<Opportunity[]>().notNull().default([]),
  // Sanitized outcomes of school outreach; capped by both the API and database.
  schoolOutreachHistory: jsonb("school_outreach_history").$type<SchoolOutreachHistoryEntry[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OpportunityKind = "job" | "school";
export type OpportunityStatus = "saved" | "researching" | "applying" | "applied" | "accepted" | "rejected" | "closed";

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  title: string;
  organization: string;
  url: string;
  location: string;
  sourceName: string;
  sourceUrl: string;
  sourceRetrievedAt: string;
  status: OpportunityStatus;
  deadline: string | null;
  notes: string;
  nextAction: string;
  readinessChecks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SchoolOutreachHistoryEntry {
  packageVersion: string;
  schoolId: string;
  schoolName: string;
  recipient: string;
  recipientSourceUrl: string;
  result: "sent" | "failed";
  providerMessageId: string | null;
  sentAt: string;
}

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
