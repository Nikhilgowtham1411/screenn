import { useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { CastPicker, type Mode } from './components/CastPicker';
import { ConnectCard } from './components/ConnectCard';
import { HelpView } from './components/HelpView';
import { Hero } from './components/Hero';
import { LibraryView } from './components/LibraryView';
import { MirrorView } from './components/MirrorView';
import { PlaybackCard } from './components/PlaybackCard';
import { SettingsView } from './components/SettingsView';
import { Logo, Sidebar, type View } from './components/Sidebar';
import { StreamView } from './components/StreamView';
import { Toasts } from './components/Toasts';
import { useServer } from './lib/server';

function Offline() {
  return (
    <div className="grid min-h-full place-items-center p-6 text-center">
      <div className="glass max-w-md p-8">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/40"><Loader2 className="h-7 w-7 animate-spin text-violet-300" /></div>
        <h1 className="text-xl font-semibold">Connecting to the CastFlow service…</h1>
        <p className="mt-2 text-sm text-mute">The dashboard talks to a small service on your computer. If this takes more than a few seconds, make sure it is running:</p>
        <code className="chip mt-3 block rounded-lg px-3 py-2 text-left text-[13px]">npm start</code>
      </div>
    </div>
  );
}

export default function App() {
  const { state, online } = useServer();
  const [view, setView] = useState<View>('cast');
  const [mode, setMode] = useState<Mode>('video');

  if (!state) return <Offline />;

  return (
    <div className="mx-auto min-h-full max-w-[1680px] p-3 pb-24 sm:p-5 md:pb-5">
      <Toasts />
      {!online && <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100"><WifiOff className="h-4 w-4" />Lost connection to the CastFlow service. Reconnecting…</div>}
      <div className="grid gap-5 md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_400px] 2xl:grid-cols-[210px_minmax(0,1fr)_430px]">
        <div className="md:col-span-2 xl:col-span-3"><Logo /></div>
        <div className="hidden md:sticky md:top-5 md:block md:h-[calc(100vh-7rem)] md:self-start xl:h-[calc(100vh-8rem)]"><Sidebar view={view} onChange={setView} /></div>
        <div className="md:hidden"><Sidebar view={view} onChange={setView} /></div>

        <main className="min-w-0 space-y-5">
          {view === 'cast' && <><Hero /><CastPicker mode={mode} setMode={setMode} /></>}
          {view === 'mirror' && <MirrorView />}
          {view === 'stream' && <StreamView />}
          {view === 'library' && <LibraryView />}
          {view === 'settings' && <SettingsView />}
          {view === 'help' && <HelpView />}
        </main>

        <aside className="min-w-0 space-y-5 md:col-start-2 xl:col-start-3 xl:row-start-2 xl:row-span-1">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
            <ConnectCard />
            <PlaybackCard />
          </div>
        </aside>
      </div>
    </div>
  );
}
