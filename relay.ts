import type { WebSocket } from 'ws';
import { library } from './media.js';

/**
 * Browser relay: a file picked in a browser tab (laptop or phone) never leaves that device as a whole.
 * When the TV asks for a byte range, the server asks the owning tab for exactly that slice over the local
 * WebSocket, forwards it to the TV, and forgets it. Nothing is stored and no cloud is involved.
 */
const owners = new Map<string, WebSocket>();
const pending = new Map<number, { ws: WebSocket; resolve: (b: Buffer) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
let seq = 1;

export const CHUNK = 4 * 1024 * 1024;

export function setOwner(mediaId: string, ws: WebSocket) {
  owners.set(mediaId, ws);
  const m = library.get(mediaId);
  if (m) m.online = true;
}

export function dropOwner(ws: WebSocket) {
  for (const [id, w] of owners) {
    if (w === ws) {
      owners.delete(id);
      const m = library.get(id);
      if (m) m.online = false;
    }
  }
  for (const [rid, p] of pending) {
    if (p.ws === ws) { clearTimeout(p.timer); pending.delete(rid); p.reject(new Error('Browser tab disconnected')); }
  }
}

export function removeRelay(mediaId: string) {
  owners.delete(mediaId);
  library.delete(mediaId);
}

export function isOnline(mediaId: string) { return owners.has(mediaId); }

/** Binary frame layout from the browser: uint32 BE request id, then payload. */
export function onBinary(buf: Buffer) {
  if (buf.length < 4) return;
  const rid = buf.readUInt32BE(0);
  const p = pending.get(rid);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(rid);
  p.resolve(buf.subarray(4));
}

export function onReadError(rid: number, message: string) {
  const p = pending.get(rid);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(rid);
  p.reject(new Error(message));
}

export function readChunk(mediaId: string, start: number, end: number): Promise<Buffer> {
  const ws = owners.get(mediaId);
  if (!ws || ws.readyState !== ws.OPEN) return Promise.reject(new Error('Browser tab that owns this file is not connected'));
  const rid = seq++ >>> 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(rid); reject(new Error('Browser did not answer in time')); }, 30000);
    pending.set(rid, { ws, resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'relay:read', rid, mediaId, start, end }));
  });
}

export async function* relayStream(mediaId: string, start: number, end: number): AsyncGenerator<Buffer> {
  let pos = start;
  // Prefetch one chunk ahead so the TV is not starved while the browser reads from disk.
  let next: Promise<Buffer> | null = null;
  const fetchAt = (p: number) => readChunk(mediaId, p, Math.min(end, p + CHUNK - 1));
  if (pos <= end) next = fetchAt(pos);
  while (pos <= end && next) {
    const buf = await next;
    pos += buf.length;
    if (buf.length === 0) throw new Error('Empty slice from browser');
    next = pos <= end ? fetchAt(pos) : null;
    yield buf;
  }
}
