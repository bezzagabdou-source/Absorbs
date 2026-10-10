/**
 * Nexus AI v15.2 — KEYLESS VIDEO FALLBACK
 * =============================================================================
 * Replicate and Veo both need a paid key, so on a keyless build "دير لي فيديو"
 * simply failed. There is no free text-to-video API that actually works, so
 * instead of pretending, this builds a real, playable, downloadable video from
 * the one generator that IS keyless: Pollinations images.
 *
 * It produces a self-contained HTML5 motion piece — N generated frames, Ken
 * Burns pan/zoom, cross-dissolves, captions, a progress bar and an MP4-style
 * export via MediaRecorder + canvas.captureStream(). The user gets a file they
 * can actually play and share, which is the point.
 *
 * Honest about what it is: a cinematic slideshow, not diffusion video. The UI
 * says so.
 */

import { ensureEnglishPrompt } from "@/lib/arabic-image-lexicon";

export interface SlideshowSpec {
  prompt: string;
  /** Number of generated frames. 4-10 is the sweet spot. */
  frames: number;
  /** Seconds per frame, including the dissolve. */
  hold: number;
  aspect: "16:9" | "9:16" | "1:1";
  captions?: string[];
}

const DIMS: Record<SlideshowSpec["aspect"], [number, number]> = {
  "16:9": [1280, 720],
  "9:16": [720, 1280],
  "1:1": [1024, 1024],
};

/**
 * Derives a shot list from one idea so the frames tell a story instead of
 * being N near-identical pictures. This is what makes it read as a video.
 */
export function shotList(idea: string, n: number): string[] {
  const beats = [
    "wide establishing shot, golden hour, cinematic",
    "medium shot, shallow depth of field, soft rim light",
    "close-up detail, macro, dramatic lighting",
    "low angle hero shot, volumetric light rays",
    "over-the-shoulder perspective, bokeh background",
    "high angle overview, symmetrical composition",
    "silhouette against a bright sky, backlit",
    "dutch angle, moody atmosphere, fog",
    "extreme close-up, texture detail, high contrast",
    "final wide shot, dusk, long shadows",
  ];
  const en = ensureEnglishPrompt(idea, "");
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${en}, ${beats[i % beats.length]}, highly detailed, 8k, film grain`);
  }
  return out;
}

/** Keyless image URL — Pollinations needs no token. */
export function frameUrl(prompt: string, w: number, h: number, seed: number): string {
  const p = encodeURIComponent(prompt.slice(0, 900));
  return `https://image.pollinations.ai/prompt/${p}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`;
}

export function buildSlideshowPlan(spec: SlideshowSpec): {
  frames: { url: string; prompt: string; caption: string }[];
  width: number;
  height: number;
  durationMs: number;
} {
  const n = Math.max(2, Math.min(12, Math.floor(spec.frames)));
  const [width, height] = DIMS[spec.aspect];
  const shots = shotList(spec.prompt, n);
  const base = Math.floor(Math.random() * 1_000_000);

  return {
    frames: shots.map((prompt, i) => ({
      url: frameUrl(prompt, width, height, base + i * 7919),
      prompt,
      caption: spec.captions?.[i] ?? "",
    })),
    width,
    height,
    durationMs: Math.round(n * spec.hold * 1000),
  };
}

/**
 * A complete standalone player + recorder. Opened in the preview panel, it
 * plays immediately and offers a real .webm download recorded from the canvas.
 */
