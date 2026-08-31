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
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS school_outreach_history jsonb NOT NULL DEFAULT '[]'::jsonb",
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_request_attempts (
      scope text NOT NULL,
      actor text NOT NULL,
      action text NOT NULL,
      attempted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, actor, action, attempted_at)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS school_request_attempts_lookup_idx
      ON school_request_attempts (scope, actor, action, attempted_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_outreach_requests (
      idempotency_key text PRIMARY KEY,
      username text NOT NULL,
      request_hash text NOT NULL,
      schools jsonb NOT NULL,
      outcomes jsonb,
      status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS school_outreach_requests_owner_idx
      ON school_outreach_requests (username, created_at)
  `);
  // Keep the DB safe even if a future writer bypasses the API validation.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_opportunities_max_100
        CHECK (jsonb_typeof(opportunities) = 'array' AND jsonb_array_length(opportunities) <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_school_outreach_history_max_50
        CHECK (jsonb_typeof(school_outreach_history) = 'array' AND jsonb_array_length(school_outreach_history) <= 50);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  logger.info("Schema ensured (users additions, school request attempts and outreach requests)");
}
