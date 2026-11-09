import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// The server stores each match as its sources build it (src/lib/match-builds.ts), and builds it again only when a
// source reaches it. A change to that code would leave every older match built the old way: the code's fingerprint
// joins what the stored matches were built from, and a new one has every match built again.

const entry = 'src/lib/match-builds.ts';

/** A short name that changes with the code that builds a match, minified: a comment or a layout change keeps it. */
export async function matchBuildCode(): Promise<string> {
  const { outputFiles } = await build({
    entryPoints: [entry],
    bundle: true,
    packages: 'external',
    minify: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  const code = outputFiles[0]?.contents;
  if (!code) throw new Error(`${entry} built to nothing.`);
  return createHash('sha256').update(code).digest('hex').slice(0, 12);
}
