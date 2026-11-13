import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PORT, ipFor } from './config.js';
import { library, probe, resolutionLabel } from './media.js';
import { stats } from './stream.js';
import { found, dlnaInfo, discoveryEvents } from './discovery.js';
import { DlnaOutput } from './dlna.js';
import { CastOutput } from './cast.js';
import { ReceiverOutput, receivers, receiverDevices, rxEvents } from './receivers.js';
import { save, store } from './store.js';
import type { Device, MediaItem, Output, OutputStatus, PlaybackState, Quality } from './types.js';

export const events = new EventEmitter();
const emit = () => events.emit('change');
discoveryEvents.on('change', emit);
rxEvents.on('change', emit);

interface Conn {
  deviceId: string;
  output: Output;
  state: 'connected' | 'reconnecting';
  latencyMs: number | null;
  since: number;
  failures: number;
}

let conn: Conn | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let startWatchdog: NodeJS.Timeout | null = null;
let transcodeOffset = 0;
let startedAt = 0;
let resumeAfterReconnect: { mediaId: string; position: number } | null = null;
export let libraryVersion = 1;
export const bumpLibrary = () => { libraryVersion++; emit(); };

export const playback: PlaybackState = {
  mediaId: null, deviceId: null, state: 'idle', confirmed: false, position: 0, duration: 0, volume: 50,
  quality: store.settings.quality, audioTrack: 0, subtitle: null, transcoding: false, updatedAt: Date.now(),
};

const setPb = (p: Partial<PlaybackState>) => { Object.assign(playback, p, { updatedAt: Date.now() }); emit(); };

export const connectedId = () => (conn?.state === 'connected' ? conn.deviceId : null);

export function allDevices(): Device[] {
  const map = new Map<string, Device>();
  for (const d of found.values()) map.set(d.id, { ...d, paired: store.paired.some((p) => p.id === d.id) });
  for (const d of receiverDevices()) map.set(d.id, d);
  for (const p of store.paired) {
    if (!map.has(p.id)) map.set(p.id, { id: p.id, name: p.name, kind: p.kind as Device['kind'], address: p.address, status: 'unreachable', lastSeen: p.lastConnected, paired: true, note: 'Remembered – not currently visible on the network' });
  }
  if (conn) {
    const d = map.get(conn.deviceId);
    if (d) d.status = conn.state === 'connected' ? 'connected' : 'unreachable';
  }
  return [...map.values()].sort((a, b) => Number(b.status === 'connected') - Number(a.status === 'connected') || b.lastSeen - a.lastSeen);
}

const deviceById = (id: string) => allDevices().find((d) => d.id === id);

function makeOutput(d: Device): Output {
  if (d.kind === 'receiver') return new ReceiverOutput(d.id);
  if (d.kind === 'dlna') {
    const info = dlnaInfo.get(d.id);
    if (!info) throw new Error('This TV was not seen on the network recently. Run an automatic search first.');
    return new DlnaOutput(info);
  }
  return new CastOutput(d.address, d.castPort || 8009);
}

export async function connect(deviceId: string): Promise<void> {
  const d = deviceById(deviceId);
  if (!d) throw new Error('Device not found. Run a search again.');
  if (d.kind === 'receiver') {
    const rx = receivers.get(d.id);
    if (!rx) throw new Error(`The CastFlow receiver on this TV is offline. Open http://${ipFor(d.address)}:${PORT}/receiver in the TV browser.`);
    if (!rx.paired) throw new Error('This TV is not paired yet. Enter the 6-digit code shown on the TV.');
  }
  if (conn) await disconnect(false);

  const output = makeOutput(d);
  // Real handshake. For Cast we open the TLS session; for DLNA we query transport state; for receivers the WebSocket must be live.
  if (output instanceof CastOutput) await output.connect();
  else if ((await output.status()) === null) throw new Error('The TV did not answer. Check it is on, awake and on the same Wi-Fi network as this computer.');

  conn = { deviceId, output, state: 'connected', latencyMs: null, since: Date.now(), failures: 0 };
  if (d.kind !== 'receiver') {
    store.paired = store.paired.filter((p) => p.id !== d.id);
    store.paired.push({ id: d.id, name: d.name, kind: d.kind, address: d.address, lastConnected: Date.now() });
  } else {
    const p = store.paired.find((x) => x.id === d.id);
    if (p) p.lastConnected = Date.now();
  }
  save();
  setPb({ deviceId });
}

