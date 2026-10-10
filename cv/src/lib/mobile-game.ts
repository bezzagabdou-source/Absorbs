/**
 * Nexus AI v21 — MOBILE GAME MODE
 * =============================================================================
 * Why this exists: every game request used to be pushed to 3 MB / 6000+ lines
 * through 120 continuation rounds. That is slow AND the main source of crashes,
 * duplicated blocks and "weak" games. A phone game that matches the request, is
 * 800-2500 lines, and runs on the first tap beats a giant broken file.
 *
 *   MOBILE_GAME_CONTRACT — the single build contract for every game request.
 *   NEXUS_NET_SHIM       — window.NexusNet: internet for sandboxed games (images,
 *                          sounds, fonts, JSON, CDN libs) with automatic fallbacks.
 *   MOBILE_GAME_TARGET   — size / round budget for the continuation engine.
 *
 * Pure strings / constants, isomorphic.
 */

/** Continuation budget for a game: finish the file, do NOT pad it to megabytes. */
import { kbGenerationBlock } from "@/lib/game-kb";

export const MOBILE_GAME_TARGET_BYTES = 28_000;
export const MOBILE_GAME_MAX_ROUNDS = 3;
export const MOBILE_GAME_MAX_TOKENS = 28_000;

/** BIG tier ("3D", "ضخمة", "كبيرة", RPG/FPS/open world...): large but still ONE verified file, finished in a few rounds. */
export const BIG_GAME_TARGET_BYTES = 90_000;
export const BIG_GAME_MAX_ROUNDS = 5;
export const BIG_GAME_MAX_TOKENS = 64_000;

/** The user wants a big / 3D game (not a quick arcade one). */
export function isBigGameRequest(text: string): boolean {
  return /\b(3d|three\.?js|webgl|fps|rpg|open[- ]?world|racing|shooter|survival|minecraft|gta)\b|ثلاثي|3[ ]?د|ضخم|كبير|احترافي|عالم مفتوح|اسطوري|أسطوري|خرافي|سباق سيار|زومبي|بقاء/i.test(text || "");
}

/** Short identity for game builds (kept standalone so it never drags the old 6000-line size rules in). */
export const MOBILE_GAME_SYSTEM = `You are Nexus Game Studio: a senior mobile-game engineer. You understand Arabic, Algerian Darija, French and English requests (short, slangy, with typos) and you build EXACTLY the game that was asked for. Reply with the finished game only: one \`\`\`html fenced block, no intro, no explanation, no questions. If the user asks to change a game you already wrote, start from your latest version, keep everything that still applies, apply only the requested change, and return the complete updated file.`;

