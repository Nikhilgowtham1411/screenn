import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { PORT, ipFor, lanInterfaces } from './config.js';
import { library, scanDirs, thumbnail, registerRelay, ffmpegAvailable, probe } from './media.js';
import { serveMedia, serveTranscode, serveSubtitle, stats } from './stream.js';
import { onBinary, onReadError, removeRelay, setOwner, dropOwner } from './relay.js';
import { attachReceiver, forgetReceiver, pairByCode, receivers, rxEvents, sendToReceiver } from './receivers.js';
import { findByIp, search, searching, startDiscovery, found } from './discovery.js';
import * as ctl from './controller.js';
const mediaView = ctl.mediaView;
import { save, store } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
const publicDir = path.resolve(here, '../public');

let ffmpeg = false;
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const clientIp = (req: Request) => (req.socket.remoteAddress || '').replace('::ffff:', '');
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch((e) => { res.status(400).json({ ok: false, error: (e as Error).message || String(e) }); next; });

const cors = (_: Request, res: Response, next: NextFunction) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Range'); res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length'); next(); };

// ---------- media delivery (HTTP Range) ----------
app.get(['/stream/:id', '/stream/:id/:name'], cors, wrap(async (q, s) => serveMedia(q, s)));
app.head(['/stream/:id', '/stream/:id/:name'], cors, wrap(async (q, s) => serveMedia(q, s)));
app.get(['/transcode/:id', '/transcode/:id/:name'], cors, wrap(async (q, s) => serveTranscode(q, s)));
app.get('/subs/:id/:which.vtt', cors, wrap(async (q, s) => serveSubtitle(q, s)));
app.get('/thumb/:id.jpg', wrap(async (q, s) => {
  const m = library.get(q.params.id);
  const f = m && (await thumbnail(m));
  if (!f) { s.status(404).end(); return; }
  s.setHeader('Cache-Control', 'public, max-age=86400');
  s.sendFile(f);
}));

// ---------- API ----------
const snap = () => ctl.snapshot(searching, ffmpeg);

app.get('/api/state', (_q, s) => { s.json(snap()); });

app.get('/api/library', (_q, s) => {
  s.json({ version: ctl.libraryVersion, items: [...library.values()].sort((a, b) => b.addedAt - a.addedAt).map(mediaView) });
});
app.post('/api/library/rescan', wrap(async (_q, s) => { await scanDirs(); ctl.bumpLibrary(); s.json({ ok: true, count: library.size }); }));
app.post('/api/library/probe/:id', wrap(async (q, s) => {
  const m = library.get(q.params.id);
  if (!m) throw new Error('Unknown video');
  await probe(m); s.json(mediaView(m)); ctl.bumpLibrary();
}));
app.post('/api/library/add-folder', wrap(async (q, s) => {
  const p = path.resolve(String(q.body.path || ''));
  const st = await fs.promises.stat(p).catch(() => null);
  if (!st?.isDirectory()) throw new Error('That folder does not exist on the CastFlow computer.');
  if (!store.settings.mediaDirs.includes(p)) store.settings.mediaDirs.push(p);
  save(); await scanDirs(); ctl.bumpLibrary(); s.json({ ok: true });
}));
app.post('/api/library/remove-folder', wrap(async (q, s) => {
  store.settings.mediaDirs = store.settings.mediaDirs.filter((d) => d !== q.body.path);
  save(); await scanDirs(); ctl.bumpLibrary(); s.json({ ok: true });
}));
app.post('/api/settings', wrap(async (q, s) => {
  const b = q.body || {};
  if (['auto', 'always', 'never'].includes(b.transcode)) store.settings.transcode = b.transcode;
  if (['dark', 'light'].includes(b.theme)) store.settings.theme = b.theme;
  if (typeof b.autoReconnect === 'boolean') store.settings.autoReconnect = b.autoReconnect;
  save(); s.json({ ok: true });
}));

