/**
 * Small, editorially checked directory, not a live nationwide search.
 * Levels and titles below come from the linked institutions' own catalogs.
 * Never use this dataset to certify a user's foreign qualification.
 */
export type ProgramLevel = 'certificate' | 'associate' | 'bachelor' | 'master';
export type ProgramField = 'computer_science' | 'business' | 'accounting' | 'psychology' |
  'nursing' | 'education' | 'engineering' | 'biology' | 'arts' | 'law' | 'dentistry' | 'other';

export interface ProgramRecord {
  id: string;
  institution: string;
  location: string;
  field: ProgramField;
  level: ProgramLevel;
  title: string;
  url: string;
  sourceUrl: string;
  checkedAt: string;
  admissionsNote: { en: string; es: string };
}

export const FIELDS: Record<ProgramField, { en: string; es: string }> = {
  computer_science: { en: 'Computer science', es: 'Ciencias de la computación' },
  business: { en: 'Business administration', es: 'Administración de empresas' },
  accounting: { en: 'Accounting', es: 'Contabilidad' },
  psychology: { en: 'Psychology', es: 'Psicología' },
  nursing: { en: 'Nursing', es: 'Enfermería' },
  education: { en: 'Education / teaching', es: 'Educación / docencia' },
  engineering: { en: 'Engineering', es: 'Ingeniería' },
  biology: { en: 'Biology', es: 'Biología' },
  arts: { en: 'Visual arts', es: 'Artes visuales' },
  law: { en: 'Law', es: 'Derecho' },
  dentistry: { en: 'Dentistry', es: 'Odontología' },
  other: { en: 'Another field / not sure', es: 'Otra área / no estoy seguro' },
};

const checkedAt = '2026-10-31';
const general = {
  en: 'Ask admissions how they assess your original qualification, whether an evaluation is required, and whether a second qualification at this level is appropriate. Admission and transfer credit are not established by this match.',
  es: 'Consulte con admisiones cómo evalúan su título original, si requieren una evaluación y si corresponde cursar otro título de este nivel. Esta coincidencia no determina admisión ni transferencia de créditos.',
};

function umgc(id: string, field: ProgramField, level: 'bachelor' | 'master', title: string, slug: string, note = general): ProgramRecord {
  const section = level === 'bachelor' ? 'bachelors' : 'masters';
  return {
    id, institution: 'University of Maryland Global Campus', location: 'Maryland',
    field, level, title, url: `https://www.umgc.edu/online-degrees/${section}/${slug}`,
    sourceUrl: `https://www.umgc.edu/online-degrees/${section}`, checkedAt, admissionsNote: note,
  };
}

function wichita(id: string, field: ProgramField, level: 'bachelor' | 'master', title: string, path: string, note = general): ProgramRecord {
  const url = `https://catalog.wichita.edu/${path}/`;
  return { id, institution: 'Wichita State University', location: 'Wichita, Kansas', field,
    level, title, url, sourceUrl: url, checkedAt, admissionsNote: note };
}

export const PROGRAMS: readonly ProgramRecord[] = [
  umgc('umgc-cs-bs', 'computer_science', 'bachelor', 'Computer Science — Bachelor’s', 'computer-science'),
  umgc('umgc-business-bs', 'business', 'bachelor', 'Business Administration & Management — Bachelor’s', 'business-administration-management'),
  umgc('umgc-accounting-bs', 'accounting', 'bachelor', 'Accounting — Bachelor’s', 'accounting'),
  umgc('umgc-psychology-bs', 'psychology', 'bachelor', 'Psychology — Bachelor’s', 'psychology'),
  umgc('umgc-nursing-bsn', 'nursing', 'bachelor', 'Nursing — RN to BSN', 'nursing-rn-bsn', {
    en: 'This is an RN-to-BSN completion program, not initial nursing licensure. Review the program’s nursing qualification and license requirements with admissions before applying.',
    es: 'Este programa RN-to-BSN es de culminación de estudios, no de habilitación inicial en enfermería. Consulte con admisiones los requisitos de formación y licencia antes de solicitar ingreso.',
  }),
  umgc('umgc-business-mba', 'business', 'master', 'Business Administration — MBA', 'mba-business-administration'),
  umgc('umgc-accounting-ms', 'accounting', 'master', 'Accounting & Financial Management — Master’s', 'accounting-financial-management'),
  umgc('umgc-education-mat', 'education', 'master', 'Teaching — Master of Arts in Teaching', 'mat-teaching', {
    en: 'Teaching is regulated by state. Review this program’s subject, placement, admission, and certification requirements; this listing does not establish teaching-license eligibility.',
    es: 'La docencia está regulada por cada estado. Revise los requisitos de área, prácticas, admisión y certificación del programa; esta lista no determina elegibilidad para una licencia docente.',
  }),
  wichita('wsu-cs-bs', 'computer_science', 'bachelor', 'BS in Computer Science', 'undergraduate/engineering/school-computing/bs-computer-science'),
  wichita('wsu-cs-ms', 'computer_science', 'master', 'MS in Computer Science', 'graduate/engineering/school-computing/ms-computer-science', {
    en: 'The catalog lists a four-year bachelor’s in computer science or a related area, a minimum GPA, and additional international-applicant requirements. Confirm the current requirements with the program; holding a master’s alone does not establish admission.',
    es: 'El catálogo indica una licenciatura de cuatro años en computación o un área afín, un promedio mínimo y requisitos adicionales para solicitantes internacionales. Confirme los requisitos vigentes; tener una maestría no garantiza admisión.',
  }),
  wichita('wsu-business-bba', 'business', 'bachelor', 'Bachelor of Business Administration', 'undergraduate/w-frank-barton-business/bachelor-of-business-administration'),
  wichita('wsu-business-mba', 'business', 'master', 'Master of Business Administration — MBA', 'graduate/w-frank-barton-business/master-business-administration/master-business-administration-mba'),
  wichita('wsu-psychology-ba', 'psychology', 'bachelor', 'BA in Psychology', 'undergraduate/fairmount-liberal-arts-sciences/psychology/psychology-ba'),
];
