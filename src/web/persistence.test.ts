import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { boardChanges } from '../lib/contract';
import { keptShape, persistOptions } from './persistence';

describe('the board kept in the browser', () => {
  test('is dropped once the API sends a field it did not have, and read again in full', () => {
    const withNewField = boardChanges.extend({ newField: z.string().nullable().catch(null) });
    expect(keptShape(withNewField)).not.toBe(keptShape(boardChanges));
  });

  test('is kept under the shape of the board the API sends', () => {
    expect(persistOptions.buster).toBe(keptShape(boardChanges));
  });
});
