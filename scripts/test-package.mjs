// SPDX-License-Identifier: GPL-2.0-or-later
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, sha256 } from './runtime.mjs';

const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const archive = process.argv[2] || path.join(ROOT, 'dist', `claude-doom-v${version}-darwin-arm64.zip`);
const staging = mkdtempSync(path.join(tmpdir(), 'doom-install-test-'));
try {
  const unpack = spawnSync('unzip', ['-q', archive, '-d', staging], { stdio: 'inherit' });
  assert.equal(unpack.status, 0);
  const bundle = path.join(staging, 'claude-doom');
  for (const line of readFileSync(path.join(bundle, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [expected, relative] = line.split('  ');
    assert.equal(sha256(readFileSync(path.join(bundle, relative))), expected, relative);
    assert.ok(!relative.includes('/Users/') && !relative.startsWith('.runtime/') && !relative.startsWith('artifacts/'));
  }
  assert.ok(statSync(path.join(bundle, 'scripts/play.sh')).mode & 0o111, 'Launcher must remain executable');
  const check = spawnSync('bash', ['scripts/play.sh', '--check'], { cwd: bundle, stdio: 'inherit' });
  assert.equal(check.status, 0, 'Extracted launcher check failed');
  const tests = readdirSync(path.join(bundle, 'tests')).filter(name => name.endsWith('.test.mjs')).map(name => path.join(bundle, 'tests', name));
  const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: bundle, stdio: 'inherit' });
  assert.equal(result.status, 0, 'Extracted release gameplay tests failed');
  console.log('PASS: extracted ZIP, checksums, executable permissions, launcher, native gameplay, cleanup');
} finally { rmSync(staging, { recursive: true, force: true }); }
