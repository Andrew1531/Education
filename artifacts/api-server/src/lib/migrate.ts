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
  logger.info("Schema ensured (contacted_agencies, roadmap_steps)");
}
