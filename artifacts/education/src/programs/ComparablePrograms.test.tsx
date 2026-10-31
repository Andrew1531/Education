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
