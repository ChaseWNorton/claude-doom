import test from 'node:test';
import assert from 'node:assert/strict';
import { startBridge } from '../scripts/bridge.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  for (let i = 0; i < 120; i++) { if (check()) return; await wait(50); }
  assert.fail(message);
}

test('original engine boots, moves, turns, fires, pauses, restarts and cleans up', async t => {
  const bridge = await startBridge(); t.after(() => bridge.close());
  const headers = { Authorization: `Bearer ${bridge.token}` };
  const api = (endpoint, body) => fetch(bridge.url + endpoint, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  await until(() => bridge.game.state?.screen === 0 && bridge.game.state?.ammo === 50 && bridge.game.state?.tick > 25, 'Freedoom did not enter the first level');
  assert.equal(bridge.game.alive, true);
  assert.equal((await fetch(bridge.url + '/frame')).status, 403);
  assert.equal((await fetch(bridge.url + '/pause', { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await api('/input', { keys: 'bad' })).status, 400);
  const original = { ...bridge.game.state };
  await api('/input', { keys: [{ key: 'w', action: 'down' }] });
  await until(() => bridge.game.state.x !== original.x || bridge.game.state.y !== original.y, 'Player did not move');
  const angle = bridge.game.state.angle;
  await api('/input', { keys: [{ key: 'right', action: 'down' }] });
  await until(() => bridge.game.state.angle !== angle, 'Player did not turn');
  await api('/input', { keys: [{ key: 'space', action: 'down' }] });
  await api('/input', { keys: [{ key: 'space', action: 'up' }] });
  await until(() => bridge.game.state.ammo < 50, 'Firing did not consume ammunition');
  await api('/release', {});
  assert.equal(bridge.game.held.size, 0);
  const frame = await (await api('/frame?columns=96&rows=36')).json();
  const cells = Buffer.from(frame.cells, 'base64');
  assert.equal(cells.length, 96 * 36 * 12);
  assert.equal(cells.readUInt32LE(0), 0x2580);
  const colors = new Set(); for (let i = 4; i < cells.length; i += 12) colors.add(cells.readUInt32LE(i));
  assert.ok(colors.size > 20, 'Expected an actual multi-color game frame');
  const image = Buffer.from(await (await api('/frame.png')).arrayBuffer());
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  const huge = await (await api('/frame?columns=100000&rows=100000')).json();
  assert.ok(huge.cells.length < 100000, 'Frames must fit the mod UI message bound');
  await api('/pause', {}); await wait(100);
  const sequence = bridge.game.sequence; await wait(180);
  assert.equal(bridge.game.sequence, sequence, 'Pause must actually suspend the game');
  await api('/pause', {});
  await until(() => bridge.game.sequence > sequence, 'Resume did not resume frames');
  const oldPid = bridge.game.child.pid;
  await api('/restart', {});
  await until(() => bridge.game.state?.ammo === 50, 'Restart did not reset game');
  assert.notEqual(bridge.game.child.pid, oldPid);
  assert.throws(() => process.kill(oldPid, 0), /ESRCH/);
  const pid = bridge.game.child.pid;
  await bridge.close();
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
});

test('abandoned game bridge exits on idle timeout', async () => {
  const bridge = await startBridge({ idleMs: 180 });
  await until(() => !bridge.game.alive, 'Idle game stayed alive');
  await bridge.close();
});
