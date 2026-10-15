export const buttons = ['B', 'A', 'Y', 'X', 'L', 'R', 'Z', 'Z', null, 'START', null, null, 'D_UP', 'D_DOWN', 'D_LEFT', 'D_RIGHT'];
export function gamepadInput(pad) {
  if (!pad || !pad.connected || pad.mapping !== 'standard') return {buttons: [], stick: [0, 0], cstick: [0, 0]};
  const held = buttons.filter((name, i) => name && pad.buttons[i]?.pressed);
  const axis = (value) => Number.isFinite(value) ? Math.abs(value) < .18 ? 0 : Math.max(-1, Math.min(1, value)) : 0;
  return {buttons: [...new Set(held)], stick: [axis(pad.axes[0]), -axis(pad.axes[1])], cstick: [axis(pad.axes[2]), -axis(pad.axes[3])]};
}
export const keys = {KeyX: 'A', KeyZ: 'B', KeyS: 'X', KeyA: 'Y', Enter: 'START', KeyQ: 'L', KeyE: 'R', KeyC: 'Z', ArrowUp: 'D_UP', ArrowDown: 'D_DOWN', ArrowLeft: 'D_LEFT', ArrowRight: 'D_RIGHT', KeyI: 'PAD_UP', KeyK: 'PAD_DOWN', KeyJ: 'PAD_LEFT', KeyL: 'PAD_RIGHT'};
export function forGame(game, input) {
  const held = new Set(input.buttons);
  if (game === 'kirby64-vc') {
    if (input.stick[0] > .4) held.add('D_RIGHT');
    if (input.stick[0] < -.4) held.add('D_LEFT');
    if (input.stick[1] > .4) held.add('D_UP');
    if (input.stick[1] < -.4) held.add('D_DOWN');
  }
  return {...input, buttons: [...held]};
}