export async function disconnect(clearPlayback = true) {
  if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
  resumeAfterReconnect = null;
  const c = conn; conn = null;
  if (c) { try { await c.output.stop(); } catch { /* */ } c.output.close(); }
  if (clearPlayback) setPb({ deviceId: null, state: 'idle', confirmed: false, error: undefined, hint: undefined });
  else emit();
}

// ---------- codec / container decisions ----------
function needsTranscode(item: MediaItem, d: Device): boolean {
  const t = store.settings.transcode;
  if (t === 'always' || playback.quality !== 'original') return true;
  if (t === 'never') return false;
  const ext = path.extname(item.name).toLowerCase();
  const v = item.videoCodec;
  const a = item.audioCodec;
  if (d.kind === 'cast') {
    const okC = ['.mp4', '.m4v', '.webm'].includes(ext);
    const okV = !v || ['h264', 'vp8', 'vp9'].includes(v);
    const okA = !a || ['aac', 'mp3', 'opus', 'vorbis'].includes(a);
    return !(okC && okV && okA);
  }
  if (d.kind === 'receiver') {
    const caps = receivers.get(d.id)?.caps || {};
    if (ext === '.webm') return caps.webm === false;
    if (ext === '.mkv') return !caps.mkv || v === 'hevc' && !caps.hevc;
    if (['.mp4', '.m4v', '.mov'].includes(ext)) return v === 'hevc' ? !caps.hevc : (!!a && ['ac3', 'eac3', 'dts', 'truehd'].includes(a));
    return true;
  }
  return !['.mp4', '.m4v', '.mkv', '.ts', '.avi', '.mov'].includes(ext);
}

function subtitleFor(item: MediaItem): string | undefined {
  if (item.kind !== 'path') return undefined;
  if (playback.subtitle === null) return undefined;
  if (playback.subtitle >= 1000) return `sc${playback.subtitle - 1000}`;
  return String(playback.subtitle);
}

export async function play(mediaId: string, startSec?: number): Promise<void> {
  if (!conn || conn.state !== 'connected') throw new Error('No TV is connected. Connect to a TV first.');
  const item = library.get(mediaId);
  if (!item) throw new Error('Video not found in your library.');
  if (item.kind === 'relay' && !item.online) throw new Error('The browser tab that selected this file was closed. Select the file again.');
  await probe(item);
  const d = deviceById(conn.deviceId)!;
  const saved = store.positions[mediaId] || 0;
  const start = startSec ?? (saved > 5 && (!item.durationSec || saved < item.durationSec - 15) ? saved : 0);

  const transcoding = needsTranscode(item, d);
  const base = `http://${ipFor(d.address)}:${PORT}`;
  const sub = subtitleFor(item);
  const url = transcoding
    ? `${base}/transcode/${item.id}/video.mp4?start=${Math.floor(start)}&q=${playback.quality}&audio=${playback.audioTrack}`
    : `${base}/stream/${item.id}/${encodeURIComponent(item.name)}`;

  transcodeOffset = transcoding ? Math.floor(start) : 0;
  startedAt = Date.now();
  stats.currentFileBytes = 0;
  setPb({
    mediaId, deviceId: d.id, state: 'loading', confirmed: false, position: start, duration: item.durationSec || playback.duration || 0,
    transcoding, error: undefined, hint: undefined,
  });
  store.recent = [{ mediaId, name: item.name, size: item.size, at: Date.now() }, ...store.recent.filter((r) => r.mediaId !== mediaId)].slice(0, 20);
  save();

  if (startWatchdog) clearTimeout(startWatchdog);
  startWatchdog = setTimeout(() => {
    if (playback.state === 'loading') {
      setPb({
        state: 'error', confirmed: false, error: 'The TV did not start playing the video.',
        hint: transcoding
          ? 'Transcoding needs FFmpeg on this computer. Check it is installed, or try a lower quality.'
          : 'The TV may not support this format. Turn on transcoding in Settings, check the TV firewall, and make sure the TV and this computer share one Wi-Fi network.',
      });
    }
  }, 25000);

  try {
    await conn.output.play({
      url, startSec: start, title: item.name, mime: transcoding ? 'video/mp4' : item.mime, transcoding,
      subtitleUrl: d.kind === 'receiver' && sub ? `${base}/subs/${item.id}/${sub}.vtt` : undefined,
    });
  } catch (e) {
    setPb({ state: 'error', confirmed: false, error: (e as Error).message, hint: 'Check that the TV is awake and still on the same Wi-Fi network.' });
    throw e;
  }
}

