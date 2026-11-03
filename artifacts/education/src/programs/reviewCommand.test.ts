import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../../scripts/review-programs.ts', import.meta.url));
const workflow = new URL('../../../../.github/workflows/program-directory-review.yml', import.meta.url);
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function runCommand(scenario: 'clear' | 'contact-missing' | 'program-broken' | 'unsafe-tls') {
  const temp = await mkdtemp(join(tmpdir(), 'verifed-review-command-'));
  directories.push(temp);
  const output = join(temp, 'report');
  const preload = join(temp, 'fixtures.mjs');
  const catalog = new URL('./catalog.ts', import.meta.url).href;
  const contacts = new URL('./accountEmail.ts', import.meta.url).href;
  // Replace data and HTTP only inside the child. The actual command, renderers,
  // filesystem writes and process exit status are exercised without live sites.
  await writeFile(preload, `
    import { PROGRAMS } from ${JSON.stringify(catalog)};
    import { ADMISSIONS_CONTACTS } from ${JSON.stringify(contacts)};
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : ['2026-11-03T12:00:00Z'])); }
      static now() { return new RealDate('2026-11-03T12:00:00Z').getTime(); }
    };
    PROGRAMS.splice(0, PROGRAMS.length, {
      ...PROGRAMS[0], id: 'fixture-program', title: 'Fixture award',
      checkedAt: '2026-11-03',
      url: 'https://fixture.test/program', sourceUrl: 'https://fixture.test/program'
    });
    for (const key of Object.keys(ADMISSIONS_CONTACTS)) delete ADMISSIONS_CONTACTS[key];
    ADMISSIONS_CONTACTS.fixtureContact = {
      recipient: 'admissions@example.test',
      sourceUrl: 'https://fixture.test/contact',
      checkedAt: '2026-11-03'
    };
    globalThis.fetch = async (url) => {
      if (${JSON.stringify(scenario)} === 'unsafe-tls') throw new Error('HTTP must not run with TLS disabled');
      if (!['https://fixture.test/program', 'https://fixture.test/contact'].includes(String(url))) {
        throw new Error('Unexpected URL: ' + url);
      }
      const missing = ${JSON.stringify(scenario)} === 'contact-missing';
      const broken = ${JSON.stringify(scenario)} === 'program-broken' && String(url).endsWith('/program');
      return new Response(missing ? '<p>Contact the admissions office.</p>' : '<a href="mailto:admissions@example.test">Admissions</a>', {
        status: broken ? 404 : 200, headers: { 'content-type': 'text/html' }
      });
    };
  `);
  const child = spawnSync(process.execPath, [
    '--experimental-strip-types', '--import', pathToFileURL(preload).href,
    script, '--output-dir', output,
  ], {
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: scenario === 'unsafe-tls' ? '0' : '1' },
    encoding: 'utf8', timeout: 15_000,
  });
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  return { ...child, output };
}

describe('weekly review command and GitHub report contract', () => {
  it('writes combined JSON and Markdown and exits zero when all checks are clear', async () => {
    const run = await runCommand('clear');
    expect(run.status, run.stderr).toBe(0);
    const report = JSON.parse(await readFile(join(run.output, 'report.json'), 'utf8'));
    expect(report.needsReview).toBe(0);
    expect(report.records[0].id).toBe('fixture-program');
    expect(report.contacts.needsReview).toBe(0);
    expect(report.contacts.records[0]).toMatchObject({ id: 'fixtureContact', result: 'present' });
    const summary = await readFile(join(run.output, 'summary.md'), 'utf8');
    expect(summary).toContain('# Official program source review');
    expect(summary).toContain('# Admissions email source review');
    expect(run.stdout).toContain(summary);
  });

  it('still saves both reports and exits one for contact-only findings', async () => {
    const run = await runCommand('contact-missing');
    expect(run.status, run.stderr).toBe(1);
    const report = JSON.parse(await readFile(join(run.output, 'report.json'), 'utf8'));
    expect(report.needsReview).toBe(0);
    expect(report.contacts.needsReview).toBe(1);
    expect(report.contacts.records[0].result).toBe('missing');
    const summary = await readFile(join(run.output, 'summary.md'), 'utf8');
    expect(summary).toContain('# Official program source review');
    expect(summary).toContain('# Admissions email source review');
    expect(summary).toContain('MISSING');
  });

  it('saves contact results even when a program URL is broken', async () => {
    const run = await runCommand('program-broken');
    expect(run.status, run.stderr).toBe(1);
    const report = JSON.parse(await readFile(join(run.output, 'report.json'), 'utf8'));
    expect(report.needsReview).toBe(1);
    expect(report.contacts.needsReview).toBe(0);
    expect(await readFile(join(run.output, 'summary.md'), 'utf8')).toContain('BROKEN');
  });

  it('refuses disabled TLS instead of writing a reassuring report', async () => {
    const run = await runCommand('unsafe-tls');
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('Program review requires TLS verification');
    await expect(readFile(join(run.output, 'report.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(run.output, 'summary.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps summary publishing and artifact upload running after review findings', async () => {
    const yaml = await readFile(workflow, 'utf8');
    expect(yaml).toContain('pnpm --filter @workspace/education review:programs');
    const summaryStep = yaml.split('- name: Publish maintainer summary')[1]?.split('- uses:')[0];
    expect(summaryStep).toContain('if: always()');
    expect(summaryStep).toContain('generated-artifacts/program-review/summary.md');
    expect(summaryStep).toContain('Program review did not produce a report');
    const uploadStep = yaml.split('uses: actions/upload-artifact@')[1];
    expect(uploadStep).toContain('if: always()');
    expect(uploadStep).toContain('path: generated-artifacts/program-review/');
    const source = await readFile(script, 'utf8');
    expect(source).toContain("../../../generated-artifacts/program-review/");
  });
});
