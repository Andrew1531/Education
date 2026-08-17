/**
 * Pure helpers for contacted-agency checkmark persistence and cross-device
 * merge logic. Kept separate from App.tsx so they can be unit-tested without
 * mounting the full React tree.
 */

export const CONTACTED_KEY_PREFIX = 'ge_agencies_contacted_';

export function contactedStorageKey(username: string): string {
  return `${CONTACTED_KEY_PREFIX}${username.toLowerCase() || 'anon'}`;
}

export function loadContacted(username: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(contactedStorageKey(username));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch { /* corrupted entry — start fresh */ }
  return {};
}

/**
 * Merge a remote contacted map into the local one using local-wins semantics:
 * - Remote entries fill in agencies that are not checked locally.
 * - For the same agency, the local timestamp always wins (never overwritten).
 * - Returns `null` when the merge adds nothing new to local (no state update
 *   or server round-trip needed).
 *
 * This is the single source of truth for the two-device conflict resolution
 * rule: a device that was offline cannot lose checkmarks it already made, and
 * it inherits any checkmarks from the server it hadn't seen yet.
 */
export function mergeContacted(
  remote: Record<string, string>,
  local: Record<string, string>,
): Record<string, string> | null {
  if (Object.keys(remote).length === 0) return null;
  // Spread order: remote first, then local on top — local always wins conflicts
  const merged = { ...remote, ...local };
  // If the merged map is no larger than local, nothing new came from the server
  if (Object.keys(merged).length === Object.keys(local).length) return null;
  return merged;
}
