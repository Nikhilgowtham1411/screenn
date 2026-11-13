import fs from 'node:fs';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import type { Request, Response } from 'express';
import { library, probe, sidecarVtt } from './media.js';
import { relayStream } from './relay.js';
import type { MediaItem, StreamStats } from './types.js';

export const stats: StreamStats = { bytesServed: 0, speedMbps: 0, activeStreams: 0, currentFileBytes: 0 };

let windowBytes = 0;
export function countBytes(n: number) { stats.bytesServed += n; windowBytes += n; stats.currentFileBytes += n; }
setInterval(() => {
  const mbps = (windowBytes * 8) / 1_000_000 / 1; // per second
  stats.speedMbps = Math.round((stats.speedMbps * 0.5 + mbps * 0.5) * 10) / 10;
  windowBytes = 0;
}, 1000).unref();

function parseRange(h: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m) return 'invalid';
  let start: number; let end: number;
  if (m[1] === '' && m[2] === '') return 'invalid';
  if (m[1] === '') { const n = Number(m[2]); start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

function dlnaHeaders(res: Response) {
  res.setHeader('transferMode.dlna.org', 'Streaming');
  res.setHeader('contentFeatures.dlna.org', 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');
}

export async function serveMedia(req: Request, res: Response) {
  const item = library.get(req.params.id);
  if (!item) { res.status(404).send('Unknown media'); return; }
  if (item.kind === 'relay' && !item.online) { res.status(503).send('The browser tab that owns this file is offline'); return; }
  const size = item.size;
  const range = parseRange(req.headers.range, size);
  if (range === 'invalid') { res.status(416).setHeader('Content-Range', `bytes */${size}`).end(); return; }

  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  res.status(range ? 206 : 200);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', item.mime);
  res.setHeader('Content-Length', String(size === 0 ? 0 : end - start + 1));
  res.setHeader('Cache-Control', 'no-store');
  if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  dlnaHeaders(res);
  if (req.method === 'HEAD' || size === 0) { res.end(); return; }

  const body: Readable = item.kind === 'path'
    ? fs.createReadStream(item.path!, { start, end, highWaterMark: 1 << 20 })
    : Readable.from(relayStream(item.id, start, end), { objectMode: false });

  stats.activeStreams++;
  body.on('data', (c: Buffer) => countBytes(c.length));
  const done = () => { stats.activeStreams = Math.max(0, stats.activeStreams - 1); body.destroy(); };
  res.on('close', done);
  body.on('error', (e) => { console.warn('stream error:', (e as Error).message); res.destroy(); });
  body.pipe(res);
}

/** Fragmented-MP4 transcode for TVs that cannot decode the source container/codec. */
export async function serveTranscode(req: Request, res: Response) {
  const item = library.get(req.params.id);
  if (!item) { res.status(404).send('Unknown media'); return; }
  await probe(item);
  const start = Math.max(0, Number(req.query.start) || 0);
  const q = String(req.query.q || 'original');
  const audio = Number(req.query.audio) || 0;
  const heights: Record<string, number> = { '1080p': 1080, '720p': 720, '480p': 480 };

  const args = ['-hide_banner', '-loglevel', 'error'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', item.kind === 'path' ? item.path! : 'pipe:0');
  args.push('-map', '0:v:0', '-map', `0:a:${audio}?`);
  const copyVideo = item.videoCodec === 'h264' && q === 'original';
  if (copyVideo) args.push('-c:v', 'copy');
  else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p');
    if (heights[q]) args.push('-vf', `scale=-2:'min(${heights[q]},ih)'`);
  }
  args.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k', '-sn',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');

  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (d) => (err += d));
  ff.on('error', () => { if (!res.headersSent) res.status(501).send('FFmpeg is not installed on the CastFlow computer'); });
  if (item.kind === 'relay') {
    const src = Readable.from(relayStream(item.id, 0, item.size - 1), { objectMode: false });
    src.pipe(ff.stdin).on('error', () => {});
    res.on('close', () => src.destroy());
  } else ff.stdin.end();

  res.status(200);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  dlnaHeaders(res);
  stats.activeStreams++;
  ff.stdout.on('data', (c: Buffer) => countBytes(c.length));
  ff.stdout.pipe(res);
  res.on('close', () => { stats.activeStreams = Math.max(0, stats.activeStreams - 1); ff.kill('SIGKILL'); });
  ff.on('close', (code) => { if (code && err) console.warn('ffmpeg:', err.split('\n')[0]); });
}

export async function serveSubtitle(req: Request, res: Response) {
  const item = library.get(req.params.id) as MediaItem | undefined;
  if (!item || item.kind !== 'path') { res.status(404).send('No subtitles'); return; }
  const which = req.params.which;
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (which.startsWith('sc')) {
    const f = item.sidecarSubs?.[Number(which.slice(2))];
    if (!f) { res.status(404).end(); return; }
    res.send(await sidecarVtt(f));
    return;
  }
  const ff = spawn('ffmpeg', ['-v', 'error', '-i', item.path!, '-map', `0:s:${Number(which) || 0}`, '-f', 'webvtt', 'pipe:1']);
  ff.on('error', () => res.status(501).end());
  ff.stdout.pipe(res);
  res.on('close', () => ff.kill('SIGKILL'));
}
