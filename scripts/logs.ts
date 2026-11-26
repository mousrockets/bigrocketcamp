// `npm run logs`: follows what `npm run dev` prints, from another terminal, as `tail -f` would on every system.
import { existsSync, openSync, readFileSync, readSync, statSync, watchFile } from 'node:fs';
import { devLogFile, nextOffset, tailStart } from './dev-log.ts';

if (!existsSync(devLogFile)) {
  console.error(`Rien à suivre : lance d'abord le serveur de dev (npm run dev), qui écrit ${devLogFile}.`);
  process.exit(1);
}
const text = readFileSync(devLogFile, 'utf8');
process.stdout.write(text.slice(tailStart(text, 50)));
let offset = Buffer.byteLength(text);

watchFile(devLogFile, { interval: 250 }, ({ size }) => {
  offset = nextOffset(size, offset);
  if (size <= offset) return;
  const chunk = Buffer.alloc(size - offset);
  const file = openSync(devLogFile, 'r');
  readSync(file, chunk, 0, chunk.length, offset);
  offset = size;
  process.stdout.write(chunk);
});
