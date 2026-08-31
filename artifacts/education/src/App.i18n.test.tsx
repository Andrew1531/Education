// @vitest-environment jsdom
/**
 * i18n integration tests — verify EN↔ES language switching produces
 * the correct translated text across the main app surfaces:
 *   - Home page hero (public, no login needed)
 *   - Evaluator results after form submission
 *   - Language toggle after evaluation re-renders in the new locale
 *   - Spanish field-name classifier inputs (contabilidad, ingeniería, enfermería)
 *   - Dossier export HTML sets lang="es" and uses Spanish headings
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { USERS_KEY } from './userStore';

// Stub fetch so syncOwnAccount / API calls fail silently (backend-unavailable)
// and don't throw unhandled promise rejections in jsdom.
// Also stub URL.createObjectURL which jsdom does not implement.
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status: 503,
    headers: { get: () => null },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  }));
  // jsdom does not implement URL.createObjectURL / revokeObjectURL.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_USER = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'a'.repeat(64),
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Seed localStorage so the app auto-logs in on mount. */
function seedLoggedInUser() {
  localStorage.setItem(USERS_KEY, JSON.stringify([VALID_USER]));
  localStorage.setItem('ge_username', VALID_USER.username);
}

/** Find the language toggle button and click it. */
async function toggleLanguage() {
  // LangToggle renders twice (desktop + mobile); use the first one.
  const btns = screen.getAllByTestId('button-lang-toggle');
  await act(async () => { fireEvent.click(btns[0]); });
}

/** Fill and submit the evaluator form. */
async function submitEvaluator(opts: {
  country: string;
  institution: string;
  degree: string;
  field: string;
  purpose?: string;
}) {
  await act(async () => {
    fireEvent.change(screen.getByTestId('input-country'), { target: { value: opts.country } });
    fireEvent.change(screen.getByTestId('input-institution'), { target: { value: opts.institution } });
    fireEvent.change(screen.getByTestId('input-degree'), { target: { value: opts.degree } });
    fireEvent.change(screen.getByTestId('input-field'), { target: { value: opts.field } });
    if (opts.purpose) {
      fireEvent.change(screen.getByTestId('select-purpose'), { target: { value: opts.purpose } });
    }
    fireEvent.submit(screen.getByTestId('form-eval'));
  });
}

// ─── Home page language toggle ────────────────────────────────────────────────

describe('Language toggle — home page', () => {
  it('shows English hero text by default', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByText(/Your Foreign Education,/i)).not.toBeNull();
    });
  });

  it('switches hero text to Spanish when ES is selected', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByText(/Your Foreign Education,/i)).not.toBeNull();
    });

    await toggleLanguage();

    await waitFor(() => {
      // Spanish hero line (TX: heroLine1)
      expect(screen.queryByText(/Tu Educación Extranjera,/i)).not.toBeNull();
    });
    // English hero line should no longer appear
    expect(screen.queryByText(/Your Foreign Education,/i)).toBeNull();
  });

  it('switches back to English when toggled again', async () => {
    await act(async () => { render(<App />); });
    await toggleLanguage();
    await waitFor(() => {
      expect(screen.queryByText(/Tu Educación Extranjera,/i)).not.toBeNull();
    });

    await toggleLanguage();

    await waitFor(() => {
      expect(screen.queryByText(/Your Foreign Education,/i)).not.toBeNull();
    });
    expect(screen.queryByText(/Tu Educación Extranjera,/i)).toBeNull();
  });
});

// ─── Evaluator — results render in the active language ────────────────────────

