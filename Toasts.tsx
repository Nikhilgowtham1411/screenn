import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useServer } from '../lib/server';

export function Toasts() {
  const { toasts, dismiss } = useServer();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="glass pointer-events-auto animate-rise flex gap-3 p-3.5 shadow-soft">
          {t.kind === 'error' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" /> : t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />}
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{t.text}</div>
            {t.hint && <div className="mt-1 text-[13px] leading-snug text-mute">{t.hint}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="focus-ring h-6 w-6 shrink-0 rounded text-mute hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
