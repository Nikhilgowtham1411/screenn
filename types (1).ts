export type DeviceKind = 'receiver' | 'dlna' | 'cast';
export interface Device {
  id: string; name: string; kind: DeviceKind; address: string; model?: string;
  status: 'available' | 'connecting' | 'connected' | 'unreachable'; lastSeen: number; paired?: boolean; note?: string;
}
export interface MediaView {
  id: string; name: string; size: number; kind: 'path' | 'relay'; durationSec?: number; resolution: string;
  videoCodec?: string; audioCodec?: string; online: boolean; addedAt: number;
  audioTracks: { index: number; lang?: string; codec?: string; title?: string }[];
  subtitleTracks: { index: number; lang?: string; codec?: string; title?: string }[];
  sidecarSubs: number; thumb: string | null;
}
export interface Playback {
  mediaId: string | null; deviceId: string | null; state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';
  confirmed: boolean; position: number; duration: number; volume: number; quality: 'original' | '1080p' | '720p' | '480p';
  audioTrack: number; subtitle: number | null; transcoding: boolean; error?: string; hint?: string;
}
export interface ServerState {
  devices: Device[];
  connection: { deviceId: string; state: 'connected' | 'reconnecting'; latencyMs: number | null; since: number } | null;
  playback: Playback;
  media: MediaView | null;
  stats: { bytesServed: number; speedMbps: number; activeStreams: number; currentFileBytes: number };
  searching: boolean; libraryVersion: number; libraryCount: number;
  recent: { mediaId: string; name: string; size: number; at: number }[];
  settings: { quality: string; transcode: 'auto' | 'always' | 'never'; theme: 'dark' | 'light'; mediaDirs: string[]; autoReconnect: boolean };
  server: { port: number; ips: string[]; ffmpeg: boolean };
}
