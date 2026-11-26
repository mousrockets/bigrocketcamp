import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { setViewportWidth } from '../test-utils';
import { useStickyTop } from './use-sticky-top';

// A sticky column on a computer window of 1440 × 900: its whole height must stay within reach.

function Column() {
  const { ref, top } = useStickyTop(24);
  return (
    <div ref={ref} data-testid="column">
      top {top}
    </div>
  );
}

const withHeight = (height: number) => vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);

afterEach(() => {
  vi.restoreAllMocks();
  setViewportWidth(1024);
});

test('a column that fits in the window stays just below its top', () => {
  setViewportWidth(1440);
  withHeight(500);
  render(<Column />);
  expect(screen.getByTestId('column')).toHaveTextContent('top 24');
});

test('a column taller than the window scrolls until its bottom shows, then stays', () => {
  setViewportWidth(1440);
  withHeight(1200);
  render(<Column />);
  // 900 − 1 200 − 24: its bottom stops 24 px above the window's.
  expect(screen.getByTestId('column')).toHaveTextContent('top -324');
});
