import { PROGRAMS } from './catalog.ts';
import type { Opportunity } from '../api';
import { validAccountEmail } from './accountEmailIdentity.ts';
export { validAccountEmail } from './accountEmailIdentity.ts';

export interface CorrespondenceProfile {
  country?: string; institution?: string; degree?: string; field?: string; purpose?: string;
}
export interface AccountEmailDraft {
  id: string;
  institution: string;
  programs: string[];
  recipient: string | null;
  sourceUrl: string;
  checkedAt: string | null;
  subject: string;
  body: string;
}

// Manually reviewed public admissions addresses, not inferred from school names.
// No personal staff addresses. A missing entry is not permission to guess one.
export const ADMISSIONS_CONTACTS = {
  // Official "Contact undergraduate admissions" page: Office of Admissions contact.
  wichitaUndergraduate: {
    recipient: 'admissions@wichita.edu',
    sourceUrl: 'https://www.wichita.edu/profiles/admissions/undergraduate_admissions/index.php',
    checkedAt: '2026-11-03',
  },
  // Graduate School FAQ: general mailbox routes questions, including admissions.
  wichitaGraduate: {
    recipient: 'wsugradschool@wichita.edu',
    sourceUrl: 'https://www.wichita.edu/academics/graduate_school/faq.php',
    checkedAt: '2026-11-03',
  },
  // Admissions counselors publish this shared mailbox; graduate inquiries are separate.
  alaskaUndergraduate: {
    recipient: 'uaf-admissions@alaska.edu',
    sourceUrl: 'https://www.uaf.edu/admissions/counselors/',
    checkedAt: '2026-11-03',
  },
  // "Interested in Graduate Programs?" explicitly directs graduate admissions here,
  // including international graduate applicants.
  alaskaGraduate: {
    recipient: 'uaf-grad-admissions@alaska.edu',
    sourceUrl: 'https://www.uaf.edu/admissions/counselors/',
    checkedAt: '2026-11-03',
  },
  // Admissions page Contact section: assistance mailbox alongside applicant pathways.
  fortSmith: {
    recipient: 'admissions@uafs.edu',
    sourceUrl: 'https://uafs.edu/admissions/',
    checkedAt: '2026-11-03',
  },
  // Published as Admissions Services (not the separate current-student
  // undergraduate/graduate advising mailboxes). Serves both admission levels.
  umgcAdmissions: {
    recipient: 'studentsfirst@umgc.edu',
    sourceUrl: 'https://www.umgc.edu/contact/a-to-z-directory',
    checkedAt: '2026-11-01',
  },
  // Office of Graduate Education on the M.S.D. page; not university-wide.
  indianaDentistryGraduate: {
    recipient: 'dsgrad@iu.edu',
    sourceUrl: 'https://dentistry.iu.edu/academics/degrees-programs/ms-dentistry/index.html',
    checkedAt: '2026-11-03',
  },
} as const;

export function accountEmailDrafts(items: Opportunity[], profile: CorrespondenceProfile, es: boolean): AccountEmailDraft[] {
  const grouped = new Map<string, AccountEmailDraft>();
  for (const item of items.filter(i => i.kind === 'school')) {
    const program = PROGRAMS.find(p => p.id === item.id);
    if (!program) continue; // Preserve legacy saves, but never trust their URLs or recipients.
    const graduate = program.level === 'master' || (program.level === 'certificate' && program.certificateType === 'graduate');
    const contact = program.institution === 'Wichita State University'
      ? graduate ? ADMISSIONS_CONTACTS.wichitaGraduate : ADMISSIONS_CONTACTS.wichitaUndergraduate
      : program.institution === 'University of Alaska Fairbanks'
        ? graduate ? ADMISSIONS_CONTACTS.alaskaGraduate : ADMISSIONS_CONTACTS.alaskaUndergraduate
        : program.institution === 'University of Arkansas – Fort Smith' && !graduate ? ADMISSIONS_CONTACTS.fortSmith
          : program.institution === 'University of Maryland Global Campus' ? ADMISSIONS_CONTACTS.umgcAdmissions
            : program.institution === 'Indiana University Indianapolis' && program.id === 'iu-dentistry-msd' && graduate
              ? ADMISSIONS_CONTACTS.indianaDentistryGraduate : null;
    // Even a shared admissions mailbox must not combine graduate and undergraduate inquiries.
    const id = `${program.institution}:${graduate ? 'graduate' : 'undergraduate'}:${contact?.recipient || 'contact-page'}`;
    const existing = grouped.get(id);
    if (existing) { if (!existing.programs.includes(program.title)) existing.programs.push(program.title); continue; }
    const sourceUrl = contact?.sourceUrl || (program.institution === 'University of Maryland Global Campus'
      ? 'https://www.umgc.edu/admission/request-information' : program.sourceUrl);
    grouped.set(id, {
      id, institution: program.institution, programs: [program.title],
      recipient: contact?.recipient || null, sourceUrl, checkedAt: contact?.checkedAt || null,
      subject: es ? `Consulta de admisión — ${program.institution}` : `Admission inquiry — ${program.institution}`,
      body: '',
    });
  }
  const L = (en: string, sp: string) => es ? sp : en;
  const clean = (value?: string) => (value || '').slice(0, 300).replace(/[\r\n]+/g, ' ').trim() || L('Not provided', 'No indicado');
  for (const draft of grouped.values()) {
    draft.body = [
      L('Hello Admissions Team,', 'Estimado equipo de admisiones:'),
      '',
      L(`I would like to ask about admission to these programs at ${draft.institution}:`, `Me gustaría consultar sobre la admisión a estos programas de ${draft.institution}:`),
      ...draft.programs.map(p => `- ${p}`),
      '',
      L('My self-reported education:', 'Mi formación académica declarada:'),
      `${L('Original award name', 'Nombre original del título')}: ${clean(profile.degree)}`,
      `${L('Institution', 'Institución')}: ${clean(profile.institution)}`,
      `${L('Country of education', 'País de educación')}: ${clean(profile.country)}`,
      `${L('Field', 'Área')}: ${clean(profile.field)}`,
      '',
      L('These details are self-reported, not an official U.S. equivalency, accreditation finding, or verification of my documents.',
        'Estos datos son declarados por mí; no constituyen una equivalencia oficial de EE. UU., una determinación de acreditación ni una verificación de mis documentos.'),
      L('Could you explain your prerequisites, required transcripts/translations, and whether you require an evaluation from a particular credential-evaluation service?',
        '¿Podrían indicar los prerrequisitos, los expedientes y traducciones requeridos y si exigen una evaluación de un servicio de evaluación de credenciales específico?'),
      '',
      L('Please reply directly to the email address I am sending this message from. Thank you.',
        'Por favor, respondan directamente a la dirección de correo desde la que envío este mensaje. Gracias.'),
    ].join('\n');
  }
  return [...grouped.values()];
}

export function emailComposeUrl(provider: 'gmail' | 'outlook', email: string, draft: AccountEmailDraft): string | null {
  if (!validAccountEmail(email) || !draft.recipient) return null;
  const url = new URL(provider === 'gmail' ? 'https://mail.google.com/mail/u/' : 'https://outlook.live.com/mail/0/deeplink/compose');
  if (provider === 'gmail') {
    url.searchParams.set('authuser', email);
    url.searchParams.set('view', 'cm');
    url.searchParams.set('fs', '1');
    url.searchParams.set('su', draft.subject);
  } else {
    url.searchParams.set('subject', draft.subject);
  }
  url.searchParams.set('to', draft.recipient);
  url.searchParams.set('body', draft.body);
  return url.toString();
}
