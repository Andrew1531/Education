const fs = require('fs');
let code = fs.readFileSync('artifacts/education/src/jobRoles.test.ts', 'utf8');

const newTest = `
describe('jobSearchUrl', () => {
  it('builds a pre-filtered Indeed search with an encoded query', () => {
    expect(jobSearchUrl('Indeed', 'Staff Accountant')).toBe('https://www.indeed.com/jobs?q=Staff%20Accountant');
  });

  it('builds URLs for every known board', () => {
    for (const board of ['Indeed', 'LinkedIn Jobs', 'Glassdoor', 'ZipRecruiter', 'USAJobs', 'Monster']) {
      const url = jobSearchUrl(board, 'Nurse');
      expect(url).toMatch(/^https:\\/\\//);
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
`;

code = code.replace(/describe\('jobSearchUrl', \(\) => \{[\s\S]*\}\);/, newTest);
fs.writeFileSync('artifacts/education/src/jobRoles.test.ts', code);
