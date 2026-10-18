'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';

const env = (process as any).env as Record<string, string | undefined>;
const firebaseConfig = {
  apiKey: env['NEXT_PUBLIC_FIREBASE_' + 'API_KEY'],
  authDomain: env['NEXT_PUBLIC_FIREBASE_' + 'AUTH_DOMAIN'],
  projectId: env['NEXT_PUBLIC_FIREBASE_' + 'PROJECT_ID'],
  storageBucket: env['NEXT_PUBLIC_FIREBASE_' + 'STORAGE_BUCKET'],
  messagingSenderId: env['NEXT_PUBLIC_FIREBASE_' + 'MESSAGING_SENDER_ID'],
  appId: env['NEXT_PUBLIC_FIREBASE_' + 'APP_ID'],
};

function fbAuth() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
interface Turn { role: 'user' | 'ai'; text: string; }

function cleanForSpeech(t: string): string {
  return t
    .replace(/```[\s\S]*?```/g, ' code ')
    .replace(/[#>*_`|[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export default function CallPage() {
  const [user, setUser] = useState<User | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState('');
  const [supported, setSupported] = useState(true);
  const recRef = useRef<any>(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const convRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    try {
      const unsub = onAuthStateChanged(fbAuth(), (u) => setUser(u));
      return () => unsub();
    } catch (e) { setSupported(false); }
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns, phase]);

  const speak = useCallback((text: string, onDone: () => void) => {
    const clean = cleanForSpeech(text);
    if (!clean) { onDone(); return; }
    try {
      const u = new SpeechSynthesisUtterance(clean);
      const voices = window.speechSynthesis.getVoices();
      const ar = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ar'));
      if (ar) u.voice = ar;
      u.lang = ar ? ar.lang : 'ar-SA';
      u.rate = 1.02;
      u.onend = onDone;
      u.onerror = onDone;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { onDone(); }
  }, []);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); setNote('Browser has no speech recognition. Use Chrome or Edge.'); return; }
    try {
      window.speechSynthesis.cancel();
      const rec = new SR();
      rec.lang = 'ar-SA';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev: any) => {
        const text = ev.results[0][0].transcript as string;
        if (text && text.trim()) {
          setTurns((t) => [...t, { role: 'user', text }]);
          void askAIRef.current(text);
        } else if (activeRef.current) startListening();
      };
      rec.onerror = (ev: any) => {
        if (!activeRef.current) return;
        if (ev.error === 'not-allowed') { setPhase('error'); setNote('Enable microphone permission to start the call.'); activeRef.current = false; }
        else setTimeout(() => activeRef.current && startListening(), 600);
      };
      rec.onend = () => {};
      recRef.current = rec;
      setPhase('listening');
      rec.start();
    } catch (e) { setTimeout(() => activeRef.current && startListening(), 600); }
  }, []);

  const askAI = useCallback(async (text: string) => {
    if (!user) return;
    setPhase('thinking');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'send', content: text, conversationId: convRef.current }),
      });
      if (!res.ok || !res.body) throw new Error('chat failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let answer = '';
      let idx = -1;
      setTurns((t) => { idx = t.length; return [...t, { role: 'ai', text: '' }]; });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (ev.type === 'meta' && ev.conversationId) convRef.current = ev.conversationId;
            if (ev.type === 'delta' && ev.text) {
              answer += ev.text;
              const cur = answer;
              setTurns((t) => { if (idx < 0) return t; const n = [...t]; n[idx] = { role: 'ai', text: cur }; return n; });
            }
            if (ev.type === 'error') throw new Error(ev.message || 'error');
          } catch (e) {}
        }
      }
      if (!activeRef.current) return;
      setPhase('speaking');
      speak(answer, () => {
        if (activeRef.current && !mutedRef.current) startListening();
        else if (activeRef.current) setPhase('listening');
      });
    } catch (e) { setPhase('error'); setNote('Connection error. Check internet and try again.'); }
  }, [user, speak, startListening]);

  const askAIRef = useRef(askAI);
  useEffect(() => { askAIRef.current = askAI; }, [askAI]);

  const startCall = () => {
    if (!user) { setNote('Sign in first to start the call.'); return; }
    activeRef.current = true;
    setNote('');
    setPhase('speaking');
    speak('Welcome to GNAB AI. I am listening, go ahead.', () => { if (activeRef.current) startListening(); });
  };

  const endCall = () => {
    activeRef.current = false;
    try { recRef.current && recRef.current.stop(); } catch (e) {}
    try { window.speechSynthesis.cancel(); } catch (e) {}
    setPhase('idle');
  };

  const inCall = phase === 'listening' || phase === 'thinking' || phase === 'speaking';

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#fdfbf7,#e9f2fb 48%,#eef7f1)', fontFamily: 'inherit' }}>
      <div style={{ position: 'absolute', width: 340, height: 340, borderRadius: '50%', filter: 'blur(70px)', opacity: 0.5, background: '#bfe0ff', top: -90, insetInlineStart: -70 }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', filter: 'blur(70px)', opacity: 0.45, background: '#ffe3c2', bottom: -80, insetInlineEnd: -60 }} />
      <style>{`@keyframes gnabPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.9);opacity:0}}`}</style>
      <div style={{ position: 'relative', maxWidth: 520, margin: '0 auto', padding: '26px 18px 34px', display: 'flex', flexDirection: 'column', minHeight: '100dvh', boxSizing: 'border-box' }}>
        <header style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 21, fontWeight: 800, color: '#22314a' }}>مكالمة <span style={{ color: '#0e63c9' }}>GNAB AI</span></h1>
          <p style={{ fontSize: 12.5, color: '#5b6b82', marginTop: 4 }}>مكالمة صوتية حقيقية — تحدّث واستمع للرد فوراً</p>
        </header>
        <div style={{ display: 'grid', placeItems: 'center', padding: '30px 0 8px' }}>
          <div style={{ position: 'relative', width: 150, height: 150 }}>
            {(phase === 'listening' || phase === 'speaking') && (<>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: phase === 'listening' ? 'rgba(14,99,201,.35)' : 'rgba(255,150,60,.4)', animation: 'gnabPulse 1.8s ease-out infinite' }} />
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: phase === 'listening' ? 'rgba(14,99,201,.25)' : 'rgba(255,150,60,.3)', animation: 'gnabPulse 1.8s .6s ease-out infinite' }} />
            </>)}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 54, color: '#fff', background: phase === 'speaking' ? 'linear-gradient(145deg,#f59e0b,#f97316)' : phase === 'thinking' ? 'linear-gradient(145deg,#64748b,#475569)' : 'linear-gradient(145deg,#0a4f9e,#0e63c9 55%,#38b6e8)', boxShadow: '0 22px 44px rgba(14,80,160,.35)', border: '1px solid rgba(255,255,255,.6)' }}>
              {phase === 'thinking' ? '💭' : phase === 'speaking' ? '🔊' : '🎙️'}
            </div>
          </div>
          <p style={{ marginTop: 16, fontSize: 14, fontWeight: 700, color: '#22314a' }}>
            {phase === 'idle' && 'جاهز للمكالمة'}
            {phase === 'listening' && '🎧 أسمعك الآن… تكلّم'}
            {phase === 'thinking' && '💭 أفكّر في الرد…'}
            {phase === 'speaking' && '🔊 GNAB AI يتحدث…'}
            {phase === 'error' && '⚠️ توقفت المكالمة'}
          </p>
          {note && <p style={{ marginTop: 6, fontSize: 12.5, color: '#b3543f', textAlign: 'center', maxWidth: 340 }}>{note}</p>}
          {!supported && <p style={{ marginTop: 6, fontSize: 12.5, color: '#b3543f', textAlign: 'center', maxWidth: 340 }}>لأفضل تجربة صوتية استخدم متصفح Chrome.</p>}
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 2px' }}>
          {turns.length === 0 && (
            <div style={{ textAlign: 'center', color: '#8296b1', fontSize: 13, background: 'rgba(255,255,255,.55)', border: '1px solid rgba(255,255,255,.7)', borderRadius: 18, padding: '14px 16px' }}>
              اضغط «بدء المكالمة»، اسمح للميكروفون، وتحدّث بالعربية أو الدارجة أو أي لغة — سيردّ عليك GNAB AI صوتياً فوراً.
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} style={{ alignSelf: t.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '86%', padding: '10px 14px', borderRadius: 20, fontSize: 14, lineHeight: 1.8, color: t.role === 'user' ? '#fff' : '#22314a', background: t.role === 'user' ? 'linear-gradient(150deg,#0a4f9e,#0e63c9 60%,#2f8ff0)' : 'linear-gradient(160deg,rgba(255,251,240,.95),rgba(255,244,224,.85))', border: t.role === 'ai' ? '1px solid rgba(255,255,255,.85)' : 'none', boxShadow: '0 10px 24px rgba(46,74,120,.13)', whiteSpace: 'pre-wrap' }}>
              {t.text || '…'}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingTop: 10 }}>
          {!inCall ? (
            <button onClick={startCall} style={{ padding: '15px 34px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 15.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(140deg,#0e9f6e,#0e63c9)', boxShadow: '0 16px 32px rgba(14,99,201,.35)', fontFamily: 'inherit' }}>📞 بدء المكالمة</button>
          ) : (<>
            <button onClick={() => setMuted((m) => !m)} style={{ padding: '14px 22px', borderRadius: 99, border: '1px solid rgba(255,255,255,.8)', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#22314a', background: 'rgba(255,255,255,.75)', fontFamily: 'inherit' }}>{muted ? '🔇 تفعيل الصوت' : '🔊 كتم الصوت'}</button>
            <button onClick={endCall} style={{ padding: '14px 26px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 14.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(140deg,#e05252,#c93a3a)', boxShadow: '0 16px 32px rgba(200,60,60,.35)', fontFamily: 'inherit' }}>⏹ إنهاء المكالمة</button>
          </>)}
        </div>
      </div>
    </div>
  );
}
