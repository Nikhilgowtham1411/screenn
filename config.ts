import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export const PORT = Number(process.env.PORT || 8787);
export const DATA_DIR = process.env.CASTFLOW_DATA || path.join(os.homedir(), '.castflow');
fs.mkdirSync(path.join(DATA_DIR, 'thumbs'), { recursive: true });

export const VIDEO_EXT = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.ts', '.m4v', '.flv', '.mpg', '.mpeg', '.wmv']);

export function defaultMediaDirs(): string[] {
  const env = (process.env.CASTFLOW_MEDIA || '').split(path.delimiter).filter(Boolean);
  if (env.length) return env;
  const home = os.homedir();
  return ['Videos', 'Movies'].map((d) => path.join(home, d)).filter((d) => fs.existsSync(d));
}

interface Iface { address: string; netmask: string }

export function lanInterfaces(): Iface[] {
  const out: Iface[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push({ address: i.address, netmask: i.netmask });
    }
  }
  return out;
}

const ipToInt = (ip: string) => ip.split('.').reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;

/** Pick our IP that lives on the same subnet as `target`, so the TV can reach the stream URL. */
export function ipFor(target?: string): string {
  const ifaces = lanInterfaces();
  if (target) {
    const t = ipToInt(target);
    for (const i of ifaces) {
      const m = ipToInt(i.netmask);
      if ((ipToInt(i.address) & m) === (t & m)) return i.address;
    }
  }
  return ifaces[0]?.address || '127.0.0.1';
}
