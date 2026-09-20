// SPDX-License-Identifier: GPL-2.0-or-later
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { enginePath } from './runtime.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIXELS = 320 * 200 * 4;
const PACKET = PIXELS + 40;
const KEYS = { w: 0xad, up: 0xad, s: 0xaf, down: 0xaf, a: 0xac, left: 0xac,
  d: 0xae, right: 0xae, q: 0xa0, e: 0xa1, f: 0xa2, ' ': 0xa3, space: 0xa3,
  return: 13, enter: 13, m: 27, tab: 9, map: 9, backspace: 127,
  '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55,
  y: 121, n: 110, '-': 45, '=': 61 };

export class DoomGame {
  constructor(directory) {
    this.sequence = 0; this.frame = null; this.state = null;
    this.held = new Map(); this.pressedAt = new Map(); this.paused = false; this.alive = true; this.log = '';
    mkdirSync(path.join(directory, 'saves'), { recursive: true });
    this.child = spawn(enginePath(), [
      '-iwad', path.join(ROOT, 'assets/freedoom1.wad'), '-nosound',
      '-config', path.join(directory, 'default.cfg'),
      '-extraconfig', path.join(directory, 'extra.cfg'),
      '-savedir', path.join(directory, 'saves'), '-skill', '3', '-warp', '1', '1',
    ], { cwd: directory, env: { PATH: process.env.PATH }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    let pending = Buffer.alloc(0);
    this.child.stdio[3].on('data', chunk => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= PACKET) {
        if (pending.readUInt32LE(0) !== 0x444f4f4d) { this.stop(); return; }
        this.sequence = pending.readUInt32LE(4);
        this.state = { x: pending.readInt32LE(8), y: pending.readInt32LE(12),
          angle: pending.readUInt32LE(16), health: pending.readInt32LE(20),
          ammo: pending.readInt32LE(24), tick: pending.readUInt32LE(28),
          screen: pending.readUInt32LE(32) };
        this.frame = Buffer.from(pending.subarray(40, PACKET));
        pending = pending.subarray(PACKET);
      }
    });
    const log = bytes => { this.log = (this.log + bytes.toString()).slice(-6000); };
    this.child.stdout.on('data', log); this.child.stderr.on('data', log);
    this.child.stdin.on('error', () => {});
    this.child.on('error', error => { this.alive = false; this.log += error.message; });
    this.exited = new Promise(resolve => this.child.on('close', code => {
      this.alive = false;
      for (const timer of this.held.values()) clearTimeout(timer);
      this.held.clear(); resolve(code);
    }));
  }
  key(name, action = 'pulse') {
    const key = KEYS[name.toLowerCase()];
    if (key === undefined || !this.alive || this.paused) return false;
    if (!['pulse', 'down', 'up'].includes(action)) return false;
    clearTimeout(this.held.get(key));
    if (action === 'up') {
      if (!this.held.has(key)) return true;
      const delay = Math.max(0, 65 - (Date.now() - this.pressedAt.get(key)));
      this.held.set(key, setTimeout(() => {
        if (this.alive) this.child.stdin.write(Buffer.from([0, key]));
        this.held.delete(key); this.pressedAt.delete(key);
      }, delay));
      return true;
    }
    if (!this.held.has(key)) {
      this.child.stdin.write(Buffer.from([1, key])); this.pressedAt.set(key, Date.now());
    }
    // A lost focus/key-up can never leave movement stuck indefinitely.
    const timer = setTimeout(() => {
      if (this.alive) this.child.stdin.write(Buffer.from([0, key]));
      this.held.delete(key); this.pressedAt.delete(key);
    }, action === 'down' ? 350 : 160);
    this.held.set(key, timer); return true;
  }
  release() {
    for (const [key, timer] of this.held) {
      clearTimeout(timer);
      if (this.alive) this.child.stdin.write(Buffer.from([0, key]));
    }
    this.held.clear(); this.pressedAt.clear();
  }
  pause(value = !this.paused) {
    if (!this.alive || value === this.paused) return;
    this.release(); this.child.kill(value ? 'SIGSTOP' : 'SIGCONT'); this.paused = value;
  }
  stop() {
    this.release();
    if (this.alive) {
      if (this.paused) this.child.kill('SIGCONT');
      this.child.kill('SIGTERM');
      const force = setTimeout(() => { if (this.alive) this.child.kill('SIGKILL'); }, 500);
      force.unref();
    }
    return this.exited;
  }
  raster(columns, rows) {
    const cells = Buffer.alloc(columns * rows * 12);
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const sx = Math.min(319, Math.floor((x + 0.5) * 320 / columns));
      const sy = Math.min(199, Math.floor((y * 2 + 0.5) * 200 / (rows * 2)));
      const by = Math.min(199, Math.floor((y * 2 + 1.5) * 200 / (rows * 2)));
      const at = (y * columns + x) * 12;
      cells.writeUInt32LE(0x2580, at);
      cells.writeUInt32LE(this.frame ? this.frame.readUInt32LE((sy * 320 + sx) * 4) & 0xffffff : 0, at + 4);
      cells.writeUInt32LE(this.frame ? this.frame.readUInt32LE((by * 320 + sx) * 4) & 0xffffff : 0, at + 8);
    }
    return cells.toString('base64');
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, bytes) {
  const payload = Buffer.concat([Buffer.from(type), bytes]);
  const head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc32(payload));
  return Buffer.concat([head, payload, tail]);
}
export function png(frame) {
  const rows = Buffer.alloc(200 * (320 * 3 + 1));
  for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) {
    const from = (y * 320 + x) * 4, to = y * 961 + 1 + x * 3;
    rows[to] = frame[from + 2]; rows[to + 1] = frame[from + 1]; rows[to + 2] = frame[from];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(320); ihdr.writeUInt32BE(200, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))]);
}

