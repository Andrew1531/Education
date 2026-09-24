// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstitutionVerification } from './InstitutionVerification';
import type { InstitutionVerification as Verification } from './api';

const { apiVerifyInstitution } = vi.hoisted(() => ({ apiVerifyInstitution: vi.fn() }));
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, apiVerifyInstitution };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const verified: Verification = {
  status: 'verified',
  message: 'corroborated',
  accreditationChecked: false,
  retrievedAt: '2026-01-01T00:00:00.000Z',
  candidates: [],
  selected: {
    entityId: 'Q1',
    name: 'Example University',
    description: 'university',
    aliases: [],
    country: 'United States',
    countryMatch: true,
    higherEducationType: 'university',
    officialWebsite: 'https://example.edu/',
    websiteAvailability: 'not_checked',
    closureDate: null,
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Example_University',
    archiveUrl: null,
    sources: [{ name: 'Wikidata', url: 'https://www.wikidata.org/wiki/Q1', retrievedAt: '2026-01-01T00:00:00.000Z' }],
  },
};

afterEach(() => {
  cleanup();
  apiVerifyInstitution.mockReset();
});

describe('InstitutionVerification', () => {
  it('ignores a stale response after the institution changes', async () => {
    const pending = deferred<Verification>();
    apiVerifyInstitution.mockReturnValueOnce(pending.promise);
    const onChange = vi.fn();
    const view = render(<InstitutionVerification name="Old University" country="United States" lang="en" onChange={onChange} onContinueUnverified={vi.fn()} />);
    fireEvent.click(screen.getByTestId('button-check-institution'));
    view.rerender(<InstitutionVerification name="New University" country="United States" lang="en" onChange={onChange} onContinueUnverified={vi.fn()} />);
    pending.resolve(verified);
    await Promise.resolve();
    expect(screen.queryByTestId('institution-verified')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows source-backed evidence and enables the parent only after verification', async () => {
    apiVerifyInstitution.mockResolvedValueOnce(verified);
    const onChange = vi.fn();
    render(<InstitutionVerification name="Example University" country="United States" lang="en" onChange={onChange} onContinueUnverified={vi.fn()} />);
    fireEvent.click(screen.getByTestId('button-check-institution'));
    await waitFor(() => expect(screen.queryByTestId('institution-verified')).not.toBeNull());
    expect(screen.getAllByText(/Wikidata/).length).toBeGreaterThan(0);
    expect(onChange).toHaveBeenLastCalledWith(verified);
  });

  it('offers an explicit unverified path when no evidence is found', async () => {
    apiVerifyInstitution.mockResolvedValueOnce({
      status: 'not_found', message: 'none', accreditationChecked: false,
      retrievedAt: '2026-01-01T00:00:00.000Z', selected: null, candidates: [],
    });
    const continueUnverified = vi.fn();
    render(<InstitutionVerification name="Unknown School" country="United States" lang="en" onChange={vi.fn()} onContinueUnverified={continueUnverified} />);
    fireEvent.click(screen.getByTestId('button-check-institution'));
    await waitFor(() => expect(screen.queryByTestId('button-continue-unverified')).not.toBeNull());
    fireEvent.click(screen.getByTestId('button-continue-unverified'));
    expect(continueUnverified).toHaveBeenCalledOnce();
  });
});