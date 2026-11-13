import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { Bonjour } from 'bonjour-service';
// @ts-ignore - node-ssdp ships no types
import ssdp from 'node-ssdp';
import { describe, type DlnaDescription } from './dlna.js';
import { probeCast } from './cast.js';
import type { Device } from './types.js';

export const discoveryEvents = new EventEmitter();
export const found = new Map<string, Device>();
export const dlnaInfo = new Map<string, DlnaDescription>();
export let searching = false;

const MR = 'urn:schemas-upnp-org:device:MediaRenderer:1';
const seenLocations = new Map<string, number>();

function upsert(d: Device) {
  const prev = found.get(d.id);
  found.set(d.id, { ...prev, ...d, status: prev?.status === 'connected' || prev?.status === 'connecting' ? prev.status : 'available' });
  discoveryEvents.emit('change');
}

async function handleSsdp(location: string, address: string) {
  if (!location) return;
  const last = seenLocations.get(location) || 0;
  if (Date.now() - last < 4000) return;
  seenLocations.set(location, Date.now());
  const d = await describe(location);
  if (!d) return;
  const id = 'dlna:' + d.udn.replace(/^uuid:/, '');
  dlnaInfo.set(id, d);
  upsert({ id, name: d.name, kind: 'dlna', address, model: d.model, status: 'available', lastSeen: Date.now(), avTransportUrl: d.avTransportUrl, renderingControlUrl: d.renderingControlUrl });
}

let ssdpClient: any = null;
function ssdpSearch() {
  try {
    if (!ssdpClient) {
      ssdpClient = new ssdp.Client({ explicitSocketBind: true });
      ssdpClient.on('response', (headers: any, _code: number, rinfo: { address: string }) => handleSsdp(headers.LOCATION, rinfo.address));
    }
    ssdpClient.search(MR);
  } catch (e) { console.warn('SSDP search failed:', (e as Error).message); }
}

let bonjour: Bonjour | null = null;
let browser: ReturnType<Bonjour['find']> | null = null;
function startMdns() {
  try {
    bonjour = new Bonjour();
    browser = bonjour.find({ type: 'googlecast' }, (svc) => {
      const ip = (svc.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || svc.referer?.address;
      if (!ip) return;
      const txt = (svc.txt || {}) as Record<string, string>;
      const castId = txt.id || svc.name;
      upsert({
        id: 'cast:' + castId, name: txt.fn || svc.name, kind: 'cast', address: ip, model: txt.md,
        status: 'available', lastSeen: Date.now(), castPort: svc.port || 8009,
      });
    });
  } catch (e) { console.warn('mDNS unavailable:', (e as Error).message); }
}

export function startDiscovery() {
  startMdns();
  search();
  setInterval(() => search(false), 20_000).unref();
  // expire devices not seen recently (never expire the connected one)
  setInterval(() => {
    for (const [id, d] of found) {
      if (d.status !== 'connected' && Date.now() - d.lastSeen > 90_000) { found.delete(id); discoveryEvents.emit('change'); }
    }
  }, 15_000).unref();
}

export async function search(announce = true): Promise<void> {
  if (announce) { searching = true; discoveryEvents.emit('change'); }
  ssdpSearch();
  try { browser?.update(); } catch { /* */ }
  if (announce) {
    await new Promise((r) => setTimeout(r, 6000));
    searching = false;
    discoveryEvents.emit('change');
  }
}

/** Unicast SSDP to one IP – works when multicast is filtered but the TV answers directly. */
function unicastSsdp(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const msg = Buffer.from(['M-SEARCH * HTTP/1.1', `HOST: ${ip}:1900`, 'MAN: "ssdp:discover"', 'MX: 2', `ST: ${MR}`, '', ''].join('\r\n'));
    const done = (v: string | null) => { try { sock.close(); } catch { /* */ } resolve(v); };
    const t = setTimeout(() => done(null), 3500);
    sock.on('message', (m) => {
      const loc = /^location:\s*(.+)$/im.exec(m.toString())?.[1]?.trim();
      if (loc) { clearTimeout(t); done(loc); }
    });
    sock.on('error', () => { clearTimeout(t); done(null); });
    sock.send(msg, 1900, ip, (e) => { if (e) { clearTimeout(t); done(null); } });
  });
}

export async function findByIp(ip: string): Promise<Device | null> {
  const loc = await unicastSsdp(ip);
  if (loc) {
    await handleSsdp(loc, ip);
    const d = [...found.values()].find((x) => x.address === ip && x.kind === 'dlna');
    if (d) return d;
  }
  if (await probeCast(ip)) {
    const id = 'cast:ip-' + ip;
    upsert({ id, name: `Google Cast device (${ip})`, kind: 'cast', address: ip, status: 'available', lastSeen: Date.now(), castPort: 8009 });
    return found.get(id)!;
  }
  return null;
}

export function stopDiscovery() {
  try { ssdpClient?.stop(); } catch { /* */ }
  try { bonjour?.destroy(); } catch { /* */ }
}
