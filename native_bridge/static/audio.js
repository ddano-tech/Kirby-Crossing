let context, enabled = false, game, generation = 0;
const cursors = new Map(), sources = new Set();
export function setAudioGame(next) {
  if (game === next) return;
  game = next; generation++;
  cursors.clear();
  for (const source of sources) { try { source.stop(); } catch {} }
  sources.clear();
}
export async function toggleAudio() {
  if (!context) context = new AudioContext();
  enabled = !enabled;
  if (enabled) await context.resume();
  else await context.suspend();
  return enabled;
}
let busy = false;
setInterval(async () => {
  if (!enabled || busy || !game) return;
  busy = true;
  const version = generation;
  try {
    await Promise.all(['dsp', 'dtk'].map(async stream => {
      const cursor = cursors.get(stream) || {offset: -1, time: 0};
      const response = await fetch(`/api/audio?game=${encodeURIComponent(game)}&stream=${stream}&offset=${cursor.offset}`, {signal: AbortSignal.timeout(1500)});
      if (response.status !== 200) return;
      const chunk = await response.json();
      if (version !== generation) return;
      if (cursor.file && cursor.file !== chunk.file) { cursors.delete(stream); return; }
      const raw = Uint8Array.from(atob(chunk.pcm), char => char.charCodeAt(0));
      if (raw.length) {
        const samples = new DataView(raw.buffer);
        const buffer = context.createBuffer(2, raw.length / 4, chunk.rate);
        for (let channel = 0; channel < 2; channel++) {
          const output = buffer.getChannelData(channel);
          for (let i = 0; i < output.length; i++) output[i] = samples.getInt16(i * 4 + channel * 2, true) / 32768;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const when = Math.max(context.currentTime + .025, cursor.time);
        if (when - context.currentTime > .5) { cursor.time = context.currentTime; }
        else {
          sources.add(source); source.onended = () => sources.delete(source);
          source.start(when); cursor.time = when + buffer.duration;
        }
      }
      cursors.set(stream, {...cursor, offset: chunk.next, file: chunk.file});
    }));
  } catch { /* Keep input/video usable if an audio stream temporarily stalls. */ }
  finally { busy = false; }
}, 100);
