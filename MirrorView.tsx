import { useEffect, useRef, useState } from 'react';
import { MonitorUp, MonitorX, Loader2 } from 'lucide-react';
import { useServer } from '../lib/server';

export function MirrorPanel() {
  const { state, sendRaw, subscribe, toast } = useServer();
  const [phase, setPhase] = useState<'idle' | 'starting' | 'live' | 'failed'>('idle');
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const dev = state?.devices.find((d) => d.id === state.connection?.deviceId);
  const connected = state?.connection?.state === 'connected';
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  const receiver = dev?.kind === 'receiver';

  const stop = () => { sendRaw({ type: 'rtc:stop' }); pc.current?.close(); pc.current = null; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setPhase('idle'); };

  useEffect(() => subscribe(async (m) => {
    if (m.type === 'rtc:answer' && pc.current) await pc.current.setRemoteDescription(m.sdp);
    else if (m.type === 'rtc:ice' && pc.current) await pc.current.addIceCandidate(m.candidate).catch(() => {});
    else if (m.type === 'rtc:state') { if (m.state === 'connected') setPhase('live'); else if (['failed', 'closed', 'disconnected'].includes(m.state)) { setPhase(m.state === 'failed' ? 'failed' : 'idle'); if (m.error) toast('error', 'Mirroring failed', m.error); } }
    else if (m.type === 'rtc:error') { toast('error', 'Cannot mirror', m.message); stop(); setPhase('failed'); }
  }), [subscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { pc.current?.close(); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  const start = async () => {
    try {
      setPhase('starting');
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      stream.current = s;
      const p = new RTCPeerConnection({ iceServers: [] }); // same-LAN only: no STUN/TURN, nothing leaves your network
      pc.current = p;
      s.getTracks().forEach((t) => p.addTrack(t, s));
      s.getVideoTracks()[0].onended = stop;
      p.onicecandidate = (e) => { if (e.candidate) sendRaw({ type: 'rtc:ice', candidate: e.candidate }); };
      const offer = await p.createOffer(); await p.setLocalDescription(offer);
      sendRaw({ type: 'rtc:offer', sdp: p.localDescription });
      setTimeout(() => setPhase((ph) => { if (ph === 'starting') { toast('error', 'The TV did not answer', 'Keep the CastFlow receiver page open and in the foreground on the TV.'); return 'failed'; } return ph; }), 12000);
    } catch (e) { setPhase('idle'); if ((e as Error).name !== 'NotAllowedError') toast('error', 'Could not capture the screen', (e as Error).message); }
  };

  return (
    <div className="rounded-2xl border border-line/15 p-5 text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30"><MonitorUp className="h-7 w-7 text-violet-300" strokeWidth={1.5} /></div>
      <h3 className="text-[18px] font-semibold">Mirror this screen</h3>
      {!supported && <p className="mx-auto mt-2 max-w-md text-sm text-amber-200">This browser cannot capture the screen. Use Chrome, Edge or Firefox on a laptop. Phones can use “Play a Video” instead.</p>}
      {supported && !connected && <p className="mx-auto mt-2 max-w-md text-sm text-mute">Connect to a TV that has the CastFlow receiver page open first.</p>}
      {supported && connected && !receiver && <p className="mx-auto mt-2 max-w-md text-sm text-amber-200">{dev?.name} is connected over {dev?.kind === 'cast' ? 'Google Cast' : 'DLNA'}, which only plays files. For mirroring, open <b>/receiver</b> in the TV browser and pair with the code.</p>}
      {supported && connected && receiver && (
        <>
          <p className="mx-auto mt-2 max-w-md text-sm text-mute">Peer-to-peer over your Wi-Fi. Nothing goes through the internet.</p>
          {phase === 'live' ? (
            <button onClick={stop} className="focus-ring chip mx-auto mt-4 flex items-center gap-2 rounded-xl px-5 py-3 font-medium text-red-200 hover:bg-red-500/10"><MonitorX className="h-5 w-5" />Stop mirroring</button>
          ) : (
            <button onClick={start} disabled={phase === 'starting'} className="btn-primary focus-ring mx-auto mt-4 flex items-center gap-2 rounded-xl px-6 py-3">{phase === 'starting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <MonitorUp className="h-5 w-5" />}{phase === 'starting' ? 'Waiting for the TV…' : 'Start mirroring'}</button>
          )}
          {phase === 'live' && <p className="mt-3 flex items-center justify-center gap-2 text-sm text-emerald-300"><i className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Live – confirmed by the TV</p>}
          {phase === 'failed' && <p className="mt-3 text-sm text-amber-200">Mirroring did not start. Check both devices are on the same Wi-Fi and try again.</p>}
        </>
      )}
    </div>
  );
}

export function MirrorView() {
  return <section className="glass animate-rise p-5 sm:p-6"><h2 className="mb-4 text-[22px] font-semibold tracking-tight">Screen Mirror</h2><MirrorPanel /></section>;
}
