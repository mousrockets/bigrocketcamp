// `npm run dev`: Vite as usual, in colour and with its keyboard shortcuts, and everything it prints copied to
// .wrangler/dev.log, so that `npm run logs` can follow it from another terminal.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { devLogFile } from './dev-log.ts';

mkdirSync(dirname(devLogFile), { recursive: true });
const log = createWriteStream(devLogFile, { flags: 'w', mode: 0o600 });
// The keyboard stays Vite's; its output goes through here, and keeps its colours although it is no terminal.
const vite = spawn('vite', process.argv.slice(2), {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
  shell: process.platform === 'win32',
});
for (const [from, to] of [
  [vite.stdout, process.stdout],
  [vite.stderr, process.stderr],
] as const) {
  from.on('data', (chunk: Buffer) => {
    to.write(chunk);
    log.write(chunk);
  });
}
// Ctrl-C reaches Vite as well, which stops on its own: this one waits for it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => vite.kill(signal));
vite.on('exit', (code) => log.end(() => process.exit(code ?? 0)));
