import { describe, expect, it } from 'vitest';
import { strategyFor } from './routes';

const origin = 'https://club.example.com';

function request(path: string, { method = 'GET', mode = 'cors', range = false } = {}) {
  const headers = new Headers(range ? { range: 'bytes=0-99' } : {});
  return { method, mode: mode as RequestMode, url: new URL(path, origin).href, headers };
}

describe('strategyFor', () => {
  it('never touches the API, sessions included', () => {
    expect(strategyFor(request('/api/state?since=4&wait=25'), origin)).toBe('network');
    expect(strategyFor(request('/api/auth/logout', { method: 'POST' }), origin)).toBe('network');
    expect(strategyFor(request('/api', { mode: 'navigate' }), origin)).toBe('network');
  });

  it('leaves writes, other sites, the worker itself and range requests to the network', () => {
    expect(strategyFor(request('/', { method: 'POST' }), origin)).toBe('network');
    expect(strategyFor(request('https://cdn.example.net/logo.png'), origin)).toBe('network');
    expect(strategyFor(request('/sw.js'), origin)).toBe('network');
    expect(strategyFor(request('/club-photo.jpg', { range: true }), origin)).toBe('network');
  });

  it('opens every page from the network first, then from the app shell', () => {
    expect(strategyFor(request('/', { mode: 'navigate' }), origin)).toBe('page');
    expect(strategyFor(request('/profil', { mode: 'navigate' }), origin)).toBe('page');
  });

  it('reads build files from their copy, and other files from the network first', () => {
    expect(strategyFor(request('/assets/index-EYUFTj7Q.js'), origin)).toBe('immutable');
    expect(strategyFor(request('/apiary.png'), origin)).toBe('fresh');
    expect(strategyFor(request('/manifest.webmanifest'), origin)).toBe('fresh');
  });
});
