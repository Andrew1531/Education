import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { finishQualifications, renderQualifications, setupQualifications, toggleQualificationLanguage } from './qualificationTestHelpers';
beforeEach(setupQualifications);
afterEach(finishQualifications);
describe('Country picker and backward-compatible award editing', () => {
  it.each(['Nigeria', 'nigeria', 'NG'])('keeps a saved legacy country value %s intact', async country => {
    await renderQualifications({ country, institution: 'Legacy School', degree: 'Original award' });
    fireEvent.click(screen.getByTestId('button-edit-legacy-qualification'));
    expect((screen.getByTestId('input-country') as HTMLInputElement).value).toBe(country);
  });
  it('keeps the sign-up picker blank and changes its placeholder with language', async () => {
    await act(async () => { render(<App />); });
    const country = screen.getByTestId('input-signup-country') as HTMLInputElement;
    expect(country.value).toBe('');
    const english = country.placeholder;
    await toggleQualificationLanguage();
    expect(country.placeholder).not.toBe(english);
  });
});
