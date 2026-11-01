// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import * as api from '../api';
import { ComparablePrograms } from './ComparablePrograms';
import { ProgramOutreach } from './ProgramOutreach';
import { mergeSaved, programOpportunity, useSavedPrograms } from './useSavedPrograms';
import { PROGRAMS } from './catalog';
import { PROGRAM_IDENTITIES, programIdentity } from '@workspace/program-catalog';

const program = PROGRAMS[0];
const opportunity = programOpportunity(program);
const legacy: api.Opportunity = { ...opportunity, id: '12345', title: 'Legacy school', organization: 'Old School', notes: 'Keep these notes' };
const job: api.Opportunity = { ...opportunity, kind: 'job', id: 'job-1', title: 'Saved job' };
const preview = { text: 'Server profile / Perfil del servidor\nCountry / País: Mexico', token: 'signed-preview', expiresAt: Date.now() + 600000 };
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api, 'apiFetchOpportunities').mockResolvedValue(null);
  vi.spyOn(api, 'apiFetchSchoolOutreachHistory').mockResolvedValue([]);
  vi.spyOn(api, 'apiSchoolReplyVerification').mockResolvedValue({ email: null, verified: false });
  vi.spyOn(api, 'apiUpsertSchoolOpportunity').mockResolvedValue();
  vi.spyOn(api, 'apiDeleteSchoolOpportunity').mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('saved program persistence', () => {
  it('keeps the static and backend official-source identities aligned', () => {
    expect(PROGRAMS.map(p => p.id).sort()).toEqual(PROGRAM_IDENTITIES.map(p => p.id).sort());
    for (const p of PROGRAMS) expect(programIdentity(p.id)?.institution).toBe(p.institution);
  });
  it('merges without deleting old school notes or saved jobs', () => {
    const result = mergeSaved([legacy, job], [opportunity], []);
    expect(result).toContainEqual(legacy);
    expect(result).toContainEqual(job);
    expect(result).toContainEqual(opportunity);
    expect(mergeSaved([legacy], [legacy], [legacy.id])).toEqual([]);
  });
  it('saves and removes on static hosting with truthful browser-only copy', async () => {
    localStorage.setItem('ge_opps_owner', JSON.stringify([legacy, job]));
    render(<ComparablePrograms username="owner" profile={{ degree: 'Bachelor', field: 'Computer Science' }} es={false} />);
    await screen.findByText(/Browser-only storage/);
    fireEvent.change(screen.getByTestId('select-cp-level'), { target: { value: program.level } });
    fireEvent.change(screen.getByTestId('select-cp-field'), { target: { value: program.field } });
    fireEvent.click(screen.getByTestId('button-cp-search'));
    fireEvent.click(screen.getByTestId(`button-save-program-${program.id}`));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('ge_opps_owner')!)).toHaveLength(3));
    expect(JSON.parse(localStorage.getItem('ge_opps_owner')!)).toContainEqual(legacy);
    expect(screen.getByText('Review contacts and message').closest('button')?.disabled).toBe(true);
    fireEvent.click(screen.getByTestId(`button-save-program-${program.id}`));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('ge_opps_owner')!)).toEqual([legacy, job]));
  });
  it('never shows another account’s saves, including during an account switch', async () => {
    localStorage.setItem('ge_opps_alice', JSON.stringify([legacy]));
    localStorage.setItem('ge_opps_bob', JSON.stringify([opportunity]));
    const { result, rerender } = renderHook(({ user }) => useSavedPrograms(user), { initialProps: { user: 'alice' } });
    await waitFor(() => expect(result.current.items).toEqual([legacy]));
    rerender({ user: 'bob' });
    await waitFor(() => expect(result.current.items).toEqual([opportunity]));
    rerender({ user: '' });
    expect(result.current.items).toEqual([]);
  });
  it('reconciles an offline removal without resurrecting the remote save', async () => {
    localStorage.setItem('ge_opps_owner', JSON.stringify([job]));
    localStorage.setItem('ge_opps_owner_removed', JSON.stringify([legacy.id]));
    vi.mocked(api.apiFetchOpportunities).mockResolvedValue([legacy, job]);
    const { result } = renderHook(() => useSavedPrograms('owner'));
    await waitFor(() => expect(result.current.mode).toBe('remote'));
    expect(api.apiDeleteSchoolOpportunity).toHaveBeenCalledWith('owner', legacy.id);
    expect(result.current.items).toEqual([job]);
    expect(localStorage.getItem('ge_opps_owner_removed')).toBe(null);
  });
  it('reports failed server writes rather than claiming account sync', async () => {
    vi.mocked(api.apiFetchOpportunities).mockResolvedValue([]);
    vi.mocked(api.apiUpsertSchoolOpportunity).mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(() => useSavedPrograms('owner'));
    await waitFor(() => expect(result.current.mode).toBe('remote'));
    await act(() => result.current.change(opportunity));
    expect(result.current.error).toBe(true);
    expect(result.current.mode).toBe('local');
    expect(result.current.items).toContainEqual(opportunity);
  });
  it('does not overwrite unreadable existing local records', async () => {
    localStorage.setItem('ge_opps_owner', '{bad json');
    const { result } = renderHook(() => useSavedPrograms('owner'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(localStorage.getItem('ge_opps_owner')).toBe('{bad json');
    await act(() => result.current.change(opportunity));
    expect(localStorage.getItem('ge_opps_owner')).toBe('{bad json');
  });
});

