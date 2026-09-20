import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, enginePath } from '../scripts/runtime.mjs';

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

test('installed CLI entry points launch through a symlinked directory', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'doom-symlink-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'plugin');
  symlinkSync(ROOT, root, 'dir');
  const run = script => spawnSync(process.execPath, [path.join(root, 'scripts', script), 'start'], {
    encoding: 'utf8', timeout: 15000,
  });
  const check = run('runtime.mjs');
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Ready:/, 'Runtime check must execute through a symlink');
  const started = run('bridge.mjs');
  assert.equal(started.status, 0, started.stderr);
  const bridge = JSON.parse(started.stdout);
  const headers = { Authorization: `Bearer ${bridge.token}` };
  t.after(async () => {
    await fetch(bridge.url + '/stop', { method: 'POST', headers, body: '{}' });
  });
  const response = await fetch(bridge.url + '/health', { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alive, true, 'Symlinked bridge must start the real engine');
});
