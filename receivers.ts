import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import { save, store } from './store.js';
import type { Device, Output, OutputStatus, PlayOptions } from './types.js';

/** TVs (or any browser) that opened /receiver. Pairing code is generated here, on the receiver side. */
export interface Rx {
  ws: WebSocket;
  id: string;
  name: string;
  ip: string;
  code: string | null;
  codeExpires: number;
  paired: boolean;
  caps: Record<string, boolean>;
  status: OutputStatus;
  statusAt: number;
  lastSeen: number;
  error?: string;
}

export const receivers = new Map<string, Rx>();
export const rxEvents = new EventEmitter();

const CODE_TTL = 10 * 60 * 1000;

function newCode(): string {
  const used = new Set([...receivers.values()].map((r) => r.code));
  for (;;) {
    const c = String(crypto.randomInt(100000, 1000000));
    if (!used.has(c)) return c;
  }
}

const send = (rx: Rx, msg: unknown) => { if (rx.ws.readyState === rx.ws.OPEN) rx.ws.send(JSON.stringify(msg)); };

export function attachReceiver(ws: WebSocket, ip: string) {
  let rx: Rx | null = null;

  ws.on('message', (raw) => {
    let m: any;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === 'hello') {
      const id = String(m.id || crypto.randomUUID()).slice(0, 64);
      const prev = receivers.get(id);
      if (prev && prev.ws !== ws) { try { prev.ws.close(); } catch { /* */ } }
      const trusted = store.paired.find((p) => p.id === id && p.token && p.token === m.token);
      rx = {
        ws, id, name: String(m.name || 'TV browser').slice(0, 60), ip, code: null, codeExpires: 0,
        paired: !!trusted, caps: m.caps || {}, status: { state: 'idle' }, statusAt: Date.now(), lastSeen: Date.now(),
      };
      receivers.set(id, rx);
      if (trusted) { trusted.lastConnected = Date.now(); trusted.address = ip; save(); send(rx, { type: 'paired', name: rx.name, reconnected: true }); }
      else { rx.code = newCode(); rx.codeExpires = Date.now() + CODE_TTL; send(rx, { type: 'code', code: rx.code, expires: rx.codeExpires }); }
      rxEvents.emit('change');
      return;
    }
    if (!rx) return;
    rx.lastSeen = Date.now();

    if (m.type === 'status') {
      rx.status = { state: m.state, position: m.position, duration: m.duration, volume: m.volume };
      rx.statusAt = Date.now();
      rx.error = m.error;
      rxEvents.emit('status', rx);
    } else if (typeof m.type === 'string' && m.type.startsWith('rtc:')) rxEvents.emit('rtc', rx.id, m);
    else if (m.type === 'ping') send(rx, { type: 'pong' });
  });

  ws.on('close', () => {
    if (!rx || receivers.get(rx.id)?.ws !== ws) return;
    receivers.delete(rx.id);
    rxEvents.emit('change');
    rxEvents.emit('gone', rx);
  });
  ws.on('error', () => {});
}

// rotate expired codes
setInterval(() => {
  for (const rx of receivers.values()) {
    if (!rx.paired && rx.codeExpires < Date.now()) {
      rx.code = newCode(); rx.codeExpires = Date.now() + CODE_TTL;
      send(rx, { type: 'code', code: rx.code, expires: rx.codeExpires });
      rxEvents.emit('change');
    }
  }
}, 5000).unref();

// brute-force protection: 6 digits is only safe if guesses are throttled
const attempts = new Map<string, { n: number; reset: number }>();

export function pairByCode(code: string, clientIp: string): { ok: true; id: string } | { ok: false; error: string; status: number } {
  const a = attempts.get(clientIp) || { n: 0, reset: Date.now() + 60_000 };
  if (a.reset < Date.now()) { a.n = 0; a.reset = Date.now() + 60_000; }
  if (a.n >= 5) return { ok: false, status: 429, error: 'Too many attempts. Wait a minute and try again.' };
  a.n++; attempts.set(clientIp, a);

  if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: 'The code has 6 digits.' };
  const rx = [...receivers.values()].find((r) => !r.paired && r.code === code && r.codeExpires > Date.now());
  if (!rx) return { ok: false, status: 404, error: 'No TV is showing that code. Check the number on the TV screen (codes refresh every 10 minutes).' };

  const token = crypto.randomBytes(24).toString('hex');
  rx.paired = true; rx.code = null;
  store.paired = store.paired.filter((p) => p.id !== rx.id);
  store.paired.push({ id: rx.id, name: rx.name, kind: 'receiver', address: rx.ip, token, lastConnected: Date.now() });
  save();
  attempts.delete(clientIp);
  send(rx, { type: 'paired', name: rx.name, token });
  rxEvents.emit('change');
  return { ok: true, id: rx.id };
}

export function forgetReceiver(id: string) {
  const rx = receivers.get(id);
  if (rx) { rx.paired = false; rx.code = newCode(); rx.codeExpires = Date.now() + CODE_TTL; send(rx, { type: 'unpaired' }); send(rx, { type: 'code', code: rx.code, expires: rx.codeExpires }); }
  store.paired = store.paired.filter((p) => p.id !== id);
  save();
  rxEvents.emit('change');
}

export function receiverDevices(): Device[] {
  const out: Device[] = [];
  for (const rx of receivers.values()) {
    out.push({ id: rx.id, name: rx.name, kind: 'receiver', address: rx.ip, status: 'available', lastSeen: rx.lastSeen, paired: rx.paired,
      note: rx.paired ? 'Paired' : 'Enter the 6-digit code shown on this TV' });
  }
  return out;
}

export class ReceiverOutput implements Output {
  constructor(private id: string) {}
  private get rx() {
    const r = receivers.get(this.id);
    if (!r || r.ws.readyState !== r.ws.OPEN) throw new Error('TV receiver is not connected');
    return r;
  }
  private cmd(m: unknown) { send(this.rx, m); }
  async play(o: PlayOptions) { this.cmd({ type: 'play', ...o }); }
  async pause() { this.cmd({ type: 'pause' }); }
  async resume() { this.cmd({ type: 'resume' }); }
  async seek(sec: number) { this.cmd({ type: 'seek', sec }); }
  async stop() { this.cmd({ type: 'stop' }); }
  async setVolume(v: number) { this.cmd({ type: 'volume', value: v / 100 }); }
  async status(): Promise<OutputStatus | null> {
    const r = receivers.get(this.id);
    if (!r || r.ws.readyState !== r.ws.OPEN || Date.now() - r.lastSeen > 15000) return null;
    return r.status;
  }
  close() {}
}

export function sendToReceiver(id: string, msg: unknown): boolean {
  const rx = receivers.get(id);
  if (!rx || !rx.paired || rx.ws.readyState !== rx.ws.OPEN) return false;
  rx.ws.send(JSON.stringify(msg));
  return true;
}
