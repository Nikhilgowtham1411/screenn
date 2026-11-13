import { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { cx } from '../lib/format';
import { useServer } from '../lib/server';

const faqs: [string, string][] = [
  ['TV not found in Auto Search', 'Put the TV and this computer on the same Wi-Fi. Turn the TV fully on, and switch off “AP / client isolation” or “guest network” on your router. Allow Node.js through the firewall (UDP 1900 and 5353, TCP 8787). If the TV has no DLNA or Google Cast, open the receiver page in its browser and use Enter Code.'],
  ['Video starts then stops / buffers', 'Wi-Fi is too slow for the file bitrate. Use 5 GHz or Ethernet on the computer, move the TV closer to the router, or pick a lower quality in Playback. Check Video Stream for the live speed.'],
  ['TV says it cannot play the file', 'Set Transcoding to Auto or Always in Settings and install FFmpeg. MKV, HEVC, Dolby/DTS audio often need conversion on TVs that do not support them.'],
  ['Phone or iPhone file will not play', 'Keep the CastFlow tab open and the phone awake while casting; the phone sends the parts of the file the TV requests. iOS may pause background tabs.'],
  ['“Not paired” or wrong code', 'Codes are valid for 10 minutes and the receiver shows a new one when it expires. After 5 wrong tries wait a minute.'],
];

export function HelpView() {
  const { state } = useServer();
  const [open, setOpen] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);
  const url = state?.server.ips[0] ? `http://${state.server.ips[0]}:${state.server.port}/receiver` : `http://<computer-ip>:8787/receiver`;
  const copy = () => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); };

  return (
    <div className="space-y-5 animate-rise">
      <section className="glass p-5 sm:p-6">
        <h2 className="mb-1 text-[22px] font-semibold tracking-tight">Help & setup</h2>
        <p className="text-sm text-mute">A website alone cannot find TVs or send video to them. CastFlow therefore runs a small companion service on your computer. This dashboard is its control panel.</p>
        <ol className="mt-4 space-y-3 text-[14px] leading-snug">
          {[
            ['Start the companion service', 'On a Windows/macOS/Linux computer on your Wi-Fi: npm run install:all, npm run build, npm start. Install FFmpeg for transcoding.'],
            ['Open the dashboard', 'On the same computer (or any phone/laptop on the Wi-Fi) open the address printed in the terminal.'],
            ['Connect your TV', 'Auto Search finds DLNA/UPnP TVs and Google Cast / Google TV devices. Otherwise open the receiver page in the TV browser and enter its 6-digit code.'],
            ['Pick a video and cast', 'Choose a file or a library video. The TV pulls it over your local network with HTTP range requests, so seeking is instant and nothing is uploaded.'],
          ].map(([t, d], i) => <li key={t} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-500/20 text-sm font-semibold text-violet-300">{i + 1}</span><span><b>{t}.</b> <span className="text-mute">{d}</span></span></li>)}
        </ol>
        <div className="chip mt-5 flex items-center justify-between gap-3 rounded-xl p-3">
          <div className="min-w-0"><div className="text-[12px] text-mute">TV receiver address (open in the TV's browser)</div><div className="truncate font-mono text-[14px]">{url}</div></div>
          <button onClick={copy} className="focus-ring chip flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm">{copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </section>
      <section className="glass p-3 sm:p-4">
        <h3 className="px-2 pb-2 pt-1 text-[18px] font-semibold">Troubleshooting</h3>
        {faqs.map(([q, a], i) => (
          <div key={q} className="border-t border-line/10 first:border-0">
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3.5 text-left font-medium"><span>{q}</span><ChevronDown className={cx('h-5 w-5 shrink-0 text-mute transition-transform', open === i && 'rotate-180')} /></button>
            {open === i && <p className="animate-rise px-2 pb-4 text-[14px] leading-relaxed text-mute">{a}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
