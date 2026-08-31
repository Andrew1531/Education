import { describe, expect, it } from 'vitest';
import { classifyEducationLevel } from './educationLevel';

describe('classifyEducationLevel', () => {
  it('does not promote N/A answers to a bachelor degree', () => {
    expect(classifyEducationLevel({ degree: 'N/A' })).toBe('unknown');
    expect(classifyEducationLevel({ degree: 'NA' })).toBe('unknown');
    expect(classifyEducationLevel({ degree: 'Not applicable' })).toBe('unknown');
  });

  it('classifies a high-school-only history as secondary education', () => {
    expect(classifyEducationLevel({
      degree: 'N/A',
      institution: 'Central High School',
      field: 'High School',
    })).toBe('secondary');

    expect(classifyEducationLevel({
      degree: 'High School Diploma',
      institution: 'Colegio Nacional',
    })).toBe('secondary');
  });

  it('recognizes explicit postsecondary degree wording', () => {
    expect(classifyEducationLevel({ degree: 'Lic.' })).toBe('bachelor');
    expect(classifyEducationLevel({ degree: 'B.Sc.' })).toBe('bachelor');
    expect(classifyEducationLevel({ degree: 'MBA' })).toBe('master');
    expect(classifyEducationLevel({ degree: 'Ph.D.' })).toBe('doctor');
    expect(classifyEducationLevel({ degree: 'HND' })).toBe('associate');
  });

  it('keeps an unrecognized credential unknown instead of guessing', () => {
    expect(classifyEducationLevel({ degree: 'School leaving award' })).toBe('unknown');
  });
});