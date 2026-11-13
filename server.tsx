import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ServerState } from './types';

export interface Toast { id: number; kind: 'info' | 'error' | 'success'; text: string; hint?: string }

interface Ctx {
  state: ServerState | null;
  online: boolean;
  thumbs: Record<string, string>;
  toasts: Toast[];
  toast: (kind: Toast['kind'], text: string, hint?: string) => void;
  dismiss: (id: number) => void;
  addFile: (file: File) => Promise<string>;
  sendRaw: (msg: unknown) => void;
  subscribe: (fn: (m: any) => void) => () => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
}

const C = createContext<Ctx>(null as unknown as Ctx);
export const useServer = () => useContext(C);

interface RelayEntry { clientId: string; file: File; meta: { durationSec?: number; width?: number; height?: number }; mediaId?: string }
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2) + Date.now().toString(36));

function readMeta(file: File): Promise<{ meta: RelayEntry['meta']; thumb?: string }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    const url = URL.createObjectURL(file);
    const done = (r: { meta: RelayEntry['meta']; thumb?: string }) => { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(r); };
    const t = setTimeout(() => done({ meta: {} }), 5000); // containers the browser cannot parse (MKV, AVI…) simply have no preview
    v.onloadedmetadata = () => {
      const meta = { durationSec: isFinite(v.duration) ? v.duration : undefined, width: v.videoWidth, height: v.videoHeight };
      try { v.currentTime = Math.min(10, (v.duration || 20) * 0.1); } catch { /* */ }
      v.onseeked = () => {
        clearTimeout(t);
        try {
          const c = document.createElement('canvas'); c.width = 480; c.height = Math.round((480 * v.videoHeight) / (v.videoWidth || 16) || 270);
          c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
          done({ meta, thumb: c.toDataURL('image/jpeg', 0.7) });
        } catch { done({ meta }); }
      };
    };
    v.onerror = () => { clearTimeout(t); done({ meta: {} }); };
    v.src = url;
  });
}

export function ServerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServerState | null>(null);
  const [online, setOnline] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => (localStorage.getItem('cf.theme') as 'dark' | 'light') || 'dark');
  const ws = useRef<WebSocket | null>(null);
  const relay = useRef(new Map<string, RelayEntry>());
  const waiters = useRef(new Map<string, (mediaId: string) => void>());
  const subs = useRef(new Set<(m: any) => void>());

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('cf.theme', theme); }, [theme]);
  const setTheme = useCallback((t: 'dark' | 'light') => setThemeState(t), []);

  const toast = useCallback((kind: Toast['kind'], text: string, hint?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text, hint }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const sendRaw = useCallback((m: unknown) => { const s = ws.current; if (s && s.readyState === 1) s.send(JSON.stringify(m)); }, []);

  useEffect(() => {
    let closed = false; let retry = 0; let timer: number | undefined;
    const open = () => {
      const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/ui`);
      s.binaryType = 'arraybuffer';
      ws.current = s;
      s.onopen = () => {
        retry = 0; setOnline(true);
        // after a reconnect, re-announce files this tab still owns so playback can continue
        for (const r of relay.current.values()) s.send(JSON.stringify({ type: 'relay:add', id: r.clientId, name: r.file.name, size: r.file.size, mime: r.file.type, ...r.meta }));
      };
      s.onmessage = async (e) => {
        let m: any; try { m = JSON.parse(e.data as string); } catch { return; }
        if (m.type === 'state') setState(m.data);
        else if (m.type === 'relay:added') {
          const r = relay.current.get(m.clientId); if (r) r.mediaId = m.mediaId;
          waiters.current.get(m.clientId)?.(m.mediaId); waiters.current.delete(m.clientId);
        } else if (m.type === 'relay:read') {
          const r = [...relay.current.values()].find((x) => x.mediaId === m.mediaId);
          if (!r) { s.send(JSON.stringify({ type: 'relay:error', rid: m.rid, message: 'File no longer selected in this tab' })); return; }
          try {
            const buf = await r.file.slice(m.start, m.end + 1).arrayBuffer();
            const out = new Uint8Array(4 + buf.byteLength);
            new DataView(out.buffer).setUint32(0, m.rid);
            out.set(new Uint8Array(buf), 4);
            if (s.readyState === 1) s.send(out);
          } catch (err) { s.send(JSON.stringify({ type: 'relay:error', rid: m.rid, message: String((err as Error).message) })); }
        } else subs.current.forEach((f) => f(m));
      };
      s.onclose = () => { setOnline(false); if (!closed) timer = window.setTimeout(open, Math.min(6000, 600 * ++retry)); };
      s.onerror = () => s.close();
    };
    open();
    return () => { closed = true; clearTimeout(timer); ws.current?.close(); };
  }, []);

  const addFile = useCallback(async (file: File) => {
    const clientId = uid();
    const { meta, thumb } = await readMeta(file);
    relay.current.set(clientId, { clientId, file, meta });
    const mediaId = await new Promise<string>((resolve, reject) => {
      const s = ws.current;
      if (!s || s.readyState !== 1) { reject(new Error('Not connected to the CastFlow service. Is it running on your computer?')); return; }
      waiters.current.set(clientId, resolve);
      s.send(JSON.stringify({ type: 'relay:add', id: clientId, name: file.name, size: file.size, mime: file.type, ...meta }));
      setTimeout(() => reject(new Error('CastFlow service did not respond')), 8000);
    });
    if (thumb) setThumbs((t) => ({ ...t, [mediaId]: thumb }));
    return mediaId;
  }, []);

  const subscribe = useCallback((fn: (m: any) => void) => { subs.current.add(fn); return () => { subs.current.delete(fn); }; }, []);

  const value = useMemo<Ctx>(() => ({ state, online, thumbs, toasts, toast, dismiss, addFile, sendRaw, subscribe, theme, setTheme }),
    [state, online, thumbs, toasts, toast, dismiss, addFile, sendRaw, subscribe, theme, setTheme]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
