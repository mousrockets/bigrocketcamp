import { z } from '../validation';

// The answers are loose objects: a field a newer API adds is kept as it comes, so that an older app copying an
// answer (the board it keeps in the browser) loses nothing. A field added later is optional, or has a fallback.

/**
 * An answer as this version of the app knows it: the fields a newer API adds stay in the data, not in the type,
 * so that a misspelt field is still a type error. The API's answers must satisfy it.
 */
export type Known<T> = T extends readonly unknown[]
  ? { [Index in keyof T]: Known<T[Index]> }
  : T extends object
    ? { [Key in keyof T as string extends Key ? never : Key]: Known<T[Key]> }
    : T;

/** What the API answers to a refused request: a French message, shown as it comes. */
export const apiError = z.looseObject({ error: z.string() });
export type ApiErrorBody = Known<z.output<typeof apiError>>;

/** A write that answers only that it was done. */
export const done = z.looseObject({ ok: z.boolean() });
export type Done = Known<z.output<typeof done>>;
