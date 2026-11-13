import { useCallback, useEffect, useState } from 'react';
import { Clock, FolderPlus, Film, Play, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { api, get } from '../lib/api';
import { cx, fmtSize, fmtTime } from '../lib/format';
import { useServer } from '../lib/server';
import type { MediaView } from '../lib/types';

export function useLibrary() {
  const { state } = useServer();
  const [items, setItems] = useState<MediaView[] | null>(null);
  const v = state?.libraryVersion;
  const load = useCallback(() => { get<{ items: MediaView[] }>('/api/library').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  useEffect(() => { load(); }, [v, load]);
  return { items, reload: load };
}

export function LibraryGrid({ compact = false }: { compact?: boolean }) {
  const { state, thumbs, toast } = useServer();
  const { items } = useLibrary();
  const connected = state?.connection?.state === 'connected';

  const play = async (m: MediaView) => {
    if (!connected) { toast('error', 'Connect to a TV first', 'Use the Connect to TV card, then pick a video.'); return; }
    try { await api('/api/play', { mediaId: m.id }); } catch (e) { toast('error', 'Could not start playback', (e as Error).message); }
  };

  if (items === null) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-40" />)}</div>;
  if (!items.length) return (
    <div className="rounded-2xl border border-dashed border-line/20 p-8 text-center">
      <Film className="mx-auto mb-2 h-9 w-9 text-mute" strokeWidth={1.3} />
      <p className="font-medium">Your library is empty</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-mute">Add a folder in Settings or Library to list videos stored on the CastFlow computer, or pick a file with “Play a Video”.</p>
    </div>
  );

  const list = compact ? items.slice(0, 6) : items;
  return (
    <div className={cx('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-4')}>
      {list.map((m) => {
        const thumb = m.thumb ?? thumbs[m.id];
        return (
          <button key={m.id} onClick={() => play(m)} disabled={!m.online} className="focus-ring group chip overflow-hidden rounded-2xl text-left transition hover:-translate-y-0.5 hover:ring-1 hover:ring-violet-400/50 disabled:opacity-50">
            <div className="relative aspect-video bg-gradient-to-br from-violet-900/50 to-slate-900">
              {thumb && <img loading="lazy" src={thumb} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
              <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100"><span className="grid h-11 w-11 place-items-center rounded-full bg-violet-500 shadow-glow"><Play className="ml-0.5 h-5 w-5 fill-white text-white" /></span></span>
              {m.durationSec ? <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px]">{fmtTime(m.durationSec)}</span> : null}
              <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{m.kind === 'relay' ? (m.online ? 'This browser' : 'Offline') : 'On PC'}</span>
            </div>
            <div className="p-2.5">
              <div className="truncate text-[14px] font-medium" title={m.name}>{m.name}</div>
              <div className="text-[12px] text-mute">{fmtSize(m.size)}{m.resolution && ` · ${m.resolution}`}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function LibraryView() {
  const { state, toast } = useServer();
  const { reload } = useLibrary();
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); reload(); } catch (e) { toast('error', (e as Error).message); } finally { setBusy(false); } };
  const recent = state?.recent ?? [];

  return (
    <div className="space-y-5 animate-rise">
      <section className="glass p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[22px] font-semibold tracking-tight">My Library</h2>
          <button onClick={() => run(() => api('/api/library/rescan', {}))} disabled={busy} className="focus-ring chip flex items-center gap-2 rounded-xl px-3 py-2 text-sm"><RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} />Rescan folders</button>
        </div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder on the CastFlow computer, e.g. D:\Movies or /home/me/Videos" aria-label="Folder path"
            className="focus-ring flex-1 rounded-xl border border-line/20 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-violet-400" />
          <button onClick={() => run(async () => { await api('/api/library/add-folder', { path: folder }); setFolder(''); })} disabled={!folder || busy} className="btn-primary flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm"><FolderPlus className="h-4 w-4" />Add folder</button>
        </div>
        {state?.settings.mediaDirs.length ? <div className="mb-4 flex flex-wrap gap-2">{state.settings.mediaDirs.map((d) => (
          <span key={d} className="chip flex items-center gap-2 rounded-lg px-2.5 py-1 text-[12px] text-mute">{d}<button aria-label={`Remove ${d}`} onClick={() => run(() => api('/api/library/remove-folder', { path: d }))} className="hover:text-red-300">×</button></span>
        ))}</div> : null}
        <LibraryGrid />
      </section>
      {recent.length > 0 && (
        <section className="glass p-5 sm:p-6">
          <h3 className="mb-3 flex items-center gap-2 text-[17px] font-semibold"><Clock className="h-5 w-5 text-violet-300" />Recent videos</h3>
          <ul className="divide-y divide-line/10">
            {recent.map((r) => (
              <li key={r.mediaId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{r.name}</div><div className="text-[12px] text-mute">{fmtSize(r.size)} · {new Date(r.at).toLocaleString()}</div></div>
                <button onClick={() => api('/api/play', { mediaId: r.mediaId }).catch((e) => toast('error', e.message))} className="focus-ring chip flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] hover:bg-white/10"><Play className="h-3.5 w-3.5" />Play</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="flex items-center gap-2 px-1 text-[12px] text-mute">{state ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}Videos from folders are streamed straight from this computer's disk. Files picked in a browser stay in that browser.</p>
    </div>
  );
}