export async function startBridge({ directory = mkdtempSync(path.join(tmpdir(), 'claude-doom-')), idleMs = 60000 } = {}) {
  let game = new DoomGame(directory), seen = Date.now(), closed = false;
  const token = randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (url.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'" });
      res.end(readFileSync(path.join(ROOT, 'scripts/preview.html'))); return;
    }
    if (req.headers.authorization !== `Bearer ${token}`) return json(403, { error: 'Invalid game token' });
    if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${server.address().port}`) return json(403, { error: 'Wrong origin' });
    seen = Date.now();
    if (req.method === 'GET' && url.pathname === '/health') return json(200, { alive: game.alive, sequence: game.sequence, paused: game.paused, state: game.state, ...(!game.alive ? { error: game.log } : {}) });
    if (req.method === 'GET' && url.pathname === '/frame') {
      const columns = Math.max(24, Math.min(140, Math.floor(Number(url.searchParams.get('columns')) || 96)));
      const rows = Math.max(8, Math.min(Math.floor(5600 / columns), 60, Math.floor(Number(url.searchParams.get('rows')) || 30)));
      return json(200, { alive: game.alive, sequence: game.sequence, paused: game.paused, columns, rows, cells: game.raster(columns, rows), ...(!game.alive ? { error: game.log } : {}) });
    }
    if (req.method === 'GET' && url.pathname === '/frame.png') {
      if (!game.frame) return json(503, { error: 'Game starting' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(png(game.frame)); return;
    }
    if (req.method !== 'POST') return json(404, { error: 'Unknown game endpoint' });
    let body = '';
    try {
      for await (const chunk of req) { body += chunk; if (body.length > 8192) return json(413, { error: 'Input too large' }); }
      const data = body ? JSON.parse(body) : {};
      if (url.pathname === '/input') {
        if (!Array.isArray(data.keys) || data.keys.length > 32) return json(400, { error: 'Expected up to 32 keys' });
        for (const k of data.keys) if (typeof k.key === 'string') game.key(k.key, k.action || 'pulse');
      } else if (url.pathname === '/release') game.release();
      else if (url.pathname === '/pause') game.pause();
      else if (url.pathname === '/restart') { await game.stop(); if (!closed) game = new DoomGame(directory); }
      else if (url.pathname === '/stop') { json(200, { ok: true }); void close(); return; }
      else return json(404, { error: 'Unknown game endpoint' });
      json(200, { ok: true, paused: game.paused });
    } catch (error) { json(400, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const interval = setInterval(() => { if (Date.now() - seen > idleMs) void close(); }, Math.min(5000, idleMs));
  async function close() {
    if (closed) return; closed = true; clearInterval(interval);
    server.close(); server.closeAllConnections(); await game.stop();
    rmSync(directory, { recursive: true, force: true });
  }
  return { url: `http://127.0.0.1:${server.address().port}`, token, close, directory, get game() { return game; } };
}

async function main() {
  enginePath(); // Fail before creating temporary files or starting a detached bridge.
  if (process.argv[2] === 'start') {
    const directory = mkdtempSync(path.join(tmpdir(), 'claude-doom-'));
    const bootstrap = path.join(directory, 'ready.json');
    const log = openSync(path.join(directory, 'bridge.log'), 'a', 0o600);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', directory], { detached: true, stdio: ['ignore', log, log] });
    child.unref(); closeSync(log);
    for (let i = 0; i < 160; i++) {
      try { console.log(readFileSync(bootstrap, 'utf8')); return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    try { process.kill(child.pid, 'SIGTERM'); } catch {}
    throw new Error('Doom did not start. Run npm run build and check build/doom-claude.');
  }
  const directory = process.argv[2] === 'serve' ? process.argv[3] : undefined;
  const bridge = await startBridge({ directory });
  const onExit = () => { void bridge.close(); };
  process.on('SIGTERM', onExit); process.on('SIGINT', onExit);
  if (directory) writeFileSync(path.join(directory, 'ready.json'), JSON.stringify({ url: bridge.url, token: bridge.token }), { mode: 0o600 });
  else console.log(`Doom preview: ${bridge.url}/#${bridge.token}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
