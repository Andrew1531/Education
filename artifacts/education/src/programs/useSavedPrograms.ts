import { useEffect, useRef, useState } from 'react';
import { apiDeleteSchoolOpportunity, apiFetchOpportunities, apiUpsertSchoolOpportunity, type Opportunity } from '../api';
import type { ProgramRecord } from './catalog';

const keyFor = (user: string) => `ge_opps_${user.trim().toLowerCase()}`;
export function readSaved(user: string): Opportunity[] {
  const value = JSON.parse(localStorage.getItem(keyFor(user)) || '[]');
  if (!Array.isArray(value) || value.some(o => !o || typeof o.id !== 'string' ||
      !['school', 'job'].includes(o.kind) || typeof o.updatedAt !== 'string')) throw new Error('invalid_saved_data');
  return value;
}
function readRemoved(user: string): string[] {
  const value = JSON.parse(localStorage.getItem(`${keyFor(user)}_removed`) || '[]');
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) throw new Error('invalid_saved_data');
  return value;
}
export function mergeSaved(local: Opportunity[], remote: Opportunity[], removed: string[]): Opportunity[] {
  const map = new Map(remote.map(o => [`${o.kind}:${o.id}`, o]));
  for (const o of local) {
    const old = map.get(`${o.kind}:${o.id}`);
    if (!old || Date.parse(o.updatedAt) > Date.parse(old.updatedAt)) map.set(`${o.kind}:${o.id}`, o);
  }
  return [...map.values()].filter(o => o.kind !== 'school' || !removed.includes(o.id));
}
export function programOpportunity(p: ProgramRecord): Opportunity {
  const now = new Date().toISOString();
  return { id: p.id, kind: 'school', title: p.title, organization: p.institution,
    location: p.location, url: p.url, sourceName: p.institution, sourceUrl: p.sourceUrl,
    sourceRetrievedAt: `${p.checkedAt}T00:00:00.000Z`, status: 'saved', deadline: null,
    readinessChecks: [], createdAt: now, updatedAt: now };
}

export function useSavedPrograms(username?: string | null) {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [mode, setMode] = useState<'loading' | 'local' | 'remote'>('loading');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadedOwner, setLoadedOwner] = useState(username);
  const owner = useRef(username);
  owner.current = username;
  const mutating = useRef(false);
  const [generation, reload] = useState(0);
  useEffect(() => {
    let active = true;
    setItems([]); setLoadedOwner(username); setMode('loading'); setError(false); setBusy(false);
    if (!username) return () => { active = false; };
    const user = username;
    const load = async () => {
      try {
        const local = readSaved(user), removed = readRemoved(user);
        if (active) setItems(local);
        const remote = await apiFetchOpportunities(user);
        if (!active) return;
        if (remote === null) { setMode('local'); return; }
        const merged = mergeSaved(local, remote, removed);
        // Per-record writes preserve jobs and unrelated legacy saves.
        for (const id of removed) await apiDeleteSchoolOpportunity(user, id);
        for (const item of merged.filter(o => o.kind === 'school')) {
          const old = remote.find(o => o.kind === 'school' && o.id === item.id);
          if (!old || Date.parse(item.updatedAt) > Date.parse(old.updatedAt)) {
            await apiUpsertSchoolOpportunity(user, item);
          }
        }
        if (!active) return;
        localStorage.setItem(keyFor(user), JSON.stringify(merged));
        localStorage.removeItem(`${keyFor(user)}_removed`);
        setItems(merged); setMode('remote');
      } catch { if (active) { setError(true); setMode('local'); } }
    };
    void load();
    return () => { active = false; };
  }, [username, generation]);

  async function change(item: Opportunity, remove = false) {
    if (!username || mutating.current || mode === 'loading') return;
    const user = username;
    mutating.current = true; setBusy(true); setError(false);
    try {
      // Persist locally first. Tombstones prevent an offline removal being
      // resurrected when the backend becomes available again.
      const current = readSaved(user);
      const removed = new Set(readRemoved(user));
      const next = current.filter(o => !(o.kind === 'school' && o.id === item.id));
      if (remove) removed.add(item.id);
      else { next.push(item); removed.delete(item.id); }
      localStorage.setItem(`${keyFor(user)}_removed`, JSON.stringify([...removed]));
      localStorage.setItem(keyFor(user), JSON.stringify(next));
      if (owner.current === user) setItems(next);
      if (mode === 'remote') {
        if (remove) await apiDeleteSchoolOpportunity(user, item.id);
        else await apiUpsertSchoolOpportunity(user, item);
        // Only clear this removal after server acknowledgement.
        if (remove) {
          const pending = readRemoved(user).filter(id => id !== item.id);
          localStorage.setItem(`${keyFor(user)}_removed`, JSON.stringify(pending));
        }
      }
    } catch {
      if (owner.current === user) { setError(true); setMode('local'); }
    } finally {
      mutating.current = false;
      if (owner.current === user) setBusy(false);
    }
  }
  return { items: loadedOwner === username ? items : [],
    mode: loadedOwner === username ? mode : 'loading' as const,
    error: loadedOwner === username && error, busy, change, retry: () => reload(v => v + 1) };
}
