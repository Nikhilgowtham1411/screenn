import { useEffect, useRef, useState } from 'react';
import { Cast, Check, Code2, Link2, Loader2, Monitor, Network, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { useServer } from '../lib/server';
import type { Device } from '../lib/types';

type Tab = 'auto' | 'code' | 'ip';
const kindLabel: Record<Device['kind'], string> = { receiver: 'Receiver', dlna: 'DLNA', cast: 'Google Cast' };

function statusOf(d: Device, connectedId?: string, reconnecting?: boolean) {
  if (d.id === connectedId) return reconnecting ? { t: 'Reconnecting…', c: 'bg-amber-400' } : { t: 'Connected', c: 'bg-violet-400' };
  if (d.status === 'unreachable') return { t: 'Not visible', c: 'bg-zinc-500' };
  if (d.kind === 'receiver' && !d.paired) return { t: 'Needs pairing code', c: 'bg-amber-400' };
  return { t: 'Available', c: 'bg-emerald-400' };
}

function Radar() {
  return (
    <div className="relative mx-auto my-5 grid h-28 w-28 place-items-center">
      {[0, 0.7, 1.4].map((d) => <span key={d} className="absolute inset-0 animate-radar rounded-full border border-violet-400/60" style={{ animationDelay: `${d}s` }} />)}
      <div className="grid h-12 w-12 place-items-center rounded-full bg-violet-500/20 ring-1 ring-violet-400/50 shadow-glow"><Search className="h-5 w-5 text-violet-300" /></div>
    </div>
  );
}

function SuccessBurst({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-[20px] bg-[rgb(var(--bg)/.85)] backdrop-blur-sm animate-rise">
      <div className="text-center">
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 animate-radar rounded-full border-2 border-emerald-400/70" />
          <div className="grid h-16 w-16 animate-pop place-items-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400"><Check className="h-8 w-8 text-emerald-300" strokeWidth={3} /></div>
        </div>
        <div className="mt-3 font-semibold">Paired with {name}</div>
        <div className="text-sm text-mute">Confirmed by your TV</div>
      </div>
    </div>
  );
}

export function ConnectCard() {
  const { state, toast } = useServer();
  const [tab, setTab] = useState<Tab>('auto');
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ip, setIp] = useState(() => localStorage.getItem('cf.lastIp') || '');
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [burst, setBurst] = useState<string | null>(null);
  const prevConn = useRef<string | null>(null);

  const devices = state?.devices ?? [];
  const connId = state?.connection?.deviceId;
  const reconnecting = state?.connection?.state === 'reconnecting';

  useEffect(() => { if (!sel && devices.length) setSel(devices.find((d) => d.status !== 'unreachable')?.id ?? devices[0].id); }, [devices, sel]);

  // success animation only once the backend reports a real connection
  useEffect(() => {
    const id = state?.connection?.state === 'connected' ? state.connection.deviceId : null;
    if (id && id !== prevConn.current) { setBurst(devices.find((d) => d.id === id)?.name ?? 'TV'); setTimeout(() => setBurst(null), 2200); }
    prevConn.current = id;
  }, [state?.connection, devices]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { const m = (e as Error).message; setErr(m); toast('error', 'Could not connect', m); } finally { setBusy(false); }
  };

  const search = () => run(async () => { await api('/api/discovery/search', {}); });
  const connect = () => run(async () => { if (!sel) throw new Error('Select a TV first.'); await api('/api/connect', { deviceId: sel }); });
  const pair = () => run(async () => { await api('/api/pair', { code: digits.join('') }); setDigits(Array(6).fill('')); });
  const byIp = () => run(async () => { localStorage.setItem('cf.lastIp', ip); await api('/api/connect-ip', { ip }); });

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '');
    if (d.length > 1) { const a = d.slice(0, 6).split(''); setDigits(Array.from({ length: 6 }, (_, k) => a[k] ?? '')); refs.current[Math.min(5, a.length)]?.focus(); return; }
    setDigits((x) => x.map((c, k) => (k === i ? d : c)));
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const searching = !!state?.searching;
  const tabs: { id: Tab; label: string; icon: typeof Search }[] = [{ id: 'auto', label: 'Auto Search', icon: Search }, { id: 'code', label: 'Enter Code', icon: Code2 }, { id: 'ip', label: 'By IP', icon: Network }];

  return (
    <section className="glass relative p-5" aria-label="Connect to TV">
      {burst && <SuccessBurst name={burst} />}
      <header className="mb-4 flex items-center gap-3">
        <Cast className="h-7 w-7 text-violet-300" strokeWidth={1.6} />
        <h2 className="text-[22px] font-semibold tracking-tight">Connect to TV</h2>
      </header>

      <div className="chip grid grid-cols-3 gap-1 rounded-2xl p-1" role="tablist">
        {tabs.map(({ id, label, icon: I }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setErr(null); }}
            className={cx('focus-ring flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-medium transition-all', tab === id ? 'bg-gradient-to-b from-violet-500 to-violet-600 text-white shadow-glow' : 'text-mute hover:text-ink')}>
            <I className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'auto' && (
        <div className="mt-4 animate-rise">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[15px] text-mute">Find TVs on your Wi-Fi network</p>
            <button onClick={search} disabled={searching} className="focus-ring flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-violet-300 hover:bg-violet-500/10 disabled:opacity-60">
              <RefreshCw className={cx('h-4 w-4', searching && 'animate-spin')} />{searching ? 'Searching' : 'Search again'}
            </button>
          </div>

          {searching && devices.length === 0 && <><Radar /><p className="pb-3 text-center text-sm text-mute">Looking for TVs via mDNS and SSDP…</p></>}

          {!searching && devices.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line/20 p-5 text-center">
              <Monitor className="mx-auto mb-2 h-8 w-8 text-mute" strokeWidth={1.4} />
              <p className="font-medium">No TVs found yet</p>
              <ul className="mt-2 space-y-1 text-left text-[13px] leading-snug text-mute">
                <li>• TV and this computer must be on the same Wi-Fi.</li>
                <li>• Turn the TV on and wake it (not in deep standby).</li>
                <li>• Router "AP / client isolation" must be off.</li>
                <li>• No DLNA/Cast on the TV? Open <b className="text-ink">/receiver</b> in its browser and use <b className="text-ink">Enter Code</b>.</li>
              </ul>
              <button onClick={search} className="btn-primary mt-4 rounded-xl px-4 py-2 text-sm">Search for TVs</button>
            </div>
          )}

          <div className="space-y-1.5" role="radiogroup" aria-label="Discovered TVs">
            {devices.map((d) => {
              const st = statusOf(d, connId, reconnecting);
              const on = sel === d.id;
              return (
                <div key={d.id} className={cx('group flex items-center gap-3 rounded-2xl p-2.5 pr-3 transition-all', on ? 'bg-violet-500/10 ring-1 ring-violet-400/40' : 'hover:bg-white/5')}>
                  <button role="radio" aria-checked={on} onClick={() => setSel(d.id)} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left">
                    <span className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-white/5 ring-1 ring-white/5"><Monitor className="h-6 w-6" strokeWidth={1.5} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{d.name}</span>
                      <span className="flex items-center gap-1.5 text-[13px] text-mute"><i className={cx('h-1.5 w-1.5 rounded-full', st.c)} />{st.t}<span className="opacity-60">· {kindLabel[d.kind]} · {d.address}</span></span>
                    </span>
                  </button>
                  {d.paired && <button onClick={() => api('/api/forget', { deviceId: d.id })} aria-label={`Forget ${d.name}`} title="Forget this TV" className="focus-ring hidden h-8 w-8 place-items-center rounded-lg text-mute opacity-0 transition hover:text-red-300 group-hover:opacity-100 sm:grid"><Trash2 className="h-4 w-4" /></button>}
                  <span className={cx('grid h-6 w-6 place-items-center rounded-full border-2', on ? 'border-violet-400' : 'border-line/25')}>{on && <span className="h-3 w-3 rounded-full bg-violet-400 shadow-glow" />}</span>
                </div>
              );
            })}
          </div>

          <button onClick={connId && sel === connId ? () => api('/api/disconnect', {}) : connect} disabled={busy || (!sel && !connId)} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px]">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
            {busy ? 'Connecting…' : connId && sel === connId ? 'Disconnect' : 'Connect to Selected TV'}
          </button>
        </div>
      )}

      {tab === 'code' && (
        <div className="mt-4 animate-rise">
          <p className="text-[15px] text-mute">Open <b className="text-ink">{state?.server.ips[0] ? `http://${state.server.ips[0]}:${state.server.port}/receiver` : '/receiver'}</b> in your TV's browser, then type the 6-digit code it shows.</p>
          <div className="my-5 flex justify-center gap-2" onPaste={(e) => { e.preventDefault(); setDigit(0, e.clipboardData.getData('text')); }}>
            {digits.map((d, i) => (
              <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" maxLength={6} aria-label={`Digit ${i + 1}`}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus(); if (e.key === 'Enter' && digits.every(Boolean)) pair(); }}
                className="focus-ring h-14 w-11 rounded-xl border border-line/20 bg-white/5 text-center text-2xl font-bold outline-none transition focus:border-violet-400 focus:shadow-glow sm:w-12" />
            ))}
          </div>
          <button onClick={pair} disabled={busy || !digits.every(Boolean)} className="btn-primary flex w-full items-center justify-center gap-2 rounded-2xl py-3.5">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Code2 className="h-5 w-5" />}{busy ? 'Validating code…' : 'Pair with TV'}
          </button>
        </div>
      )}

      {tab === 'ip' && (
        <div className="mt-4 animate-rise">
          <label htmlFor="ip" className="text-[15px] text-mute">TV IP address</label>
          <input id="ip" value={ip} onChange={(e) => setIp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ip && byIp()} placeholder="192.168.1.42" inputMode="decimal"
            className="focus-ring mt-2 w-full rounded-xl border border-line/20 bg-white/5 px-4 py-3 text-lg outline-none focus:border-violet-400" />
          <p className="mt-2 text-[13px] text-mute">Find it in the TV's Wi-Fi settings. CastFlow checks UPnP/DLNA and Google Cast on that address.</p>
          <button onClick={byIp} disabled={busy || !ip} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Network className="h-5 w-5" />}{busy ? 'Contacting TV…' : 'Connect by IP'}
          </button>
        </div>
      )}

      {err && (
        <div role="alert" className="mt-3 flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[13px] leading-snug text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><span>{err}</span>
        </div>
      )}
    </section>
  );
}
