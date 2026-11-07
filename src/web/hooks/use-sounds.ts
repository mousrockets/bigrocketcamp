import { useSyncExternalStore } from 'react';

// Sounds are a choice of this device, not of the member: kept in the browser, on by default. The former board kept
// the same choice under the same key, so it carries over.

const key = 'rl-sound';
const listeners = new Set<() => void>();
/** Private windows and some embedded browsers refuse storage: the choice then lasts for the visit only. */
let unsaved: boolean | null = null;

function readSounds(): boolean {
  if (unsaved !== null) return unsaved;
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the app changed it.
  addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    removeEventListener('storage', listener);
  };
}

export function setSounds(on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
    unsaved = null;
  } catch {
    unsaved = on;
  }
  for (const listener of listeners) listener();
}

/** Whether this device plays the celebration sounds, and how to change it. */
export function useSounds(): [on: boolean, setOn: (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, readSounds, () => true), setSounds];
}
