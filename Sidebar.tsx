import { Cast, FolderOpen, HelpCircle, MonitorUp, PlayCircle, Settings, Tv2 } from 'lucide-react';
import { cx } from '../lib/format';

export type View = 'cast' | 'mirror' | 'stream' | 'library' | 'settings' | 'help';

const items: { id: View; label: string; icon: typeof Cast }[] = [
  { id: 'cast', label: 'Cast', icon: Cast },
  { id: 'mirror', label: 'Screen Mirror', icon: MonitorUp },
  { id: 'stream', label: 'Video Stream', icon: PlayCircle },
  { id: 'library', label: 'My Library', icon: FolderOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'help', label: 'Help', icon: HelpCircle },
];

export function Logo() {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500/25 to-violet-700/10 ring-1 ring-violet-400/40 shadow-glow">
        <Tv2 className="h-6 w-6 text-violet-400" strokeWidth={1.8} />
      </div>
      <span className="text-[26px] font-bold tracking-tight">Cast<span className="text-violet-400">Flow</span></span>
    </div>
  );
}

export function Sidebar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <>
      {/* desktop / tablet rail */}
      <nav className="glass relative hidden h-full flex-col gap-1 overflow-hidden p-3 md:flex" aria-label="Main">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id} onClick={() => onChange(id)} aria-current={view === id ? 'page' : undefined} title={label}
            className={cx(
              'focus-ring group relative flex items-center gap-3 rounded-xl px-3.5 py-3.5 text-left text-[15px] font-medium transition-all',
              view === id ? 'bg-gradient-to-r from-violet-500/30 to-violet-500/10 text-ink ring-1 ring-violet-400/30' : 'text-mute hover:bg-white/5 hover:text-ink',
            )}
          >
            <Icon className={cx('h-[22px] w-[22px] shrink-0 transition-transform group-hover:scale-110', view === id && 'text-violet-300')} strokeWidth={1.7} />
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full opacity-90" viewBox="0 0 200 180" preserveAspectRatio="none" aria-hidden>
          <defs><linearGradient id="w" x1="0" x2="1"><stop offset="0" stopColor="#7c3aed" stopOpacity=".05" /><stop offset="1" stopColor="#a78bfa" stopOpacity=".55" /></linearGradient></defs>
          <path d="M0 110 C40 60 70 150 110 150 S170 160 200 175 L200 180 L0 180Z" fill="url(#w)" />
          <path d="M0 120 C40 80 80 160 120 150 S180 150 200 165" fill="none" stroke="#a78bfa" strokeOpacity=".5" />
        </svg>
      </nav>
      {/* mobile bottom bar */}
      <nav className="glass fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl p-1.5 md:hidden" aria-label="Main" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
        {items.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => onChange(id)} aria-label={label} aria-current={view === id ? 'page' : undefined}
            className={cx('focus-ring grid h-11 w-11 place-items-center rounded-xl transition', view === id ? 'bg-violet-500/30 text-violet-200' : 'text-mute')}>
            <Icon className="h-5 w-5" strokeWidth={1.8} />
          </button>
        ))}
      </nav>
    </>
  );
}
