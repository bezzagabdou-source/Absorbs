import { W, H, clamp, lerp, mulberry } from './core.js';

// scenes3d.js — 3D scene builders (photoreal Earth, procedural star, galaxy, cosmic web)

export const NOISE_GLSL = `
vec3 hash3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453123); }
float noise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float n=0.0;
  n+=mix(mix(mix(dot(hash3(i+vec3(0,0,0))-0.5,vec3(1,1,1)),dot(hash3(i+vec3(1,0,0))-0.5,vec3(1,1,1)),f.x),
              mix(dot(hash3(i+vec3(0,1,0))-0.5,vec3(1,1,1)),dot(hash3(i+vec3(1,1,0))-0.5,vec3(1,1,1)),f.x),f.y),
          mix(mix(dot(hash3(i+vec3(0,0,1))-0.5,vec3(1,1,1)),dot(hash3(i+vec3(1,0,1))-0.5,vec3(1,1,1)),f.x),
              mix(dot(hash3(i+vec3(0,1,1))-0.5,vec3(1,1,1)),dot(hash3(i+vec3(1,1,1))-0.5,vec3(1,1,1)),f.x),f.y),f.z);
  return n; }
float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
`;

function glowSprite(THREE, color, size = 256, hard = 0.0) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color); g.addColorStop(clamp(0.12 + hard), color.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(0.45, color.replace(/[\d.]+\)$/, '0.09)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// derive a soft, transparent cloud map from the (white-on-black) cloud texture
export function softCloudTexture(THREE, img) {
  const w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  // the source PNG stores cloud density in ALPHA; lift it into a smooth white RGB map
  for (let i = 0; i < d.length; i += 4) {
    let a = d[i + 3] / 255;
    a = Math.max(0, (a - 0.02) / 0.98);
    a = Math.pow(a, 0.85);
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
    d[i + 3] = a * 255;
  }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 1;
  return t;
}

// ---------------------------------------------------------------- EARTH
export function earth(A, TEX, o = {}) {
  const T = A.THREE, g = new T.Group();
  const R = o.r || 2.2, seg = o.seg || 128;
  const sunDir = new T.Vector3(...(o.sunPos || [6.5, 2.0, 4.4])).normalize();
  const mat = new T.ShaderMaterial({
    uniforms: {
      uDay: { value: TEX.day }, uNight: { value: TEX.night }, uClouds: { value: TEX.cloudsSoft || TEX.clouds },
      uSun: { value: sunDir }, uLights: { value: o.lights ?? 1.0 }, uAtmo: { value: o.atmo ?? 1.15 },
      uCloudOff: { value: new T.Vector2(0, 0) }, uCloudAmt: { value: o.clouds ?? 0.55 },
      uHaze: { value: new T.Color(0x0a1626) }, uExpo: { value: o.expo ?? 1.0 }, uDbg: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal);
        vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uDay,uNight,uClouds; uniform vec3 uSun; uniform float uLights,uAtmo,uCloudAmt,uExpo;
      uniform vec2 uCloudOff; uniform vec3 uHaze; uniform float uDbg;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        if(uDbg>0.5){
          if(uDbg<1.5) gl_FragColor=vec4(texture2D(uDay,vUv).rgb,1.0);
          else if(uDbg<2.5) gl_FragColor=vec4(vec3(texture2D(uClouds,vUv).a),1.0);
          else if(uDbg<3.5) gl_FragColor=vec4(texture2D(uNight,vUv).rgb*40.0,1.0);
          else if(uDbg<4.5){ vec3 n=normalize(vN); vec3 V=normalize(cameraPosition-vW); vec3 H=normalize(uSun+V);
            gl_FragColor=vec4(vec3(pow(max(dot(n,H),0.0),420.0)),1.0); }
          else { vec3 n=normalize(vN); vec3 V=normalize(cameraPosition-vW);
            gl_FragColor=vec4(vec3(pow(1.0-max(dot(n,V),0.0),3.1)),1.0); }
          return;
        }
        vec3 n=normalize(vN);
        vec3 V=normalize(cameraPosition-vW);
        float ndl=dot(n,uSun);
        float day=smoothstep(-0.22,0.30,ndl);
        vec3 base=texture2D(uDay,vUv).rgb;
        // subtle saturation + warm/cool split
        base=pow(base, vec3(1.06));
        // diffuse with soft terminator
        float lam=max(ndl,0.0);
        float wrap=clamp((ndl+0.22)/1.22,0.0,1.0);
        vec3 col=base*(0.030+1.02*pow(wrap,1.30));
        // warmth near terminator (sunrise red)
        float term=pow(clamp(1.0-abs(ndl)/0.55,0.0,1.0),3.0);
        col+=base*vec3(1.0,0.40,0.14)*term*0.38;
        // ocean specular
        // (no ocean specular: the flat map produces a distracting glare blob)
        // clouds (alpha texture), lit + shadowed
        float cl=texture2D(uClouds,vUv+uCloudOff).a;
        vec3 clCol=vec3(1.0,0.985,0.96)*(0.05+1.05*pow(wrap,1.3));
        col=mix(col,clCol,cl*uCloudAmt);
        // city lights only at night
        vec3 lt=texture2D(uNight,vUv).rgb;
        lt=min(lt*lt*lt, vec3(1.0));
        float night=smoothstep(0.42,0.02,day);
        col+=lt*vec3(1.0,0.76,0.46)*1.35*uLights*night;
        // atmospheric scattering at the limb
        float fres=pow(1.0-max(dot(n,V),0.0),3.1);
        vec3 atmo=vec3(0.16,0.42,0.95);
        col+=atmo*fres*(0.45+1.15*day)*uAtmo;
        // aerial haze on the day side low angles
        col=mix(col,uHaze,0.0);
        gl_FragColor=vec4(col*uExpo,1.0);
      }`
  });
  const globe = new T.Mesh(new T.SphereGeometry(R, seg, seg), mat);
  globe.rotation.z = T.MathUtils.degToRad(23.4);
  g.add(globe);

  // outer glow shell
  const atmoMat = new T.ShaderMaterial({
    transparent: true, blending: T.AdditiveBlending, side: T.BackSide, depthWrite: false,
    uniforms: { uColor: { value: new T.Color(o.atmoColor || 0x3f8cff) }, uPow: { value: 3.6 }, uStr: { value: o.atmoStr ?? 1.1 },
      uSun: { value: sunDir } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz;
        vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor,uSun; uniform float uPow,uStr; varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(-vP))),uPow);
        float lit=clamp(dot(normalize(vW),uSun)*0.5+0.55,0.0,1.0);
        gl_FragColor=vec4(uColor*f*uStr*lit, f*lit*0.85); }`
  });
  g.add(new T.Mesh(new T.SphereGeometry(R * 1.045, 72, 72), atmoMat));

  return {
    group: g, globe, mat, R,
    spin(t, ts = 0.05, cs = 0.062) {
      globe.rotation.y = t * ts;
      mat.uniforms.uCloudOff.value.set(t * cs * 0.42, 0);
    },
    set rot(v) { globe.rotation.y = v; },
  };
}

// ---------------------------------------------------------------- SUN
export function sun(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const R = o.r || 1;
  const mat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRes: { value: new T.Vector2(W, H) }, uHot: { value: o.hot ?? 1.0 }, uR: { value: R } },
    vertexShader: `varying vec3 vPos; varying vec3 vN; varying vec3 vV;
      void main(){ vPos=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0);
        vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vPos; varying vec3 vN; varying vec3 vV;
      uniform float uTime,uHot; ${NOISE_GLSL}
      void main(){
        vec3 p=normalize(vPos)*2.6;
        float t=uTime*0.09;
        float n1=fbm(p*1.6+vec3(t*0.5,t*0.3,0.0));
        float n2=fbm(p*4.2-vec3(t*0.8,0.0,t*0.4));
        float gran=0.55+0.45*n1;
        // limb darkening
        float mu=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        float limb=pow(mu,0.55);
        // sunspots
        float spots=smoothstep(0.62,0.9,n2)*smoothstep(0.35,0.6,mu);
        float heat=(0.62*gran+0.55*n2)*limb*(1.0-0.55*spots);
        vec3 c1=vec3(0.95,0.16,0.01); vec3 c2=vec3(1.0,0.45,0.06); vec3 c3=vec3(1.0,0.78,0.36); vec3 c4=vec3(1.0,0.96,0.86);
        vec3 col=mix(c1,c2,smoothstep(0.15,0.55,heat));
        col=mix(col,c3,smoothstep(0.5,0.95,heat));
        col=mix(col,c4,smoothstep(0.95,1.35,heat)*0.8);
        col*= 0.62+0.16*uHot;
        // edge fire
        float edge=pow(1.0-mu,3.2);
        col+=vec3(1.0,0.34,0.06)*edge*0.55;
        col*=mix(0.55,1.0,smoothstep(0.0,0.35,mu));
        gl_FragColor=vec4(col,1.0);
      }`
  });
  const ball = new T.Mesh(new T.SphereGeometry(R, 128, 128), mat);
  g.add(ball);

  // corona billboard
  const cor = new T.Sprite(new T.SpriteMaterial({
    map: glowSprite(T, 'rgba(255,146,58,1)', 512, 0.35), color: 0xffffff,
    blending: T.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: o.corona ?? 1.0
  }));
  cor.scale.setScalar(R * (o.coronaScale || 6.4));
  g.add(cor);

  const cor2 = new T.Sprite(new T.SpriteMaterial({
    map: glowSprite(T, 'rgba(255,90,30,1)', 512, 0.5), blending: T.AdditiveBlending,
    transparent: true, depthWrite: false, depthTest: false, opacity: 0.75
  }));
  cor2.scale.setScalar(R * (o.coronaScale2 || 12.5));
  g.add(cor2);

  const light = new T.PointLight(0xffd9a0, o.lightI ?? 3.0, 0, 1.6); g.add(light);
  return { group: g, mat, ball, corona: cor, corona2: cor2, R, update(t) { mat.uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- GALAXY
export function galaxy(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const N = o.n || 130000, arms = o.arms || 4, rad = o.r || 1;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
  const cCore = new T.Color(0xfff2cf), cInner = new T.Color(0xffd9a0), cArm = new T.Color(0xa8c8ff), cOut = new T.Color(0x6f8cff), cHII = new T.Color(0xff6f9a);
  const rand = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < N; i++) {
    const roll = Math.random();
    const bulge = roll < 0.12;
    const diffuse = !bulge && roll > 0.60;
    let r, th, y;
    if (diffuse) {
      r = Math.pow(Math.random(), 0.62) * 0.95 * rad;
      th = Math.random() * 6.283;
      y = rand(-1, 1) * Math.pow(Math.random(), 2.2) * 0.03 * rad;
    } else if (bulge) {
      r = Math.pow(Math.random(), 2.1) * 0.30 * rad; th = Math.random() * 6.283;
      y = rand(-1, 1) * Math.pow(Math.random(), 1.6) * 0.10 * rad;
    } else {
      const a = Math.floor(Math.random() * arms);
      const t = Math.pow(Math.random(), 0.55);
      r = (0.09 + t * 0.91) * rad;
      const tw = 1.05 * (0.35 + 0.65 * t);
      th = t * 2.7 + (a * 6.2832) / arms + rand(-1, 1) * tw + Math.random() * 0.12;
      y = rand(-1, 1) * Math.pow(Math.random(), 2.0) * 0.035 * rad * (1.0 - 0.35 * t);
    }
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const tn = Math.min(1, r / rad);
    const c = new T.Color().copy(cCore).lerp(cInner, Math.min(1, tn * 3.4))
      .lerp(cArm, Math.max(0, (tn - 0.22) * 1.7)).lerp(cOut, Math.max(0, (tn - 0.62) * 2.4));
    if (!bulge && Math.random() < 0.022) c.lerp(cHII, 0.9);
    // HII regions are bright knots
    const knot = (!bulge && Math.random() < 0.022) ? 2.4 : 1.0;
    const b = (bulge ? rand(0.35, 1.0) : diffuse ? rand(0.10, 0.40) : rand(0.18, 0.75) * (1.2 - 0.45 * tn)) * knot;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    sz[i] = bulge ? rand(1.4, 3.4) : rand(1.0, 3.8);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new T.BufferAttribute(sz, 1));
  const mat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGain: { value: o.gain ?? 1 }, uR: { value: rad }, uPx: { value: o.px ?? 340 }, uBright: { value: o.bright ?? 0.16 } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize; varying vec3 vC; varying float vFade; uniform float uTime,uGain,uR,uPx;
      void main(){ vec3 p=position;
        float rn=length(p.xz)/uR;
        vC=color*uGain;
        vFade=smoothstep(1.02,0.52,rn);
        float sp=0.30+0.62/(0.30+rn*2.0);
        float a=uTime*sp*0.11; float c=cos(a), s=sin(a);
        p=vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=min(aSize*(uPx/max(0.9,-mv.z)), 26.0);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vFade; uniform float uBright;
      void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
        float a=smoothstep(0.5,0.02,r); a=pow(a,1.9)*vFade;
        gl_FragColor=vec4(vC*a*uBright, a*0.55); }`
  });
  const pts = new T.Points(geo, mat); pts.frustumCulled = false; g.add(pts);

  // soft core glow + halo (subtle so it never blows out)
  const core = new T.Sprite(new T.SpriteMaterial({ map: glowSprite(T, 'rgba(255,228,190,0.35)', 512, 0.10),
    blending: T.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: 0.14 }));
  core.scale.setScalar(rad * 0.30); g.add(core);
  const halo = new T.Sprite(new T.SpriteMaterial({ map: glowSprite(T, 'rgba(120,155,255,0.30)', 512, 0.65),
    blending: T.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: 0.14 }));
  halo.scale.setScalar(rad * 2.1); g.add(halo);
  return { group: g, pts, mat, update(t) { mat.uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- COSMIC WEB
export function cosmicWeb(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const nodes = [], NN = o.nodes || 260, span = o.span || 60;
  for (let i = 0; i < NN; i++) {
    const r = Math.pow(Math.random(), 0.55) * span;
    const th = Math.random() * 6.283, u = 2 * Math.random() - 1, s = Math.sqrt(1 - u * u);
    nodes.push(new T.Vector3(r * s * Math.cos(th), r * u * 0.8, r * s * Math.sin(th)));
  }
  // filaments: connect nearby nodes
  const verts = [], cols = [];
  const cA = new T.Color(0x5f8fff), cB = new T.Color(0xffb066), cC = new T.Color(0xb066ff);
  for (let i = 0; i < NN; i++) {
    const d = nodes.map((p, j) => [p.distanceTo(nodes[i]), j]).filter(([dd, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, o.links || 3);
    for (const [dd, j] of d) {
      if (j < i) continue;
      const c = new T.Color().copy(cA).lerp(cB, Math.random()).lerp(cC, Math.random() * 0.5);
      const mid = nodes[i].clone().add(nodes[j]).multiplyScalar(0.5);
      mid.multiplyScalar(0.94 + Math.random() * 0.12);
      const steps = 6; let prev = nodes[i].clone();
      for (let k = 1; k <= steps; k++) {
        const tt = k / steps;
        const p = nodes[i].clone().lerp(mid, tt).lerp(nodes[j], tt * tt * (3 - 2 * tt) * 0.9 + tt * 0.1);
        verts.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        const b = (0.14 + 0.55 * Math.sin(tt * Math.PI));
        cols.push(c.r * b, c.g * b, c.b * b, c.r * b, c.g * b, c.b * b);
        prev = p;
      }
    }
  }
  const lg = new T.BufferGeometry();
  lg.setAttribute('position', new T.BufferAttribute(new Float32Array(verts), 3));
  lg.setAttribute('color', new T.BufferAttribute(new Float32Array(cols), 3));
  const lm = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, blending: T.AdditiveBlending, depthWrite: false });
  g.add(new T.LineSegments(lg, lm));

  // node clusters
  const N2 = 4200, pos = new Float32Array(N2 * 3), col = new Float32Array(N2 * 3), sz = new Float32Array(N2);
  for (let i = 0; i < N2; i++) {
    const n = nodes[Math.floor(Math.random() * NN)];
    const s = Math.pow(Math.random(), 2) * (o.cluster || 1.1);
    pos[i * 3] = n.x + (Math.random() - .5) * s;
    pos[i * 3 + 1] = n.y + (Math.random() - .5) * s;
    pos[i * 3 + 2] = n.z + (Math.random() - .5) * s;
    const c = new T.Color(0xffe9c8).lerp(new T.Color(0x88b4ff), Math.random() * 0.7);
    const b = 0.25 + Math.random() * 0.55;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    sz[i] = 0.4 + Math.pow(Math.random(), 3) * 1.6;
  }
  const g2 = new T.BufferGeometry();
  g2.setAttribute('position', new T.BufferAttribute(pos, 3));
  g2.setAttribute('color', new T.BufferAttribute(col, 3));
  g2.setAttribute('aSize', new T.BufferAttribute(sz, 1));
  const m2 = new T.ShaderMaterial({
    uniforms: { uGain: { value: o.gain ?? 0.75 } }, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize; varying vec3 vC; uniform float uGain;
      void main(){ vC=color*uGain; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=min(aSize*(320.0/max(1.0,-mv.z)), 18.0); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float a=smoothstep(0.5,0.0,length(d));
      a=pow(a,2.2); gl_FragColor=vec4(vC*a,a); }`
  });
  const pts = new T.Points(g2, m2); pts.frustumCulled = false; g.add(pts);
  return { group: g, line: lm, pts, nodes };
}

