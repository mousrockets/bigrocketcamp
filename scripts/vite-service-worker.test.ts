import { describe, expect, it } from 'vitest';
import { buildHeader, buildVersion, precacheFiles } from './vite-service-worker';

describe('the service worker build', () => {
  it('copies the shell and the build files, without source maps', () => {
    expect(
      precacheFiles(['index.html', 'sw.js', 'assets/index-b.js', 'assets/index-b.js.map', 'assets/a.css']),
    ).toEqual(['/', '/assets/a.css', '/assets/index-b.js']);
  });

  it('names each file list differently, and the same list the same way', async () => {
    const version = await buildVersion(['/', '/assets/index-a.js']);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(await buildVersion(['/', '/assets/index-a.js'])).toBe(version);
    expect(await buildVersion(['/', '/assets/index-b.js'])).not.toBe(version);
  });

  it('writes the build as the first statement of sw.js', () => {
    expect(buildHeader({ version: 'abc', files: ['/'] })).toBe(
      'const __SW_BUILD__ = {"version":"abc","files":["/"]};\n',
    );
  });
});
