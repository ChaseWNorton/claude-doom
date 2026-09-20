// SPDX-License-Identifier: GPL-2.0-or-later
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ROOT, CLAUDE_VERSION, sha256 } from './runtime.mjs';
import path from 'node:path';

const commit = 'a92ea1cdb11ad21f9d583fad2db181dfdac918a6';
const url = `https://raw.githubusercontent.com/anthropics/claude-code/${commit}/mods/types/claude-code.d.ts`;
const response = await fetch(url);
if (!response.ok) throw new Error(`Cannot download the upstream API types: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (sha256(bytes) !== 'ac107a37c08ad46f8632edc1639b13a740fae0b8249a2245532adfd325e57d0d') throw new Error('Upstream API types checksum mismatch');
mkdirSync(path.join(ROOT, 'types'), { recursive: true });
writeFileSync(path.join(ROOT, 'types/claude-code.d.ts'), bytes);
const result = spawnSync('npm', ['install', '--prefix', '.runtime', '--no-audit', '--no-fund', `@anthropic-ai/claude-code@${CLAUDE_VERSION}`, 'typescript@5.9.3'], { cwd: ROOT, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
