'use client';

import { useEffect, useRef, useState } from 'react';
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

type Tab = 'text' | 'image' | 'video' | 'audio' | 'embed' | '3d' | 'live';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'text', label: 'نص ذكي', icon: '💬' },
  { id: 'image', label: 'صور', icon: '🖼️' },
  { id: 'video', label: 'فيديو', icon: '🎬' },
  { id: 'audio', label: 'صوت', icon: '🔊' },
  { id: '3d', label: 'ثلاثي الأبعاد', icon: '🧊' },
  { id: 'embed', label: 'تضمين', icon: '🧬' },
  { id: 'live', label: 'الوقت الحقيقي', icon: '⚡' },
];

const EXAMPLES: Record<string, string[]> = {
  text: ['اكتب قصة قصيرة عن مدينة الجزائر في المستقبل', 'اشرح الذكاء الاصطناعي لطفل في ٣ أسطر', 'أعطني خطة لتعلم البرمجة في ٣٠ يوم'],
  image: ['مدينة جزائرية مستقبلية على البحر وقت الغروب', 'رائد فضاء يزرع شجرة على القمر، فن رقمي', 'سيارة رياضية حمراء في صحراء، إضاءة سينمائية'],
  video: ['موجات البحر تتحرك ببطء وقت الغروب', 'مدينة مستقبلية من الأعلى، طيران بطيء'],
  audio: ['مرحباً بكم في GNAB AI، صانع المواقع والألعاب الذكي', 'الشمس تشرق كل يوم لتمنحنا فرصة جديدة'],
  embed: ['الذكاء الاصطناعي يغير العالم', 'وصفة كسكس جزائري تقليدي'],
  '3d': ['كوكب أزرق يدور حوله قمر', 'مكعب ذهبي لامع يطفو', 'هرم أخضر من المستقبل'],
};