export async function control(action: string, value?: number): Promise<void> {
  if (!conn || conn.state !== 'connected') throw new Error('No TV is connected.');
  const o = conn.output;
  if (action === 'pause') await o.pause();
  else if (action === 'resume') await o.resume();
  else if (action === 'stop') { await o.stop(); setPb({ state: 'stopped', confirmed: false }); }
  else if (action === 'volume') { await o.setVolume(Number(value)); setPb({ volume: Number(value) }); }
  else if (action === 'seek') {
    const sec = Math.max(0, Number(value) || 0);
    if (playback.transcoding && playback.mediaId) await play(playback.mediaId, sec);
    else await o.seek(sec);
  } else throw new Error('Unknown action');
  setTimeout(pollOnce, 500);
}

export async function setOptions(opts: { quality?: Quality; audioTrack?: number; subtitle?: number | null }) {
  if (opts.quality) { playback.quality = opts.quality; store.settings.quality = opts.quality; save(); }
  if (opts.audioTrack !== undefined) playback.audioTrack = opts.audioTrack;
  if (opts.subtitle !== undefined) playback.subtitle = opts.subtitle;
  emit();
  if (conn && playback.mediaId && ['playing', 'paused', 'loading'].includes(playback.state)) await play(playback.mediaId, playback.position);
}

export function playlist(): MediaItem[] {
  return [...library.values()].filter((m) => m.kind === 'path' || m.online).sort((a, b) => b.addedAt - a.addedAt);
}
export async function step(dir: 1 | -1) {
  const list = playlist();
  const i = list.findIndex((m) => m.id === playback.mediaId);
  const next = list[(i + dir + list.length) % list.length];
  if (!next) throw new Error('Your library is empty.');
  await play(next.id, 0);
}

// ---------- status polling & reconnection ----------
function applyStatus(s: OutputStatus) {
  const patch: Partial<PlaybackState> = {};
  const age = Date.now() - startedAt;
  if (playback.state === 'loading') {
    if (s.state === 'playing' || s.state === 'paused') { patch.state = s.state; patch.confirmed = true; if (startWatchdog) clearTimeout(startWatchdog); }
  } else if (playback.mediaId && ['playing', 'paused'].includes(playback.state)) {
    if (s.state === 'playing' || s.state === 'paused') { patch.state = s.state; patch.confirmed = true; }
    else if (s.state === 'loading') { patch.state = 'loading'; patch.confirmed = false; }
    else if ((s.state === 'stopped' || s.state === 'idle') && age > 6000) { patch.state = 'stopped'; patch.confirmed = true; }
  } else if (playback.state === 'stopped' || playback.state === 'error') return;

  if (s.position !== undefined && (s.state === 'playing' || s.state === 'paused')) patch.position = transcodeOffset + s.position;
  if (s.duration && !playback.transcoding && s.duration > 0) patch.duration = s.duration;
  if (s.volume !== undefined && !Number.isNaN(s.volume)) patch.volume = s.volume;
  if (Object.keys(patch).length) {
    Object.assign(playback, patch, { updatedAt: Date.now() });
    if (playback.state === 'playing' && playback.mediaId && Math.floor(playback.position) % 5 === 0) { store.positions[playback.mediaId] = playback.position; save(); }
    emit();
  }
}