app.post('/api/discovery/search', wrap(async (_q, s) => { search(true).catch(() => {}); s.json({ ok: true }); }));

app.post('/api/pair', wrap(async (q, s) => {
  const r = pairByCode(String(q.body.code || ''), clientIp(q));
  if (!r.ok) { s.status(r.status).json({ ok: false, error: r.error }); return; }
  await ctl.connect(r.id);
  s.json({ ok: true, deviceId: r.id });
}));
app.post('/api/connect', wrap(async (q, s) => { await ctl.connect(String(q.body.deviceId)); s.json({ ok: true }); }));
app.post('/api/connect-ip', wrap(async (q, s) => {
  const ip = String(q.body.ip || '').trim();
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split('.').some((n) => Number(n) > 255)) throw new Error('Enter a valid IPv4 address, for example 192.168.1.42');
  const rx = [...receivers.values()].find((r) => r.ip === ip);
  if (rx) {
    if (!rx.paired) throw new Error('A CastFlow receiver is running on that TV but is not paired. Use the "Enter Code" tab with the number shown on the TV.');
    await ctl.connect(rx.id); s.json({ ok: true }); return;
  }
  const d = await findByIp(ip);
  if (!d) throw new Error(`Nothing answered at ${ip}. Check the address, that the TV is on, and that DLNA / Cast is enabled on it (or open /receiver in the TV browser).`);
  await ctl.connect(d.id);
  s.json({ ok: true, deviceId: d.id });
}));
app.post('/api/disconnect', wrap(async (_q, s) => { await ctl.disconnect(); s.json({ ok: true }); }));
app.post('/api/forget', wrap(async (q, s) => {
  const id = String(q.body.deviceId);
  store.paired = store.paired.filter((p) => p.id !== id); found.delete(id); forgetReceiver(id); save(); ctl.events.emit('change'); s.json({ ok: true });
}));

app.post('/api/play', wrap(async (q, s) => {
  const startSec = q.body.startSec === undefined ? undefined : Number(q.body.startSec);
  await ctl.play(String(q.body.mediaId), startSec); s.json({ ok: true });
}));
app.post('/api/control', wrap(async (q, s) => {
  const a = String(q.body.action);
  if (a === 'next') await ctl.step(1); else if (a === 'prev') await ctl.step(-1);
  else await ctl.control(a, q.body.value);
  s.json({ ok: true });
}));
app.post('/api/options', wrap(async (q, s) => { await ctl.setOptions(q.body || {}); s.json({ ok: true }); }));

app.get('/api/diagnostics', wrap(async (_q, s) => {
  const dev = ctl.allDevices();
  const c = ctl.snapshot(searching, ffmpeg).connection;
  const ifs = lanInterfaces();
  s.json({
    checks: [
      { name: 'Local network', ok: ifs.length > 0, detail: ifs.length ? ifs.map((i) => i.address).join(', ') : 'No Wi-Fi/Ethernet IPv4 address found. Connect this computer to your Wi-Fi.' },
      { name: 'Streaming server', ok: true, detail: `Listening on port ${PORT}. If the TV cannot load videos, allow this port in your firewall.` },
      { name: 'FFmpeg (transcoding)', ok: ffmpeg, detail: ffmpeg ? 'Installed' : 'Not found. Install FFmpeg to play MKV/HEVC/AC3 files on TVs that cannot decode them.' },
      { name: 'TV discovery', ok: dev.length > 0, detail: dev.length ? `${dev.length} device(s) known` : 'No TVs found. Make sure the TV and this computer use the same Wi-Fi, and that AP/client isolation is off on your router.' },
      { name: 'TV connection', ok: !!c && c.state === 'connected', detail: c ? `${c.state}, round-trip ${c.latencyMs ?? '–'} ms` : 'Not connected' },
      { name: 'Streaming throughput', ok: true, detail: `${stats.speedMbps} Mbps now, ${(stats.bytesServed / 1e9).toFixed(2)} GB served this session` },
    ],
  });
}));

