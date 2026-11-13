import { useRef, useState } from 'react';
import { Check, CloudUpload, FolderOpen, Loader2, Monitor, PlaySquare } from 'lucide-react';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { useServer } from '../lib/server';
import { LibraryGrid } from './LibraryView';
import { MirrorPanel } from './MirrorView';

export type Mode = 'video' | 'mirror' | 'library';
const EXT = '.mp4,.mkv,.mov,.avi,.webm,.ts,.m4v,.flv,video/*';
const OK = /\.(mp4|mkv|mov|avi|webm|ts|m4v|flv|mpg|mpeg|wmv)$/i;

const modes: { id: Mode; title: string; sub: string; icon: typeof Monitor }[] = [
  { id: 'video', title: 'Play a Video', sub: 'Select and play any video file', icon: PlaySquare },
  { id: 'mirror', title: 'Screen Mirror', sub: 'Mirror your laptop or mobile screen', icon: Monitor },
  { id: 'library', title: 'Open Library', sub: 'Play from saved videos', icon: FolderOpen },
];

export function CastPicker({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { state, addFile, toast } = useServer();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const connected = state?.connection?.state === 'connected';

  const handle = async (file?: File | null) => {
    if (!file) return;
    if (!OK.test(file.name) && !file.type.startsWith('video/')) { toast('error', `${file.name} is not a supported video`, 'Supported: MP4, MKV, MOV, AVI, WebM, TS, M4V, FLV.'); return; }
    setBusy(true);
    try {
      const mediaId = await addFile(file);
      if (connected) { await api('/api/play', { mediaId, startSec: 0 }); toast('success', 'Sent to TV', 'Waiting for the TV to confirm playback…'); }
      else toast('info', `${file.name} is ready`, 'Connect to a TV, then open it from My Library or select it again.');
    } catch (e) { toast('error', 'Could not start playback', (e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  return (
    <section className="glass p-5 sm:p-6" aria-label="Choose what to cast">
      <h2 className="mb-4 text-[22px] font-semibold tracking-tight">Choose What to Cast</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {modes.map(({ id, title, sub, icon: I }) => {
          const on = mode === id;
          return (
            <button key={id} onClick={() => setMode(id)} aria-pressed={on}
              className={cx('focus-ring relative rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5', on ? 'bg-violet-500/10 ring-2 ring-violet-400/80 shadow-glow' : 'chip hover:bg-white/10')}>
              {on && <span className="absolute right-3 top-3 grid h-6 w-6 animate-pop place-items-center rounded-full bg-violet-500"><Check className="h-4 w-4 text-white" strokeWidth={3} /></span>}
              <I className={cx('h-8 w-8', on ? 'text-violet-300' : 'text-ink')} strokeWidth={1.5} />
              <div className="mt-3 text-[16px] font-semibold">{title}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-mute">{sub}</div>
            </button>
          );
        })}
      </div>

      {mode === 'video' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files?.[0]); }}
          className={cx('mt-4 grid place-items-center rounded-2xl border-2 border-dashed px-4 py-9 text-center transition-all', over ? 'border-violet-400 bg-violet-500/10 shadow-glow' : 'border-line/20')}>
          <div>
            <div className={cx('mx-auto grid h-14 w-14 place-items-center transition-transform', over && 'scale-110')}>
              {busy ? <Loader2 className="h-10 w-10 animate-spin text-violet-400" /> : <CloudUpload className="h-12 w-12 text-violet-400" strokeWidth={1.4} />}
            </div>
            <h3 className="mt-2 text-[18px] font-semibold">Select a Video File</h3>
            <p className="mt-1 text-[14px] text-mute">Drag & drop your video here or click to browse</p>
            <p className="mx-auto mt-1 max-w-md text-[12px] text-mute/80">The file stays on this device. CastFlow serves only the parts your TV asks for.</p>
            <input ref={input} type="file" accept={EXT} className="sr-only" id="file" onChange={(e) => handle(e.target.files?.[0])} />
            <button onClick={() => input.current?.click()} disabled={busy} className="btn-primary focus-ring mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px]"><FolderOpen className="h-5 w-5" />Choose Video</button>
            <p className="mt-4 text-[13px] text-mute">Supported: MP4, MKV, MOV, AVI, WebM, TS, M4V, FLV, <b className="text-violet-300">(Any Size)</b></p>
          </div>
        </div>
      )}
      {mode === 'mirror' && <div className="mt-4"><MirrorPanel /></div>}
      {mode === 'library' && <div className="mt-4"><LibraryGrid compact /></div>}
    </section>
  );
}
