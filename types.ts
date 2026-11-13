export type DeviceKind = 'receiver' | 'dlna' | 'cast';
export type DeviceStatus = 'available' | 'connecting' | 'connected' | 'unreachable';

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  address: string;
  model?: string;
  status: DeviceStatus;
  lastSeen: number;
  paired?: boolean;
  /** DLNA control endpoints */
  avTransportUrl?: string;
  renderingControlUrl?: string;
  castPort?: number;
  note?: string;
}

export interface MediaItem {
  id: string;
  name: string;
  size: number;
  kind: 'path' | 'relay';
  path?: string;
  mime: string;
  addedAt: number;
  durationSec?: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  hdr?: boolean;
  audioTracks?: { index: number; lang?: string; codec?: string; title?: string }[];
  subtitleTracks?: { index: number; lang?: string; codec?: string; title?: string }[];
  sidecarSubs?: string[];
  probed?: boolean;
  /** relay items: is the browser tab that owns the file still connected? */
  online?: boolean;
}

export type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';
export type Quality = 'original' | '1080p' | '720p' | '480p';

export interface PlaybackState {
  mediaId: string | null;
  deviceId: string | null;
  state: PlayState;
  /** true only when the target device itself reported this state */
  confirmed: boolean;
  position: number;
  duration: number;
  volume: number;
  quality: Quality;
  audioTrack: number;
  subtitle: number | null;
  transcoding: boolean;
  error?: string;
  hint?: string;
  updatedAt: number;
}

export interface StreamStats {
  bytesServed: number;
  speedMbps: number;
  activeStreams: number;
  currentFileBytes: number;
}

export interface PlayOptions {
  url: string;
  startSec: number;
  title: string;
  mime: string;
  subtitleUrl?: string;
  transcoding: boolean;
}

export interface OutputStatus {
  state: PlayState;
  position?: number;
  duration?: number;
  volume?: number;
}

export interface Output {
  play(o: PlayOptions): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(sec: number): Promise<void>;
  stop(): Promise<void>;
  setVolume(v: number): Promise<void>;
  /** Ask the device for its real status. null = unreachable. */
  status(): Promise<OutputStatus | null>;
  close(): void;
}
