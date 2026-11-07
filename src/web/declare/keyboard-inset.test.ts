import { describe, expect, it } from 'vitest';
import { keyboardInsetOf } from './keyboard-inset';

describe('keyboardInsetOf', () => {
  it('sees no keyboard when the whole page is visible', () => {
    expect(keyboardInsetOf({ innerHeight: 800, height: 800, offsetTop: 0, scale: 1 })).toBeNull();
  });

  it('measures the keyboard under the visible part', () => {
    expect(keyboardInsetOf({ innerHeight: 800, height: 460, offsetTop: 0, scale: 1 })).toEqual({
      bottom: 340,
      height: 460,
    });
  });

  it('accounts for a page the browser scrolled to show the field', () => {
    expect(keyboardInsetOf({ innerHeight: 800, height: 460, offsetTop: 120, scale: 1 })).toEqual({
      bottom: 220,
      height: 460,
    });
  });

  it('keeps the keyboard when the page scrolled it all the way down', () => {
    expect(keyboardInsetOf({ innerHeight: 800, height: 460, offsetTop: 360, scale: 1 })).toEqual({
      bottom: 0,
      height: 460,
    });
  });

  it('ignores a small gap left by a browser bar', () => {
    expect(keyboardInsetOf({ innerHeight: 800, height: 744, offsetTop: 0, scale: 1 })).toBeNull();
  });

  it('ignores a pinch zoom', () => {
    expect(keyboardInsetOf({ innerHeight: 800, height: 400, offsetTop: 0, scale: 2 })).toBeNull();
  });
});
