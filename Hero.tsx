import { Infinity as Inf, Zap } from 'lucide-react';

function TvArt() {
  return (
    <svg viewBox="0 0 420 250" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b1640" /><stop offset=".55" stopColor="#4b2a86" /><stop offset="1" stopColor="#0f1536" /></linearGradient>
        <linearGradient id="mt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9e5ff" /><stop offset=".25" stopColor="#7a66c8" /><stop offset="1" stopColor="#1a1b3f" /></linearGradient>
        <radialGradient id="glow" cx=".5" cy=".6" r=".6"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".6" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></radialGradient>
      </defs>
      <rect x="-20" y="-10" width="460" height="270" fill="url(#glow)" />
      <g transform="translate(60 18) skewY(-3)">
        <rect width="300" height="170" rx="6" fill="#06070e" stroke="#2a2d49" strokeWidth="3" />
        <rect x="6" y="6" width="288" height="158" rx="3" fill="url(#sky)" />
        <path d="M6 120 L70 58 L96 84 L140 34 L200 104 L236 76 L294 124 L294 164 L6 164Z" fill="url(#mt)" />
        <path d="M6 138 L294 138 L294 164 L6 164Z" fill="#171a44" opacity=".85" />
        <path d="M6 146h288" stroke="#a78bfa" strokeOpacity=".5" />
        <circle cx="150" cy="86" r="20" fill="rgba(0,0,0,.45)" stroke="#fff" strokeOpacity=".9" strokeWidth="1.5" />
        <path d="M144 76l17 10-17 10z" fill="#fff" />
        <rect x="6" y="154" width="288" height="2.5" fill="#fff" opacity=".18" /><rect x="6" y="154" width="150" height="2.5" fill="#fff" opacity=".8" />
      </g>
      <rect x="95" y="212" width="230" height="8" rx="4" fill="#0b0c18" /><rect x="105" y="206" width="210" height="4" rx="2" fill="#7c3aed" opacity=".5" />
    </svg>
  );
}

const features = [
  { icon: <Zap className="h-7 w-7 text-violet-400" strokeWidth={1.6} />, title: 'No Upload', sub: 'Direct & Private' },
  { icon: <Inf className="h-7 w-7 text-violet-400" strokeWidth={1.6} />, title: 'Any File Size', sub: '5GB – 50GB+' },
  { icon: <span className="rounded-md border border-violet-400/70 px-1.5 text-sm font-bold text-violet-400">4K</span>, title: 'Ultra HD', sub: 'Up to 4K / HDR' },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl">
      <div className="relative z-10 max-w-[560px] animate-rise pt-2">
        <h1 className="text-[40px] font-bold leading-[1.1] tracking-tight md:text-[46px]">
          Cast to Your <span className="bg-gradient-to-r from-violet-300 to-violet-500 bg-clip-text text-transparent">TV</span>
        </h1>
        <p className="mt-3 max-w-[470px] text-[17px] leading-snug text-mute">Play videos, mirror your screen and stream directly over Wi-Fi.</p>
        <div className="mt-6 grid max-w-[540px] grid-cols-3 divide-x divide-line/10">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col items-center px-2 text-center">
              <div className="mb-2 grid h-14 w-14 place-items-center rounded-full bg-violet-500/10 ring-1 ring-violet-400/20">{f.icon}</div>
              <div className="text-[15px] font-semibold">{f.title}</div>
              <div className="text-[13px] text-mute">{f.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute -right-6 top-0 hidden h-[300px] w-[420px] animate-floaty lg:block 2xl:right-0" style={{ maskImage: 'linear-gradient(to left, #000 70%, transparent)' }}>
        <TvArt />
      </div>
    </section>
  );
}
