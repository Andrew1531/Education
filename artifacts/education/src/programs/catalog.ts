/**
 * Small, editorially checked directory, not a live nationwide search.
 * Levels and titles below come from the linked institutions' own catalogs.
 * Never use this dataset to certify a user's foreign qualification.
 */
import { programIdentity } from '@workspace/program-catalog';
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

const engineeringNote = {
  en: 'Confirm mathematics, physics and engineering prerequisites and international credential requirements with admissions. A same-level listing does not establish transfer credit or eligibility for a state professional engineer license.',
  es: 'Confirme con admisiones los prerrequisitos de matemáticas, física e ingeniería y los requisitos para credenciales internacionales. Un programa del mismo nivel no determina créditos transferibles ni elegibilidad para una licencia estatal de ingeniería profesional.',
};

function uaf(id: string, field: 'accounting' | 'business', level: 'certificate' | 'associate', title: string, slug: string): ProgramRecord {
  const url = `https://catalog.uaf.edu/${level === 'certificate' ? 'certificates' : 'associates'}/${slug}/`;
  return {
    id, institution: 'University of Alaska Fairbanks', location: 'Fairbanks, Alaska',
    field, level, title, url, sourceUrl: url, checkedAt,
    admissionsNote: {
      en: `This is an ${level === 'certificate' ? 'undergraduate certificate, not a graduate certificate or degree' : 'applied associate degree, not a bachelor’s degree'}. Ask admissions about international credentials, placement and transfer credit; further-degree admission and professional licensing are separate decisions.`,
      es: `Este programa es ${level === 'certificate' ? 'un certificado de pregrado, no un certificado de posgrado ni un grado académico' : 'un título asociado aplicado, no una licenciatura'}. Consulte con admisiones sobre credenciales internacionales, ubicación y créditos transferibles; la admisión a otros títulos y las licencias profesionales son decisiones aparte.`,
    },
  };
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
  uaf('uaf-accounting-cert', 'accounting', 'certificate', 'Applied Accounting — Undergraduate Certificate', 'accounting-applied'),
  uaf('uaf-business-cert', 'business', 'certificate', 'Applied Business — Undergraduate Certificate', 'business-applied'),
  uaf('uaf-accounting-aas', 'accounting', 'associate', 'Applied Accounting — A.A.S.', 'accounting-applied'),
  uaf('uaf-business-aas', 'business', 'associate', 'Applied Business — A.A.S.', 'business-applied'),
  {
    id: 'uafs-engineering-as', institution: 'University of Arkansas – Fort Smith',
    location: 'Fort Smith, Arkansas', field: 'engineering', level: 'associate',
    title: 'Engineering (Electrical) — Associate of Science',
    url: 'https://uafs.edu/programs/associates/engineering-electrical.php',
    sourceUrl: 'https://uafs.edu/programs/associates/engineering-electrical.php', checkedAt,
    admissionsNote: {
      en: 'This is the UAFS associate award with an electrical engineering concentration, not the partner university’s bachelor’s degree. Continuing to the University of Arkansas bachelor’s program requires separate admission. Confirm placement and transfer requirements; this award does not establish professional engineer licensure.',
      es: 'Es el título asociado de UAFS con concentración en ingeniería eléctrica, no la licenciatura de la universidad asociada. Continuar a la licenciatura de University of Arkansas requiere admisión separada. Confirme los requisitos de ubicación y transferencia; este título no determina una licencia de ingeniería profesional.',
    },
  },
  wichita('wsu-mechanical-bs', 'engineering', 'bachelor', 'BS in Mechanical Engineering',
    'undergraduate/engineering/mechanical-engineering/mechanical-engineering-bs', engineeringNote),
  wichita('wsu-mechanical-ms', 'engineering', 'master', 'MS in Mechanical Engineering',
    'graduate/engineering/mechanical-engineering/ms-in-mechanical-engineering', {
      en: 'The program requires a calculus-based engineering background and GPA requirements; applicants in mathematics, physics or chemistry may be considered conditionally with prerequisite coursework. Confirm English-language and reference requirements. This master’s is not a professional engineer license.',
      es: 'El programa exige formación en ingeniería basada en cálculo y requisitos de promedio; se pueden considerar condicionalmente solicitantes de matemáticas, física o química con cursos prerrequisito. Confirme los requisitos de inglés y referencias. Esta maestría no es una licencia de ingeniería profesional.',
    }),
  wichita('wsu-biology-bs', 'biology', 'bachelor', 'BS in Biological Sciences with Biological/Biomedical Emphasis',
    'undergraduate/fairmount-liberal-arts-sciences/biological-sciences/biological-sciences-bs-biological-biomedical-emphasis', {
      en: 'This is a biological sciences bachelor’s with a biological/biomedical emphasis, not a medical degree or clinical license. Confirm science prerequisites, transfer credit and international credential review with admissions.',
      es: 'Es una licenciatura en ciencias biológicas con énfasis biológico/biomédico, no un título de medicina ni una licencia clínica. Confirme con admisiones los prerrequisitos científicos, créditos transferibles y la revisión de credenciales internacionales.',
    }),
  wichita('wsu-biology-ms', 'biology', 'master', 'MS in Biological Sciences',
    'graduate/fairmount-liberal-arts-sciences/biological-sciences/biological-sciences-ms', {
      en: 'Admission requires a life-science-related bachelor’s, overall and biology GPA requirements, a statement of purpose and science-faculty references. Review English proficiency and thesis/nonthesis requirements. This is an academic biology master’s, not clinical licensing or medical-degree equivalency.',
      es: 'La admisión requiere una licenciatura afín a ciencias de la vida, requisitos de promedio general y de biología, una declaración de propósito y referencias de docentes de ciencias. Revise el dominio de inglés y las opciones con o sin tesis. Es una maestría académica en biología, no una habilitación clínica ni equivalencia de un título médico.',
    }),
  {
    id: 'iu-dentistry-msd', institution: 'Indiana University Indianapolis',
    location: 'Indianapolis, Indiana', field: 'dentistry', level: 'master',
    title: 'Master of Science in Dentistry (M.S.D.)',
    url: 'https://dentistry.iu.edu/academics/degrees-programs/ms-dentistry/index.html',
    sourceUrl: 'https://dentistry.iu.edu/academics/degrees-programs/ms-dentistry/index.html', checkedAt,
    admissionsNote: {
      en: 'This is an actual master’s plus clinical certificate, not a DDS/DMD or a stand-alone specialty certificate. Admission requires a DDS/DMD from an accredited U.S./Canadian school or international dental education the school accepts as equivalent, GPA and English proficiency requirements, plus major-specific review. A specialty title alone does not establish a master’s equivalency. This listing does not establish eligibility for U.S. dental licensure.',
      es: 'Es una maestría real junto con un certificado clínico, no un DDS/DMD ni un certificado de especialidad independiente. La admisión exige un DDS/DMD de una escuela acreditada de EE. UU./Canadá o formación dental internacional que la escuela acepte como equivalente, requisitos de promedio e inglés y revisión por especialidad. Un título de especialidad por sí solo no determina equivalencia a una maestría. Esta lista no determina elegibilidad para una licencia odontológica en EE. UU.',
    },
  },
];

// A newly added listing must explicitly opt into official-source outreach.
for (const program of PROGRAMS) {
  if (programIdentity(program.id)?.institution !== program.institution) {
    throw new Error(`Missing official program identity: ${program.id}`);
  }
}
