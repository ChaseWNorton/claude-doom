import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { sha256 } from './runtime.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'vendor/doomgeneric/doomgeneric');
const objects = readFileSync(path.join(source, 'Makefile'), 'utf8').match(/^SRC_DOOM = (.+)$/m)[1].split(' ');
const files = objects.filter(x => x !== 'doomgeneric_xlib.o').map(x => path.join(source, x.replace(/\.o$/, '.c')));
mkdirSync(path.join(root, 'build'), { recursive: true });
const env = { ...process.env };
if (process.platform === 'darwin' && existsSync('/Library/Developer/CommandLineTools')) env.DEVELOPER_DIR ??= '/Library/Developer/CommandLineTools';
const result = spawnSync(process.env.CC || 'cc', [
  '-O2', '-std=gnu11', '-DNORMALUNIX', '-DLINUX', '-D_DEFAULT_SOURCE',
  '-DDOOMGENERIC_RESX=320', '-DDOOMGENERIC_RESY=200',
  ...(process.platform === 'darwin' ? ['-mmacosx-version-min=14.0'] : []),
  '-Wno-deprecated-non-prototype', '-Wno-unused-result', '-I', source,
  ...files, path.join(root, 'native/doomgeneric_claude.c'), '-lm',
  '-o', path.join(root, 'build/doom-claude'),
], { env, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
writeFileSync(path.join(root, 'build/engine.json'), JSON.stringify({
  target: `${process.platform}-${process.arch}`,
  sha256: sha256(readFileSync(path.join(root, 'build/doom-claude'))),
  ...(process.platform === 'darwin' ? { minimumMacOS: '14.0' } : {}),
}, null, 2) + '\n');
console.log('Built build/doom-claude (320 × 200, native Doom engine).');
