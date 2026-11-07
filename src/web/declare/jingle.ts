// The celebration's jingle, generated in the browser: no audio file to host or license. A series plays three rising
// notes, a cleared debt five.

const notes = {
  series: [659.25, 783.99, 1046.5],
  cleared: [523.25, 659.25, 783.99, 1046.5, 1318.5],
};

export function playJingle(kind: keyof typeof notes): void {
  try {
    const Context =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const gap = 0.09;
    notes[kind].forEach((frequency, index) => {
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
    setTimeout(() => void context.close(), 2000);
  } catch {
    // Sound is a bonus: a blocked audio context must not spoil the celebration.
  }
}
