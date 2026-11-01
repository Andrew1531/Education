import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'node:events';

const state = vi.hoisted(() => ({
  users: [] as Record<string, unknown>[],
  intents: new Map<string, Record<string, unknown>>(),
  html: '<p>Admissions <a href="mailto:admissions@umgc.edu">Contact admissions</a></p>',
  providerStatus: 200,
  throwProvider: false,
  senderAvailable: true,
  sends: [] as unknown[],
}));
vi.mock('@workspace/db', () => ({
  usersTable: {},
  db: { select: () => ({ from: () => ({ where: async () => state.users }) }) },
  pool: {
    connect: async () => ({ query: async () => ({ rows: [{ count: '0' }] }), release() {} }),
    query: async (sql: string, args: unknown[]) => {
      if (sql.startsWith('INSERT INTO school_outreach_requests')) {
        const id = args[0] as string;
        if (state.intents.has(id)) return { rows: [] };
        const row = { username: args[1], request_hash: args[2], status: 'processing',
          schools: JSON.parse(args[3] as string), updated_at: new Date() };
        state.intents.set(id, row);
        return { rows: [row] };
      }
      if (sql.startsWith('SELECT *')) return { rows: [state.intents.get(args[0] as string)] };
      if (sql.startsWith('SELECT outcomes')) return { rows: [...state.intents.values()] };
      if (sql.startsWith('UPDATE school_outreach_requests')) {
        Object.assign(state.intents.get(args[0] as string)!, { status: 'completed', outcomes: JSON.parse(args[1] as string) });
      }
      return { rows: [] };
    },
  },
}));
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '8.8.8.8', family: 4 }] }));
vi.mock('node:https', () => ({
  request: (_url: URL, _options: unknown, callback: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & { setTimeout(): void; end(): void };
    req.setTimeout = () => {};
    req.end = () => queueMicrotask(() => {
      const res = Object.assign(new EventEmitter(), { statusCode: 200,
        headers: { 'content-type': 'text/html' }, resume() {}, destroy() {} });
      callback(res);
      res.emit('data', Buffer.from(state.html)); res.emit('end');
    });
    return req;
  },
}));
vi.mock('@replit/connectors-sdk', () => ({
  ReplitConnectors: class {
    async proxy(_connector: string, path: string, options: unknown) {
      if (path === '/domains') return { ok: true, json: async () => ({ data: state.senderAvailable ? [{ name: 'sender.example', status: 'verified' }] : [] }) };
      state.sends.push(options);
      if (state.throwProvider) throw new Error('lost connection');
      return { ok: state.providerStatus === 200, status: state.providerStatus, json: async () => ({ id: 'provider-id' }) };
    }
  },
}));

import app from '../app';
import { issueUserToken } from '../lib/userToken';

const ids = ['umgc-cs-bs', 'umgc-business-bs'];
const contacts = () => request(app).post('/api/auth/schools/contacts')
  .set('x-auth-token', issueUserToken('owner')!).send({ username: 'owner', schoolIds: ids });
const send = (preview: unknown, requestId = 'request-123456789abcdef') =>
  request(app).post('/api/auth/school-outreach').set('x-auth-token', issueUserToken('owner')!).send({
    username: 'owner', requestId, consent: true, preview,
    schools: ids.map(schoolId => ({ schoolId, email: 'admissions@umgc.edu' })),
  });

