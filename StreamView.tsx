import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { get } from '../lib/api';
import { cx, fmtSize } from '../lib/format';
import { useServer } from '../lib/server';

interface Check { name: string; ok: boolean; detail: string }

export function Diagnostics() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); get<{ checks: Check[] }>('/api/diagnostics').then((r) => setChecks(r.checks)).catch(() => setChecks([])).finally(() => setBusy(false)); };
  useEffect(run, []);
  return (
    <section className="glass p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-[18px] font-semibold">Connection diagnostics</h3>
        <button onClick={run} className="focus-ring chip flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm"><RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} />Re-run</button></div>
      {!checks ? <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}</div> : (
        <ul className="space-y-2">{checks.map((c) => (
          <li key={c.name} className="chip flex gap-3 rounded-xl p-3">
            {c.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />}
            <div><div className="text-[14px] font-medium">{c.name}</div><div className="text-[13px] leading-snug text-mute">{c.detail}</div></div>
          </li>))}
        </ul>
      )}
    </section>
  );
}

export function StreamView() {
  const { state } = useServer();
  const [hist, setHist] = useState<number[]>(Array(60).fill(0));
  const last = useRef(0);
  useEffect(() => { if (state && state.stats.speedMbps !== last.current) last.current = state.stats.speedMbps; }, [state]);
  useEffect(() => { const t = setInterval(() => setHist((h) => [...h.slice(1), last.current]), 1000); return () => clearInterval(t); }, []);
  const max = Math.max(5, ...hist);
  const s = state?.stats;
  const pts = hist.map((v, i) => `${(i / 59) * 300},${60 - (v / max) * 54}`).join(' ');

  return (
    <div className="space-y-5 animate-rise">
      <section className="glass p-5 sm:p-6">
        <h2 className="mb-1 flex items-center gap-2 text-[22px] font-semibold tracking-tight"><Activity className="h-6 w-6 text-violet-300" />Video Stream</h2>
        <p className="mb-4 text-sm text-mute">Live view of what this computer is sending to your TV.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Network speed', `${(s?.speedMbps ?? 0).toFixed(1)} Mbps`],
            ['Active streams', String(s?.activeStreams ?? 0)],
            ['Sent this video', fmtSize(s?.currentFileBytes ?? 0)],
            ['Sent this session', fmtSize(s?.bytesServed ?? 0)],
          ].map(([k, v]) => <div key={k} className="chip rounded-2xl p-4"><div className="text-[12px] text-mute">{k}</div><div className="mt-1 text-[22px] font-semibold tabular-nums">{v}</div></div>)}
        </div>
        <svg viewBox="0 0 300 60" className="mt-5 h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Network speed over the last minute">
          <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".5" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
          <polygon points={`0,60 ${pts} 300,60`} fill="url(#g)" /><polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex justify-between text-[11px] text-mute"><span>60 s ago</span><span>now · peak {max.toFixed(0)} Mbps</span></div>
        <p className="mt-4 text-[13px] text-mute">A 4K Blu-ray rip typically needs 40–80 Mbps. If the speed drops below that, move closer to the router, use 5 GHz Wi-Fi, or lower the playback quality.</p>
      </section>
      <Diagnostics />
    </div>
  );
}