export const MOBILE_GAME_CONTRACT = `
===== MOBILE GAME CONTRACT v21 (binding, overrides any size / "huge" wording above) =====
GOAL: build EXACTLY the game the user asked for, as a FAST, FINISHED, PHONE-FIRST game. Correct and playable on the first tap beats big. Size target: 800-2500 lines in ONE self-contained \`\`\`html block (no words before or after, ends with </html>). Do NOT pad, do NOT build 3 MB files.

1. FOLLOW THE REQUEST. Use the user's theme, genre, characters, rules and language literally. If they name a game ("مثل Flappy Bird", "snake", "football") build that game's real rules. If the request is short, pick the classic, proven mechanic for that genre and add polish - never invent a different game.
2. MOBILE FIRST. <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">. Portrait by default (landscape only when the genre needs it, with a "rotate" hint). The shell is 100dvh with overflow hidden, safe-area insets, touch-action:none on the canvas, no text selection, no long-press menu, no double-tap zoom. Controls are THUMB controls: tap / swipe / drag, or a virtual joystick + big buttons (>=56px) at the bottom corners. Keyboard + mouse also work. Canvas is devicePixelRatio-aware (cap DPR at 2) and resizes without resetting progress.
3. BOOT-SAFE, ZERO-CRASH. One classic <script> at the end of <body>. Every element lookup null-checked; getContext guarded; the whole boot inside try/catch that paints a readable in-page error card (never a black screen). requestAnimationFrame loop with clamped dt (max 0.033) and a per-frame try/catch so one bad frame never kills the loop; pause on visibilitychange. Guard NaN / division by zero. No ES module imports, no top-level await, no duplicate const/let names, balanced braces.
4. SCREENS. Title (animated, big PLAY button) -> playing -> pause -> game over (score, best, RETRY, MENU). Restart resets ALL state. Best score + settings saved with window.NexusDB when present (Promise API) else localStorage in try/catch else memory.
5. FEEL. Instant response in the first 2 seconds, readable HUD (>=16px), gradual difficulty curve, 3+ enemy/obstacle/item types, power-ups, combo or score multiplier, particles, screen shake, floating score text, haptics via navigator.vibrate in try/catch. Procedural WebAudio SFX (AudioContext created/resumed on the FIRST user gesture, master gain, mute button).
6. LOOK. A designed scene from frame 1 (gradient sky / parallax / glow), ONE coherent palette and art style, never a flat black void. Arabic requests: dir="rtl", lang="ar", system fonts or a Google Font loaded through NexusNet.font().
7. SPEED OF THE FILE ITSELF. Pool objects, no allocation in hot loops, cull off-screen, cache gradients/sprites on offscreen canvases, <=150 live particles. Must hold 60fps on a mid phone.
8. INTERNET IS ALLOWED (for assets), but the game must NEVER depend on it. The page already has window.NexusNet (do not redefine it):
   - NexusNet.image(url) -> Promise<HTMLImageElement|null>
   - NexusNet.sound(ctx, url) -> Promise<AudioBuffer|null>   (decodeAudioData, after the first tap)
   - NexusNet.json(url) / NexusNet.text(url) -> Promise<any|null>
   - NexusNet.font("Cairo", "400;700") -> Promise<boolean>   (Google Fonts)
   - NexusNet.script(url) -> Promise<boolean>   (only cdnjs.cloudflare.com / cdn.jsdelivr.net / unpkg.com, pinned version)
   - NexusNet.online -> boolean
   They never throw and never hang (timeouts built in): they resolve null/false on failure. RULES: only use stable public https URLs you are SURE exist (Google Fonts, fonts.gstatic.com, cdnjs, jsdelivr/unpkg packages, raw.githubusercontent.com / cdn.jsdelivr.net/gh/ files of well-known repos, upload.wikimedia.org, kenney.nl packs mirrored on GitHub). Do not guess random file URLs. Start the game IMMEDIATELY with procedural art; load remote assets in the background and swap them in when they arrive. If an asset is null, keep the canvas-drawn version. If the user pasted a link or file URL, use exactly that URL.
   - Heavy engines (Phaser, Three.js r128, Howler) are allowed ONLY when the user asks for 3D or the genre truly needs it; load with NexusNet.script() and show the procedural/canvas fallback or a clear message if it fails. 2D games default to plain Canvas 2D (fastest, nothing to fail).
9. FINAL SILENT QA before you answer: boot -> title -> play -> die -> retry -> pause -> resume -> mute all work; every id used by JS exists; no TODO / "rest of code"; text fits at 360px; file ends with </html>.
===== END MOBILE GAME CONTRACT =====${kbGenerationBlock()}`;

/**
 * window.NexusNet — injected into every previewed document.
 * Direct CORS / <img> loading first (fast), then the host proxy (/api/asset via postMessage),
 * so Google Fonts, GitHub, Wikimedia etc. work even when a host blocks hotlinking or CORS.
 */
