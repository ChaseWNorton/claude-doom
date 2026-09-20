// SPDX-License-Identifier: GPL-2.0-or-later
import type { EngineInterface, Register, Timer } from 'claude-code';

type Bridge = { url: string; token: string };
type Frame = { sequence: number; columns: number; rows: number; cells: string; alive: boolean; paused: boolean; error?: string };

type State = {
  bridge?: Bridge; frame?: Frame; timer?: Timer;
  opened: boolean; busy: boolean; launching: boolean;
  columns: number; rows: number; error: string;
};

async function request($: EngineInterface, state: State, endpoint: string, body?: object) {
  if (!state.bridge) throw new Error('Doom is not running. Run /doom to start it.');
  const result = await $.http.fetch(state.bridge.url + endpoint, {
    headers: { Authorization: `Bearer ${state.bridge.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  if (!result.ok) throw new Error(`Doom bridge returned ${result.status}. Try /doom restart.`);
  return result.text;
}

async function stop($: EngineInterface, state: State) {
  state.opened = false; state.timer?.cancel(); state.timer = undefined;
  if (state.bridge) await request($, state, '/stop', {}).catch(() => {});
  state.bridge = undefined; state.frame = undefined;
}

async function poll($: EngineInterface, state: State) {
  if (!state.opened || !state.bridge || state.busy) return;
  state.busy = true;
  try {
    const next = JSON.parse(await request($, state, `/frame?columns=${state.columns}&rows=${state.rows}`)) as Frame;
    if (!state.opened) return;
    if (!next.alive) throw new Error(next.error || 'The Doom engine stopped. Run /doom restart.');
    const resize = !state.frame || state.frame.columns !== next.columns || state.frame.rows !== next.rows;
    const changed = !state.frame || state.frame.sequence !== next.sequence;
    state.frame = next;
    if (resize) $.ui.invalidate('ui.render');
    else if (changed) await $.ui.blit({ requestId: 'doom', key: 'screen', cells: next.cells });
  } catch (cause) {
    state.error = cause instanceof Error ? cause.message : String(cause);
    state.timer?.cancel(); state.timer = undefined; $.ui.invalidate('ui.render');
  } finally { state.busy = false; }
}

async function launch($: EngineInterface, state: State) {
  if (state.launching) return;
  state.launching = true; state.error = '';
  try {
    if (!state.bridge) {
      const result = await $.process.run(['node', `${$.plugin.root}/scripts/bridge.mjs`, 'start'], { cwd: $.plugin.root, timeoutMs: 12000 });
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || 'Run npm run build in the Doom mod directory.');
      const started = JSON.parse(result.stdout.trim()) as Bridge;
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(started.url) || !/^[a-f0-9]{48}$/.test(started.token)) throw new Error('Invalid local game address.');
      state.bridge = started;
    }
    state.opened = true;
    await poll($, state);
    await $.ui.open({ id: 'doom', title: 'DOOM · Freedoom', focus: true, rows: 39, columns: 110 });
    state.timer?.cancel(); state.timer = $.clock.every(50, () => poll($, state));
  } finally { state.launching = false; }
}

async function action($: EngineInterface, state: State, kind: string) {
  if (kind === 'close') { await stop($, state); await $.ui.close({ id: 'doom' }); return; }
  if (kind === 'restart') { await stop($, state); await launch($, state); $.ui.invalidate('ui.render'); return; }
  if (kind === 'pause') {
    const result = JSON.parse(await request($, state, '/pause', {})) as { paused: boolean };
    if (state.frame) state.frame.paused = result.paused;
    $.ui.invalidate('ui.render');
  }
}

export const register: Register = on => {
  const state: State = { opened: false, busy: false, launching: false, columns: 96, rows: 32, error: '' };
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'doom', description: 'Play the original Doom engine with Freedoom', argumentHint: '[pause|restart|close]', immediate: true });
    return next(e);
  });

  on('command.run', { command: 'doom' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase();
    try {
      if (['close', 'pause', 'restart'].includes(arg)) await action($, state, arg);
      else if (arg) return { text: 'Usage: /doom [pause|restart|close]' };
      else await launch($, state);
      return {};
    } catch (cause) {
      await stop($, state);
      return { text: `Doom: ${cause instanceof Error ? cause.message : String(cause)}` };
    }
  });

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== 'doom') return next(e);
    if (e.surface !== 'terminal') return $.ui.resolve(e).Text({ children: 'Run /doom in the Claude Code terminal. This adapter renders terminal pixels.' });
    const { Box, Text, Button, Client, Raster } = $.ui.resolve(e);
    // Inline body's measured height follows its content; using that during
    // loading collapses the first frame. Reserve space from the viewport.
    const paneRows = e.props.placement === 'dock' ? e.props.scroll.bodyRows : Math.min(39, (e.viewport?.rows ?? 55) - 12);
    const availableRows = Math.max(8, paneRows - 5);
    state.columns = Math.max(24, Math.min(140, e.props.bodyColumns || 96, Math.floor(availableRows / 0.375)));
    state.rows = Math.max(8, Math.min(availableRows, Math.floor(state.columns * 0.375), Math.floor(5600 / state.columns)));
    return Box({ flexDirection: 'column', children: [
      Text({ children: state.frame?.paused ? 'DOOM / FREEDOOM — PAUSED' : 'DOOM / FREEDOOM · local · no model calls', bold: true, color: '#efab62' }),
      state.error ? Text({ children: state.error, color: '#ff7d71' }) : state.frame && state.frame.columns === state.columns && state.frame.rows === state.rows
        ? Raster({ key: 'screen', columns: state.columns, rows: state.rows, cells: state.frame.cells })
        : Box({ height: state.rows, width: state.columns, children: Text({ children: 'Loading the game…' }) }),
      Client({ key: 'controls', module: './controls.ts', width: state.columns, height: 2 }),
      Box({ gap: 2, children: [
        Button({ key: 'pause', children: state.frame?.paused ? 'Resume' : 'Pause', onPress: () => action($, state, 'pause') }),
        Button({ key: 'restart', children: 'Restart game', onPress: () => action($, state, 'restart') }),
        Button({ key: 'close', children: 'Close game', onPress: () => action($, state, 'close') }),
        Text({ children: 'Esc → Claude', dimColor: true }),
      ] }),
    ] });
  });

  on('ui.message', async ($, e) => {
    if (!state.opened || e.element !== 'controls' || typeof e.data !== 'object' || !e.data) return {};
    const data = e.data as { action?: string; keys?: { key: string; action: string }[] };
    try {
      if (data.action === 'pause') await action($, state, 'pause');
      else if (data.keys) await request($, state, '/input', { keys: data.keys });
    } catch (cause) { state.error = String(cause); $.ui.invalidate('ui.render'); }
    return {};
  });

  on('ui.close', async ($, e, next) => { if (e.id === 'doom') await stop($, state); return next(e); });
  on('session.end', async ($, e, next) => { await stop($, state); return next(e); });
};
