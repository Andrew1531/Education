import { act, fireEvent, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addQualification, finishQualifications, renderQualifications, savedProfile, setupQualifications, testUser, jsonResponse } from './qualificationTestHelpers';
import { educationProfileKey } from './educationProfileStore';
beforeEach(setupQualifications);
afterEach(finishQualifications);
describe('Separate qualification persistence through the evaluator', () => {
  it('retains the selected canonical institution identity in the saved qualification', async () => {
    await renderQualifications();
    vi.mocked(fetch).mockImplementation(async url => String(url).includes('/institutions/verify')
      ? jsonResponse({
        status: 'verified', message: 'corroborated', accreditationChecked: false,
        retrievedAt: '2026-01-01T00:00:00.000Z', candidates: [],
        selected: {
          entityId: 'Q123', name: 'Barclay College', description: 'college', aliases: [],
          country: 'United States', countryMatch: true, higherEducationType: 'college',
          officialWebsite: 'https://example.edu/', websiteAvailability: 'not_checked',
          closureDate: null, wikipediaUrl: null, archiveUrl: null,
          sources: [{ name: 'Wikidata', url: 'https://www.wikidata.org/wiki/Q123', retrievedAt: '2026-01-01T00:00:00.000Z' }],
        },
      }) : jsonResponse({ ok: true }));
    await addQualification('Original award', 'United States', 'Barcaly College');
    expect(savedProfile().qualifications![0].institution).toBe('Barclay College');
    expect(savedProfile().institution).toBe('Barclay College');
    expect(savedProfile().qualifications![0].verification?.selected?.name).toBe('Barclay College');
  });
  it('adds, edits and removes separate awards, including deletion of the last award after reload', async () => {
    await renderQualifications();
    await addQualification('Licenciatura', 'Mexico', 'Universidad de prueba');
    await addQualification('MBBS', 'India', 'Test Medical College');
    let qs = savedProfile().qualifications!;
    expect(qs.map(q => q.awardName)).toEqual(['Licenciatura', 'MBBS']);
    expect(qs.every(q => q.evidenceStatus === 'unavailable')).toBe(true);
    const second = qs[1].id;
    fireEvent.click(screen.getByTestId(`button-edit-${second}`));
    fireEvent.change(screen.getByTestId('input-duration'), { target: { value: '5 years / 300 local credits' } });
    fireEvent.change(screen.getByTestId('select-completion'), { target: { value: 'completed' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-qualification')); });
    qs = savedProfile().qualifications!;
    expect(qs[0].awardName).toBe('Licenciatura');
    expect(qs[1].duration).toBe('5 years / 300 local credits');
    expect(qs[1].completion).toBe('completed');
    cleanup();
    await renderQualifications();
    for (const q of qs) {
      fireEvent.click(screen.getByTestId(`button-delete-${q.id}`));
      await act(async () => { fireEvent.click(screen.getByTestId(`button-confirm-delete-${q.id}`)); });
    }
    expect(savedProfile().qualifications).toEqual([]);
    cleanup(); await renderQualifications();
    expect(screen.queryByTestId('empty-qualifications')).not.toBeNull();
  });
  it('sends the complete list with owner authorization and legacy summary fields', async () => {
    await renderQualifications();
    await addQualification('Diploma original', 'Ecuador', 'Instituto de prueba');
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/auth/profile'));
    const request = calls.at(-1)![1]!;
    expect((request.headers as Record<string, string>)['x-auth-token']).toBe('test-owner-token');
    const body = JSON.parse(request.body as string);
    expect(body.profile.qualifications[0].awardName).toBe('Diploma original');
    expect(body.profile.country).toBe('Ecuador');
    expect(body.profile.institution).toBe('Instituto de prueba');
    expect(localStorage.getItem(educationProfileKey(testUser.username))).not.toBeNull();
  });
  it('keeps local changes and an explicit warning when account sync fails', async () => {
    await renderQualifications();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'offline' }, 503));
    await addQualification('Unsupported award');
    expect(savedProfile().qualifications![0].awardName).toBe('Unsupported award');
    expect(screen.queryByText(/Saved on this device. Sync unavailable/)).not.toBeNull();
    expect(localStorage.getItem(`${educationProfileKey(testUser.username)}_pending`)).toBe('true');
  });
  it('keeps the editor and does not claim success if local storage fails', async () => {
    await renderQualifications();
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
      if (key.startsWith('ge_education_profile_')) throw new Error('Storage is full');
      original.call(this, key, value);
    });
    fireEvent.click(screen.getByTestId('button-add-qualification'));
    fireEvent.change(screen.getByTestId('input-award-name'), { target: { value: 'Keep this draft' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-qualification')); });
    expect(screen.queryByTestId('form-qualification')).not.toBeNull();
    expect(screen.queryByText(/Not saved/)).not.toBeNull();
    expect(savedProfile().qualifications).toBeUndefined();
  });
  it('restores old profiles without inventing completion or a U.S. degree', async () => {
    await renderQualifications({ country: 'Nigeria', institution: 'Legacy University', degree: 'B.Sc', field: 'Physics', purpose: 'Employment & HR', credits: '4 years' });
    fireEvent.click(screen.getByTestId('button-edit-legacy-qualification'));
    expect((screen.getByTestId('input-award-name') as HTMLInputElement).value).toBe('B.Sc');
    expect((screen.getByTestId('input-duration') as HTMLInputElement).value).toBe('4 years');
    expect((screen.getByTestId('select-completion') as HTMLSelectElement).value).toBe('unknown');
    expect(screen.queryByText(/Bachelor's Degree/)).toBeNull();
  });
  it('retains the admission goal and existing school tools', async () => {
    await renderQualifications();
    fireEvent.change(screen.getByTestId('input-goal'), { target: { value: 'University Admission' } });
    await addQualification('Original award');
    expect(savedProfile().purpose).toBe('University Admission');
    await waitFor(() => expect(screen.queryByTestId('container-comparable-programs')).not.toBeNull());
  });
});