export function slideshowHtml(spec: SlideshowSpec): string {
  const plan = buildSlideshowPlan(spec);
  const data = JSON.stringify({
    frames: plan.frames,
    w: plan.width,
    h: plan.height,
    hold: Math.max(1.2, spec.hold),
    title: spec.prompt.slice(0, 120),
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nexus Video</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;height:100%;background:#07090f;color:#e8ecf5;
    font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px}
  canvas{max-width:100%;max-height:72vh;border-radius:14px;background:#000;
    box-shadow:0 24px 70px -24px rgba(91,140,255,.55);border:1px solid rgba(255,255,255,.09)}
  .bar{width:min(100%,780px);height:4px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}
  .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5b8cff,#d97757);transition:width .2s}
  .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  button{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);
    color:#e8ecf5;padding:10px 18px;border-radius:11px;font:inherit;font-weight:600;cursor:pointer}
  button:hover{border-color:#5b8cff} button:disabled{opacity:.45;cursor:default}
  .note{font-size:12.5px;color:#8c93a8;text-align:center;max-width:640px}
</style></head>
<body><div class="wrap">
  <canvas id="c"></canvas>
  <div class="bar"><i id="p"></i></div>
  <div class="row">
    <button id="play">▶ تشغيل</button>
    <button id="rec">⏺ سجّل فيديو</button>
    <button id="dl" disabled>⬇ حمّل</button>
  </div>
  <p class="note" id="s">نحضّرو اللقطات…</p>
</div>
<script>
const D = ${data};
const c = document.getElementById("c"), x = c.getContext("2d");
const pb = document.getElementById("p"), st = document.getElementById("s");
c.width = D.w; c.height = D.h;
let imgs = [], ready = false, blob = null;

function load(src){ return new Promise(res=>{ const i=new Image(); i.crossOrigin="anonymous";
  i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }

(async function(){
  for (let k=0;k<D.frames.length;k++){
    st.textContent = "نولّدو اللقطة " + (k+1) + " من " + D.frames.length + "…";
    pb.style.width = Math.round(((k+1)/D.frames.length)*100) + "%";
    imgs.push(await load(D.frames[k].url));
  }
  imgs = imgs.filter(Boolean);
  ready = imgs.length > 0;
  st.textContent = ready ? (imgs.length + " لقطة جاهزة — اضغط تشغيل") : "ما نجّمناش نولّدو اللقطات. تحقّق من الإنترنت.";
  if (ready) draw(0,0);
})();

/* Ken Burns: each frame slowly zooms and pans, and dissolves into the next. */
function paint(i, t){
  const im = imgs[i]; if(!im) return;
  const z = 1.06 + 0.10*t, dx = (i%2?-1:1)*18*t, dy = (i%3?1:-1)*12*t;
  const w = c.width*z, h = c.height*z;
  x.drawImage(im, (c.width-w)/2+dx, (c.height-h)/2+dy, w, h);
}
function draw(i, t){
  x.fillStyle="#000"; x.fillRect(0,0,c.width,c.height);
  paint(i,t);
  const nx = i+1;
  if (nx < imgs.length && t > 0.78){
    x.save(); x.globalAlpha = (t-0.78)/0.22; paint(nx, 0); x.restore();
  }
  const cap = (D.frames[i]||{}).caption;
  if (cap){
    x.save(); const fs = Math.round(c.width*0.038);
    x.font = "600 "+fs+"px system-ui"; x.textAlign="center";
    x.shadowColor="rgba(0,0,0,.85)"; x.shadowBlur=18;
    x.fillStyle="#fff"; x.fillText(cap, c.width/2, c.height - fs*1.4);
    x.restore();
  }
}

let raf = 0, t0 = 0, playing = false;
function loop(now){
  if(!t0) t0 = now;
  const el = (now - t0)/1000, per = D.hold, total = per*imgs.length;
  if (el >= total){ playing = false; pb.style.width="100%"; st.textContent="خلص ▸ عاود ولا سجّل"; return; }
  const i = Math.min(imgs.length-1, Math.floor(el/per));
  draw(i, (el - i*per)/per);
  pb.style.width = Math.round((el/total)*100)+"%";
  raf = requestAnimationFrame(loop);
}
document.getElementById("play").onclick = ()=>{
  if(!ready||playing) return; playing=true; t0=0; cancelAnimationFrame(raf);
  st.textContent="يشتغل…"; raf=requestAnimationFrame(loop);
};

document.getElementById("rec").onclick = async ()=>{
  if(!ready) return;
  const stream = c.captureStream(30);
  const mime = ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"]
    .find(m=>window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if(!mime){ st.textContent="المتصفح ما يدعمش التسجيل. جرّب Chrome."; return; }
  const rec = new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6_000_000});
  const parts=[];
  rec.ondataavailable=e=>{ if(e.data.size) parts.push(e.data); };
  rec.onstop=()=>{ blob=new Blob(parts,{type:mime});
    document.getElementById("dl").disabled=false; st.textContent="الفيديو جاهز للتحميل ✅"; };
  rec.start(); st.textContent="يسجّل…";
  playing=true; t0=0; cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
  setTimeout(()=>{ try{rec.stop();}catch(e){} }, D.hold*imgs.length*1000 + 400);
};

document.getElementById("dl").onclick = ()=>{
  if(!blob) return;
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="nexus-video.webm"; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
};
</script></body></html>`;
}