// ---------- TV receiver page + dashboard ----------
app.get('/receiver', (_q, s) => { s.sendFile(path.join(publicDir, 'receiver.html')); });
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|stream|transcode|subs|thumb|ws).*/, (_q, s) => { s.sendFile(path.join(webDist, 'index.html')); });
} else {
  app.get('/', (_q, s) => { s.type('text').send('CastFlow server is running. Build the dashboard first: npm run build'); });
}

// ---------- WebSockets ----------
const server = http.createServer(app);
const rxWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
rxWss.on('connection', (ws, req) => attachReceiver(ws, (req.socket.remoteAddress || '').replace('::ffff:', '')));

const uiClients = new Set<WebSocket>();
// Relay frames from the browser carry file slices, so the UI socket accepts larger messages.
const uiWssRelay = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (url.startsWith('/ws/ui')) uiWssRelay.handleUpgrade(req, socket, head, (ws) => uiWssRelay.emit('connection', ws, req));
  else if (url.startsWith('/ws/receiver')) rxWss.handleUpgrade(req, socket, head, (ws) => rxWss.emit('connection', ws, req));
  else socket.destroy();
});

uiWssRelay.on('connection', (ws) => {
  uiClients.add(ws);
  ws.send(JSON.stringify({ type: 'state', data: snap() }));
  ws.on('message', (raw, isBinary) => {
    if (isBinary) { onBinary(raw as Buffer); return; }
    let m: any;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === 'relay:add') {
      const item = registerRelay(String(m.id), String(m.name), Number(m.size), String(m.mime || ''));
      item.durationSec = Number(m.durationSec) || undefined;
      item.height = Number(m.height) || undefined; item.width = Number(m.width) || undefined;
      setOwner(item.id, ws);
      ws.send(JSON.stringify({ type: 'relay:added', clientId: m.id, mediaId: item.id }));
      ctl.bumpLibrary();
    } else if (m.type === 'relay:remove') { removeRelay(String(m.mediaId)); ctl.bumpLibrary(); }
    else if (m.type === 'relay:error') onReadError(Number(m.rid), String(m.message || 'read error'));
    else if (typeof m.type === 'string' && m.type.startsWith('rtc:')) {
      const id = ctl.connectedId();
      if (!id || !sendToReceiver(id, m)) ws.send(JSON.stringify({ type: 'rtc:error', message: 'The connected TV has no CastFlow receiver open. Screen mirroring needs the receiver page.' }));
    }
  });
  ws.on('close', () => { uiClients.delete(ws); dropOwner(ws); ctl.bumpLibrary(); });
  ws.on('error', () => {});
});

rxEvents.on('rtc', (id: string, m: unknown) => {
  if (id !== ctl.connectedId()) return;
  const msg = JSON.stringify(m);
  for (const c of uiClients) if (c.readyState === c.OPEN) c.send(msg);
});

let timer: NodeJS.Timeout | null = null;
ctl.events.on('change', () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const msg = JSON.stringify({ type: 'state', data: snap() });
    for (const c of uiClients) if (c.readyState === c.OPEN) c.send(msg);
  }, 120);
});
setInterval(() => ctl.events.emit('change'), 1000).unref();

// ---------- boot ----------
server.listen(PORT, '0.0.0.0', async () => {
  ffmpeg = await ffmpegAvailable();
  await scanDirs();
  startDiscovery();
  const ip = ipFor();
  console.log(`\n  CastFlow is running\n  Dashboard : http://localhost:${PORT}   (other devices: http://${ip}:${PORT})\n  TV receiver: http://${ip}:${PORT}/receiver  (open this in the TV's browser)\n  FFmpeg    : ${ffmpeg ? 'found' : 'NOT found (transcoding disabled)'}\n  Library   : ${library.size} video(s) in ${store.settings.mediaDirs.join(', ') || 'no folders yet'}\n`);
});

process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));
