import { beforeEach } from 'vitest';

// The language lives in the URL (/es/...). Start every browser-environment test at
// the English root so a test that switched language cannot leak into the next one.
beforeEach(() => {
  if (typeof window !== 'undefined') window.history.replaceState({}, '', '/');
});