// ---------------------------------------------------------------- RED DWARF
export function redDwarf(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const R = o.r || 1;
  const mat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vPos; varying vec3 vN; varying vec3 vV;
      void main(){ vPos=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0);
        vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vPos; varying vec3 vN; varying vec3 vV; uniform float uTime; ${NOISE_GLSL}
      void main(){
        vec3 p=normalize(vPos)*3.2; float t=uTime*0.07;
        float n=fbm(p+vec3(0.0,t,0.0));
        float n2=fbm(p*3.0-vec3(t*1.4,t,0.0));
        float mu=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);
        float limb=pow(mu,0.5);
        float heat=(0.5+0.5*n)*limb*(0.75+0.5*n2);
        vec3 c1=vec3(0.65,0.06,0.02), c2=vec3(1.0,0.28,0.10), c3=vec3(1.0,0.62,0.34);
        vec3 col=mix(c1,c2,smoothstep(0.2,0.7,heat)); col=mix(col,c3,smoothstep(0.75,1.15,heat));
        float edge=pow(1.0-mu,2.2); col+=vec3(1.0,0.35,0.12)*edge*1.4;
        gl_FragColor=vec4(col,1.0);
      }`
  });
  const ball = new T.Mesh(new T.SphereGeometry(R, 96, 96), mat);
  g.add(ball);
  const cor = new T.Sprite(new T.SpriteMaterial({ map: glowSprite(T, 'rgba(255,120,60,1)', 512, 0.3), blending: T.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, opacity: 0.9 }));
  cor.scale.setScalar(R * 5.2); g.add(cor);
  return { group: g, mat, ball, update(t) { mat.uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- ASTEROID / DEBRIS?
export function debrisBelt(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  return { group: g };
}


// ---------------------------------------------------------------- WARP TUNNEL
export function warpTunnel(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const N = o.n || 2600;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N), ph = new Float32Array(N);
  const LEN = o.len || 90;
  const palette = [new T.Color(0x9fdcff), new T.Color(0xfff0d0), new T.Color(0x7f9dff), new T.Color(0xffc98f)];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * 6.2832, r = 1.2 + Math.pow(Math.random(), 0.55) * (o.radius || 13);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r;
    pos[i * 3 + 2] = -Math.random() * LEN;
    const c = palette[(Math.random() * palette.length) | 0];
    const b = 0.35 + Math.random() * 0.9;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    sz[i] = 0.6 + Math.pow(Math.random(), 2.2) * 3.4;
    ph[i] = Math.random();
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new T.BufferAttribute(sz, 1));
  const mat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSpeed: { value: o.speed ?? 40 }, uLen: { value: LEN }, uGain: { value: o.gain ?? 1 }, uStretch: { value: o.stretch ?? 1 } },
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float aSize; varying vec3 vC; varying float vZ; uniform float uTime,uSpeed,uLen;
      void main(){ vC=color; vec3 p=position;
        p.z = mod(p.z + uTime*uSpeed, uLen) - uLen;
        vZ = clamp(-p.z/uLen, 0.0, 1.0);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize = min(aSize*(260.0/max(1.0,-mv.z)), 30.0);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vZ; uniform float uGain;
      void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
        float a=smoothstep(0.5,0.0,r); a=pow(a,1.7)*smoothstep(0.02,0.25,vZ);
        gl_FragColor=vec4(vC*a*uGain, a*0.85); }`
  });
  const pts = new T.Points(geo, mat); pts.frustumCulled = false; g.add(pts);
  return { group: g, pts, mat, update(t) { mat.uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- SPEED LINES (2D drawn in GL)
export function speedLines(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const N = o.n || 420;
  const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
  const LEN = o.len || 120;
  const data = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * 6.2832, r = 1.4 + Math.pow(Math.random(), 0.6) * 16;
    data.push({ a, r, z: -Math.random() * LEN, sp: 0.7 + Math.random() * 0.8 });
    const b = 0.5 + Math.random() * 0.6;
    for (let k = 0; k < 2; k++) {
      col[(i * 2 + k) * 3] = 0.72 * b; col[(i * 2 + k) * 3 + 1] = 0.87 * b; col[(i * 2 + k) * 3 + 2] = 1.0 * b;
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  const mat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false });
  const seg = new T.LineSegments(geo, mat); seg.frustumCulled = false; g.add(seg);
  return {
    group: g, seg, mat,
    update(t, speed = 90, stretch = 6) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const d = data[i];
        let z = d.z + t * speed * d.sp;
        z = ((z % LEN) + LEN) % LEN - LEN;
        const x = Math.cos(d.a) * d.r, y = Math.sin(d.a) * d.r;
        const z2 = Math.min(z + stretch * d.sp, 0);
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
        p[i * 6 + 3] = x; p[i * 6 + 4] = y; p[i * 6 + 5] = z2;
      }
      geo.attributes.position.needsUpdate = true;
    }
  };
}

