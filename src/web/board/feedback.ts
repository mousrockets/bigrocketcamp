// Sound, voice and vibration: a bonus that never breaks the page. The member turns them off in the profile.

export type JingleKind = 'cheer' | 'finish' | 'badge' | 'loss';

const soundKey = 'rl-sound';

export function soundOn(): boolean {
  try {
    return localStorage.getItem(soundKey) !== 'off';
  } catch {
    return true;
  }
}

export function setSound(on: boolean): void {
  try {
    localStorage.setItem(soundKey, on ? 'on' : 'off');
  } catch {
    // Private windows refuse storage: the sound stays on for the visit.
  }
}

// Generated in the browser: no audio files to host or license.
export function playJingle(kind: JingleKind): void {
  if (!soundOn()) return;
  try {
    const AudioContextType =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextType) return;
    const context = new AudioContextType();
    const notes =
      kind === 'loss'
        ? [392, 349.23, 311.13, 261.63]
        : kind === 'cheer'
          ? [659.25, 783.99, 1046.5]
          : [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const gap = kind === 'loss' ? 0.18 : 0.09;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * gap;
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + gap * 3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + gap * 3 + 0.02);
    });
    setTimeout(() => context.close(), 2000);
  } catch {
    // A blocked audio context must not break the celebration.
  }
}

export function speak(text: string, delayMs = 400): void {
  if (!soundOn() || typeof speechSynthesis === 'undefined') return;
  setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      utterance.rate = 1.05;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch {
      // The voice is optional.
    }
  }, delayMs);
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is optional and refused by some browsers.
  }
}
