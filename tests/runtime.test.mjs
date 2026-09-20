import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enginePath } from '../scripts/runtime.mjs';

test('release rejects an incompatible platform and a modified engine', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'doom-runtime-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => enginePath({ root, platform: 'win32', arch: 'x64' }), /No Doom engine for win32-x64/);
  mkdirSync(path.join(root, 'build'));
  const binary = enginePath();
  cpSync(binary, path.join(root, 'build/doom-claude'));
  cpSync(path.join(path.dirname(binary), 'engine.json'), path.join(root, 'build/engine.json'));
  assert.throws(() => enginePath({ root, platform: 'win32', arch: 'x64' }), /This engine is for/);
  writeFileSync(path.join(root, 'build/doom-claude'), Buffer.concat([readFileSync(binary), Buffer.from('modified')]));
  assert.throws(() => enginePath({ root }), /checksum mismatch/);
});
