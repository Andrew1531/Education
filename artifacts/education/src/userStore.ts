/**
 * userStore.ts
 *
 * Low-level helpers for reading and writing the `ge_users` localStorage key.
 * Extracted here so they can be unit-tested without importing the full React app.
 */

export const USERS_KEY = 'ge_users';

export interface StoredUser {
  username:  string;
  email:     string;
  password:  string;
  salt?:     string;  // PBKDF2 salt; absent on legacy SHA-256 or plain-text records
  createdAt: string;
}

/** Thrown when the `ge_users` localStorage entry exists but cannot be parsed. */
export class UserStoreCorruptError extends Error {
  constructor(cause: unknown) {
    super(
      `User store (${USERS_KEY}) is corrupt and could not be read: ` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = 'UserStoreCorruptError';
  }
}

/** True when `v` has every required field of a StoredUser at the right type. */
export function isValidStoredUser(v: unknown): v is StoredUser {
  if (!v || typeof v !== 'object') return false;
  const u = v as Record<string, unknown>;
  return (
    typeof u.username  === 'string' && u.username.length > 0 &&
    (u.email === undefined || u.email === null || typeof u.email === 'string') &&
    typeof u.password  === 'string' && u.password.length > 0 &&
    typeof u.createdAt === 'string'
  );
}

/**
 * Read all stored users.
 *
 * Returns `[]` only when the key is absent (genuine first-run state).
 * An empty string, non-array JSON, or any record that fails schema
 * validation all throw `UserStoreCorruptError` — callers must handle this
 * explicitly rather than treating it as "no users".
 */
export function getUsers(): StoredUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (raw === null) return [];               // key absent → first-run, no data yet
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new UserStoreCorruptError('parsed value is not an array');
    }
    // Validate every record — a partially-written entry is still corrupt.
    const invalid = parsed.findIndex((item) => !isValidStoredUser(item));
    if (invalid !== -1) {
      throw new UserStoreCorruptError(
        `record at index ${invalid} is missing required fields (username, password, createdAt)`,
      );
    }
    return parsed as StoredUser[];
  } catch (e) {
    if (e instanceof UserStoreCorruptError) throw e;
    throw new UserStoreCorruptError(e);
  }
}

/**
 * Persist the user list.
 *
 * Performs a JSON round-trip check before writing so that a serialisation
 * failure is caught before it overwrites good data with a truncated value.
 */
export function saveUsers(users: StoredUser[]) {
  let serialized: string;
  try {
    serialized = JSON.stringify(users);
    // Round-trip validation: confirm we can parse what we are about to write.
    const roundTripped: unknown = JSON.parse(serialized);
    if (!Array.isArray(roundTripped)) throw new Error('round-trip produced non-array');
  } catch (e) {
    throw new Error(
      `saveUsers: data failed round-trip validation and was NOT written. ` +
        (e instanceof Error ? e.message : String(e)),
    );
  }
  localStorage.setItem(USERS_KEY, serialized);
}
