// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { educationProfileKey, loadEducationProfile, restoreEducationProfile, storeEducationProfile, unownedEducationProfileKey } from './educationProfileStore';
import type { Qualification } from './qualificationGuidance';
const award: Qualification = { id: 'a', awardName: 'Original', institution: '', country: '', field: '', duration: '', completion: 'unknown', awardType: 'unknown', evidenceStatus: 'not_checked' };
beforeEach(() => localStorage.clear());
describe('Owned profile restoration', () => {
  it('does not assign unowned legacy details to the next user who signs in', () => {
    const raw = JSON.stringify({ qualifications: [award], institution: 'Previous user school' });
    localStorage.setItem('ge_profile', raw);
    expect(loadEducationProfile('bob')).toEqual({});
    restoreEducationProfile('bob', { country: 'Mexico', qualifications: [] });
    expect(loadEducationProfile('bob')).toEqual({ country: 'Mexico', qualifications: [] });
    expect(localStorage.getItem(unownedEducationProfileKey)).toBe(raw);
    expect(localStorage.getItem('ge_profile_owner')).toBe('bob');
  });
  it('lets an explicit legacy owner override a different active username', () => {
    localStorage.setItem('ge_profile_owner', 'alice');
    localStorage.setItem('ge_username', 'bob');
    localStorage.setItem('ge_profile', JSON.stringify({ qualifications: [award] }));
    expect(loadEducationProfile('bob')).toEqual({});
    expect(loadEducationProfile('alice').qualifications).toEqual([award]);
  });
  it('migrates a legacy same-user profile and preserves all data', () => {
    localStorage.setItem('ge_username', 'Alice');
    localStorage.setItem('ge_profile', JSON.stringify({ degree: 'BSc', country: 'India' }));
    expect(loadEducationProfile('alice')).toEqual({ degree: 'BSc', country: 'India' });
  });
  it('does not copy one known owner’s qualifications into another account', () => {
    storeEducationProfile('alice', { qualifications: [award] });
    expect(loadEducationProfile('bob')).toEqual({});
    restoreEducationProfile('bob', { country: 'Mexico' });
    expect(loadEducationProfile('bob').qualifications).toBeUndefined();
    expect(loadEducationProfile('alice').qualifications).toEqual([award]);
  });
  it('preserves a signed-out legacy owner’s data without giving it to a new account', () => {
    localStorage.setItem('ge_profile_owner', 'alice');
    localStorage.setItem('ge_profile', JSON.stringify({ qualifications: [award] }));
    storeEducationProfile('bob', { country: 'Mexico' });
    expect(loadEducationProfile('alice').qualifications).toEqual([award]);
    expect(loadEducationProfile('bob')).toEqual({ country: 'Mexico' });
  });
  it('accepts a complete remote list and preserves remote deletion rather than merging arrays', () => {
    storeEducationProfile('alice', { qualifications: [award] });
    restoreEducationProfile('alice', { qualifications: [] });
    expect(loadEducationProfile('alice').qualifications).toEqual([]);
  });
  it('preserves an offline edit or deletion until it is explicitly synced', () => {
    storeEducationProfile('alice', { qualifications: [] });
    localStorage.setItem(`${educationProfileKey('alice')}_pending`, 'true');
    restoreEducationProfile('alice', { qualifications: [award] });
    expect(loadEducationProfile('alice').qualifications).toEqual([]);
  });
});
