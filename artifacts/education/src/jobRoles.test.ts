import { describe, it, expect } from 'vitest';
import { getAlignedRoles, jobSearchUrl } from './jobRoles';

const ACCOUNTING = ['Staff Accountant', 'Financial Analyst', 'Auditor', 'Tax Associate', 'Bookkeeper', 'Accounts Payable Specialist'];
const IT = ['Software Engineer', 'Web Developer', 'Data Analyst', 'QA Engineer', 'IT Support Specialist', 'DevOps Engineer'];
const HEALTH = ['Registered Nurse', 'Medical Assistant', 'Patient Care Technician', 'Clinical Research Coordinator', 'Health Services Coordinator', 'Medical Technologist'];
const BUSINESS = ['Business Analyst', 'Operations Coordinator', 'Project Coordinator', 'Account Manager', 'Office Manager', 'Management Trainee'];
const EDUCATION = ['Teacher', 'Teaching Assistant', 'Tutor', 'Instructional Aide', 'Education Coordinator', 'Curriculum Specialist'];
const LAW = ['Paralegal', 'Legal Assistant', 'Compliance Analyst', 'Contract Administrator', 'Legal Researcher'];

const genericFallback = (field: string) => [
  `${field} Specialist`,
  `${field} Analyst`,
  `${field} Coordinator`,
  `${field} Assistant`,
  `Entry Level ${field}`,
];

describe('getAlignedRoles field routing', () => {
  it('routes Accounting to accounting roles', () => {
    expect(getAlignedRoles('Accounting')).toEqual(ACCOUNTING);
  });

  it('routes Computer Science to IT roles', () => {
    expect(getAlignedRoles('Computer Science')).toEqual(IT);
  });

  it('routes "IT" (as a standalone word) to IT roles', () => {
    expect(getAlignedRoles('IT')).toEqual(IT);
    expect(getAlignedRoles('IT Management')).toEqual(IT);
  });

  it('does NOT route Architecture to IT roles ("it" substring bug)', () => {
    const roles = getAlignedRoles('Architecture');
    expect(roles).not.toEqual(IT);
    expect(roles).toEqual(genericFallback('Architecture'));
  });

  it('routes Hospitality to the generic fallback, not IT', () => {
    const roles = getAlignedRoles('Hospitality');
    expect(roles).not.toEqual(IT);
    expect(roles).toEqual(genericFallback('Hospitality'));
  });

  it('routes Political Science to the generic fallback, not IT', () => {
    const roles = getAlignedRoles('Political Science');
    expect(roles).not.toEqual(IT);
    expect(roles).toEqual(genericFallback('Political Science'));
  });

  it('routes Nursing to healthcare roles', () => {
    expect(getAlignedRoles('Nursing')).toEqual(HEALTH);
  });

  it('routes Civil Engineering to engineering roles', () => {
    const roles = getAlignedRoles('Civil Engineering');
    expect(roles).toEqual([
      'Civil Engineering Engineer',
      'Project Engineer',
      'Design Engineer',
      'CAD Technician',
      'Quality Engineer',
      'Field Engineer',
    ]);
  });

  it('routes Business to business roles', () => {
    expect(getAlignedRoles('Business')).toEqual(BUSINESS);
    expect(getAlignedRoles('Business Administration')).toEqual(BUSINESS);
  });

  it('routes Education to education roles', () => {
    expect(getAlignedRoles('Education')).toEqual(EDUCATION);
  });

  it('routes Law to legal roles', () => {
    expect(getAlignedRoles('Law')).toEqual(LAW);
  });

  it('returns the generic fallback for an unknown field', () => {
    expect(getAlignedRoles('Basket Weaving')).toEqual(genericFallback('Basket Weaving'));
  });

  it('is case-insensitive', () => {
    expect(getAlignedRoles('accounting')).toEqual(ACCOUNTING);
    expect(getAlignedRoles('NURSING')).toEqual(HEALTH);
  });

  it('routes Spanish-language fields correctly', () => {
    expect(getAlignedRoles('Contabilidad')).toEqual(ACCOUNTING);
    expect(getAlignedRoles('Enfermería')).toEqual(HEALTH);
    expect(getAlignedRoles('Derecho')).toEqual(LAW);
  });
});


describe('jobSearchUrl', () => {
  it('builds a pre-filtered Indeed search with an encoded query', () => {
    expect(jobSearchUrl('Indeed', 'Staff Accountant')).toBe('https://www.indeed.com/jobs?q=Staff%20Accountant');
  });

  it('builds URLs for every known board', () => {
    for (const board of ['Indeed', 'LinkedIn Jobs', 'Glassdoor', 'ZipRecruiter', 'USAJobs', 'Monster']) {
      const url = jobSearchUrl(board, 'Nurse');
      expect(url).toMatch(/^https:\/\//);
      expect(url).toContain('Nurse');
    }
  });
  
  it('appends location and remote when provided', () => {
    const urlIndeed = jobSearchUrl('Indeed', 'Nurse', 'New York', true);
    expect(urlIndeed).toContain('l=New%20York');
    expect(urlIndeed).toContain('sc=0kf:attr(DSQF7);');
    
    const urlLinkedIn = jobSearchUrl('LinkedIn Jobs', 'Nurse', 'Texas', true);
    expect(urlLinkedIn).toContain('location=Texas');
    expect(urlLinkedIn).toContain('f_WT=2');
  });

  it('returns empty string for an unknown board', () => {
    expect(jobSearchUrl('Unknown Board', 'Nurse')).toBe('');
  });
});

