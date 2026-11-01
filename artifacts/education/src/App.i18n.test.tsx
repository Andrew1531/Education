import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { addQualification, finishQualifications, renderQualifications, savedProfile, setupQualifications, toggleQualificationLanguage } from './qualificationTestHelpers';
import { buildDossierHtml } from './qualificationGuidance';
beforeEach(setupQualifications);
afterEach(finishQualifications);
describe('Language switching with uniform education guidance', () => {
  it('preserves the bilingual comparable-program panel for the selected admission qualification', async () => {
    await renderQualifications();
    fireEvent.change(screen.getByTestId('input-goal'), { target: { value: 'University Admission' } });
    await addQualification('Original award');
    // This panel is a lazy-loaded chunk; allow cold compilation under a parallel suite.
    expect(await screen.findByTestId('container-comparable-programs', {}, { timeout: 5000 })).not.toBeNull();
    expect(screen.queryByText(/Comparable U.S. programs at your level/)).not.toBeNull();
    await toggleQualificationLanguage();
    expect(screen.queryByText(/Programas de EE. UU. comparables a su nivel/)).not.toBeNull();
  });
  it('changes public home language in both directions', async () => {
    await act(async () => { render(<App />); });
    expect(screen.queryAllByText(/Your Education Abroad/).length).toBeGreaterThan(0);
    await toggleQualificationLanguage();
    expect(screen.queryAllByText(/Tu educación en el extranjero/i).length).toBeGreaterThan(0);
    await toggleQualificationLanguage();
    expect(screen.queryAllByText(/Your Education Abroad/).length).toBeGreaterThan(0);
  });
  it('rerenders saved awards and guidance without translating original names or assigning levels', async () => {
    await renderQualifications();
    await addQualification('Doctor en Medicina', 'Ecuador', 'Institución de prueba');
    const q = savedProfile().qualifications![0];
    fireEvent.click(screen.getByTestId(`button-guidance-${q.id}`));
    expect(screen.queryByText(/Preliminary guidance, not a U.S. equivalency/)).not.toBeNull();
    await toggleQualificationLanguage();
    expect(screen.queryByText('Sus titulaciones')).not.toBeNull();
    expect(screen.queryByText(/Orientación preliminar, no una equivalencia estadounidense/)).not.toBeNull();
    expect(screen.queryByText('Doctor en Medicina')).not.toBeNull();
    expect(screen.queryByText('Fuentes no disponibles')).not.toBeNull();
    await toggleQualificationLanguage();
    expect(screen.queryByText(/Preliminary guidance, not a U.S. equivalency/)).not.toBeNull();
  });
  it.each(['en', 'es'] as const)('downloads all awards with the correct %s dossier content', async lang => {
    await renderQualifications();
    await addQualification('Título técnico');
    await addQualification('MBBS');
    if (lang === 'es') await toggleQualificationLanguage();
    const create = vi.fn(() => 'blob:test');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByTestId('button-download-dossier'));
    expect(create).toHaveBeenCalledOnce();
    const html = buildDossierHtml(savedProfile().qualifications!, lang);
    expect(html).toContain(`lang="${lang}"`);
    expect(html).toContain('Título técnico');
    expect(html).toContain('MBBS');
    expect(html).not.toMatch(/undefined|U.S. SCU|120–130/);
    expect(html).toContain(lang === 'es' ? 'Licencias profesionales — revisión separada' : 'Professional licensing — separate review');
  });
});
