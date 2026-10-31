import type { EvalProfile } from './api';
import type { Qualification as ApiQualification } from '@workspace/api-client-react';
export type Qualification = ApiQualification;
export type GuidanceLang = 'en' | 'es';

/** An explicit empty array is a deletion, not an invitation to restore legacy data. */
export function normalizeQualifications(profile: EvalProfile): Qualification[] {
  if (Array.isArray(profile.qualifications)) return profile.qualifications;
  if (!profile.degree && !profile.institution && !profile.field) return [];
  return [{
    id: 'legacy-qualification', awardName: profile.degree || '',
    institution: profile.institution || '', country: profile.country || '',
    field: profile.field || '', duration: profile.credits || '', completion: 'unknown',
    awardType: 'unknown', evidenceStatus: 'not_checked',
  }];
}

export function qualificationLabels(lang: GuidanceLang): Record<string, string> {
  return lang === 'es' ? {
    awardName: 'Nombre original del título', institution: 'Institución', country: 'País de educación',
    field: 'Área de estudio', duration: 'Duración / créditos originales', completion: 'Estado de finalización',
    awardType: 'Tipo de título declarado', evidenceStatus: 'Evidencia institucional', unknown: 'Desconocido',
    completed: 'Finalizado / título obtenido', in_progress: 'En curso', not_completed: 'No finalizado',
    academic: 'Académico', professional: 'Profesional',
    not_checked: 'No comprobada', corroborated: 'País y tipo institucional corroborados — no es acreditación',
    not_found: 'No encontrada en las fuentes consultadas', ambiguous: 'Coincidencia sin resolver',
    unavailable: 'Fuentes no disponibles',
  } : {
    awardName: 'Original award name', institution: 'Institution', country: 'Country of education',
    field: 'Field of study', duration: 'Study duration / original credits', completion: 'Completion status',
    awardType: 'Self-reported award type', evidenceStatus: 'Institution evidence', unknown: 'Unknown',
    completed: 'Completed / award earned', in_progress: 'In progress', not_completed: 'Not completed',
    academic: 'Academic', professional: 'Professional',
    not_checked: 'Not checked', corroborated: 'Country and institution type corroborated — not accreditation',
    not_found: 'Not found in consulted sources', ambiguous: 'Unresolved match',
    unavailable: 'Sources unavailable',
  };
}

