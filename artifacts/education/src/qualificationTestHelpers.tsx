// Shared fixtures for evaluator integration tests. No real accounts or providers.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';
import type { EvalProfile } from './api';
export const testUser = { username: 'qualification-test', email: 'qualification@example.test', password: 'a'.repeat(64), createdAt: '2026-01-01T00:00:00Z' };
export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export function setupQualifications() {
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('/institutions/verify')
    ? jsonResponse({ error: 'sources_unavailable' }, 503) : jsonResponse({ ok: true })));
}
export function finishQualifications() { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
export async function renderQualifications(profile?: EvalProfile) {
  localStorage.setItem('ge_users', JSON.stringify([testUser]));
  localStorage.setItem('ge_username', testUser.username);
  localStorage.setItem(`ge_auth_token_${testUser.username}`, 'test-owner-token');
  if (profile) localStorage.setItem('ge_profile', JSON.stringify(profile));
  await act(async () => { render(<App />); });
  await screen.findByTestId('qualification-workflow');
}
export async function addQualification(awardName: string, country = '', institution = '') {
  fireEvent.click(screen.getByTestId('button-add-qualification'));
  fireEvent.change(screen.getByTestId('input-award-name'), { target: { value: awardName } });
  if (country) fireEvent.change(screen.getByTestId('input-country'), { target: { value: country } });
  if (institution) fireEvent.change(screen.getByTestId('input-institution'), { target: { value: institution } });
  await act(async () => { fireEvent.submit(screen.getByTestId('form-qualification')); });
  await waitFor(() => expectNoEditor());
}
function expectNoEditor() { if (screen.queryByTestId('form-qualification')) throw new Error('Editor has not closed'); }
export function savedProfile(): EvalProfile { return JSON.parse(localStorage.getItem('ge_profile') || '{}'); }
export async function toggleQualificationLanguage() { await act(async () => { fireEvent.click(screen.getAllByTestId('button-lang-toggle')[0]); }); }