describe('sourced program contact review and send (all email mocked)', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'outreach-fixture-only';
    process.env.NODE_ENV = 'test';
    delete process.env.SCHOOL_OUTREACH_FROM;
    state.users = [{ username: 'owner', country: 'Mexico', degree: 'Original award',
      institution: 'Original institution', field: 'Computing', purpose: 'University Admission',
      opportunities: ids.map(id => ({ id, kind: 'school', url: 'https://attacker.invalid' })) }];
    state.intents.clear(); state.sends = [];
    state.providerStatus = 200; state.throwProvider = false;
    state.senderAvailable = true;
    state.html = '<p>Admissions <a href="mailto:admissions@umgc.edu">Contact admissions</a></p>';
  });
  it('reviews official program IDs without a government key or trusting saved URLs', async () => {
    const res = await contacts();
    expect(res.status).toBe(200);
    expect(res.body.contacts[0].recipients).toEqual([{ email: 'admissions@umgc.edu', sourceUrl: 'https://www.umgc.edu/admission' }]);
    expect(res.body.preview.text).toContain('Original award');
    expect(state.sends).toHaveLength(0);
  });
  it('requires the unchanged preview and preserves its exact text in the sent message', async () => {
    const review = await contacts();
    const res = await send(review.body.preview);
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(['sent', 'sent']);
    expect(state.sends).toHaveLength(1); // shared recipient: no duplicate mail
    expect(state.sends[0]).toMatchObject({ body: { text: review.body.preview.text, to: ['admissions@umgc.edu'] } });
    expect((await send(review.body.preview)).body.results).toEqual(res.body.results);
    expect(state.sends).toHaveLength(1); // durable replay: no duplicate send
  });
  it('refuses stale profile information even if the browser still consents', async () => {
    const review = await contacts();
    state.users[0].degree = 'Changed award';
    expect((await send(review.body.preview)).status).toBe(409);
    expect(state.sends).toHaveLength(0);
  });
  it('rejects expired or forged previews', async () => {
    const review = await contacts();
    expect((await send({ ...review.body.preview, expiresAt: 1 })).status).toBe(409);
    expect((await send({ ...review.body.preview, token: 'a'.repeat(64) })).status).toBe(409);
    expect((await send(undefined)).status).toBe(409);
    expect(state.sends).toHaveLength(0);
  });
  it('re-verifies recipients at send time', async () => {
    const review = await contacts();
    state.html = '<p>No contact</p>';
    expect((await send(review.body.preview)).status).toBe(400);
    expect(state.sends).toHaveLength(0);
    const history = await request(app).get('/api/auth/school-outreach-history?username=owner')
      .set('x-auth-token', issueUserToken('owner')!);
    expect(history.body.history[0].result).toBe('not_attempted');
  });
  it('rejects generic parent domains, third parties, and malformed mailto escapes', async () => {
    state.html = '<p>Admissions <a href="mailto:admissions@edu">x</a><a href="mailto:admissions@evil.example">x</a><a href="mailto:%zz">x</a></p>';
    const res = await contacts();
    expect(res.status).toBe(200);
    expect(res.body.contacts[0].status).toBe('fallback');
    expect(res.body.contacts[0].recipients).toEqual([]);
  });
  it.each([400, 503])('distinguishes provider rejection from uncertain server failure (%s)', async status => {
    const review = await contacts();
    state.providerStatus = status;
    const res = await send(review.body.preview);
    expect(res.body.results[0].result).toBe(status === 400 ? 'failed' : 'unknown');
  });
  it('reports uncertain network outcomes without claiming failure or retrying', async () => {
    const review = await contacts();
    state.throwProvider = true;
    const res = await send(review.body.preview);
    expect(res.body.results[0].result).toBe('unknown');
    expect((await send(review.body.preview)).body.results[0].result).toBe('unknown');
    expect(state.sends).toHaveLength(1);
  });
  it('does not resume an existing processing request', async () => {
    const review = await contacts();
    await send(review.body.preview);
    const row = state.intents.get('request-123456789abcdef')!;
    row.status = 'processing';
    const res = await send(review.body.preview);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('school_outreach_processing_or_unknown');
    expect(state.sends).toHaveLength(1);
    const history = await request(app).get('/api/auth/school-outreach-history?username=owner')
      .set('x-auth-token', issueUserToken('owner')!);
    // Simulate a crash before the outcome was saved.
    row.outcomes = null;
    const uncertain = await request(app).get('/api/auth/school-outreach-history?username=owner')
      .set('x-auth-token', issueUserToken('owner')!);
    expect(history.status).toBe(200);
    expect(uncertain.body.history[0].result).toBe('unknown');
  });
  it('records a missing sender as not attempted, never sent or failed delivery', async () => {
    state.senderAvailable = false;
    const review = await contacts();
    expect((await send(review.body.preview)).status).toBe(503);
    expect(state.sends).toHaveLength(0);
    const history = await request(app).get('/api/auth/school-outreach-history?username=owner')
      .set('x-auth-token', issueUserToken('owner')!);
    expect(history.body.history.every((h: { result: string }) => h.result === 'not_attempted')).toBe(true);
  });
  it('retains earlier profile-stored history for the same authenticated owner', async () => {
    state.users[0].schoolOutreachHistory = [{ schoolId: '123', schoolName: 'Legacy School',
      recipient: 'admissions@legacy.example', result: 'sent', sentAt: '2026-01-01T00:00:00.000Z' }];
    const history = await request(app).get('/api/auth/school-outreach-history?username=owner')
      .set('x-auth-token', issueUserToken('owner')!);
    expect(history.body.history[0].schoolName).toBe('Legacy School');
  });
});
