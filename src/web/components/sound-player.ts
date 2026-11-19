import type { SoundId } from '../../lib/sounds';

// The sound badges' files, in public/sounds: free sounds from Wikimedia Commons, credited in public/sounds/CREDITS.md.

/** A badge plays a short shout, never a whole recording. */
const maxMs = 6000;
/** An empty WAV: playing it during the tap lets the page play the drawn sound later. */
const silence = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export const soundUrl = (id: SoundId) => `/sounds/${id}.mp3`;

export interface SoundPlayer {
  /** Plays the sound; `onEnd` runs once it stops, by itself or cut short. */
  play: (id: SoundId, onEnd?: () => void) => void;
}

/**
 * A player made during the member's tap: phones only let a page play sound in answer to a tap, and the drawn sound
 * comes later, once the API answers.
 */
export function soundPlayer(): SoundPlayer {
  let audio: HTMLAudioElement | null = null;
  try {
    audio = new Audio(silence);
    void audio.play()?.catch(() => undefined);
  } catch {
    audio = null;
  }
  return {
    play(id, onEnd) {
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        onEnd?.();
      };
      if (!audio) return end();
      try {
        const playing = audio;
        playing.onended = end;
        playing.onerror = end;
        playing.src = soundUrl(id);
        void playing.play()?.catch(end);
        setTimeout(() => {
          playing.pause();
          end();
        }, maxMs);
      } catch {
        // Sound is a bonus: a refused player must not spoil the badge.
        end();
      }
    },
  };
}

export const playSound = (id: SoundId, onEnd?: () => void) => soundPlayer().play(id, onEnd);
