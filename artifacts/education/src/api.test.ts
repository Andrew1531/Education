import { describe, it, expect } from 'vitest';
import { isUnavailableResponse } from './api';

function fakeRes(status: number, contentType: string | null) {
  return { status, headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? contentType : null) } };
}

describe('isUnavailableResponse', () => {
  it('treats an HTML 404 (GitHub Pages SPA fallback) as backend-unavailable', () => {
    expect(isUnavailableResponse(fakeRes(404, 'text/html; charset=utf-8'))).toBe(true);
  });

  it('treats gateway errors without JSON as backend-unavailable', () => {
    expect(isUnavailableResponse(fakeRes(502, 'text/html'))).toBe(true);
    expect(isUnavailableResponse(fakeRes(503, null))).toBe(true);
    expect(isUnavailableResponse(fakeRes(504, 'text/plain'))).toBe(true);
  });

  it('keeps real API responses, including JSON 404s and auth failures', () => {
    expect(isUnavailableResponse(fakeRes(404, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(401, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(409, 'application/json'))).toBe(false);
    expect(isUnavailableResponse(fakeRes(200, 'application/json'))).toBe(false);
  });
});