export default function StudioPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('image');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [textOut, setTextOut] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoMsg, setVideoMsg] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [embedOut, setEmbedOut] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [imgModel, setImgModel] = useState('flux');
  const [voice, setVoice] = useState('nova');
  const [now, setNow] = useState(new Date());
  const threeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const unsub = onAuthStateChanged(fbAuth(), (u) => setUser(u));
      return () => unsub();
    } catch (e) {}
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function callMedia(body: any): Promise<Response> {
    if (!user) throw new Error('سجّل الدخول أولاً لاستعمال الاستوديو');
    const token = await user.getIdToken();
    return fetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  }

  async function run() {
    setErr('');
    setBusy(true);
    try {
      const p = prompt.trim() || (EXAMPLES[tab] && EXAMPLES[tab][0]) || 'beautiful landscape';
      if (tab === 'text') {
        const r = await callMedia({ kind: 'text', prompt: p, maxTokens: 1200 });
        const j: any = await r.json().catch(() => ({}));
        const txt = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || j.error || JSON.stringify(j).slice(0, 800);
        setTextOut(String(txt));
      } else if (tab === 'image') {
        const parts = size.split('x');
        const r = await callMedia({ kind: 'image', prompt: p, width: Number(parts[0]), height: Number(parts[1]), model: imgModel, seed: Math.floor(Math.random() * 99999) });
        if (!r.ok) throw new Error('فشل توليد الصورة');
        const blob = await r.blob();
        if (imgUrl) URL.revokeObjectURL(imgUrl);
        setImgUrl(URL.createObjectURL(blob));
      } else if (tab === 'video') {
        const r = await callMedia({ kind: 'video', prompt: p });
        const j: any = await r.json().catch(() => ({}));
        const url = (j && (j.url || j.video_url || (j.data && j.data[0] && (j.data[0].url || j.data[0].video_url)))) || '';
        if (url) { setVideoUrl(String(url)); setVideoMsg(''); }
        else setVideoMsg('استلم السيرفر طلب الفيديو: ' + JSON.stringify(j).slice(0, 400));
      } else if (tab === 'audio') {
        const r = await callMedia({ kind: 'audio', prompt: p, voice });
        if (!r.ok) throw new Error('فشل توليد الصوت');
        const blob = await r.blob();
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
      } else if (tab === 'embed') {
        const r = await callMedia({ kind: 'embeddings', prompt: p });
        const j: any = await r.json().catch(() => ({}));
        const v = j && j.data && j.data[0] && j.data[0].embedding;
        if (Array.isArray(v)) setEmbedOut('الأبعاد: ' + v.length + '\nأول القيم: ' + v.slice(0, 12).map((x: number) => x.toFixed(5)).join(', ') + ' …');
        else setEmbedOut(JSON.stringify(j).slice(0, 600));
      } else if (tab === '3d') {
        await build3D(p);
      }
    } catch (e: any) {
      setErr(String((e && e.message) || e));
    }
    setBusy(false);
  }

  async function build3D(p: string) {
    let shape = 'icosahedron';
    let color = '#0e63c9';
    let bg = '#0b1526';
    try {
      const r = await callMedia({ kind: 'text', prompt: 'Reply ONLY with JSON {"shape":"box|sphere|torus|cone|icosahedron","color":"#hex","bg":"#hex"} for a 3D scene about: ' + p, maxTokens: 80 });
      const j: any = await r.json().catch(() => ({}));
      const txt = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) { const o = JSON.parse(m[0]); if (o.shape) shape = o.shape; if (o.color) color = o.color; if (o.bg) bg = o.bg; }
    } catch (e) {}
    const mount = threeRef.current;
    if (!mount) return;
    mount.innerHTML = '';
    const load = () => {
      const T = (window as any).THREE;
      if (!T) { setErr('تعذر تحميل محرك 3D'); return; }
      const w = mount.clientWidth || 640;
      const h = 380;
      const scene = new T.Scene();
      scene.background = new T.Color(bg);
      const camera = new T.PerspectiveCamera(55, w / h, 0.1, 100);
      camera.position.z = 6;
      const renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      mount.appendChild(renderer.domElement);
      let geo: any;
      if (shape === 'box') geo = new T.BoxGeometry(2.2, 2.2, 2.2);
      else if (shape === 'sphere') geo = new T.SphereGeometry(1.6, 48, 48);
      else if (shape === 'torus') geo = new T.TorusGeometry(1.5, 0.55, 24, 80);
      else if (shape === 'cone') geo = new T.ConeGeometry(1.6, 2.6, 48);
      else geo = new T.IcosahedronGeometry(1.8, 0);
      const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: new T.Color(color), metalness: 0.35, roughness: 0.3, flatShading: shape === 'icosahedron' }));
      scene.add(mesh);
      const ring = new T.Mesh(new T.TorusGeometry(2.6, 0.03, 12, 120), new T.MeshBasicMaterial({ color: 0xffffff }));
      ring.rotation.x = Math.PI / 2.4;
      scene.add(ring);
      scene.add(new T.AmbientLight(0xffffff, 0.7));
      const key = new T.DirectionalLight(0xffffff, 1.2);
      key.position.set(4, 6, 6);
      scene.add(key);
      let drag = false, px = 0, py = 0, vx = 0.008, vy = 0.004;
      const el = renderer.domElement;
      el.style.cursor = 'grab';
      el.addEventListener('pointerdown', (e: any) => { drag = true; px = e.clientX; py = e.clientY; });
      window.addEventListener('pointerup', () => { drag = false; });
      el.addEventListener('pointermove', (e: any) => { if (!drag) return; vy = (e.clientX - px) * 0.0006; vx = (e.clientY - py) * 0.0006; px = e.clientX; py = e.clientY; });
      const loop = () => {
        if (!mount.contains(el)) return;
        requestAnimationFrame(loop);
        mesh.rotation.y += 0.01 + vy * 8;
        mesh.rotation.x += 0.005 + vx * 8;
        ring.rotation.z += 0.004;
        renderer.render(scene, camera);
      };
      loop();
    };
    if ((window as any).THREE) load();
    else {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = load;
      s.onerror = () => setErr('تعذر تحميل محرك 3D');
      document.head.appendChild(s);
    }
  }

  const btn: React.CSSProperties = { padding: '13px 26px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#fff', background: 'linear-gradient(140deg,#7c3aed,#0e63c9)', boxShadow: '0 14px 30px rgba(90,60,200,.35)', fontFamily: 'inherit' };
  const chip: React.CSSProperties = { padding: '7px 13px', borderRadius: 99, border: '1px solid #dbe4f0', background: '#fff', cursor: 'pointer', fontSize: 12.5, color: '#33507c', fontFamily: 'inherit' };
  const sel: React.CSSProperties = { padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe4f0', background: '#fff', fontSize: 13.5, fontFamily: 'inherit' };

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(165deg,#fdfbf7,#f3eafd 45%,#e9f2fb)', padding: '22px 16px 40px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#22314a' }}>🎨 استوديو <span style={{ color: '#7c3aed' }}>GNAB AI</span></h1>
          <p style={{ fontSize: 13, color: '#5b6b82', marginTop: 5 }}>كل قدرات <b>Pollinations</b> في مكان واحد: نص • صور • فيديو • صوت • ثلاثي الأبعاد • تضمين • وقت حقيقي</p>
          {!user && <p style={{ marginTop: 8, fontSize: 12.5, color: '#b3543f' }}>⚠️ سجّل الدخول أولاً باش تخدم الأدوات</p>}
        </header>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 16px', borderRadius: 99, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', border: tab === t.id ? '2px solid #7c3aed' : '1px solid #dbe4f0', background: tab === t.id ? '#7c3aed' : '#fff', color: tab === t.id ? '#fff' : '#33507c', boxShadow: tab === t.id ? '0 10px 22px rgba(124,58,237,.35)' : 'none' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div style={{ background: 'rgba(255,255,255,.8)', border: '1px solid #fff', borderRadius: 22, padding: 18, boxShadow: '0 18px 40px rgba(46,74,120,.12)' }}>
          {tab === 'live' ? (
            <div style={{ textAlign: 'center', padding: '10px 4px' }}>
              <div style={{ fontSize: 15, color: '#5b6b82' }}>🕐 الوقت الحقيقي الآن</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: '#22314a', direction: 'ltr', margin: '8px 0' }}>{now.toLocaleTimeString('en-GB')}</div>
              <div style={{ fontSize: 15, color: '#33507c' }}>{now.toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <p style={{ fontSize: 13, color: '#5b6b82', margin: '14px auto', maxWidth: 460 }}>GNAB AI يعرف الوقت والتاريخ الحقيقي في كل محادثة. جرّب المكالمة الحية بصوت Gemini البشري:</p>
              <a href='/call' style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>🎙️ افتح المكالمة الحية</a>
            </div>
          ) : (
            <>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={tab === 'audio' ? 'اكتب النص اللي يتحول لصوت…' : 'اوصف ما تريد إنشاءه…'} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 16, border: '1px solid #dbe4f0', fontSize: 14.5, lineHeight: 1.8, fontFamily: 'inherit', resize: 'vertical', background: '#fff' }} />
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '10px 0' }}>
                {(EXAMPLES[tab] || []).map((ex, i) => (
                  <button key={i} style={chip} onClick={() => setPrompt(ex)}>{ex}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {tab === 'image' && (<>
                  <select value={imgModel} onChange={(e) => setImgModel(e.target.value)} style={sel}>
                    <option value='flux'>نموذج Flux (جودة)</option>
                    <option value='turbo'>نموذج Turbo (سرعة)</option>
                  </select>
                  <select value={size} onChange={(e) => setSize(e.target.value)} style={sel}>
                    <option value='1024x1024'>مربع 1024</option>
                    <option value='1280x720'>عريض 720p</option>
                    <option value='720x1280'>طولي (هاتف)</option>
                  </select>
                </>)}
                {tab === 'audio' && (
                  <select value={voice} onChange={(e) => setVoice(e.target.value)} style={sel}>
                    <option value='nova'>صوت Nova</option>
                    <option value='alloy'>صوت Alloy</option>
                    <option value='echo'>صوت Echo</option>
                    <option value='shimmer'>صوت Shimmer</option>
                  </select>
                )}
                <button onClick={run} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
                  {busy ? '⏳ جاري الإنشاء…' : tab === 'image' ? '🖼️ أنشئ الصورة' : tab === 'video' ? '🎬 أنشئ الفيديو' : tab === 'audio' ? '🔊 حوّل لصوت' : tab === '3d' ? '🧊 أنشئ مشهد 3D' : tab === 'embed' ? '🧬 احسب التضمين' : '💬 اسأل'}
                </button>
                <button onClick={() => { setPrompt(''); setTextOut(''); setVideoMsg(''); setEmbedOut(''); setErr(''); }} style={{ ...chip, padding: '11px 18px', fontWeight: 700 }}>🧹 مسح</button>
              </div>
              {err && <p style={{ marginTop: 12, fontSize: 13, color: '#b3543f' }}>⚠️ {err}</p>}

              {tab === 'text' && textOut && <div style={{ marginTop: 14, background: '#fbf7ee', border: '1px solid #f0e3c8', borderRadius: 16, padding: '14px 16px', fontSize: 14, lineHeight: 1.9, color: '#22314a', whiteSpace: 'pre-wrap' }}>{textOut}</div>}
              {tab === 'image' && imgUrl && (
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <img src={imgUrl} alt='AI' style={{ maxWidth: '100%', borderRadius: 18, boxShadow: '0 18px 40px rgba(46,74,120,.22)' }} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                    <a href={imgUrl} download='gnab-image.jpg' style={{ ...chip, textDecoration: 'none', fontWeight: 700, padding: '10px 18px' }}>⬇️ تحميل الصورة</a>
                    <a href={imgUrl} target='_blank' rel='noreferrer' style={{ ...chip, textDecoration: 'none', fontWeight: 700, padding: '10px 18px' }}>🔍 فتح بالحجم الكامل</a>
                  </div>
                </div>
              )}
              {tab === 'video' && (videoUrl || videoMsg) && (
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  {videoUrl ? <video src={videoUrl} controls style={{ maxWidth: '100%', borderRadius: 18 }} /> : <p style={{ fontSize: 13, color: '#5b6b82', wordBreak: 'break-word' }}>{videoMsg}</p>}
                </div>
              )}
              {tab === 'audio' && audioUrl && (
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <audio src={audioUrl} controls autoPlay style={{ width: '100%' }} />
                  <div style={{ marginTop: 10 }}><a href={audioUrl} download='gnab-audio.mp3' style={{ ...chip, textDecoration: 'none', fontWeight: 700, padding: '10px 18px' }}>⬇️ تحميل الصوت</a></div>
                </div>
              )}
              {tab === 'embed' && embedOut && <pre style={{ marginTop: 14, background: '#0b1526', color: '#9fd0ff', borderRadius: 16, padding: '14px 16px', fontSize: 12.5, whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left' }}>{embedOut}</pre>}
              {tab === '3d' && <div ref={threeRef} style={{ marginTop: 14, borderRadius: 18, overflow: 'hidden', minHeight: 380, background: '#0b1526' }} />}
              {tab === '3d' && <p style={{ marginTop: 8, fontSize: 12, color: '#8296b1', textAlign: 'center' }}>اسحب بالماوس/إصبعك لتدوير المشهد — الشكل والألوان يختارها الذكاء حسب وصفك</p>}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <a href='/call' style={{ ...chip, textDecoration: 'none', fontWeight: 700, padding: '10px 18px' }}>🎙️ المكالمة الصوتية Gemini</a>
          <a href='/code' style={{ ...chip, textDecoration: 'none', fontWeight: 700, padding: '10px 18px' }}>💻 GNAB CODE — صانع المواقع والألعاب</a>
          <a href='/' style={{ ...chip, textDecoration: 'none', fontWeight: 700, padding: '10px 18px' }}>💬 المحادثة</a>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#8296b1', marginTop: 12 }}>مدعوم بـ Pollinations AI + Gemini — GNAB AI</p>
      </div>
    </div>
  );
}
