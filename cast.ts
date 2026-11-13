// @ts-ignore - castv2-client ships no types
import castv2 from 'castv2-client';
import type { Output, OutputStatus, PlayOptions } from './types.js';

const { Client, DefaultMediaReceiver } = castv2 as any;

const pcall = <T,>(fn: (cb: (err: any, res?: T) => void) => void): Promise<T> =>
  new Promise((resolve, reject) => fn((err, res) => (err ? reject(err instanceof Error ? err : new Error(String(err?.message || err))) : resolve(res as T))));

/** Google Cast (Chromecast, Google TV, Android TV) through the Default Media Receiver. */
export class CastOutput implements Output {
  private client: any = null;
  private player: any = null;
  private dead = false;
  constructor(private host: string, private port = 8009) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const c = new Client();
      const t = setTimeout(() => { try { c.close(); } catch { /* */ } reject(new Error('Timed out connecting to the Cast device')); }, 7000);
      c.on('error', (e: Error) => { this.dead = true; clearTimeout(t); reject(e); });
      c.connect({ host: this.host, port: this.port }, () => { clearTimeout(t); this.client = c; resolve(); });
    });
    this.client.on('error', () => { this.dead = true; });
  }

  async play(o: PlayOptions) {
    if (!this.client) await this.connect();
    this.player = await pcall<any>((cb) => this.client.launch(DefaultMediaReceiver, cb));
    await pcall((cb) => this.player.load({
      contentId: o.url, contentType: o.mime, streamType: 'BUFFERED',
      metadata: { type: 0, metadataType: 0, title: o.title },
    }, { autoplay: true, currentTime: o.transcoding ? 0 : o.startSec }, cb));
  }
  async pause() { await pcall((cb) => this.player.pause(cb)); }
  async resume() { await pcall((cb) => this.player.play(cb)); }
  async seek(sec: number) { await pcall((cb) => this.player.seek(sec, cb)); }
  async stop() { if (this.player) await pcall((cb) => this.player.stop(cb)).catch(() => {}); }
  async setVolume(v: number) { await pcall((cb) => this.client.setVolume({ level: Math.max(0, Math.min(1, v / 100)) }, cb)); }

  async status(): Promise<OutputStatus | null> {
    if (this.dead || !this.client) return null;
    try {
      const vol: any = await pcall((cb) => this.client.getVolume(cb)).catch(() => null);
      if (!this.player) return { state: 'idle', volume: vol ? Math.round(vol.level * 100) : undefined };
      const s: any = await pcall((cb) => this.player.getStatus(cb));
      if (!s) return { state: 'idle' };
      const map: Record<string, OutputStatus['state']> = { PLAYING: 'playing', PAUSED: 'paused', BUFFERING: 'loading', IDLE: 'stopped' };
      return { state: map[s.playerState] || 'idle', position: s.currentTime, duration: s.media?.duration, volume: vol ? Math.round(vol.level * 100) : undefined };
    } catch { return null; }
  }
  close() { try { this.client?.close(); } catch { /* */ } this.client = null; this.player = null; }
}

export async function probeCast(host: string, port = 8009): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 2500 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(false));
  });
}
