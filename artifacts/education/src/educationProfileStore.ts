import type { EvalProfile } from './api';

export const educationProfileKey = (username: string) => `ge_education_profile_${username.trim().toLowerCase()}`;
export const unownedEducationProfileKey = 'ge_unowned_education_profile';
export function loadEducationProfile(username: string): EvalProfile {
  const scoped = localStorage.getItem(educationProfileKey(username));
  if (scoped) return JSON.parse(scoped);
  const owner = localStorage.getItem('ge_profile_owner') || localStorage.getItem('ge_username');
  // Only migrate the legacy global profile when it belongs to this account.
  if (owner && owner.toLowerCase() === username.trim().toLowerCase()) {
    return JSON.parse(localStorage.getItem('ge_profile') || '{}');
  }
  return {};
}
export function storeEducationProfile(username: string, profile: EvalProfile): void {
  const legacy = localStorage.getItem('ge_profile');
  const owner = localStorage.getItem('ge_profile_owner') || localStorage.getItem('ge_username');
  if (legacy && owner && owner.trim().toLowerCase() !== username.trim().toLowerCase()
    && !localStorage.getItem(educationProfileKey(owner))) {
    // Keep a known previous owner's legacy copy when replacing the global
    // compatibility mirror for another account.
    localStorage.setItem(educationProfileKey(owner), legacy);
  }
  if (legacy && !owner && legacy !== '{}') {
    // Preserve orphaned data for recovery without assigning it to a new account.
    // No application read path imports this archive into an account.
    const previous = localStorage.getItem(unownedEducationProfileKey);
    const key = previous && previous !== legacy
      ? `${unownedEducationProfileKey}_${Date.now()}` : unownedEducationProfileKey;
    localStorage.setItem(key, legacy);
  }
  // The scoped copy is authoritative. If storage is full, throw before claiming success.
  localStorage.setItem(educationProfileKey(username), JSON.stringify(profile));
  localStorage.setItem('ge_profile_owner', username.trim().toLowerCase());
  localStorage.setItem('ge_profile', JSON.stringify(profile));
}
export function restoreEducationProfile(username: string, remote?: EvalProfile): void {
  const local = loadEducationProfile(username);
  const pending = localStorage.getItem(`${educationProfileKey(username)}_pending`) === 'true';
  // The server's complete list is authoritative except when this device has an
  // explicitly unsynced edit. Do not merge arrays: deletions must remain deletions.
  const merged: EvalProfile = { ...remote, ...Object.fromEntries(Object.entries(local).filter(([, v]) => v)) };
  if (remote?.qualifications && !pending) merged.qualifications = remote.qualifications;
  if (pending && local.qualifications) merged.qualifications = local.qualifications;
  if (!Object.keys(merged).length && !localStorage.getItem('ge_profile')) return;
  storeEducationProfile(username, merged);
}
