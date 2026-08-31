import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent, production-safe schema updates run at server startup.
 * The deploy pipeline does not run drizzle-kit push, so any new column the
 * server selects must be guaranteed here before requests are served.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS contacted_agencies jsonb",
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS roadmap_steps jsonb",
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS opportunities jsonb NOT NULL DEFAULT '[]'::jsonb",
  );
  // Keep the DB safe even if a future writer bypasses the API validation.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_opportunities_max_100
        CHECK (jsonb_typeof(opportunities) = 'array' AND jsonb_array_length(opportunities) <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  logger.info("Schema ensured (contacted_agencies, roadmap_steps, opportunities)");
}