describe('reviewed program outreach', () => {
  it.each([false, true])('requires review and fresh consent; shows every outcome (Spanish=%s)', async es => {
    vi.spyOn(api, 'apiReviewSchoolContacts').mockResolvedValue({ preview, contacts: [
      { schoolId: opportunity.id, schoolName: program.institution, status: 'verified', recipients: [{ email: 'admissions@umgc.edu', sourceUrl: 'https://www.umgc.edu/admission' }] },
      { schoolId: legacy.id, schoolName: legacy.organization, status: 'fallback', recipients: [], fallbackUrl: 'https://example.edu/admissions' },
    ] });
    const send = vi.spyOn(api, 'apiSendReviewedSchoolOutreach').mockResolvedValue({ results: [{ schoolId: opportunity.id, recipient: 'admissions@umgc.edu', result: 'sent' }] });
    render(<ProgramOutreach username="owner" items={[opportunity, legacy]} remote busy={false} profileKey="one" es={es} remove={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: opportunity.title }));
    fireEvent.click(screen.getByRole('checkbox', { name: legacy.title }));
    fireEvent.click(screen.getByRole('button', { name: es ? 'Revisar contactos y mensaje' : 'Review contacts and message' }));
    await screen.findByTestId('program-outreach-preview');
    const button = screen.getByRole('button', { name: es ? 'Enviar la información revisada' : 'Send reviewed information' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: es ? /Revisé esta información/ : /I reviewed this exact/ }));
    fireEvent.click(button);
    await waitFor(() => expect(send).toHaveBeenCalledWith('owner', expect.any(String),
      [{ schoolId: opportunity.id, email: 'admissions@umgc.edu' }], true, preview));
    await screen.findByTestId('program-outreach-results');
    expect(screen.getByTestId('program-outreach-results').textContent).toContain(es ? 'entrega no confirmada' : 'delivery not confirmed');
    expect(screen.getByTestId('program-outreach-results').textContent).toContain(es ? 'No se intentó' : 'Not attempted');
    expect(button.disabled).toBe(true); // no accidental duplicate send
  });
  it('invalidates consent and preview when the profile changes', async () => {
    vi.spyOn(api, 'apiReviewSchoolContacts').mockResolvedValue({ preview, contacts: [
      { schoolId: opportunity.id, schoolName: program.institution, status: 'verified', recipients: [{ email: 'admissions@umgc.edu', sourceUrl: 'https://www.umgc.edu/admission' }] },
    ] });
    const { rerender } = render(<ProgramOutreach username="owner" items={[opportunity]} remote busy={false} profileKey="one" es={false} remove={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: opportunity.title }));
    fireEvent.click(screen.getByRole('button', { name: 'Review contacts and message' }));
    await screen.findByTestId('program-outreach-preview');
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed this exact/ }));
    rerender(<ProgramOutreach username="owner" items={[opportunity]} remote busy={false} profileKey="two" es={false} remove={() => {}} />);
    expect(screen.queryByTestId('program-outreach-preview')).toBe(null);
  });
  it('keeps send results when history refresh fails and reports the history problem', async () => {
    vi.spyOn(api, 'apiReviewSchoolContacts').mockResolvedValue({ preview, contacts: [
      { schoolId: opportunity.id, schoolName: program.institution, status: 'verified', recipients: [{ email: 'admissions@umgc.edu', sourceUrl: 'https://www.umgc.edu/admission' }] },
    ] });
    vi.spyOn(api, 'apiSendReviewedSchoolOutreach').mockResolvedValue({ results: [{ schoolId: opportunity.id, result: 'unknown' }] });
    const history = vi.mocked(api.apiFetchSchoolOutreachHistory);
    render(<ProgramOutreach username="owner" items={[opportunity]} remote busy={false} profileKey="one" es={false} remove={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: opportunity.title }));
    fireEvent.click(screen.getByRole('button', { name: 'Review contacts and message' }));
    await screen.findByTestId('program-outreach-preview');
    history.mockRejectedValue(new Error('history unavailable'));
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed this exact/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send reviewed information' }));
    await screen.findByTestId('program-outreach-results');
    expect(screen.getByTestId('program-outreach-results').textContent).toContain('Outcome unknown');
    expect(screen.getByRole('alert').textContent).toContain('History could not be refreshed');
  });
});
