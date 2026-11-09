import { useLocation } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { renderInApp } from '../test-utils';
import { SheetLink, useCloseSheet } from './sheet-link';

afterEach(() => vi.restoreAllMocks());

function Page() {
  const close = useCloseSheet();
  const { searchStr } = useLocation();
  return (
    <>
      <output aria-label="Adresse">{searchStr}</output>
      <SheetLink sheet="ranks">Les ranks</SheetLink>
      <button type="button" onClick={() => close('ranks')}>
        Fermer
      </button>
    </>
  );
}

/** The router's calls that took the window back to the top. */
const toTop = (calls: unknown[][]) => calls.filter(([options]) => (options as ScrollToOptions | undefined)?.top === 0);

test('opens and closes a sheet without taking the page back to the top', async () => {
  renderInApp(<Page />, { path: '/matchs' });
  const link = await screen.findByRole('link', { name: 'Les ranks' });
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

  await userEvent.click(link);
  await vi.waitFor(() => expect(screen.getByRole('status', { name: 'Adresse' })).toHaveTextContent('?ranks=true'));
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
  await vi.waitFor(() => expect(screen.getByRole('status', { name: 'Adresse' })).toBeEmptyDOMElement());

  expect(toTop(scrollTo.mock.calls)).toEqual([]);
});
