// SPDX-License-Identifier: GPL-2.0-or-later
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { release } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLAUDE_VERSION = '2.1.278';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function enginePath({ root = ROOT, platform = process.platform, arch = process.arch } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Doom requires Node.js 22 or newer.');
  const target = `${platform}-${arch}`;
  const packaged = path.join(root, 'native', target, 'doom-claude');
  const binary = existsSync(packaged) ? packaged : path.join(root, 'build', 'doom-claude');
  const metadataPath = path.join(path.dirname(binary), 'engine.json');
  if (!existsSync(binary) || !existsSync(metadataPath)) {
    throw new Error(`No Doom engine for ${target}. The alpha release supports Mac Apple Silicon. Download its release ZIP, or run npm run build from source.`);
  }
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (metadata.target !== target) throw new Error(`This engine is for ${metadata.target}; this machine is ${target}. Download the matching release.`);
  if (platform === 'darwin' && Number(release().split('.')[0]) < 23) throw new Error('This alpha requires macOS 14 or newer.');
  if (sha256(readFileSync(binary)) !== metadata.sha256) throw new Error('Doom engine checksum mismatch. Download the release again or rebuild from source.');
  accessSync(binary, constants.X_OK);
  if (!existsSync(path.join(root, 'assets/freedoom1.wad'))) throw new Error('Freedoom assets are missing. Download the complete release ZIP.');
  return binary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Ready: ${process.platform}-${process.arch}, Node ${process.versions.node}\nEngine: ${enginePath()}\nTested Claude Code: ${CLAUDE_VERSION}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