export function guidanceFor(q: Qualification, lang: GuidanceLang, purpose = '') {
  const es = lang === 'es';
  const labels = qualificationLabels(lang);
  const missing = (['institution', 'country', 'field', 'duration'] as const)
    .filter(key => !q[key].trim()).map(key => labels[key]);
  if (q.completion === 'unknown') missing.push(labels.completion);
  if (q.awardType === 'unknown') missing.push(labels.awardType);
  const admission = purpose === 'University Admission';
  const immigration = purpose === 'Immigration (USCIS)';
  return {
    limits: es
      ? 'Orientación preliminar, no una equivalencia estadounidense. No se han autenticado documentos, determinado acreditación ni otorgado una licencia. El nombre traducido de un título, “doctor”, MBBS o un título profesional no demuestra un doctorado académico de EE. UU.'
      : 'Preliminary guidance, not a U.S. equivalency. Documents have not been authenticated, accreditation has not been determined, and no license is granted. A translated award name, “doctor”, MBBS or a professional title does not establish a U.S. academic doctorate.',
    context: es
      ? `El título «${q.awardName}» se conserva como fue declarado${q.country ? ` en el contexto educativo de ${q.country}` : ''}. Para compararlo se necesitan los requisitos de ingreso, el nivel dentro de ese sistema, el plan de estudios, la duración y los documentos de finalización. No convertimos años ni créditos automáticamente. ${q.completion !== 'completed' ? 'No se ha declarado como título finalizado; no debe presentarse como un título obtenido.' : 'La finalización es declarada por usted, no verificada por esta aplicación.'}`
      : `“${q.awardName}” is preserved as reported${q.country ? ` in the education-system context of ${q.country}` : ''}. Comparison requires entry requirements, the award’s standing within that system, curriculum, duration and completion documents. We do not automatically convert years or credits. ${q.completion !== 'completed' ? 'This has not been reported as a completed award; do not present it as an earned degree.' : 'Completion is self-reported, not verified by this app.'}`,
    missing,
    terminology: es
      ? 'Terminología de EE. UU. (NCES): associate suele corresponder a un programa de unos dos años; bachelor, a unos cuatro años; master es un título de posgrado. Los doctorados de investigación y los de práctica profesional son categorías distintas. Los certificados pueden existir en distintos niveles. Estas definiciones no asignan ningún nivel a su título extranjero.'
      : 'U.S. terminology (NCES): an associate’s degree usually involves about two years of college study; a bachelor’s about four years; a master’s is a graduate award. Research doctorates and professional-practice doctorates are distinct categories. Certificates can exist at different levels. These definitions do not assign a level to your foreign award.',
    career: es
      ? `${admission ? 'Consulte a la oficina de admisiones sobre prerrequisitos y evaluadores aceptados.' : immigration ? 'Consulte las instrucciones oficiales del trámite y asesoría migratoria cualificada; esta orientación no determina elegibilidad migratoria.' : 'Presente el nombre original del título, institución, país, área y estado real de finalización en su currículum. Consulte con recursos humanos qué documentación o evaluación acepta para el puesto.'} Antes de pagar, confirme el servicio y tipo de informe aceptados por quien recibirá la evaluación. Para una comparación individual con títulos de EE. UU., solicite una evaluación oficial aceptada por ese destinatario, con expedientes y traducciones según sus instrucciones. NACES es una asociación de servicios privados, no una agencia que evalúa ni un acreditador de títulos.`
      : `${admission ? 'Ask the admissions office about prerequisites and accepted evaluators.' : immigration ? 'Consult the official application instructions and qualified immigration advice; this guidance does not determine immigration eligibility.' : 'List the original award name, institution, country, field and actual completion status on your resume. Ask HR what documentation or evaluation it accepts for the role.'} Before paying, confirm the service and report type accepted by the recipient. For an individual comparison with U.S. awards, obtain an official evaluation accepted by that recipient, using transcripts and translations as instructed. NACES is an association of private services, not an evaluating agency or a degree accreditor.`,
    licensing: es
      ? 'La orientación laboral general no autoriza a ejercer una profesión regulada. Identifique la profesión exacta y el estado de EE. UU.; consulte a la junta competente sobre evaluación especializada, cursos, exámenes, experiencia e idioma. Los requisitos varían y no se determinan aquí (Departamento de Educación de EE. UU.).'
      : 'General career guidance does not authorize practice in a regulated profession. Identify the exact profession and U.S. state; ask the relevant board about specialized evaluation, coursework, exams, experience and language requirements. Requirements vary and are not determined here (U.S. Department of Education).',
    references: [
      { name: es ? 'Departamento de Educación de EE. UU. — reconocimiento' : 'U.S. Department of Education — recognition', url: 'https://www.ed.gov/about/initiatives/international-affairs/recognition-of-foreign-qualifications' },
      { name: es ? 'Departamento de Educación de EE. UU. — licencias profesionales' : 'U.S. Department of Education — professional licensure', url: 'https://www.ed.gov/about/initiatives/international-affairs/professional-licensure' },
      { name: es ? 'NCES — glosario de educación de EE. UU.' : 'NCES — U.S. education glossary', url: 'https://nces.ed.gov/programs/coe/glossary' },
      { name: es ? 'NACES — directorio de miembros, no recomendación individual' : 'NACES — member directory, not an individual endorsement', url: 'https://www.naces.org/members' },
    ],
  };
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function publicEvidenceUrl(value: string): string | null {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}

/** All exported data is escaped, including provider text. No computed equivalency tags. */
export function buildDossierHtml(qualifications: Qualification[], lang: GuidanceLang, purpose = ''): string {
  const es = lang === 'es', labels = qualificationLabels(lang);
  const title = es ? 'Expediente de orientación educativa' : 'Education guidance dossier';
  const section = (heading: string, text: string) => `<h3>${heading}</h3><p>${escapeHtml(text)}</p>`;
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><title>${title}</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:20px;color:#172033}table{border-collapse:collapse;width:100%}td{padding:8px;border-bottom:1px solid #ddd;vertical-align:top}h2{margin-top:35px}article{break-inside:avoid}a{overflow-wrap:anywhere}@media print{body{margin:0}}</style><h1>VerifED — ${title}</h1><p>${es ? 'Generado' : 'Generated'}: ${new Date().toISOString()}</p><p>${es ? 'Objetivo declarado' : 'Self-reported goal'}: ${escapeHtml(({ 'University Admission': es ? 'Admisión universitaria' : 'University admission', 'Employment & HR': es ? 'Empleo / RR. HH.' : 'Employment / HR', 'Professional Licensing': es ? 'Licencia profesional' : 'Professional licensing', 'Immigration (USCIS)': es ? 'Inmigración (USCIS)' : 'Immigration (USCIS)' } as Record<string, string>)[purpose] || purpose || labels.unknown)}</p>
  ${qualifications.map((q, index) => {
    const g = guidanceFor(q, lang, purpose);
    const evidence = q.verification?.selected;
    const links = (evidence?.sources || []).map(s => {
      const url = publicEvidenceUrl(s.url);
      return url ? `<li><a href="${escapeHtml(url)}">${escapeHtml(s.name)}</a> — ${escapeHtml(s.retrievedAt)}</li>` : '';
    }).join('');
    return `<article><h2>${index + 1}. ${escapeHtml(q.awardName)}</h2><p>${es ? 'Información declarada por el usuario; no autenticada' : 'User-reported information; not authenticated'}</p><table>${(['awardName', 'institution', 'country', 'field', 'duration', 'completion', 'awardType', 'evidenceStatus'] as const).map(key => `<tr><td>${labels[key]}</td><td>${escapeHtml(['completion', 'awardType', 'evidenceStatus'].includes(key) ? labels[q[key]] || q[key] : q[key] || labels.unknown)}</td></tr>`).join('')}</table>
      ${section(es ? 'Límites' : 'Limits', g.limits)}
      ${section(es ? 'Contexto de la titulación' : 'Award context', g.context)}
      ${section(es ? 'Detalles necesarios' : 'Details needed', g.missing.length ? g.missing.join('; ') : (es ? 'Para comparar: requisitos de ingreso, expediente académico y requisitos del destinatario.' : 'For comparison: entry requirements, academic transcript and recipient requirements.'))}
      ${section(es ? 'Terminología estadounidense' : 'U.S. terminology', g.terminology)}
      ${section(es ? 'Próximos pasos' : 'Next steps', g.career)}
      ${section(es ? 'Licencias profesionales — revisión separada' : 'Professional licensing — separate review', g.licensing)}
      <h3>${es ? 'Evidencia institucional pública — no autenticidad ni equivalencia' : 'Public institution evidence — not authenticity or equivalency'}</h3>
      <p>${es ? 'La ausencia de evidencia o un error de consulta no invalida la institución ni el título. Los datos guardados son una instantánea histórica, no una comprobación actual.' : 'Missing evidence or a lookup failure does not invalidate the institution or award. Saved evidence is a historical snapshot, not a current check.'}</p>
      ${evidence ? `<p>${escapeHtml(evidence.name)} · ${escapeHtml(evidence.country || labels.unknown)} · ${escapeHtml(evidence.higherEducationType || labels.unknown)}</p><p>${es ? 'Cierre informado por la fuente (si consta)' : 'Source-reported closure (if listed)'}: ${escapeHtml(evidence.closureDate || labels.unknown)}</p><p>${es ? 'Sitio web: disponibilidad no comprobada' : 'Website: live availability not checked'}</p>` : ''}
      ${q.verification ? `<p>${es ? 'Fecha de consulta pública' : 'Public lookup date'}: ${escapeHtml(q.verification.retrievedAt)}</p>` : ''}
      <ul>${links}</ul>
      ${!evidence && q.verification?.candidates.length ? `<h4>${es ? 'Posibles coincidencias — ninguna confirmada' : 'Possible matches — none confirmed'}</h4><ul>${q.verification.candidates.map(c => `<li>${escapeHtml(c.name)} (${escapeHtml(c.country || labels.unknown)})<ul>${c.sources.map(s => { const url = publicEvidenceUrl(s.url); return url ? `<li><a href="${escapeHtml(url)}">${escapeHtml(s.name)}</a> — ${escapeHtml(s.retrievedAt)}</li>` : ''; }).join('')}</ul></li>`).join('')}</ul>` : ''}
      <h3>${es ? 'Referencias generales — no evidencia individual del título' : 'General references — not individual award evidence'}</h3><ul>${g.references.map(r => `<li><a href="${r.url}">${r.name}</a></li>`).join('')}</ul></article>`;
  }).join('')}<footer>${es ? 'VerifED es una plataforma independiente. Este expediente no es una certificación, evaluación oficial ni decisión de licencia.' : 'VerifED is an independent platform. This dossier is not a certification, official evaluation or licensing decision.'}</footer></html>`;
}
