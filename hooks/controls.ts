// SPDX-License-Identifier: GPL-2.0-or-later
import type { ClientModule, JsonValue } from 'claude-code';

type State = { queue: { key: string; action: string }[]; pause: boolean };
const controls: ClientModule<JsonValue, State> = (_props, surface) => {
  const { Box, Text } = surface.elements;
  if (!surface.state) {
    const state: State = { queue: [], pause: false };
    surface.setState(state);
    surface.onKey(event => {
      if (event.ctrl || event.meta) return;
      const key = event.key.toLowerCase();
      if (key === 'p') state.pause = true;
      else if (['w','a','s','d','q','e','f',' ','space','up','down','left','right','return','enter','m','tab','map','backspace','1','2','3','4','5','6','7','y','n','-','='].includes(key)) {
        state.queue.push({ key, action: 'pulse' });
        if (state.queue.length > 32) state.queue.shift();
      }
      surface.setState(state);
    });
    surface.every(30, () => {
      if (state.pause) { surface.post({ action: 'pause' }); state.pause = false; }
      else if (state.queue.length) { surface.post({ keys: state.queue.splice(0) }); }
    });
  }
  return Box({ flexDirection: 'column', children: [
    Text({ children: 'CLICK HERE TO PLAY · W/S move · A/D turn · Q/E strafe · Space fire · F use', color: '#e8c79f', bold: true }),
    Text({ children: 'Arrows move/turn · 1–7 weapon · M menu · Enter select · Tab map · P pause', dimColor: true }),
  ] });
};
export default controls;
