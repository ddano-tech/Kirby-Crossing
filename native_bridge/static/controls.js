import {gamepadInput, keys, forGame} from './mapping.js';
import {setAudioGame, toggleAudio} from './audio.js';
const client = crypto.randomUUID();
const held = new Set();
let game = 'animal-crossing', enabled = false, busy = false, switchHeld = false;
let revision;
let browserKirby = false, kirbyReady = false, kirbyError = '', soundEnabled = false;
const kirbyFrame = document.querySelector('#kirby');
const neutral = {buttons: [], stick: [0, 0], cstick: [0, 0]};
function syncKirby(input = neutral) {
  if (!browserKirby) return;
  const activeKirby = game === 'kirby64-vc';
  kirbyFrame.style.opacity = activeKirby ? '1' : '0';
  document.querySelector('#screen').style.opacity = activeKirby ? '0' : '1';
  const adapter = kirbyFrame.contentWindow?.kirbyBridge;
  adapter?.active(activeKirby, soundEnabled);
  adapter?.input(activeKirby ? input : neutral);
}
fetch('/api/state').then(r => r.json()).then(state => {
  browserKirby = !!state.browserKirby;
  if (browserKirby) { reset(); enable.disabled = true; kirbyFrame.src = '/n64/'; syncKirby(); }
}).catch(() => {});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== kirbyFrame.contentWindow) return;
  if (event.data.type === 'kirby-ready') { kirbyReady = true; kirbyError = ''; enable.disabled = false; syncKirby(); }
  if (event.data.type === 'kirby-error') {
    kirbyError = `Kirby 64 could not load: ${event.data.message}. Reload the page to retry.`;
    enable.disabled = false;
    choose('animal-crossing');
    syncKirby();
    status.textContent = kirbyError;
  }
});
let previousPad = {buttons: [], stick: [0, 0], cstick: [0, 0]}, blocked = new Set(), blockStick = false, blockC = false;
const status = document.querySelector('#status');
const active = document.querySelector('#active');
const enable = document.querySelector('#enable');
const select = document.querySelector('#game');
setAudioGame(game);
document.querySelector('#sound').onclick = async () => {
  try { soundEnabled = await toggleAudio(); document.querySelector('#sound').textContent = soundEnabled ? 'Mute sound' : 'Enable sound'; syncKirby(); document.querySelector('#sound').blur(); }
  catch { status.textContent = 'Browser audio is unavailable'; }
};
function reset() { held.clear(); enabled = false; enable.textContent = 'Enable controls'; syncKirby(); }
function choose(value) { held.clear(); blocked = new Set(previousPad.buttons); blockStick = previousPad.stick.some(v => v !== 0); blockC = previousPad.cstick.some(v => v !== 0); game = kirbyError ? 'animal-crossing' : value; setAudioGame(game); select.value = game; active.textContent = game === 'animal-crossing' ? 'Animal Crossing' : 'Kirby 64'; }
enable.onclick = () => { enabled = !enabled; held.clear(); enable.textContent = enabled ? 'Pause controls' : 'Enable controls'; enable.blur(); };
select.onchange = () => { choose(select.value); select.blur(); };
document.querySelector('#return').onclick = () => { choose('animal-crossing'); document.querySelector('#return').blur(); };
window.addEventListener('keydown', event => {
  if (!enabled || event.target.matches('select, button, input')) return;
  if (event.code === 'Tab') {
    event.preventDefault();
    if (!event.repeat) choose(game === 'animal-crossing' ? 'kirby64-vc' : 'animal-crossing');
  } else if (keys[event.code]) { event.preventDefault(); if (!event.repeat) held.add(keys[event.code]); }
});
window.addEventListener('keyup', event => { if(keys[event.code]) held.delete(keys[event.code]); });
window.addEventListener('blur', reset);
document.addEventListener('visibilitychange', () => { if(document.hidden) reset(); });
window.addEventListener('gamepaddisconnected', reset);
async function tick() {
  if (busy) return;
  if (browserKirby && !kirbyReady && !kirbyError) { status.textContent = 'Loading original Kirby 64…'; return; }
  busy = true;
  try {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const pad = pads.find(p => p?.connected && p.mapping === 'standard');
    previousPad = gamepadInput(pad);
    const switching = enabled && !!pad?.buttons[8]?.pressed;
    if (switching && !switchHeld) choose(game === 'animal-crossing' ? 'kirby64-vc' : 'animal-crossing');
    switchHeld = switching;
    for (const name of blocked) if (!previousPad.buttons.includes(name)) blocked.delete(name);
    if (previousPad.stick.every(v => v === 0)) blockStick = false;
    if (previousPad.cstick.every(v => v === 0)) blockC = false;
    const input = enabled ? {buttons: previousPad.buttons.filter(b => !blocked.has(b)), stick: blockStick ? [0, 0] : previousPad.stick, cstick: blockC ? [0, 0] : previousPad.cstick} : {buttons: [], stick: [0, 0], cstick: [0, 0]};
    if (enabled) {
      const keyboardButtons = [...held].filter(b => !b.startsWith('D_')).map(b => b.replace(/^PAD_/, 'D_'));
      input.buttons = [...new Set([...input.buttons, ...keyboardButtons])];
      const x = Number(held.has('D_RIGHT')) - Number(held.has('D_LEFT'));
      const y = Number(held.has('D_UP')) - Number(held.has('D_DOWN'));
      if (x || y) input.stick = [x, y];
    }
    const requestedGame = game, requestedEnabled = enabled;
    const response = await fetch('/api/input', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({client, enabled: requestedEnabled, game: requestedGame, revision, ...forGame(requestedGame, input)}), signal: AbortSignal.timeout(1500)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Controller bridge unavailable');
    revision = result.revision;
    // A local switch made while this request was pending belongs to the next
    // snapshot. Its older reply must not undo that switch or forward old input.
    if (game !== requestedGame || enabled !== requestedEnabled) return;
    if (!enabled) { syncKirby(); return; }
    if (result.active !== game) { choose(result.active); syncKirby(); }
    else syncKirby(enabled ? forGame(game, input) : neutral);
    status.textContent = kirbyError || (enabled ? (pad ? `Controller: ${pad.id}` : 'Keyboard controls enabled') : 'Controls paused');
  } catch (error) { reset(); status.textContent = error.message; }
  finally { busy = false; }
}
setInterval(tick, 1000 / 60);
let frameBusy = false, imageUrl;
setInterval(async () => {
  if (frameBusy) return;
  if (browserKirby && game === 'kirby64-vc') return;
  frameBusy = true;
  let next;
  const image = document.querySelector('#screen');
  try {
    const response = await fetch(`/api/frame?game=${encodeURIComponent(game)}`, {signal: AbortSignal.timeout(1500)});
    if (response.status !== 200) return;
    next = URL.createObjectURL(await response.blob());
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = next;
    });
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = next;
    next = undefined;
    document.querySelector('#waiting').hidden = true;
  } catch { /* Preserve the last good frame during reconnection. */ }
  finally {
    if (next) URL.revokeObjectURL(next);
    image.onload = image.onerror = null;
    frameBusy = false;
  }
}, 100);
