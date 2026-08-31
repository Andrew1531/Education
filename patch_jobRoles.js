const fs = require('fs');
let code = fs.readFileSync('artifacts/education/src/jobRoles.ts', 'utf8');

const newJobSearchUrl = `export function jobSearchUrl(boardName: string, query: string, location?: string, remote?: boolean): string {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  switch (boardName) {
    case 'Indeed': {
      let url = \`https://www.indeed.com/jobs?q=\${q}\`;
      if (loc) url += \`&l=\${loc}\`;
      if (remote) url += \`&sc=0kf:attr(DSQF7);\`;
      return url;
    }
    case 'LinkedIn Jobs': {
      let url = \`https://www.linkedin.com/jobs/search/?keywords=\${q}\`;
      if (loc) url += \`&location=\${loc}\`;
      if (remote) url += \`&f_WT=2\`;
      return url;
    }
    case 'Glassdoor': {
      let fullQ = query;
      if (remote) fullQ += ' Remote';
      else if (location) fullQ += \` \${location}\`;
      return \`https://www.glassdoor.com/Job/jobs.htm?sc.keyword=\${encodeURIComponent(fullQ)}\`;
    }
    case 'ZipRecruiter': {
      let url = \`https://www.ziprecruiter.com/jobs-search?search=\${q}\`;
      if (loc) url += \`&location=\${loc}\`;
      if (remote) url += \`&refine_by_location_type=remote\`;
      return url;
    }
    case 'USAJobs': {
      let url = \`https://www.usajobs.gov/Search/Results?k=\${q}\`;
      if (loc) url += \`&l=\${loc}\`;
      if (remote) url += \`&rm=true\`;
      return url;
    }
    case 'Monster': {
      let fullQ = query;
      if (remote) fullQ += ' Remote';
      else if (location) fullQ += \` \${location}\`;
      return \`https://www.monster.com/jobs/search?q=\${encodeURIComponent(fullQ)}\`;
    }
    default: return '';
  }
}`;

code = code.replace(/export function jobSearchUrl[\s\S]*?\}\n/, newJobSearchUrl + "\n");
fs.writeFileSync('artifacts/education/src/jobRoles.ts', code);
