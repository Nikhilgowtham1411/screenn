import { XMLParser } from 'fast-xml-parser';
import type { Output, OutputStatus, PlayOptions } from './types.js';

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

export interface DlnaDescription {
  udn: string;
  name: string;
  model?: string;
  avTransportUrl?: string;
  avType?: string;
  renderingControlUrl?: string;
  rcType?: string;
}

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function collectServices(dev: any, out: any[]) {
  for (const s of asArray(dev?.serviceList?.service)) out.push(s);
  for (const d of asArray(dev?.deviceList?.device)) collectServices(d, out);
}

export async function describe(location: string): Promise<DlnaDescription | null> {
  try {
    const r = await fetch(location, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = parser.parse(await r.text());
    const dev = j?.root?.device;
    if (!dev) return null;
    const services: any[] = [];
    collectServices(dev, services);
    const av = services.find((s) => String(s.serviceType).includes('AVTransport'));
    if (!av) return null; // not a media renderer
    const rc = services.find((s) => String(s.serviceType).includes('RenderingControl'));
    const abs = (u?: string) => (u ? new URL(u, j.root.URLBase || location).toString() : undefined);
    return {
      udn: String(dev.UDN || location),
      name: String(dev.friendlyName || 'DLNA renderer'),
      model: dev.modelName ? String(dev.modelName) : undefined,
      avTransportUrl: abs(av.controlURL), avType: String(av.serviceType),
      renderingControlUrl: abs(rc?.controlURL), rcType: rc ? String(rc.serviceType) : undefined,
    };
  } catch { return null; }
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

async function soap(url: string, type: string, action: string, args: Record<string, string | number>): Promise<any> {
  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${type}">${Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</u:${action}></s:Body></s:Envelope>`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${type}#${action}"` },
    body, signal: AbortSignal.timeout(6000),
  });
  const text = await r.text();
  if (!r.ok) {
    const code = /<errorCode>(\d+)<\/errorCode>/.exec(text)?.[1];
    throw new Error(`${action} failed (HTTP ${r.status}${code ? `, UPnP error ${code}` : ''})`);
  }
  const j = parser.parse(text);
  return j?.Envelope?.Body?.[`${action}Response`] ?? {};
}

const hms = (s: number) => {
  s = Math.max(0, Math.floor(s));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};
const parseHms = (t?: string) => {
  if (!t || !/^\d+:\d+:\d+/.test(t)) return undefined;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + Math.floor(s);
};

export class DlnaOutput implements Output {
  constructor(private d: DlnaDescription) {}
  private av = (a: string, args: Record<string, string | number> = {}) =>
    soap(this.d.avTransportUrl!, this.d.avType!, a, { InstanceID: 0, ...args });

  async play(o: PlayOptions) {
    try { await this.av('Stop'); } catch { /* nothing playing */ }
    const didl = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${esc(o.title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:${o.mime}:DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000">${esc(o.url)}</res></item></DIDL-Lite>`;
    await this.av('SetAVTransportURI', { CurrentURI: esc(o.url), CurrentURIMetaData: esc(didl) });
    await this.av('Play', { Speed: 1 });
    if (o.startSec > 0 && !o.transcoding) {
      // Most renderers only accept Seek once they are PLAYING.
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 700));
        const s = await this.status();
        if (s?.state === 'playing') { await this.seek(o.startSec).catch(() => {}); break; }
      }
    }
  }
  pause = async () => { await this.av('Pause'); };
  resume = async () => { await this.av('Play', { Speed: 1 }); };
  seek = async (sec: number) => { await this.av('Seek', { Unit: 'REL_TIME', Target: hms(sec) }); };
  stop = async () => { await this.av('Stop'); };
  async setVolume(v: number) {
    if (!this.d.renderingControlUrl) throw new Error('This TV does not expose volume control over DLNA');
    await soap(this.d.renderingControlUrl, this.d.rcType!, 'SetVolume', { InstanceID: 0, Channel: 'Master', DesiredVolume: Math.round(v) });
  }
  async status(): Promise<OutputStatus | null> {
    try {
      const t = await this.av('GetTransportInfo');
      const st = String(t.CurrentTransportState || '');
      const state = st === 'PLAYING' ? 'playing' : st === 'PAUSED_PLAYBACK' || st === 'PAUSED_RECORDING' ? 'paused'
        : st === 'TRANSITIONING' ? 'loading' : st === 'STOPPED' || st === 'NO_MEDIA_PRESENT' ? 'stopped' : 'idle';
      let position: number | undefined; let duration: number | undefined; let volume: number | undefined;
      try {
        const p = await this.av('GetPositionInfo');
        position = parseHms(String(p.RelTime)); duration = parseHms(String(p.TrackDuration));
      } catch { /* optional */ }
      if (this.d.renderingControlUrl) {
        try {
          const v = await soap(this.d.renderingControlUrl, this.d.rcType!, 'GetVolume', { InstanceID: 0, Channel: 'Master' });
          volume = Number(v.CurrentVolume);
        } catch { /* optional */ }
      }
      return { state, position, duration, volume };
    } catch { return null; }
  }
  close() {}
}