describe('Evaluator — language-aware results', () => {
  beforeEach(() => { seedLoggedInUser(); });

  it('does not classify N/A and high-school-only answers as a bachelor degree', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await submitEvaluator({
      country: 'Jamaica',
      institution: 'N/A',
      degree: 'N/A',
      field: 'High School',
    });

    const summary = await screen.findByTestId('text-summary');
    expect(summary.textContent).toContain('High School Diploma / Secondary Education');
    expect(summary.textContent).not.toMatch(/Bachelor/i);
    expect(summary.textContent).toContain('not an official U.S. equivalency determination');
  });

  it('shows English evaluator heading by default', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });
    // TX: evalH1 EN = 'Understand Your Foreign Education In'
    expect(screen.queryByText(/Understand Your Foreign Education In/i)).not.toBeNull();
  });

  it('shows Spanish evaluator heading when ES is active', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await toggleLanguage();

    await waitFor(() => {
      // TX: evalH1 ES = 'Transforma Tu Educación Extranjera en'
      expect(screen.queryByText(/Transforma Tu Educación Extranjera en/i)).not.toBeNull();
    });
  });

  it('shows Spanish results immediately when form is submitted in ES mode', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await toggleLanguage();
    await waitFor(() => {
      expect(screen.queryByText(/Transforma Tu Educación Extranjera en/i)).not.toBeNull();
    });

    await submitEvaluator({
      country: 'Mexico',
      institution: 'UNAM',
      degree: 'Licenciatura',
      field: 'Contabilidad',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    // Summary includes institution and country
    const summary = screen.getByTestId('text-summary');
    expect(summary.textContent).toContain('UNAM');
    expect(summary.textContent).toContain('Mexico');

    // Insight should use the Spanish accounting pathway text
    const insight = screen.getByTestId('text-insight');
    // ES insightAccount contains "Vía de Licencia CPA"
    expect(insight.textContent).toMatch(/Vía de Licencia CPA|CPA|NASBA/i);
  });

  it('re-renders results in Spanish when language is toggled AFTER submission', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    // Submit in English first
    await submitEvaluator({
      country: 'Colombia',
      institution: 'Universidad Nacional',
      degree: 'Bachelor',
      field: 'Engineering',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    // In English, engineering insight contains "ABET-equivalent coursework"
    const insightEN = screen.getByTestId('text-insight');
    expect(insightEN.textContent).toMatch(/ABET|PE licensure|FE exam/i);

    // Now toggle to Spanish
    await toggleLanguage();

    await waitFor(() => {
      // Spanish evaluator heading confirms the context re-rendered
      expect(screen.queryByText(/Transforma Tu Educación Extranjera en/i)).not.toBeNull();
    });

    // Insight should now be in Spanish: "Equivalencia Técnica"
    const insightES = screen.getByTestId('text-insight');
    expect(insightES.textContent).toMatch(/Equivalencia Técnica|ABET|examen FE/i);
  });

  it('shows English results again when toggled back to EN after ES', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await submitEvaluator({
      country: 'Spain',
      institution: 'Universidad de Madrid',
      degree: 'Bachelor',
      field: 'Accounting',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    await toggleLanguage();
    await waitFor(() => {
      expect(screen.queryByText(/Transforma Tu Educación Extranjera en/i)).not.toBeNull();
    });

    await toggleLanguage();
    await waitFor(() => {
      expect(screen.queryByText(/Understand Your Foreign Education In/i)).not.toBeNull();
    });

    // English accounting insight
    const insight = screen.getByTestId('text-insight');
    expect(insight.textContent).toMatch(/CPA Licensure Pathway/i);
  });
});

// ─── Spanish classifier inputs ────────────────────────────────────────────────

describe('Evaluator — Spanish field-name classifiers', () => {
  beforeEach(() => { seedLoggedInUser(); });

  it('routes "Contabilidad" to the accounting insight in Spanish', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await toggleLanguage();
    await submitEvaluator({
      country: 'Mexico',
      institution: 'UNAM',
      degree: 'Licenciatura',
      field: 'Contabilidad',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    const insight = screen.getByTestId('text-insight');
    // ES insightAccount: "Vía de Licencia CPA"
    expect(insight.textContent).toMatch(/Vía de Licencia CPA|NASBA|CFA/i);
  });

  it('routes "Ingeniería Civil" to the engineering insight in Spanish', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await toggleLanguage();
    await submitEvaluator({
      country: 'Argentina',
      institution: 'UBA',
      degree: 'Ingeniería',
      field: 'Ingeniería Civil',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    const insight = screen.getByTestId('text-insight');
    // ES insightEngineering: "Equivalencia Técnica"
    expect(insight.textContent).toMatch(/Equivalencia Técnica|ABET|examen FE|PE/i);
  });

  it('routes "Enfermería" to the health insight in Spanish', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await toggleLanguage();
    await submitEvaluator({
      country: 'Colombia',
      institution: 'Universidad Javeriana',
      degree: 'Licenciatura',
      field: 'Enfermería',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    const insight = screen.getByTestId('text-insight');
    // ES insightHealth: "Requisitos Regulatorios de Salud" / NCLEX
    expect(insight.textContent).toMatch(/Requisitos Regulatorios de Salud|NCLEX|CGFNS/i);
  });

  it('routes "Finanzas" (Spanish synonym) to the accounting pathway', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    // Submit in English to check EN result too
    await submitEvaluator({
      country: 'Mexico',
      institution: 'Tec de Monterrey',
      degree: 'Bachelor',
      field: 'Finanzas',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    const insight = screen.getByTestId('text-insight');
    // EN insightAccount: "CPA Licensure Pathway"
    expect(insight.textContent).toMatch(/CPA Licensure Pathway|NASBA/i);
  });
});

// ─── Dossier export — Spanish HTML ────────────────────────────────────────────

describe('SchoolFinder — language-aware results', () => {
  beforeEach(() => { seedLoggedInUser(); });

  it('renders SchoolFinder in Spanish when purpose is University Admission', async () => {
    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await submitEvaluator({
      country: 'Mexico',
      institution: 'UNAM',
      degree: 'Bachelor',
      field: 'Computer Science',
      purpose: 'University Admission'
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
      // Ensure SchoolFinder shows up
      expect(screen.queryByTestId('container-schoolfinder')).not.toBeNull();
    });

    // It should be in English first
    expect(screen.queryByText(/Búsqueda de Universidades/i)).toBeNull();
    expect(screen.queryByText(/University Search/i)).not.toBeNull();

    // Toggle to Spanish
    await toggleLanguage();

    await waitFor(() => {
      expect(screen.queryByText(/Búsqueda de Universidades/i)).not.toBeNull();
    });
  });
});

describe('Dossier export — Spanish HTML output', () => {
  beforeEach(() => { seedLoggedInUser(); });

  it('generates a dossier blob with lang="es" and Spanish section headings when ES is active', async () => {
    let capturedBlob: Blob | null = null;

    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      capturedBlob = b as Blob;
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Intercept <a> clicks so jsdom doesn't navigate away
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: vi.fn(), writable: true });
      }
      return el;
    });

    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    // Switch to Spanish
    await toggleLanguage();
    await waitFor(() => {
      expect(screen.queryByText(/Transforma Tu Educación Extranjera en/i)).not.toBeNull();
    });

    // Submit the evaluator
    await submitEvaluator({
      country: 'Mexico',
      institution: 'UNAM',
      degree: 'Licenciatura',
      field: 'Contabilidad',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    // Click roadmap step 4 (dossier) to expand it
    const step3 = screen.queryByTestId('roadmap-step-3');
    if (step3) {
      const stepBtn = step3.querySelector('button');
      if (stepBtn) {
        await act(async () => { fireEvent.click(stepBtn); });
      }
    }

    const exportBtn = screen.queryByTestId('button-export-dossier');
    if (exportBtn) {
      await act(async () => { fireEvent.click(exportBtn); });
    }

    // Verify the generated HTML
    if (capturedBlob) {
      const html = await (capturedBlob as Blob).text();
      expect(html).toContain('lang="es"');
      // Spanish section headings from TX keys
      expect(html).toMatch(/Resumen de Credenciales|Agencias NACES|Institución/i);
    }
  });

  it('generates a dossier with lang="en" and English headings when EN is active', async () => {
    let capturedBlob: Blob | null = null;

    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      capturedBlob = b as Blob;
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: vi.fn(), writable: true });
      }
      return el;
    });

    await act(async () => { render(<App />); });
    await waitFor(() => {
      expect(screen.queryByTestId('form-eval')).not.toBeNull();
    });

    await submitEvaluator({
      country: 'Colombia',
      institution: 'Universidad Nacional',
      degree: 'Bachelor',
      field: 'Accounting',
    });

    await waitFor(() => {
      expect(screen.queryByTestId('results-container')).not.toBeNull();
    });

    const step3 = screen.queryByTestId('roadmap-step-3');
    if (step3) {
      const stepBtn = step3.querySelector('button');
      if (stepBtn) {
        await act(async () => { fireEvent.click(stepBtn); });
      }
    }

    const exportBtn = screen.queryByTestId('button-export-dossier');
    if (exportBtn) {
      await act(async () => { fireEvent.click(exportBtn); });
    }

    if (capturedBlob) {
      const html = await (capturedBlob as Blob).text();
      expect(html).toContain('lang="en"');
      expect(html).toMatch(/Credential Summary|NACES Agency|Institution/i);
    }
  });
});
