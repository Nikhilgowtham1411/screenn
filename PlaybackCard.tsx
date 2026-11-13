import { useEffect, useRef, useState } from 'react';
import { Captions, Expand, Gauge, Loader2, Pause, Play, PlayCircle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, Languages, Film } from 'lucide-react';
import { api } from '../lib/api';
import { cx, fmtSize, fmtTime } from '../lib/format';
import { useServer } from '../lib/server';

function Select({ icon, label, value, onChange, children }: { icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="chip flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12px] text-mute">
      {icon}<span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="focus-ring w-full min-w-0 truncate bg-transparent text-[12px] text-ink outline-none">{children}</select>
    </label>
  );
}

export function PlaybackCard() {
  const { state, thumbs, toast } = useServer();
  const pb = state?.playback;
  const media = state?.media;
  const conn = state?.connection;
  const confirmedConn = conn?.state === 'connected';
  const rootRef = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [showVol, setShowVol] = useState(false);
  const [vol, setVol] = useState(50);
  useEffect(() => { if (pb && !showVol) setVol(pb.volume); }, [pb?.volume, showVol]);

  const act = async (action: string, value?: number) => { try { await api('/api/control', { action, value }); } catch (e) { toast('error', (e as Error).message); } };
  const dur = pb?.duration || media?.durationSec || 0;
  const pos = drag ?? pb?.position ?? 0;
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
  const playing = pb?.state === 'playing';
  const loading = pb?.state === 'loading';
  const canControl = confirmedConn && !!pb?.mediaId;

  const toggle = async () => {
    if (!pb) return;
    if (playing) return act('pause');
    if (pb.state === 'paused') return act('resume');
    if (pb.mediaId && confirmedConn) { try { await api('/api/play', { mediaId: pb.mediaId }); } catch (e) { toast('error', (e as Error).message); } }
  };

  const pill = confirmedConn
    ? { t: 'TV Connected', c: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30', d: 'bg-emerald-400' }
    : conn?.state === 'reconnecting' ? { t: 'Reconnecting…', c: 'text-amber-300 bg-amber-400/10 ring-amber-400/30', d: 'bg-amber-400 animate-pulse' }
    : { t: 'No TV connected', c: 'text-mute bg-white/5 ring-white/10', d: 'bg-zinc-500' };

  const thumb = media ? (media.thumb ?? thumbs[media.id]) : undefined;
  const VolIcon = vol === 0 ? VolumeX : vol < 40 ? Volume1 : Volume2;
  const subs = media ? [...media.subtitleTracks.map((s) => ({ v: String(s.index), l: s.title || s.lang || `Track ${s.index + 1}` })), ...Array.from({ length: media.sidecarSubs }, (_, i) => ({ v: String(1000 + i), l: `External file ${i + 1}` }))] : [];

  return (
    <section ref={rootRef} className="glass p-5 [&:fullscreen]:overflow-auto [&:fullscreen]:bg-[rgb(var(--bg))] [&:fullscreen]:p-10" aria-label="Playback">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><PlayCircle className="h-7 w-7" strokeWidth={1.5} /><h2 className="text-[22px] font-semibold tracking-tight">Playback</h2></div>
        <span className={cx('flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1', pill.c)}><i className={cx('h-1.5 w-1.5 rounded-full', pill.d)} />{pill.t}</span>
      </header>

      <div className="chip flex items-center gap-4 rounded-2xl p-2.5">
        <div className="relative aspect-[16/10] w-[42%] max-w-[200px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-violet-900/60 via-indigo-900/50 to-slate-900">
          {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" onError={(e) => ((e.currentTarget.style.display = 'none'))} />}
          {!media && <Film className="absolute inset-0 m-auto h-8 w-8 text-white/30" />}
          {media && <span className="absolute inset-0 grid place-items-center"><span className="grid h-10 w-10 place-items-center rounded-full bg-black/40 ring-1 ring-white/50 backdrop-blur"><Play className="ml-0.5 h-4 w-4 fill-white text-white" /></span></span>}
          {dur > 0 && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium">{fmtTime(dur)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          {media ? (
            <>
              <div className="truncate text-[17px] font-semibold" title={media.name}>{media.name}</div>
              <div className="mt-0.5 text-[14px] text-mute">{fmtSize(media.size)}{media.resolution && <> <span className="mx-1">•</span> {media.resolution}</>}</div>
              {pb?.transcoding && <div className="mt-1 inline-block rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[11px] text-violet-300">Transcoding</div>}
            </>
          ) : <><div className="text-[16px] font-semibold">Nothing playing</div><div className="mt-0.5 text-[13px] text-mute">Choose a video, connect a TV and press play.</div></>}
        </div>
      </div>

      <div className="mt-5">
        <input type="range" className="cf-range" min={0} max={Math.max(1, Math.floor(dur))} step={1} value={Math.floor(pos)} disabled={!canControl || !dur || pb?.state === 'loading'}
          style={{ ['--p' as string]: `${pct}%` }} aria-label="Seek" aria-valuetext={`${fmtTime(pos)} of ${fmtTime(dur)}`}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => { if (drag !== null) { act('seek', drag); setDrag(null); } }} onKeyUp={() => { if (drag !== null) { act('seek', drag); setDrag(null); } }} />
        <div className="mt-2 flex justify-between text-[13px] tabular-nums text-mute"><span>{fmtTime(pos)}</span><span>{fmtTime(dur)}</span></div>
      </div>

      <div className="relative mt-3 flex items-center justify-between">
        <div className="relative">
          <button onClick={() => setShowVol((v) => !v)} aria-label="Volume" aria-expanded={showVol} disabled={!confirmedConn} className="focus-ring chip grid h-12 w-12 place-items-center rounded-2xl transition hover:bg-white/10 disabled:opacity-40"><VolIcon className="h-5 w-5" /></button>
          {showVol && (
            <div className="glass absolute bottom-14 left-0 z-10 w-44 animate-rise p-3">
              <input type="range" className="cf-range" min={0} max={100} value={vol} aria-label="Volume level" style={{ ['--p' as string]: `${vol}%` }}
                onChange={(e) => setVol(Number(e.target.value))} onPointerUp={() => act('volume', vol)} onKeyUp={() => act('volume', vol)} />
            </div>
          )}
        </div>
        <button onClick={() => act('prev')} disabled={!confirmedConn} aria-label="Previous" className="focus-ring chip grid h-12 w-14 place-items-center rounded-2xl transition hover:bg-white/10 disabled:opacity-40"><SkipBack className="h-5 w-5 fill-current" /></button>
        <button onClick={toggle} disabled={!canControl} aria-label={playing ? 'Pause' : 'Play'} className="btn-primary focus-ring grid h-16 w-16 place-items-center rounded-full">
          {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : playing ? <Pause className="h-7 w-7 fill-current" /> : <Play className="ml-1 h-7 w-7 fill-current" />}
        </button>
        <button onClick={() => act('next')} disabled={!confirmedConn} aria-label="Next" className="focus-ring chip grid h-12 w-14 place-items-center rounded-2xl transition hover:bg-white/10 disabled:opacity-40"><SkipForward className="h-5 w-5 fill-current" /></button>
        <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen?.())} aria-label="Fullscreen" className="focus-ring chip grid h-12 w-12 place-items-center rounded-2xl transition hover:bg-white/10"><Expand className="h-5 w-5" /></button>
      </div>

      {media && confirmedConn && (
        <div className="mt-4 flex gap-2">
          <Select icon={<Gauge className="h-3.5 w-3.5 shrink-0" />} label="Quality" value={pb!.quality} onChange={(v) => api('/api/options', { quality: v }).catch((e) => toast('error', e.message))}>
            <option value="original">Original</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option>
          </Select>
          {media.audioTracks.length > 1 && (
            <Select icon={<Languages className="h-3.5 w-3.5 shrink-0" />} label="Audio track" value={String(pb!.audioTrack)} onChange={(v) => api('/api/options', { audioTrack: Number(v) })}>
              {media.audioTracks.map((a) => <option key={a.index} value={a.index}>{a.title || a.lang || `Audio ${a.index + 1}`}</option>)}
            </Select>
          )}
          {subs.length > 0 && (
            <Select icon={<Captions className="h-3.5 w-3.5 shrink-0" />} label="Subtitles" value={pb!.subtitle === null ? 'off' : String(pb!.subtitle)} onChange={(v) => api('/api/options', { subtitle: v === 'off' ? null : Number(v) })}>
              <option value="off">Subs off</option>{subs.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </Select>
          )}
        </div>
      )}

      {state && playing && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-mute">
          <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Streaming {state.stats.speedMbps.toFixed(1)} Mbps</span>
          <span>{fmtSize(state.stats.currentFileBytes)} sent{conn?.latencyMs != null && ` · ${conn.latencyMs} ms`}</span>
        </div>
      )}
      {pb?.error && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] leading-snug text-amber-100">
          <div className="font-medium">{pb.error}</div>{pb.hint && <div className="mt-1 text-amber-100/80">{pb.hint}</div>}
        </div>
      )}
    </section>
  );
}
