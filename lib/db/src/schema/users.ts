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
  // NACES agencies the user has marked as contacted: { [agencyName]: "YYYY-MM-DD" }
  contactedAgencies: jsonb("contacted_agencies").$type<Record<string, string>>(),
  // Roadmap step checkboxes: boolean[] indexed by step position
  roadmapSteps: jsonb("roadmap_steps").$type<boolean[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
