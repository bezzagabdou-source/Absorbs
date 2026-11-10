// core.js — shared render harness: WebGL 3D + 2D Arabic type compositor + cinematic grade
export const W = 1080, H = 1920;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const easeOut = (x, p = 3) => 1 - Math.pow(1 - clamp(x), p);
export const easeIn = (x, p = 3) => Math.pow(clamp(x), p);
export const easeInOut = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const backOut = (x, s = 1.7) => { x = clamp(x); const c3 = s + 1; return 1 + c3 * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
export const expo = (x) => x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x));
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5; let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export async function boot(opts = {}) {
  const { bloom = { strength: 0.42, radius: 0.45, threshold: 0.92 }, exposure = 1.0, bg = 0x000000 } = opts;
  const THREE = await import('/vendor/three/build/three.module.js');
  const { EffectComposer } = await import('/vendor/three/examples/jsm/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('/vendor/three/examples/jsm/postprocessing/RenderPass.js');
  const { UnrealBloomPass } = await import('/vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js');
  const { ShaderPass } = await import('/vendor/three/examples/jsm/postprocessing/ShaderPass.js');

  document.body.innerHTML = `
    <canvas id="gl" width="${W}" height="${H}"></canvas>
    <canvas id="bg" width="${W}" height="${H}"></canvas>
    <canvas id="fg" width="${W}" height="${H}"></canvas>
    <canvas id="out" width="${W}" height="${H}"></canvas>`;
  const css = `html,body{margin:0;background:#000;overflow:hidden}
    canvas{position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:block}
    #bg,#fg,#out{pointer-events:none}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  await Promise.all([
    document.fonts.load('900 120px Alex'), document.fonts.load('800 120px Kuf'), document.fonts.load('400 120px Anton'),
    document.fonts.load('900 120px Kuf'), document.fonts.load('100 120px Alex'),
  ]);
  await document.fonts.ready;

  const glC = document.getElementById('gl'), bgC = document.getElementById('bg'), fgC = document.getElementById('fg'), outC = document.getElementById('out');
  const renderer = new THREE.WebGLRenderer({ canvas: glC, antialias: false, preserveDrawingBuffer: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.setClearColor(bg, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 40000);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bl = new UnrealBloomPass(new THREE.Vector2(W, H), bloom.strength, bloom.radius, bloom.threshold);
  composer.addPass(bl);

  const gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.75 }, uGrain: { value: 0.035 }, uChroma: { value: 0 }, uExpo: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uVig,uGrain,uChroma,uExpo; varying vec2 vUv;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      void main(){
        vec3 c;
        if(uChroma>0.001){
          vec2 d=(vUv-0.5)*uChroma*0.05;
          c.r=texture2D(tDiffuse,vUv+d).r; c.g=texture2D(tDiffuse,vUv).g; c.b=texture2D(tDiffuse,vUv-d).b;
        } else c=texture2D(tDiffuse,vUv).rgb;
        c*=uExpo;
        float v=smoothstep(1.02,0.18,length(vUv-0.5)*1.22); c*=mix(1.0,v,uVig);
        float g=h21(vUv*vec2(1080.,1920.)+uTime*37.0)-0.5;
        c+=g*uGrain*(0.4+0.9*dot(c,vec3(0.333)));
        gl_FragColor=vec4(c,1.0);
      }`
  });
  composer.addPass(gradePass);

  const bgx = bgC.getContext('2d'), fgx = fgC.getContext('2d'), ox = outC.getContext('2d');

  const api = {
    THREE, renderer, scene, camera, composer, bloom: bl, gradePass, three: { W, H },
    glC, bgC, fgC, outC, bgx, fgx, ox,
    // 3D helpers
    rt(pass) { pass && (pass.uniforms.tDiffuse.value = rt.texture); },
    grade(o) {
      const u = gradePass.uniforms;
      if (o.vig !== undefined) u.uVig.value = o.vig;
      if (o.grain !== undefined) u.uGrain.value = o.grain;
      if (o.chroma !== undefined) u.uChroma.value = o.chroma;
      if (o.expo !== undefined) u.uExpo.value = o.expo;
      if (o.time !== undefined) u.uTime.value = o.time;
    },
    texture(loader, url, srgb = true, repeat = 1) {
      const t = loader.load(url);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
      return t;
    },
    // ---------- final composite ----------
    compose(t, o = {}) {
      // o: {flash, chroma, zoom, blur, dim, sat, grain, letterbox, warm, shake:{x,y}, fadeTo}
      const ctx = ox;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const s = o.zoom || 1;
      const sx = (o.shake?.x || 0) * W, sy = (o.shake?.y || 0) * H;
      const dx = (W - W * s) / 2 + sx, dy = (H - H * s) / 2 + sy;
      const filt = [];
      if (o.sat !== undefined) filt.push(`saturate(${o.sat})`);
      if (o.blur) filt.push(`blur(${o.blur}px)`);
      if (o.bright !== undefined) filt.push(`brightness(${o.bright})`);
      if (o.contrast !== undefined) filt.push(`contrast(${o.contrast})`);
      if (filt.length) ctx.filter = filt.join(' ');
      ctx.drawImage(bgC, 0, 0);
      ctx.drawImage(glC, dx, dy, W * s, H * s);
      ctx.drawImage(fgC, 0, 0);
      ctx.filter = 'none';
      if (o.glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = o.glow * 0.5;
        ctx.filter = 'blur(48px) brightness(1.3)';
        ctx.drawImage(outC, 0, 0);
        ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (o.letterbox) {
        const h = (H * o.letterbox) / 2;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
      }
      if (o.grain) {
        // fast procedural film grain (pre-generated tile)
        const g = grainTile();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = o.grain * 0.5;
        const off = Math.floor(t * 60) % 220;
        ctx.drawImage(g, -off, -((Math.floor(t * 37) % 220)));
        ctx.drawImage(g, 220 - off, -((Math.floor(t * 37) % 220)));
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (o.warm) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = o.warm; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (o.flash) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,255,255,${clamp(o.flash) * 0.9})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (o.fadeTo) {
        ctx.fillStyle = `rgba(0,0,0,${clamp(o.fadeTo)})`; ctx.fillRect(0, 0, W, H);
      }
      if (o.scan) {
        ctx.globalAlpha = 0.05; ctx.fillStyle = '#8ecfff';
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.2);
        ctx.globalAlpha = 1;
      }
      return outC.toDataURL('image/jpeg', o.q || 0.94);
    },
  };
  let _grain = null;
  function grainTile() {
    if (_grain) return _grain;
    const c = document.createElement('canvas'); c.width = c.height = 220;
    const x = c.getContext('2d'); const img = x.createImageData(220, 220);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0); _grain = c; return c;
  }
  api.grainTile = grainTile;
  // shaders registry for reuse
  api.shaders = {};
  window.__A = api;
  return api;
}

