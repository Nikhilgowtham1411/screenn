import { Moon, Sun, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { cx } from '../lib/format';
import { useServer } from '../lib/server';
import { Diagnostics } from './StreamView';

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium">{title}</div>{sub && <div className="mt-0.5 max-w-md text-[13px] text-mute">{sub}</div>}</div>{children}</div>;
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="chip inline-flex rounded-xl p-1">{options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} className={cx('focus-ring rounded-lg px-3 py-1.5 text-sm transition', value === v ? 'bg-violet-500 text-white shadow-glow' : 'text-mute hover:text-ink')}>{l}</button>)}</div>;
}

export function SettingsView() {
  const { state, theme, setTheme, toast } = useServer();
  const st = state?.settings;
  const save = (b: object) => api('/api/settings', b).catch((e) => toast('error', e.message));
  const paired = state?.devices.filter((d) => d.paired) ?? [];

  return (
    <div className="space-y-5 animate-rise">
      <section className="glass p-5 sm:p-6">
        <h2 className="mb-1 text-[22px] font-semibold tracking-tight">Settings</h2>
        <div className="divide-y divide-line/10">
          <Row title="Theme" sub="Dark is the default CastFlow look."><Seg value={theme} onChange={(t) => { setTheme(t); save({ theme: t }); }} options={[['dark', 'Dark'], ['light', 'Light']]} /></Row>
          <Row title="Transcoding" sub={state?.server.ffmpeg ? 'Auto converts only when the TV cannot play the file (needs FFmpeg).' : 'FFmpeg was not found on the CastFlow computer, so transcoding will fail. Install FFmpeg first.'}>
            <Seg value={st?.transcode ?? 'auto'} onChange={(v) => save({ transcode: v })} options={[['auto', 'Auto'], ['always', 'Always'], ['never', 'Never']]} />
          </Row>
          <Row title="Default quality" sub="Anything below Original uses transcoding.">
            <Seg value={(state?.playback.quality ?? 'original') as string} onChange={(v) => api('/api/options', { quality: v })} options={[['original', 'Original'], ['1080p', '1080p'], ['720p', '720p'], ['480p', '480p']]} />
          </Row>
        </div>
      </section>
      <section className="glass p-5 sm:p-6">
        <h3 className="mb-3 text-[18px] font-semibold">Remembered TVs</h3>
        {paired.length === 0 ? <p className="text-sm text-mute">No paired TVs yet. TVs you pair or connect to appear here and reconnect automatically.</p> : (
          <ul className="space-y-2">{paired.map((d) => (
            <li key={d.id} className="chip flex items-center justify-between gap-3 rounded-xl p-3"><div className="min-w-0"><div className="truncate font-medium">{d.name}</div><div className="text-[12px] text-mute">{d.kind} · {d.address} · {d.status === 'unreachable' ? 'not visible now' : 'visible'}</div></div>
              <button onClick={() => api('/api/forget', { deviceId: d.id })} className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" />Forget</button></li>))}
          </ul>
        )}
      </section>
      <Diagnostics />
      <p className="flex items-center gap-2 px-1 text-[12px] text-mute">{theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}Settings are stored on the CastFlow computer; the theme is also remembered in this browser.</p>
    </div>
  );
}
