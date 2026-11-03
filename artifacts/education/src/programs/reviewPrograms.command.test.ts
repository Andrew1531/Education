import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROGRAMS } from './catalog';
import { ADMISSIONS_CONTACTS } from './accountEmail';
import type { ProgramReviewReport } from './catalogReviewReport';
import type { ContactReviewReport } from './contactReview';

const education = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(education, '../..');
const fixture = join(education, 'src/programs/test-fixtures/review-command.mjs');
const workflow = readFileSync(join(root, '.github/workflows/program-directory-review.yml'), 'utf8');
const steps = workflow.split(/^      - /m).slice(1);
const summaryStep = steps.find(step => step.startsWith('name: Publish maintainer summary\n'))!;
const uploadStep = steps.find(step => step.startsWith('uses: actions/upload-artifact@'))!;
const summaryShell = summaryStep.split('        run: |\n')[1]
  ?.split('\n').map(line => line.replace(/^          /, '')).join('\n');
const scratch: string[] = [];

afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runReview(scenario: string, tlsDisabled = false) {
  const workspace = mkdtempSync(join(tmpdir(), 'program-review-command-'));
  scratch.push(workspace);
  const app = join(workspace, 'artifacts/education');
  mkdirSync(join(app, 'scripts'), { recursive: true });
  // Preserve the real command's relative output path without touching a developer's reports.
  copyFileSync(join(education, 'scripts/review-programs.ts'), join(app, 'scripts/review-programs.ts'));
  copyFileSync(join(education, 'package.json'), join(app, 'package.json'));
  symlinkSync(join(education, 'src'), join(app, 'src'), 'dir');
  symlinkSync(join(education, 'node_modules'), join(app, 'node_modules'), 'dir');
  const requestLog = join(workspace, 'requests.log');
  const command = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).scripts['review:programs'];
  expect(command).toBe('node --experimental-strip-types scripts/review-programs.ts');
  const result = spawnSync(process.execPath, [
    '--import', fixture, ...command.split(' ').slice(1),
  ], {
    cwd: app,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      NODE_TLS_REJECT_UNAUTHORIZED: tlsDisabled ? '0' : '1',
      REVIEW_TEST_SCENARIO: scenario,
      REVIEW_TEST_REQUEST_LOG: requestLog,
    },
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return { ...result, workspace, requestLog, reports: join(workspace, 'generated-artifacts/program-review') };
}

function publishSummary(workspace: string) {
  expect(summaryShell).toBeTruthy();
  const destination = join(workspace, 'github-step-summary.md');
  const result = spawnSync('bash', ['-e', '-c', summaryShell!], {
    cwd: workspace, encoding: 'utf8', timeout: 5_000,
    env: { ...process.env, GITHUB_STEP_SUMMARY: destination },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(destination, 'utf8');
}

describe('weekly review command and workflow contract (offline)', () => {
  it('runs the package command and always publishes and uploads its reports, even on failure', () => {
    expect(workflow).toContain("cron: '0 13 * * 1'");
    expect(steps.some(step => step.includes('run: pnpm --filter @workspace/education review:programs'))).toBe(true);
    expect(summaryStep).toMatch(/^        if: always\(\)$/m);
    expect(uploadStep).toMatch(/^        if: always\(\)$/m);
    expect(uploadStep).toMatch(/^          path: generated-artifacts\/program-review\/$/m);
    expect(uploadStep).toContain('name: official-program-source-review');
  });

  it.each([
    ['clear', 0, 'present'],
    ['missing', 1, 'missing'],
    ['unavailable', 1, 'unconfirmed'],
    ['overdue', 1, 'present'],
    ['program-only', 1, 'present'],
  ] as const)('saves combined JSON and Markdown for %s and exits %i', (scenario, exitCode, contactResult) => {
    const result = runReview(scenario);
    expect(result.status, result.stderr).toBe(exitCode);
    const report = JSON.parse(readFileSync(join(result.reports, 'report.json'), 'utf8')) as
      ProgramReviewReport & { contacts: ContactReviewReport };
    const summary = readFileSync(join(result.reports, 'summary.md'), 'utf8');
    expect(report.records.map(record => record.id)).toEqual(PROGRAMS.map(program => program.id));
    expect(report.contacts.records.map(record => record.id)).toEqual(Object.keys(ADMISSIONS_CONTACTS));
    expect(report.distinctUrls).toBe(new Set(PROGRAMS.flatMap(p => [p.url, p.sourceUrl])).size);
    expect(report.contacts.distinctUrls).toBe(new Set(Object.values(ADMISSIONS_CONTACTS).map(c => c.sourceUrl)).size);
    expect(report.needsReview).toBe(scenario === 'program-only' ? 1 : 0);
    expect(report.contacts.needsReview).toBe(['clear', 'program-only'].includes(scenario) ? 0 : 1);
    expect(report.contacts.records[0]).toMatchObject({
      result: contactResult,
      editorialReviewDue: scenario === 'overdue',
      recipient: Object.values(ADMISSIONS_CONTACTS)[0].recipient,
    });
    expect(summary).toContain('# Official program source review');
    expect(summary).toContain('# Admissions email source review');
    for (const [id, contact] of Object.entries(ADMISSIONS_CONTACTS)) {
      expect(summary).toContain(`## ${id} —`);
      expect(summary).toContain(contact.recipient);
      expect(summary).toContain(contact.sourceUrl.replaceAll('_', '\\_'));
    }
    expect(summary).toContain(`## ${Object.keys(ADMISSIONS_CONTACTS)[0]} — ${contactResult.toUpperCase()}`);
    if (scenario === 'overdue') expect(summary).toContain('EDITORIAL REVIEW REQUIRED');
    if (scenario === 'unavailable') expect(summary).toContain('HTTP 503');
    expect(result.stdout).toContain(summary);
    expect(readFileSync(result.requestLog, 'utf8').trim().split('\n')).toHaveLength(
      report.distinctUrls + report.contacts.distinctUrls,
    );
    // Execute the workflow's actual shell, from repository root as GitHub does.
    expect(publishSummary(result.workspace)).toBe(summary);
  });

  it('refuses disabled TLS before fetching or writing reports and publishes the missing-report warning', () => {
    const result = runReview('clear', true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Program review requires TLS verification. Remove NODE_TLS_REJECT_UNAUTHORIZED=0.');
    expect(existsSync(result.requestLog)).toBe(false);
    expect(existsSync(result.reports)).toBe(false);
    expect(publishSummary(result.workspace)).toContain(
      'Program review did not produce a report. Check setup and command logs; link and editorial status are unknown.',
    );
  });
});