// ---------------------------------------------------------------- MASSIVE HIGHWAY (streaked spiral)
export function highway(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const N = o.n || 1500, R = o.r || 14;
  const data = [];
  const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
  for (let i = 0; i < N; i++) {
    const arm = i % 3;
    const rr = 1.5 + Math.random() * R;
    const a0 = arm * 2.0944 + rr * 0.42 + (Math.random() - 0.5) * 0.5;
    const y = (Math.random() - 0.5) * 0.8;
    data.push({ rr, a0, y });
    const b = 0.35 + Math.random() * 0.8;
    for (let k = 0; k < 2; k++) {
      col[(i * 2 + k) * 3] = 0.68 * b; col[(i * 2 + k) * 3 + 1] = 0.84 * b; col[(i * 2 + k) * 3 + 2] = b;
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  const mat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false });
  const seg = new T.LineSegments(geo, mat); seg.frustumCulled = false; g.add(seg);
  return {
    group: g, seg,
    update(t, speed = 0.55, tail = 0.16) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const d = data[i];
        const a1 = d.a0 + t * speed * (1.6 / Math.max(1, d.rr * 0.22));
        for (let k = 0; k < 2; k++) {
          const a = a1 - k * tail * (1.4 / Math.max(1, d.rr * 0.2));
          p[i * 6 + k * 3] = Math.cos(a) * d.rr;
          p[i * 6 + k * 3 + 1] = d.y;
          p[i * 6 + k * 3 + 2] = Math.sin(a) * d.rr;
        }
      }
      geo.attributes.position.needsUpdate = true;
    }
  };
}