let polling = false;
async function pollOnce() {
  if (!conn || polling) return;
  polling = true;
  const c = conn;
  try {
    const t0 = Date.now();
    const s = await c.output.status();
    if (conn !== c) return;
    if (s === null) {
      c.failures++;
      if (c.failures >= 3 && c.state === 'connected') beginReconnect();
    } else {
      c.failures = 0;
      c.latencyMs = Date.now() - t0;
      if (c.state === 'connected') applyStatus(s);
    }
  } finally { polling = false; }
}
setInterval(pollOnce, 1000).unref();

function beginReconnect() {
  if (!conn || conn.state === 'reconnecting') return;
  const deviceId = conn.deviceId;
  if (playback.mediaId && ['playing', 'paused', 'loading'].includes(playback.state)) {
    resumeAfterReconnect = { mediaId: playback.mediaId, position: playback.position };
    store.positions[playback.mediaId] = playback.position; save();
  }
  conn.state = 'reconnecting';
  try { conn.output.close(); } catch { /* */ }
  setPb({ confirmed: false, state: playback.state === 'idle' ? 'idle' : 'loading', error: 'Connection to the TV was lost. Reconnecting…', hint: 'Playback resumes from where it stopped.' });
  const giveUp = Date.now() + 120_000;
  reconnectTimer = setInterval(async () => {
    if (!conn) { clearInterval(reconnectTimer!); return; }
    if (Date.now() > giveUp) {
      clearInterval(reconnectTimer!); reconnectTimer = null; conn = null;
      setPb({ deviceId: null, state: 'error', confirmed: false, error: 'Could not reconnect to the TV.', hint: 'Wake the TV, confirm the Wi-Fi network, then connect again. Your position is saved.' });
      return;
    }
    try {
      conn = null;
      await connect(deviceId);
      clearInterval(reconnectTimer!); reconnectTimer = null;
      const r = resumeAfterReconnect; resumeAfterReconnect = null;
      setPb({ error: undefined, hint: undefined });
      if (r) await play(r.mediaId, r.position).catch(() => {});
    } catch {
      // keep trying; reinstate a placeholder connection so UI keeps showing "reconnecting"
      if (!conn) conn = { deviceId, output: { close() {} } as Output, state: 'reconnecting', latencyMs: null, since: Date.now(), failures: 0 };
    }
  }, 4000);
}

rxEvents.on('gone', (rx: { id: string }) => { if (conn?.deviceId === rx.id) beginReconnect(); });

// ---------- snapshot for UI ----------
export function mediaView(m: MediaItem) {
  return {
    id: m.id, name: m.name, size: m.size, kind: m.kind, durationSec: m.durationSec, resolution: resolutionLabel(m),
    videoCodec: m.videoCodec, audioCodec: m.audioCodec, online: m.kind === 'path' ? true : !!m.online, addedAt: m.addedAt,
    audioTracks: m.audioTracks || [], subtitleTracks: m.subtitleTracks || [], sidecarSubs: (m.sidecarSubs || []).length,
    thumb: m.kind === 'path' ? `/thumb/${m.id}.jpg` : null,
  };
}

export function snapshot(searching: boolean, ffmpeg: boolean) {
  const cur = playback.mediaId ? library.get(playback.mediaId) : undefined;
  return {
    devices: allDevices(),
    connection: conn ? { deviceId: conn.deviceId, state: conn.state, latencyMs: conn.latencyMs, since: conn.since } : null,
    playback: { ...playback },
    media: cur ? mediaView(cur) : null,
    stats: { ...stats },
    searching,
    libraryVersion,
    libraryCount: library.size,
    recent: store.recent,
    settings: store.settings,
    server: { port: PORT, ips: [ipFor()], ffmpeg },
  };
}
