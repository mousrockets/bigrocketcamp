// What `npm run dev` prints, kept in a file that `npm run logs` follows from another terminal (docs/base-locale.md).
// Under .wrangler, ignored by git: it holds the local sign-in codes.

export const devLogFile = '.wrangler/dev.log';

/** Where to read from next: the file was started over (a new `npm run dev`) when it got shorter than what was read. */
export const nextOffset = (size: number, offset: number): number => (size < offset ? 0 : offset);

/** Where to start following: the last `lines` lines of what the file already holds. */
export function tailStart(text: string, lines: number): number {
  let start = text.length;
  for (let found = 0; start > 0; ) {
    const newline = text.lastIndexOf('\n', start - 2);
    if (newline < 0) return 0;
    start = newline + 1;
    if (++found >= lines) return start;
  }
  return 0;
}
