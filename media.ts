import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import mime from 'mime-types';
import { DATA_DIR, VIDEO_EXT } from './config.js';
import { store } from './store.js';
import type { MediaItem } from './types.js';

export const library = new Map<string, MediaItem>();

const idFor = (p: string) => crypto.createHash('sha1').update(p).digest('hex').slice(0, 12);

export function mimeFor(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.ts') return 'video/mp2t';
  if (ext === '.avi') return 'video/x-msvideo';
  if (ext === '.flv') return 'video/x-flv';
  return (mime.lookup(name) as string) || 'video/mp4';
}

export async function scanDirs(): Promise<void> {
  for (const [id, m] of library) if (m.kind === 'path') library.delete(id);
  const walk = async (dir: string, depth: number) => {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (VIDEO_EXT.has(path.extname(e.name).toLowerCase())) {
        try {
          const st = await fs.promises.stat(full);
          const id = idFor(full);
          library.set(id, {
            id, name: e.name, size: st.size, kind: 'path', path: full, mime: mimeFor(e.name),
            addedAt: st.mtimeMs, sidecarSubs: findSidecars(full),
          });
        } catch { /* ignore unreadable */ }
      }
    }
  };
  for (const d of store.settings.mediaDirs) await walk(d, 0);
}

function findSidecars(file: string): string[] {
  const base = file.slice(0, file.length - path.extname(file).length);
  return ['.srt', '.vtt'].map((e) => base + e).filter((p) => fs.existsSync(p));
}

export function registerRelay(id: string, name: string, size: number, type: string): MediaItem {
  const item: MediaItem = {
    id: 'r' + id, name, size, kind: 'relay', mime: type || mimeFor(name), addedAt: Date.now(), online: true, probed: true,
  };
  library.set(item.id, item);
  return item;
}

function run(cmd: string, args: string[], timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('timeout')); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}`)); });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try { await run('ffmpeg', ['-version'], 4000); return true; } catch { return false; }
}

export async function probe(item: MediaItem): Promise<MediaItem> {
  if (item.probed || item.kind !== 'path' || !item.path) return item;
  try {
    const out = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', item.path]);
    const j = JSON.parse(out);
    const v = (j.streams || []).find((s: any) => s.codec_type === 'video' && !s.disposition?.attached_pic);
    item.durationSec = Number(j.format?.duration) || undefined;
    if (v) {
      item.width = v.width; item.height = v.height; item.videoCodec = v.codec_name;
      item.hdr = /smpte2084|arib-std-b67/.test(v.color_transfer || '');
    }
    const audio = (j.streams || []).filter((s: any) => s.codec_type === 'audio');
    item.audioCodec = audio[0]?.codec_name;
    item.audioTracks = audio.map((s: any, i: number) => ({ index: i, lang: s.tags?.language, codec: s.codec_name, title: s.tags?.title }));
    item.subtitleTracks = (j.streams || []).filter((s: any) => s.codec_type === 'subtitle')
      .map((s: any, i: number) => ({ index: i, lang: s.tags?.language, codec: s.codec_name, title: s.tags?.title }));
  } catch { /* ffprobe missing: leave metadata empty */ }
  item.probed = true;
  return item;
}

export function resolutionLabel(m: MediaItem): string {
  if (!m.height) return '';
  const h = m.height;
  const base = h >= 2000 ? '4K' : h >= 1400 ? '1440p' : h >= 1000 ? '1080p' : h >= 700 ? '720p' : `${h}p`;
  return m.hdr ? `${base} HDR` : base;
}

export async function thumbnail(item: MediaItem): Promise<string | null> {
  if (item.kind !== 'path' || !item.path) return null;
  const out = path.join(DATA_DIR, 'thumbs', item.id + '.jpg');
  if (fs.existsSync(out)) return out;
  try {
    await probe(item);
    const at = Math.min(30, Math.max(1, (item.durationSec || 20) * 0.1));
    await run('ffmpeg', ['-y', '-ss', String(at), '-i', item.path, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', out], 30000);
    return fs.existsSync(out) ? out : null;
  } catch { return null; }
}

/** Convert an .srt/.vtt sidecar to WebVTT text. */
export async function sidecarVtt(file: string): Promise<string> {
  let t = await fs.promises.readFile(file, 'utf8');
  if (file.toLowerCase().endsWith('.vtt')) return t;
  t = t.replace(/^﻿/, '').replace(/\r/g, '').replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2');
  return 'WEBVTT\n\n' + t;
}