// ---------------------------------------------------------------- textures
export function texLoader(THREE) { return new THREE.TextureLoader(); }

// starfield points
export function starField(THREE, n = 7000, rMin = 60, rMax = 900, opts = {}) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rMin + Math.pow(Math.random(), opts.bias || 0.6) * (rMax - rMin);
    const th = Math.random() * Math.PI * 2, u = 2 * Math.random() - 1, s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(th);
    const b = 0.55 + Math.random() * 0.45 + Math.pow(Math.random(), 8) * 1.6;
    const tint = Math.random();
    col[i * 3] = b * (tint > .8 ? 1.0 : tint > .4 ? .92 : .82);
    col[i * 3 + 1] = b * (tint > .8 ? .93 : .95);
    col[i * 3 + 2] = b * (tint > .8 ? .82 : tint > .4 ? 1.0 : .95);
    sz[i] = 0.5 + Math.pow(Math.random(), 3) * 3.4; ph[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGain: { value: 1 }, uScale: { value: 1 } },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize; attribute float aPh; varying vec3 vC; varying float vTw;
      uniform float uTime,uGain,uScale;
      void main(){ vC=color*uGain; vTw=0.65+0.35*sin(uTime*1.7+aPh*62.8);
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=min(aSize*uScale*(420.0/max(1.0,-mv.z)), 22.0);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vTw;
      void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); float a=smoothstep(0.5,0.02,r);
        a=pow(a,1.9); float core=smoothstep(0.22,0.0,r);
        gl_FragColor=vec4(vC*(a*0.9+core*1.4)*vTw, a*vTw); }`
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}
