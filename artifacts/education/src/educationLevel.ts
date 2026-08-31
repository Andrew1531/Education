export type EducationLevel =
  | 'secondary'
  | 'associate'
  | 'bachelor'
  | 'master'
  | 'doctor'
  | 'unknown';

interface EducationLevelInput {
  degree: string;
  institution?: string;
  field?: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const UNKNOWN_ANSWER = /^(?:n ?a|not applicable|none|unknown|unsure|not sure|no degree|no diploma)$/;
const SECONDARY_EDUCATION =
  /\b(?:high school|secondary school|secondary education|secondary diploma|ged|bachillerato|secundaria|ensino medio|lycee)\b/;

/**
 * Provides a conservative preliminary level classification from self-reported
 * text. Unknown credentials stay unknown instead of defaulting to a bachelor's
 * degree; only an official credential evaluator can determine equivalency.
 */
export function classifyEducationLevel({
  degree,
  institution = '',
  field = '',
}: EducationLevelInput): EducationLevel {
  const normalizedDegree = normalize(degree);
  const educationContext = normalize(`${degree} ${institution} ${field}`);

  if (UNKNOWN_ANSWER.test(normalizedDegree)) {
    return SECONDARY_EDUCATION.test(educationContext) ? 'secondary' : 'unknown';
  }

  if (SECONDARY_EDUCATION.test(normalizedDegree)) return 'secondary';

  if (/\b(?:phd|ph d|doctorate|doctoral|doctorado)\b/.test(normalizedDegree)) {
    return 'doctor';
  }

  if (
    /\b(?:master|masters|msc|m sc|mba|m ba|postgraduate|post graduate|posgrado|postgrado|maestria)\b/.test(
      normalizedDegree,
    )
  ) {
    return 'master';
  }

  if (
    /\b(?:associate|associates|hnd|higher national diploma|tecnico|tecnologo|diplomado)\b/.test(
      normalizedDegree,
    )
  ) {
    return 'associate';
  }

  if (
    /\b(?:bachelor|bachelors|baccalaureate|undergraduate|licenciatura|licenciado|licenciada|bsc|b sc|ba|b a|bs|b s)\b/.test(
      normalizedDegree,
    ) ||
    /^(?:lic|licenciatura)$/.test(normalizedDegree)
  ) {
    return 'bachelor';
  }

  if (SECONDARY_EDUCATION.test(educationContext)) return 'secondary';

  return 'unknown';
}