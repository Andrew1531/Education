// Job-board helpers: pre-filled search URLs and field-aligned role suggestions.

// Build a pre-filled job-search URL on each board for a given query
export function jobSearchUrl(boardName: string, query: string, location?: string, remote?: boolean): string {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  switch (boardName) {
    case 'Indeed': {
      let url = `https://www.indeed.com/jobs?q=${q}`;
      if (loc) url += `&l=${loc}`;
      if (remote) url += `&sc=0kf:attr(DSQF7);`;
      return url;
    }
    case 'LinkedIn Jobs': {
      let url = `https://www.linkedin.com/jobs/search/?keywords=${q}`;
      if (loc) url += `&location=${loc}`;
      if (remote) url += `&f_WT=2`;
      return url;
    }
    case 'Glassdoor': {
      let fullQ = query;
      if (remote) fullQ += ' Remote';
      else if (location) fullQ += ` ${location}`;
      return `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(fullQ)}`;
    }
    case 'ZipRecruiter': {
      let url = `https://www.ziprecruiter.com/jobs-search?search=${q}`;
      if (loc) url += `&location=${loc}`;
      if (remote) url += `&refine_by_location_type=remote`;
      return url;
    }
    case 'USAJobs': {
      let url = `https://www.usajobs.gov/Search/Results?k=${q}`;
      if (loc) url += `&l=${loc}`;
      if (remote) url += `&rm=true`;
      return url;
    }
    case 'Monster': {
      let fullQ = query;
      if (remote) fullQ += ' Remote';
      else if (location) fullQ += ` ${location}`;
      return `https://www.monster.com/jobs/search?q=${encodeURIComponent(fullQ)}`;
    }
    default: return '';
  }
}

// Suggested U.S. job titles aligned with the user's field of study
export function getAlignedRoles(field: string): string[] {
  const f = field.toLowerCase();
  if (f.includes('account') || f.includes('finance') || f.includes('audit') ||
      f.includes('contab') || f.includes('finanz') || f.includes('auditor') || f.includes('contabilid')) {
    return ['Staff Accountant', 'Financial Analyst', 'Auditor', 'Tax Associate', 'Bookkeeper', 'Accounts Payable Specialist'];
  }
  if (f.includes('computer') || f.includes('software') || f.includes('information') || /\bit\b/.test(f) || f.includes('data science') || f.includes('cyber') ||
      f.includes('computac') || f.includes('informát') || f.includes('informat') || f.includes('sistem') || f.includes('datos') || f.includes('cibersegur')) {
    return ['Software Engineer', 'Web Developer', 'Data Analyst', 'QA Engineer', 'IT Support Specialist', 'DevOps Engineer'];
  }
  if (f.includes('engineer') || f.includes('ingeni')) {
    return [`${field} Engineer`, 'Project Engineer', 'Design Engineer', 'CAD Technician', 'Quality Engineer', 'Field Engineer'];
  }
  if (f.includes('nursing') || f.includes('health') || f.includes('medicine') || f.includes('medical') ||
      f.includes('enfermer') || f.includes('salud') || f.includes('medic') || f.includes('medicina')) {
    return ['Registered Nurse', 'Medical Assistant', 'Patient Care Technician', 'Clinical Research Coordinator', 'Health Services Coordinator', 'Medical Technologist'];
  }
  if (f.includes('business') || f.includes('management') || f.includes('admin') ||
      f.includes('negoci') || f.includes('administrac') || f.includes('gestión') || f.includes('gestion')) {
    return ['Business Analyst', 'Operations Coordinator', 'Project Coordinator', 'Account Manager', 'Office Manager', 'Management Trainee'];
  }
  if (f.includes('teach') || f.includes('educat') || f.includes('docen') || f.includes('pedagog') || f.includes('educaci')) {
    return ['Teacher', 'Teaching Assistant', 'Tutor', 'Instructional Aide', 'Education Coordinator', 'Curriculum Specialist'];
  }
  if (f.includes('law') || f.includes('legal') || f.includes('derecho') || f.includes('jurídic') || f.includes('juridic')) {
    return ['Paralegal', 'Legal Assistant', 'Compliance Analyst', 'Contract Administrator', 'Legal Researcher'];
  }
  return [`${field} Specialist`, `${field} Analyst`, `${field} Coordinator`, `${field} Assistant`, `Entry Level ${field}`];
}
