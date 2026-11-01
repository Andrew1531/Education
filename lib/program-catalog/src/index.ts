/** Official-source identity allowlist shared by the static directory and outreach.
 * Keep program IDs stable: they are also user-owned saved-record identifiers.
 */
const umgc = 'University of Maryland Global Campus';
const wsu = 'Wichita State University';
const uaf = 'University of Alaska Fairbanks';
export const PROGRAM_IDENTITIES = [
  ...['umgc-cs-bs', 'umgc-business-bs', 'umgc-accounting-bs', 'umgc-psychology-bs', 'umgc-nursing-bsn', 'umgc-business-mba', 'umgc-accounting-ms', 'umgc-education-mat']
    .map(id => ({ id, institution: umgc, contactUrl: 'https://www.umgc.edu/admission' })),
  ...['wsu-cs-bs', 'wsu-cs-ms', 'wsu-business-bba', 'wsu-business-mba', 'wsu-psychology-ba', 'wsu-mechanical-bs', 'wsu-mechanical-ms', 'wsu-biology-bs', 'wsu-biology-ms']
    .map(id => ({ id, institution: wsu, contactUrl: 'https://www.wichita.edu/admissions/' })),
  ...['uaf-accounting-cert', 'uaf-business-cert', 'uaf-accounting-aas', 'uaf-business-aas']
    .map(id => ({ id, institution: uaf, contactUrl: 'https://www.uaf.edu/admissions/' })),
  { id: 'uafs-engineering-as', institution: 'University of Arkansas – Fort Smith', contactUrl: 'https://uafs.edu/admissions/' },
  { id: 'iu-dentistry-msd', institution: 'Indiana University Indianapolis', contactUrl: 'https://dentistry.iu.edu/academics/degrees-programs/ms-dentistry/index.html' },
] as const;

export function programIdentity(id: string) {
  return PROGRAM_IDENTITIES.find(p => p.id === id);
}