// ---------------------------------------------------------------- HYPERSPACE CYLINDER (shader)
export function hyperTunnel(A, o = {}) {
  const T = A.THREE, g = new T.Group();
  const R = o.r || 9, L = o.len || 120;
  const geo = new T.CylinderGeometry(R, R * 0.55, L, 96, 1, true);
  geo.rotateX(Math.PI / 2);
  const mat = new T.ShaderMaterial({
    transparent: true, side: T.BackSide, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSpeed: { value: 0.55 }, uGain: { value: 1 }, uCol1: { value: new T.Color(0x7fc4ff) }, uCol2: { value: new T.Color(0xffd9a8) } },
    vertexShader: `varying vec2 vUv; varying vec3 vP;
      void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vP; uniform float uTime,uSpeed,uGain; uniform vec3 uCol1,uCol2;
      float hash(float n){ return fract(sin(n)*43758.5453); }
      void main(){
        float u=vUv.x*64.0;             // around the tube
        float v=vUv.y*2.0 - uTime*uSpeed;  // along the tube (streaming)
        float cell=floor(v*3.0); float lane=floor(u*3.0);
        float seed=hash(cell*7.13+lane*3.71);
        float stripe=fract(u*3.0);
        float thin=smoothstep(0.44,0.5,stripe)*smoothstep(0.56,0.5,stripe);
        float dash=smoothstep(0.0,0.25,fract(v*3.0))*smoothstep(1.0,0.55,fract(v*3.0));
        float bright=thin*dash*(0.35+0.65*seed);
        // depth fade: brighter toward the camera
        float depth=smoothstep(0.0,0.55,vUv.y);
        vec3 col=mix(uCol1,uCol2,seed);
        float a=bright*depth*uGain;
        col+=uCol1*0.06*depth;
        gl_FragColor=vec4(col*a*1.8, a*0.9);
      }`
  });
  const mesh = new T.Mesh(geo, mat); g.add(mesh);
  return { group: g, mesh, mat, update(t, speed) { mat.uniforms.uTime.value = t; if (speed !== undefined) mat.uniforms.uSpeed.value = speed; } };
}

// ---------------------------------------------------------------- MOON (photoreal-ish relief sphere)
export function moon(A, tex, o = {}) {
  const T = A.THREE, g = new T.Group();
  const r = o.r || 1;
  const geo = new T.SphereGeometry(r, 128, 96);
  const mat = new T.MeshStandardMaterial({
    map: tex, bumpMap: tex, bumpScale: o.bump ?? 0.035,
    roughness: 0.98, metalness: 0.0, color: new T.Color(0xffffff),
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.rotation.z = -0.2;
  g.add(mesh);
  const key = new T.DirectionalLight(0xfff3e0, o.key ?? 3.2);
  key.position.set(o.sunPos?.[0] ?? 1, o.sunPos?.[1] ?? 0.35, o.sunPos?.[2] ?? 0.5).multiplyScalar(10);
  g.add(key);
  const fill = new T.AmbientLight(0x22304a, o.fill ?? 0.35);
  g.add(fill);
  return {
    group: g, mesh, mat,
    spin(t, x = 0.04, y = 0.03) { mesh.rotation.y = t * y; mesh.rotation.x = Math.sin(t * 0.1) * x; },
  };
}
