import { describe, test, expect, mock } from 'claude-code/testing';

describe('Doom mod', () => {
  test('opens a real Raster pane and forwards game input without model calls', async ($, on) => {
    const clock = mock.clock(on);
    const requests: { url: string; body?: string }[] = [];
    let registered = '', stopped = false, paused = false;
    on('session.start', ($, e) => ({ cwd: e.cwd }));
    on('command.register', ($, e) => { registered = e.name; return { value: { command: e.name } }; });
    on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ url: 'http://127.0.0.1:12345', token: 'a'.repeat(48) }), stderr: '' } }));
    on('http.fetch', ($, e) => {
      requests.push({ url: e.url, body: e.init?.body });
      if (e.url.endsWith('/pause')) paused = !paused;
      if (e.url.endsWith('/stop')) stopped = true;
      const query = e.url.split('?')[1] || '';
      const columns = Number(/columns=(\d+)/.exec(query)?.[1]) || 96;
      const rows = Number(/rows=(\d+)/.exec(query)?.[1]) || 32;
      const value = e.url.includes('/frame') ? { alive: true, sequence: requests.length, columns, rows, cells: 'gCUAAAD/fwAAAAAA'.repeat(columns * rows), paused } : { ok: true, paused };
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(value) } };
    });
    on('ui.open', () => ({ value: undefined }));
    on('ui.close', () => ({ value: undefined }));
    on('ui.blit', () => ({ value: {} }));
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
    expect(registered).toBe('doom');
    const answer = await $.command.run({ command: 'doom', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } });
    expect(answer.context).toBeUndefined();
    const ui = await $.ui.mount({ plugin: 'doom', surface: 'terminal', component: 'Pane', requestId: 'doom',
      props: { title: 'Doom', isFocused: true, bodyColumns: 96, placement: 'inline', scroll: { offset: 0, bodyRows: 5 }, view: {} },
      viewport: { columns: 120, rows: 50, isFullscreen: false } });
    await clock.advance(60); await clock.settle();
    expect(await ui.find({ key: 'screen' })).toBeDefined();
    await ui.key({ in: 'controls', key: 'w' });
    await ui.advance(40);
    expect(requests.some(r => r.url.endsWith('/input') && r.body?.includes('"key":"w"'))).toBe(true);
    await ui.press({ key: 'pause' });
    expect(paused).toBe(true);
    await ui.press({ key: 'close' });
    expect(stopped).toBe(true);
    await ui.unmount();
  });
});
