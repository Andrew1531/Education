// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as userStore from '../userStore';
import { AccountEmailComposer } from './AccountEmailComposer';
import { programOpportunity } from './useSavedPrograms';
import { PROGRAMS } from './catalog';
import { apiSignup, apiSignin } from '../api';
import { readAccountEmail } from './accountEmailIdentity';

const wsu = PROGRAMS.find(p => p.id === 'wsu-cs-bs')!;
const umgc = PROGRAMS.find(p => p.institution === 'University of Maryland Global Campus')!;
const items = [programOpportunity(wsu), programOpportunity(umgc)];
const profile = { country: 'Mexico', degree: 'Licenciatura', institution: 'UNAM', field: 'Computing' };
const user = (email: string) => ({ username: 'Ana', email, password: 'x', createdAt: '2026-01-01' });
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AccountEmailComposer', () => {
  it('uses the email from a successful API signup even with no local-account record', async () => {
    vi.spyOn(userStore, 'getUsers').mockReturnValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: { email: 'ana-server@example.com' }, token: 'synthetic-test-token',
    }), { status: 201, headers: { 'content-type': 'application/json' } })));
    await apiSignup('Ana', 'ana-server@example.com', 'test-only-password');
    expect(readAccountEmail('ana')).toBe('ana-server@example.com');
    render(<AccountEmailComposer username="Ana" items={items} profile={profile} es={false} />);
    expect(screen.getByTestId('text-account-email').textContent).toContain('ana-server@example.com');
    fireEvent.click(screen.getByTestId('checkbox-consent-0'));
    expect(screen.getByTestId('link-gmail-0').getAttribute('href')).toContain('authuser=ana-server%40example.com');
  });

  it('refreshes the owner email on API sign-in and never borrows an ownerless legacy email', async () => {
    vi.spyOn(userStore, 'getUsers').mockReturnValue([]);
    localStorage.setItem('ge_email', 'someone-else@example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: { email: 'ana-returning@example.com' }, token: 'synthetic-test-token',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await apiSignin('Ana', 'test-only-password');
    expect(readAccountEmail('OtherAccount')).toBe('');
    const { unmount } = render(<AccountEmailComposer username="Ana" items={items} profile={profile} es={false} />);
    expect(screen.getByTestId('text-account-email').textContent).toContain('ana-returning@example.com');
    unmount();
    render(<AccountEmailComposer username="OtherAccount" items={items} profile={profile} es={false} />);
    expect(screen.getByTestId('status-account-email-missing')).toBeTruthy();
    expect(screen.queryByTestId('checkbox-consent-0')).toBeNull();
  });
  it('requires consent before compose links and uses the owner email', () => {
    vi.spyOn(userStore, 'getUsers').mockReturnValue([user('other@example.com'), { ...user('ana@example.com'), username: 'ana' }].slice(1));
    render(<AccountEmailComposer username="ANA" items={items} profile={profile} es={false} />);
    expect(screen.getByTestId('text-account-email').textContent).toContain('ana@example.com');
    expect(screen.queryByTestId('link-gmail-0')).toBeNull();
    fireEvent.click(screen.getByTestId('checkbox-consent-0'));
    const href = screen.getByTestId('link-gmail-0').getAttribute('href')!;
    expect(href).toContain('authuser=ana%40example.com');
    expect(href).toContain('admissions%40wichita.edu');
    // Contact-page-only record: no consent/compose, but copy available.
    expect(screen.queryByTestId('checkbox-consent-1')).toBeNull();
    expect(screen.getByTestId('button-copy-message-1')).toHaveProperty('type', 'button');
  });

  it('disables compose when the account email is missing', () => {
    vi.spyOn(userStore, 'getUsers').mockReturnValue([user('')]);
    render(<AccountEmailComposer username="Ana" items={items} profile={profile} es={false} />);
    expect(screen.getByTestId('status-account-email-missing')).toBeTruthy();
    expect(screen.queryByTestId('checkbox-consent-0')).toBeNull();
    expect(screen.queryByTestId('link-gmail-0')).toBeNull();
  });

  it('resets consent when switching to Spanish', () => {
    vi.spyOn(userStore, 'getUsers').mockReturnValue([user('ana@example.com')]);
    const { rerender } = render(<AccountEmailComposer username="Ana" items={items} profile={profile} es={false} />);
    fireEvent.click(screen.getByTestId('checkbox-consent-0'));
    expect(screen.getByTestId('link-outlook-0')).toBeTruthy();
    rerender(<AccountEmailComposer username="Ana" items={items} profile={profile} es />);
    expect(screen.queryByTestId('link-outlook-0')).toBeNull();
    expect((screen.getByTestId('checkbox-consent-0') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('text-subject-0').textContent).toContain('Consulta de admisión');
  });

  it('reports copy success and honest failure', async () => {
    vi.spyOn(userStore, 'getUsers').mockReturnValue([user('ana@example.com')]);
    render(<AccountEmailComposer username="Ana" items={items} profile={profile} es={false} />);
    fireEvent.click(screen.getByTestId('button-copy-subject-0'));
    await waitFor(() => expect(screen.getByTestId('status-copy-0').textContent).toContain('Nothing has been sent'));
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByTestId('button-copy-message-0'));
    await waitFor(() => expect(screen.getByTestId('status-copy-0').textContent).toContain('Copy failed'));
  });
});