export const NEXUS_NET_SHIM = `<script data-nexus-net>(function(){
"use strict";
if(window.NexusNet)return;
var seq=0,pend={},cache={};
function viaHost(url,ms){return new Promise(function(res){var id=++seq,done=false;function fin(v){if(done)return;done=true;delete pend[id];res(v)}pend[id]=fin;setTimeout(function(){fin(null)},ms||10000);try{parent.postMessage({__nexus:1,type:"net",id:id,url:url},"*")}catch(e){fin(null)}});}
window.addEventListener("message",function(e){var d=e.data;if(d&&d.__nexus===1&&d.type==="net-reply"&&pend[d.id])pend[d.id](d)});
function okUrl(u){return typeof u==="string"&&/^https:\\/\\//i.test(u)}
function direct(url,as,ms){return new Promise(function(res){var t=setTimeout(function(){res(null)},ms||6000);try{fetch(url,{mode:"cors",credentials:"omit"}).then(function(r){if(!r.ok)throw 0;return as==="json"?r.json():as==="text"?r.text():as==="buffer"?r.arrayBuffer():r.blob()}).then(function(v){clearTimeout(t);res(v)},function(){clearTimeout(t);res(null)})}catch(e){clearTimeout(t);res(null)}});}
function bytes(url,as){
  if(!okUrl(url))return Promise.resolve(null);
  var k=as+"|"+url;if(cache[k])return cache[k];
  var p=direct(url,as,6000).then(function(v){if(v!=null)return v;return viaHost(url,10000).then(function(r){
    if(!r||!r.ok||!r.buffer)return null;
    if(as==="buffer")return r.buffer;
    if(as==="json"||as==="text"){try{var s=new TextDecoder().decode(r.buffer);return as==="json"?JSON.parse(s):s}catch(e){return null}}
    try{return new Blob([r.buffer],{type:r.mime||"application/octet-stream"})}catch(e){return null}});});
  cache[k]=p;return p;
}
function image(url){
  if(!okUrl(url))return Promise.resolve(null);
  return new Promise(function(res){
    var done=false,img=new Image();
    function fin(v){if(done)return;done=true;res(v)}
    var t=setTimeout(function(){tryProxy()},5000),tried=false;
    function tryProxy(){if(tried)return;tried=true;clearTimeout(t);
      bytes(url,"blob").then(function(b){if(!b)return fin(null);var i2=new Image();i2.onload=function(){fin(i2)};i2.onerror=function(){fin(null)};try{i2.src=URL.createObjectURL(b)}catch(e){fin(null)}});}
    img.onload=function(){clearTimeout(t);fin(img)};
    img.onerror=tryProxy;
    try{img.crossOrigin="anonymous";img.src=url}catch(e){tryProxy()}
  });
}
function sound(ctx,url){
  if(!ctx||!ctx.decodeAudioData)return Promise.resolve(null);
  return bytes(url,"buffer").then(function(b){if(!b)return null;return new Promise(function(res){try{var p=ctx.decodeAudioData(b.slice(0),res,function(){res(null)});if(p&&p.then)p.then(res,function(){res(null)})}catch(e){res(null)}});});
}
function font(family,weights){
  return new Promise(function(res){
    try{
      var f=String(family||"").replace(/[^A-Za-z0-9 ]/g,"").trim();if(!f)return res(false);
      var w=String(weights||"400;700").replace(/[^0-9;]/g,"")||"400";
      var l=document.createElement("link");l.rel="stylesheet";
      l.href="https://fonts.googleapis.com/css2?family="+encodeURIComponent(f).replace(/%20/g,"+")+":wght@"+w+"&display=swap";
      var t=setTimeout(function(){res(false)},4000);
      l.onload=function(){clearTimeout(t);try{(document.fonts&&document.fonts.load?document.fonts.load("16px '"+f+"'"):Promise.resolve()).then(function(){res(true)},function(){res(true)})}catch(e){res(true)}};
      l.onerror=function(){clearTimeout(t);res(false)};
      (document.head||document.documentElement).appendChild(l);
    }catch(e){res(false)}
  });
}
function script(url){
  return new Promise(function(res){
    if(!/^https:\\/\\/(cdnjs\\.cloudflare\\.com|cdn\\.jsdelivr\\.net|unpkg\\.com)\\//i.test(String(url)))return res(false);
    try{var s=document.createElement("script");s.src=url;var t=setTimeout(function(){res(false)},8000);
      s.onload=function(){clearTimeout(t);res(true)};s.onerror=function(){clearTimeout(t);res(false)};document.head.appendChild(s)}catch(e){res(false)}
  });
}
window.NexusNet={
  online:(typeof navigator!=="undefined"&&navigator.onLine!==false),
  image:image,sound:sound,font:font,script:script,
  json:function(u){return bytes(u,"json")},
  text:function(u){return bytes(u,"text")},
  buffer:function(u){return bytes(u,"buffer")},
  blob:function(u){return bytes(u,"blob")}
};
})();</script>`;


