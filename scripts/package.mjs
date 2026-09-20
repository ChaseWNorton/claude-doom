// SPDX-License-Identifier: GPL-2.0-or-later
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, enginePath, sha256 } from './runtime.mjs';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Build this alpha on Mac Apple Silicon.');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const plugin = JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
if (pkg.version !== plugin.version) throw new Error('Package and plugin versions must match.');
const target = 'darwin-arm64';
const name = `claude-doom-v${pkg.version}-${target}`;
const dist = path.join(ROOT, 'dist');
const staging = mkdtempSync(path.join(tmpdir(), 'doom-package-'));
const bundle = path.join(staging, 'claude-doom');
const binary = enginePath();
mkdirSync(bundle);
mkdirSync(dist, { recursive: true });
try {
  for (const entry of ['.claude-plugin/plugin.json', 'hooks', 'scripts', 'tests', 'native/doomgeneric_claude.c', 'vendor', 'assets', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'PRODUCT.md', 'DESIGN.md', 'package.json', 'tsconfig.json', 'docs']) {
    if (!existsSync(path.join(ROOT, entry))) throw new Error(`Missing release file: ${entry}`);
    mkdirSync(path.dirname(path.join(bundle, entry)), { recursive: true });
    cpSync(path.join(ROOT, entry), path.join(bundle, entry), { recursive: true });
  }
  const native = path.join(bundle, 'native', target);
  mkdirSync(native, { recursive: true });
  cpSync(binary, path.join(native, 'doom-claude'));
  cpSync(path.join(path.dirname(binary), 'engine.json'), path.join(native, 'engine.json'));
  const files = [];
  function inventory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) inventory(full);
      else if (entry.isFile()) files.push(`${sha256(readFileSync(full))}  ${path.relative(bundle, full)}`);
      else throw new Error(`Only regular files and directories may ship: ${full}`);
    }
  }
  inventory(bundle);
  writeFileSync(path.join(bundle, 'SHA256SUMS'), files.join('\n') + '\n');
  const archive = path.join(dist, `${name}.zip`);
  rmSync(archive, { force: true });
  const result = spawnSync('zip', ['-q', '-r', '-X', archive, 'claude-doom'], { cwd: staging, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Creating the release ZIP failed.');
  writeFileSync(path.join(dist, `${name}.zip.sha256`), `${sha256(readFileSync(archive))}  ${path.basename(archive)}\n`);
  console.log(`Packaged ${archive}\n${files.length} files; source, engine, assets, and licenses included.`);
} finally { rmSync(staging, { recursive: true, force: true }); }
