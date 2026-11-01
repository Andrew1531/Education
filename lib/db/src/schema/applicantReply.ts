import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const applicantReplyVerificationTable = pgTable("applicant_reply_verification", {
  username: text("username").primaryKey(),
  userId: integer("user_id").notNull().unique("applicant_reply_verification_user_idx")
    .references(() => usersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  codeHash: text("code_hash"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const insertApplicantReplyVerificationSchema = createInsertSchema(applicantReplyVerificationTable);
export type InsertApplicantReplyVerification = z.infer<typeof insertApplicantReplyVerificationSchema>;
export type ApplicantReplyVerification = typeof applicantReplyVerificationTable.$inferSelect;