/**
 * BIG GAME ADDON — appended after the contract for 3D / huge requests.
 * Big is allowed; BROKEN is not. The recurring crashes of big games are API mismatches
 * (code written for a newer Three.js than the one loaded), a missing engine, and lost progress
 * on resize, so the rules below remove exactly those.
 */
export const BIG_GAME_ADDON = `
===== BIG / 3D GAME ADDON (overrides the size line of rule "Size target" above) =====
Size: 2500-6000 lines, ONE file, finished completely. Big = many REAL systems, never padding. Build in this fixed order so nothing references something undefined: CONFIG -> utils/math -> input (touch joystick + look-drag + buttons, keyboard/mouse) -> audio -> renderer/scene/camera -> world generation -> entities/pools -> AI -> combat/gameplay systems -> UI/HUD/menus -> save -> main loop -> boot.
3D ENGINE (the ONLY engine, loaded exactly like this in <head>, plain tag, never a module, never another version):
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
THREE r128 API ONLY. FORBIDDEN (do not exist in r128 and crash the game): THREE.CapsuleGeometry, THREE.Geometry (use BufferGeometry), renderer.outputColorSpace, texture.colorSpace, THREE.SRGBColorSpace, THREE.ColorManagement, Capsule/Lathe tricks from newer versions, any import/importmap, OrbitControls / GLTFLoader / PointerLockControls / FontLoader / TextGeometry / EffectComposer (addons are NOT loaded: write your own camera controller; build characters from primitives; HUD text is HTML, not TextGeometry). Use renderer.outputEncoding = THREE.sRGBEncoding, BoxGeometry / SphereGeometry / CylinderGeometry / ConeGeometry / PlaneGeometry / TorusGeometry / BufferGeometry, MeshStandardMaterial / MeshLambertMaterial / MeshBasicMaterial, InstancedMesh for repeated objects, CanvasTexture for procedural textures.
SAFE BOOT: at the start of boot() check typeof THREE !== "undefined" and WebGL support; if either fails, show a styled in-page card ("Could not load 3D engine - check connection" + Retry button that reloads) instead of a black screen. A visible loading screen with progress shows from the first frame.
PERFORMANCE ON PHONES: renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)), antialias off on mobile, shadows only on desktop (or one small shadow map), fog + limited far plane, <= 150 draw calls (merge / instance), pool bullets / particles / enemies, reuse Vector3 objects in hot loops, cap active enemies, auto-lower quality when frame time > 24ms for 2 seconds. Resize re-fits camera aspect + renderer WITHOUT resetting the game.
CONTROLS: touch = left virtual joystick (move) + right-half drag (look) + 2-4 big action buttons; desktop = WASD + mouse (pointer lock optional, never required) + Space/Shift. Never rely on pointer lock for the game to work.
CONTENT DEPTH (real systems): several levels/zones or an endless escalating mode, 4+ enemy types with distinct AI, 1+ boss, weapons or abilities with upgrades, pickups/economy, minimap or objective arrow, tutorial hint in the first 20 seconds, save/load, settings (sound, quality, sensitivity).
FINAL 3D QA (silent): every THREE.* name used exists in r128; every variable is declared before first use; the loop starts only after the world is built; death -> retry -> pause -> resume work; file ends with </html>.
===== END BIG / 3D GAME ADDON =====`;


/** The user wants the AI to look at the internet: download a file, open / check a site, find real assets or info. */
export function wantsInternet(text: string): boolean {
  return /من (?:ال)?(?:انترنت|إنترنت|نت|ويب)|اونلاين|أونلاين|online|\b(?:download|fetch|browse|scrape)\b|حمّ?ل|تحميل|نزّ?ل|ابحث|دور على|افحص (?:ال)?(?:موقع|رابط|لينك)|تفحص|تحقق من (?:ال)?(?:موقع|رابط)|check (?:the |this )?(?:site|website|link|url)|صور حقيقية|اصوات حقيقية|أصوات حقيقية/i.test(text || "");
}
