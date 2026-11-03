// Child-process-only fixture: no real HTTP requests or changes to catalog files.
import { appendFileSync } from 'node:fs';
import { PROGRAMS } from '../catalog.ts';
import { ADMISSIONS_CONTACTS } from '../accountEmail.ts';

const scenario = process.env.REVIEW_TEST_SCENARIO;
const today = new Date().toISOString().slice(0, 10);
for (const program of PROGRAMS) program.checkedAt = today;
for (const contact of Object.values(ADMISSIONS_CONTACTS)) contact.checkedAt = today;
const [targetId, target] = Object.entries(ADMISSIONS_CONTACTS)[0];
if (scenario === 'overdue') target.checkedAt = '2000-01-01';

const pages = new Map();
for (const program of PROGRAMS) {
  pages.set(program.url, '<html>Official program fixture</html>');
  pages.set(program.sourceUrl, '<html>Official program fixture</html>');
}
for (const [id, contact] of Object.entries(ADMISSIONS_CONTACTS)) {
  const mailbox = scenario === 'missing' && id === targetId ? '' : contact.recipient;
  pages.set(contact.sourceUrl, `${pages.get(contact.sourceUrl) || '<html>Admissions fixture</html>'} ${mailbox}`);
}

globalThis.fetch = async (input) => {
  const url = String(input);
  appendFileSync(process.env.REVIEW_TEST_REQUEST_LOG, `${url}\n`);
  // No fallback to native fetch, including for unexpected URLs.
  if (!pages.has(url)) throw new Error(`Unconfigured fixture URL: ${url}`);
  if (scenario === 'unavailable' && url === target.sourceUrl) {
    return new Response('Unavailable', { status: 503 });
  }
  if (scenario === 'program-only' && url === PROGRAMS[0].url) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(pages.get(url), { headers: { 'content-type': 'text/html' } });
};
