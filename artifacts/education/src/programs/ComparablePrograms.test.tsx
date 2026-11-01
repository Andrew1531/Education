// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ComparablePrograms } from './ComparablePrograms';
import { PROGRAMS, FIELDS } from './catalog';

afterEach(cleanup);

const first = PROGRAMS[0];
const profile = { degree: 'Licenciatura', field: 'Something unusual', country: 'Mexico', institution: 'UNAM', purpose: 'University Admission' };

function pick(level: string, field: string) {
  fireEvent.change(screen.getByTestId('select-cp-level'), { target: { value: level } });
  fireEvent.change(screen.getByTestId('select-cp-field'), { target: { value: field } });
}

describe('ComparablePrograms', () => {
  it.each([false, true])('requires certificate type and explains uncertainty in both languages (es=%s)', es => {
    render(<ComparablePrograms profile={{ ...profile, degree: 'Graduate Certificate / Certificado de posgrado' }} es={es} />);
    pick('certificate', 'accounting');
    const type = screen.getByLabelText(es ? 'Tipo de certificado' : 'Certificate type') as HTMLSelectElement;
    const search = screen.getByTestId('button-cp-search') as HTMLButtonElement;
    expect(type.value).toBe('');
    expect(search.disabled).toBe(true);
    expect(type.textContent).toContain(es ? 'Certificado de pregrado' : 'Undergraduate certificate');
    expect(type.textContent).toContain(es ? 'Certificado de posgrado' : 'Graduate certificate');
    fireEvent.change(type, { target: { value: 'uncertain' } });
    expect(search.disabled).toBe(true);
    expect(screen.getByTestId('text-cp-uncertain-certificate').textContent)
      .toContain(es ? 'No inferimos' : 'We will not infer');
    fireEvent.submit(screen.getByTestId('form-comparable-programs'));
    expect(screen.queryByTestId('list-cp-results')).toBeNull();

    fireEvent.change(type, { target: { value: 'undergraduate' } });
    expect(search.disabled).toBe(false);
    fireEvent.click(search);
    expect(screen.getByTestId('text-cp-reason-uaf-accounting-cert').textContent)
      .toContain(es ? 'Certificado de pregrado' : 'Undergraduate certificate');
    fireEvent.change(type, { target: { value: 'graduate' } });
    expect(screen.queryByTestId('list-cp-results')).toBeNull();
    fireEvent.click(search);
    expect(screen.getByTestId('text-cp-empty').textContent)
      .toContain(es ? 'certificado de posgrado' : 'graduate certificate');
    fireEvent.change(type, { target: { value: 'uncertain' } });
    expect(screen.queryByTestId('text-cp-empty')).toBeNull();
    expect(search.disabled).toBe(true);
  });

  it('resets certificate type on level and profile changes', () => {
    const { rerender } = render(<ComparablePrograms profile={profile} es={false} />);
    pick('certificate', 'accounting');
    fireEvent.change(screen.getByTestId('select-cp-certificate-type'), { target: { value: 'undergraduate' } });
    fireEvent.click(screen.getByTestId('button-cp-search'));
    fireEvent.change(screen.getByTestId('select-cp-level'), { target: { value: 'bachelor' } });
    expect(screen.queryByTestId('select-cp-certificate-type')).toBeNull();
    expect(screen.queryByTestId('list-cp-results')).toBeNull();
    pick('certificate', 'accounting');
    expect((screen.getByTestId('select-cp-certificate-type') as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByTestId('select-cp-certificate-type'), { target: { value: 'undergraduate' } });
    fireEvent.click(screen.getByTestId('button-cp-search'));
    rerender(<ComparablePrograms profile={{ ...profile, degree: 'Another certificate' }} es={false} />);
    expect(screen.queryByTestId('list-cp-results')).toBeNull();
    pick('certificate', 'accounting');
    expect((screen.getByTestId('select-cp-certificate-type') as HTMLSelectElement).value).toBe('');
  });

  it.each([
    ['certificate', 'accounting', 'uaf-accounting-cert', false],
    ['associate', 'engineering', 'uafs-engineering-as', false],
    ['bachelor', 'biology', 'wsu-biology-bs', false],
    ['master', 'engineering', 'wsu-mechanical-ms', false],
    ['master', 'dentistry', 'iu-dentistry-msd', true],
  ])('renders sourced %s %s results and the admissions caveat', (level, field, id, es) => {
    render(<ComparablePrograms profile={profile} es={es} />);
    pick(level as string, field as string);
    if (level === 'certificate') {
      fireEvent.change(screen.getByTestId('select-cp-certificate-type'), { target: { value: 'undergraduate' } });
    }
    fireEvent.click(screen.getByTestId('button-cp-search'));
    const p = PROGRAMS.find(p => p.id === id)!;
    const card = screen.getByTestId(`card-cp-program-${id}`);
    expect(card.textContent).toContain(p.title);
    expect(card.textContent).toContain(p.admissionsNote[es ? 'es' : 'en']);
    expect(screen.getByTestId(`link-cp-source-${id}`).getAttribute('href')).toBe(p.sourceUrl);
  });

  it('requires explicit level; does not prefill field from non-exact text', () => {
    render(<ComparablePrograms profile={profile} es={false} />);
    expect((screen.getByTestId('select-cp-level') as HTMLSelectElement).value).toBe('');
    expect((screen.getByTestId('select-cp-field') as HTMLSelectElement).value).toBe('');
    expect((screen.getByTestId('button-cp-search') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('text-cp-level-warning')).toBeTruthy();
  });

  it('prefills exact field name', () => {
    render(<ComparablePrograms profile={{ ...profile, field: FIELDS[first.field].es }} es />);
    expect((screen.getByTestId('select-cp-field') as HTMLSelectElement).value).toBe(first.field);
  });

  it('shows same-level same-field results with source links', () => {
    render(<ComparablePrograms profile={profile} es={false} />);
    pick(first.level, first.field);
    fireEvent.click(screen.getByTestId('button-cp-search'));
    expect(screen.getByTestId(`card-cp-program-${first.id}`)).toBeTruthy();
    expect(screen.getByTestId(`link-cp-source-${first.id}`).getAttribute('href')).toBe(first.sourceUrl);
    expect(screen.getByTestId(`text-cp-reason-${first.id}`).textContent).toMatch(/Same level/);
  });

  it('unknown level blocks search', () => {
    render(<ComparablePrograms profile={profile} es />);
    pick('unknown', first.field);
    expect(screen.getByTestId('text-cp-unknown-level')).toBeTruthy();
    expect((screen.getByTestId('button-cp-search') as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears results on profile change', () => {
    const { rerender } = render(<ComparablePrograms profile={profile} es={false} />);
    pick(first.level, first.field);
    fireEvent.click(screen.getByTestId('button-cp-search'));
    expect(screen.queryByTestId('list-cp-results')).not.toBeNull();
    rerender(<ComparablePrograms profile={{ ...profile, degree: 'Maestría' }} es={false} />);
    expect(screen.queryByTestId('list-cp-results')).toBeNull();
    expect((screen.getByTestId('select-cp-level') as HTMLSelectElement).value).toBe('');
  });

  it('clears results when level changes', () => {
    render(<ComparablePrograms profile={profile} es={false} />);
    pick(first.level, first.field);
    fireEvent.click(screen.getByTestId('button-cp-search'));
    fireEvent.change(screen.getByTestId('select-cp-level'), { target: { value: 'unknown' } });
    expect(screen.queryByTestId('list-cp-results')).toBeNull();
  });
});
