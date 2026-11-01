// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from '../api';
import { ProgramOutreach } from './ProgramOutreach';

vi.mock('./AccountEmailComposer', () => ({ AccountEmailComposer: () => null }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const item: api.Opportunity = { id: 'umgc-cs-bs', kind: 'school', title: 'Computer Science', organization: 'UMGC',
  status: 'saved', deadline: null, readinessChecks: [], createdAt: '', updatedAt: '' };
const props = { username: 'owner', items: [item], remote: true, busy: false, profileKey: '', es: false, remove: () => {} };
const preview = { text: 'Reviewed self-reported education', token: 'signed', expiresAt: Date.now() + 900_000,
  replyTo: 'owner@example.org' };
const contacts: api.SchoolContact[] = [{ schoolId: item.id, schoolName: 'UMGC', status: 'verified',
  recipients: [{ email: 'admissions@umgc.edu', sourceUrl: 'https://www.umgc.edu/admission' }] }];

beforeEach(() => {
  vi.spyOn(api, 'apiFetchSchoolOutreachHistory').mockResolvedValue([]);
  vi.spyOn(api, 'apiSendReviewedSchoolOutreach').mockResolvedValue({
    results: [{ schoolId: item.id, recipient: 'admissions@umgc.edu', result: 'sent' }],
  });
  vi.spyOn(api, 'apiReviewSchoolContacts').mockResolvedValue({ contacts, preview });
  vi.spyOn(api, 'apiSchoolReplyVerification').mockResolvedValue({ email: 'owner@example.org', verified: true });
});

describe('optional verified applicant reply address', () => {
  it.each([false, true])('requires opt-in, exact-address consent and a signed preview in Spanish=%s', async es => {
    render(<ProgramOutreach {...props} es={es} />);
    const include = await screen.findByRole('checkbox', { name: /owner@example.org/ });
    expect((include as HTMLInputElement).checked).toBe(false);
    fireEvent.click(include);
    fireEvent.click(screen.getByLabelText('Computer Science'));
    fireEvent.click(screen.getByText(es ? 'Revisar contactos y mensaje' : 'Review contacts and message'));
    await screen.findByTestId('program-outreach-preview');
    expect(api.apiReviewSchoolContacts).toHaveBeenCalledWith('owner', [item.id], true);
    const send = screen.getByText(es ? 'Enviar la información revisada' : 'Send reviewed information') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const consent = screen.getByRole('checkbox', { name: es ? /Doy mi consentimiento.*owner@example.org/ : /I consent.*owner@example.org/ });
    expect(api.apiSendReviewedSchoolOutreach).not.toHaveBeenCalled();
    fireEvent.click(consent);
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(api.apiSendReviewedSchoolOutreach).toHaveBeenCalledWith(
      'owner', expect.any(String), [{ schoolId: item.id, email: 'admissions@umgc.edu' }], true, preview));
  });
  it('invalidates the reviewed preview and consent when opting out, and clears consent on language change', async () => {
    const view = render(<ProgramOutreach {...props} />);
    const include = await screen.findByRole('checkbox', { name: /owner@example.org/ });
    fireEvent.click(include);
    fireEvent.click(screen.getByLabelText('Computer Science'));
    fireEvent.click(screen.getByText('Review contacts and message'));
    await screen.findByTestId('program-outreach-preview');
    fireEvent.click(screen.getByRole('checkbox', { name: /I consent.*owner@example.org/ }));
    view.rerender(<ProgramOutreach {...props} es />);
    expect((screen.getByRole('checkbox', { name: /Doy mi consentimiento/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /Incluir.*owner@example.org/ }));
    expect(screen.queryByTestId('program-outreach-preview')).toBeNull();
    expect(api.apiSendReviewedSchoolOutreach).not.toHaveBeenCalled();
  });
  it.each([false, true])('verifies the account email without selecting sharing or sending in Spanish=%s', async es => {
    vi.mocked(api.apiSchoolReplyVerification)
      .mockResolvedValueOnce({ email: 'owner@example.org', verified: false })
      .mockResolvedValueOnce({ email: 'owner@example.org', verified: false, codeSent: true })
      .mockResolvedValueOnce({ email: 'owner@example.org', verified: true });
    render(<ProgramOutreach {...props} es={es} />);
    fireEvent.click(await screen.findByText(es ? 'Enviar código de verificación' : 'Send verification code'));
    fireEvent.change(await screen.findByLabelText(es ? 'Código de verificación' : 'Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText(es ? 'Verificar correo de la cuenta' : 'Verify account email'));
    const include = await screen.findByRole('checkbox', { name: /owner@example.org/ }) as HTMLInputElement;
    expect(include.checked).toBe(false);
    expect(api.apiSchoolReplyVerification).toHaveBeenCalledWith('owner', 'confirm', '123456');
    expect(api.apiReviewSchoolContacts).not.toHaveBeenCalled();
    expect(api.apiSendReviewedSchoolOutreach).not.toHaveBeenCalled();
  });
  it('disables verification, review and sending without a backend, in both languages', async () => {
    const view = render(<ProgramOutreach {...props} remote={false} />);
    expect(screen.getByText(/Static hosting cannot send/)).toBeTruthy();
    expect((screen.getByLabelText('Computer Science') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByText('Review contacts and message') as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<ProgramOutreach {...props} remote={false} es />);
    expect(screen.getByText(/El alojamiento estático no puede enviar/)).toBeTruthy();
    expect(api.apiSchoolReplyVerification).not.toHaveBeenCalled();
    expect(api.apiSendReviewedSchoolOutreach).not.toHaveBeenCalled();
  });
  it('clears the selected reply address and preview when accounts change', async () => {
    const view = render(<ProgramOutreach {...props} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /owner@example.org/ }));
    fireEvent.click(screen.getByLabelText('Computer Science'));
    fireEvent.click(screen.getByText('Review contacts and message'));
    await screen.findByTestId('program-outreach-preview');
    vi.mocked(api.apiSchoolReplyVerification).mockResolvedValue({ email: 'other@example.org', verified: false });
    view.rerender(<ProgramOutreach {...props} username="other" />);
    await screen.findByText(/Account email: other@example.org/);
    expect(screen.queryByTestId('program-outreach-preview')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /owner@example.org/ })).toBeNull();
  });
});
