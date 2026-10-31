import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
vi.mock('@workspace/db', () => {
  const state = { updates: [] as unknown[], row: {} as Record<string, unknown> };
  return { usersTable: {}, __qualificationState: state, db: {
    update: () => ({ set: (value: unknown) => {
      state.updates.push(value);
      return { where: () => ({ returning: async () => [state.row] }) };
    } }),
  } };
});
import app from '../app';
import { issueUserToken } from '../lib/userToken';
const state = (await import('@workspace/db') as any).__qualificationState;
const q = { id: 'q1', awardName: 'Doctor en Medicina', institution: 'Universidad', country: 'Ecuador', field: 'Medicina', duration: '6 años', completion: 'completed', awardType: 'professional', evidenceStatus: 'unavailable' };
beforeEach(() => {
  process.env.SESSION_SECRET = 'qualification-test-secret';
  state.updates = [];
  state.row = { username: 'alice', email: '', salt: '', createdAt: new Date('2026-01-01'), qualifications: [q] };
});
const save = (profile: unknown, token = issueUserToken('alice')!) => request(app).post('/api/auth/profile').set('x-auth-token', token).send({ username: 'alice', profile });
describe('Authenticated multi-qualification profile persistence', () => {
  it('saves and returns every award without collapsing original names, duration or evidence states', async () => {
    const list = [q, { ...q, id: 'q2', awardName: 'Diploma técnico', completion: 'unknown', evidenceStatus: 'not_found' }];
    const res = await save({ qualifications: list, country: 'Ecuador' });
    expect(res.status).toBe(200);
    expect(state.updates[0].qualifications).toEqual(list);
    expect(res.body.user.qualifications).toEqual([q]);
  });
  it('accepts explicit removal of all qualifications and empty legacy summaries', async () => {
    const res = await save({ qualifications: [], country: '', institution: '', degree: '', field: '' });
    expect(res.status).toBe(200);
    expect(state.updates[0]).toEqual({ qualifications: [], country: '', institution: '', degree: '', field: '' });
  });
  it('rejects another user’s token without writing', async () => {
    expect((await save({ qualifications: [q] }, issueUserToken('bob')!)).status).toBe(401);
    expect(state.updates).toEqual([]);
  });
  it.each([
    { qualifications: [{ ...q, completion: 'fabricated' }] },
    { qualifications: [q, q] },
    { qualifications: Array.from({ length: 51 }, (_, i) => ({ ...q, id: `${i}` })) },
  ])('rejects invalid or duplicate qualification records', async profile => {
    expect((await save(profile)).status).toBe(400);
    expect(state.updates).toEqual([]);
  });
});
