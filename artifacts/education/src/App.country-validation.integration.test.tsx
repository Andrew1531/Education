import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { addQualification, finishQualifications, renderQualifications, savedProfile, setupQualifications, toggleQualificationLanguage } from './qualificationTestHelpers';
beforeEach(setupQualifications);
afterEach(finishQualifications);
describe('Optional qualification details and account-country validation', () => {
  it('allows preliminary guidance when the country and institution are unknown', async () => {
    await renderQualifications();
    await addQualification('Unknown award');
    expect(savedProfile().qualifications![0].country).toBe('');
    expect(savedProfile().qualifications![0].evidenceStatus).toBe('not_checked');
  });
  it('does not lose an unfamiliar historic country name', async () => {
    await renderQualifications();
    await addQualification('Historic diploma', 'Former country / system');
    expect(savedProfile().qualifications![0].country).toBe('Former country / system');
  });
  it.each(['en', 'es'])('retains account sign-up validation in %s', async lang => {
    await act(async () => { render(<App />); });
    if (lang === 'es') await toggleQualificationLanguage();
    fireEvent.change(screen.getByTestId('input-username'), { target: { value: 'new-country-user' } });
    fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'test@example.test' } });
    fireEvent.change(screen.getByTestId('input-signup-country'), { target: { value: 'Not a country' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('form-auth')); });
    expect(screen.queryByText(lang === 'es'
      ? /selecciona un país|seleccione un país/i : /Please select a country from the list/)).not.toBeNull();
  });
});
