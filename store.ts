import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, defaultMediaDirs } from './config.js';
import type { Quality } from './types.js';

export interface PairedDevice { id: string; name: string; kind: string; address: string; token?: string; lastConnected: number }
export interface RecentItem { mediaId: string; name: string; size: number; at: number }

export interface Persisted {
  paired: PairedDevice[];
  positions: Record<string, number>;
  recent: RecentItem[];
  settings: { quality: Quality; transcode: 'auto' | 'always' | 'never'; theme: 'dark' | 'light'; mediaDirs: string[]; autoReconnect: boolean };
}

const file = path.join(DATA_DIR, 'state.json');

function load(): Persisted {
  const base: Persisted = {
    paired: [], positions: {}, recent: [],
    settings: { quality: 'original', transcode: 'auto', theme: 'dark', mediaDirs: defaultMediaDirs(), autoReconnect: true },
  };
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...base, ...j, settings: { ...base.settings, ...(j.settings || {}) } };
  } catch { return base; }
}

export const store: Persisted = load();

let timer: NodeJS.Timeout | null = null;
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { fs.writeFileSync(file, JSON.stringify(store, null, 2)); } catch (e) { console.error('save failed', e); }
  }, 400);
}
