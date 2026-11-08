/* =====================================================================
   نغم — player.js · محرّك الصوت
   قائمة انتظار · Media Session (تحكّم شاشة القفل والتشغيل في الخلفية)
   معادل صوتي Web Audio · حفظ للاستماع بلا إنترنت · إدارة الأخطاء والمرايا
   ===================================================================== */
import { bus, cfg, clamp, toast, t, sleep, fetchJSON } from './core.js';
import * as store from './store.js';

const EQ_FREQS = [60, 230, 910, 3600, 12000];
export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0],
  bass: [7, 4, 0, -1, 0],
  vocal: [-3, 0, 4, 4, 1],
  night: [4, 2, 0, 1, 3],
  rai: [5, 2, -1, 3, 4],
  rock: [4, 1, -1, 3, 4],
  elec: [6, 2, -2, 2, 6],
};

export class Player {
  constructor() {
    this.el = null;
    this.queue = [];
    this.index = -1;
    this.playing = false;
    this.buffering = false;
    this.shuffleOrder = [];
    this.shufflePos = -1;
    this.error = null;
    this.track = null;
    this.rate = 1;
    this.retries = 0;
    this.blobUrl = null;
    this.ctx = null; this.nodes = null;
    this.stream = null; /* active AudioSource for visualizer */
    this.sleepAt = 0; this.sleepTimer = null;
    this._posTick = 0;
    this._radioFails = 0;
    this._objCounter = 0;
  }

  /* ------------------------------- boot ------------------------------- */
  init() {
    this.repeat = cfg.get('repeat') || 'off';
    this.shuffle = !!cfg.get('shuffle');
    this.volume = cfg.get('volume') ?? 1;
    this.buildAudio();
    this.bindMedia();
    bus.emit('player', this.state());
  }

  buildAudio() {
    const prev = this.el;
    if (prev) { try { prev.pause(); prev.removeAttribute('src'); prev.load?.(); } catch {} }
    const el = new Audio();
    el.preload = 'auto';
    el.volume = this.volume;
    el.defaultPlaybackRate = this.rate;
    el.setAttribute('playsinline', '');
    if (cfg.get('eqOn')) el.crossOrigin = 'anonymous';      /* ضروري لتمرير الصوت عبر Web Audio */
    this.el = el;
    this.attachFxIfNeeded();
    for (const ev of ['play', 'pause', 'ended', 'error', 'waiting', 'playing', 'stalled',
      'timeupdate', 'durationchange', 'loadedmetadata', 'canplay', 'progress', 'ratechange', 'volumechange']) {
      el.addEventListener(ev, (e) => this.onMedia(ev, e));
    }
    if (prev) prev.remove();
  }

  /* --------------------------- Web Audio (EQ) --------------------------- */
  attachFxIfNeeded() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!cfg.get('eqOn') || !AC || this.ctx || !this.el) { if (!cfg.get('eqOn')) { /* bypass */ } return; }
    try {
      const ctx = new AC();
      const src = ctx.createMediaElementSource(this.el);
      const pre = ctx.createGain();
      const bands = EQ_FREQS.map((f) => {
        const b = ctx.createBiquadFilter();
        b.type = 'peaking'; b.frequency.value = f; b.Q.value = 0.9; b.gain.value = 0;
        return b;
      });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.82;
      let n = src;
      n.connect(pre); n = pre;
      for (const b of bands) { n.connect(b); n = b; }
      const post = ctx.createGain(); post.gain.value = 1;
      n.connect(post); n = post;
      if (cfg.get('normalize')) { n.connect(comp); n = comp; }
      n.connect(analyser); analyser.connect(ctx.destination);
      this.ctx = ctx;
      this.nodes = { src, pre, bands, post, comp, analyser, freq: new Uint8Array(analyser.frequencyBinCount) };
      this.applyEq(cfg.get('eq') || EQ_PRESETS.flat, true);
    } catch (e) {
      console.warn('[fx]', e);
      cfg.set('eqOn', false);
      toast('هذا المصدر لا يدعم المعادل الصوتي', 'err', 2600);
    }
  }
  setEqOn(on) {
    cfg.set('eqOn', !!on);
    if (this.ctx) { try { this.ctx.close(); } catch {} this.ctx = null; this.nodes = null; }
    const pos = this.el?.currentTime || 0;
    const src = this.track;
    this.buildAudio();
    if (src) this.load(src, { autoplay: this.playing, resume: pos });
    bus.emit('player', this.state());
  }
  applyEq(gains, silent) {
    if (!this.nodes) return;
    gains.forEach((g, i) => { this.nodes.bands[i].gain.value = clamp(+g || 0, -14, 14); });
    if (!silent) bus.emit('eq', gains);
  }
  levels() {
    if (!this.nodes) return null;
    this.nodes.analyser.getByteFrequencyData(this.nodes.freq);
    const f = this.nodes.freq, n = f.length, out = [];
    const bands = 28;
    for (let i = 0; i < bands; i++) {
      const a = Math.floor((i / bands) ** 1.5 * n), b = Math.max(a + 1, Math.floor(((i + 1) / bands) ** 1.5 * n));
      let m = 0; for (let j = a; j < b; j++) m = Math.max(m, f[j]);
      out.push(m / 255);
    }
    return out;
  }

  /* --------------------------- media session --------------------------- */
  bindMedia() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const h = {
      play: () => this.play(), pause: () => this.pause(), 'toggle-play-pause': () => this.toggle(),
      previoustrack: () => this.prev(), nexttrack: () => this.next(),
      stop: () => { this.pause(); this.seekTo(0); },
      seekbackward: (d) => this.nudge(-(d.seekOffset || 10)),
      seekforward: (d) => this.nudge(d.seekOffset || 10),
      seekto: (d) => this.seekTo(d.seekTime),
    };
    for (const [k, fn] of Object.entries(h)) { try { ms.setActionHandler(k, fn); } catch {} }
  }
  updateMedia(t) {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: t?.title || 'نغم',
        artist: t?.artist || '',
        album: t?.live ? t.src === 'radio' ? 'إذاعة حية' : 'بث' : (t?.album || 'نغم'),
        artwork: t?.art ? [{ src: t.art, sizes: '512x512', type: 'image/jpeg' }, { src: t.art, sizes: 'any' }] : [],
      });
    } catch {}
    this.updatePlaybackState();
  }
  updatePlaybackState() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = this.playing ? 'playing' : 'paused';
      const t = this.track;
      if (t && !t.live && this.el.duration && isFinite(this.el.duration)) {
        navigator.mediaSession.setPositionState({ duration: this.maxTime(), position: clamp(this.el.currentTime, 0, this.maxTime()), playbackRate: this.rate });
      } else if (t?.live) { navigator.mediaSession.setPositionState?.({ duration: 0, position: 0 }); }
    } catch {}
  }

  maxTime() {
    const d = this.el?.duration || 0;
    const cap = this.track?.preview ? 30 : 0;
    if (!isFinite(d) || d <= 0) return cap || 0;
    return cap ? Math.min(d, cap) : d;
  }

  /* ------------------------------- state ------------------------------- */
  state() {
    return {
      track: this.track, playing: this.playing, buffering: this.buffering, error: this.error,
      index: this.index, size: this.queue.length, shuffle: this.shuffle, repeat: this.repeat,
      rate: this.rate, volume: this.el?.volume ?? this.volume, fx: !!cfg.get('eqOn'), sleepAt: this.sleepAt,
      pos: this.el?.currentTime || 0, dur: this.maxTime(),
      downloaded: !!this._fromBlob,
    };
  }
  emit() { bus.emit('player', this.state()); }

  /* ------------------------------- queue ------------------------------- */
  setQueue(tracks, index = 0) {
    this.queue = (tracks || []).filter(Boolean);
    this.buildShuffle();
    const i = clamp(index, 0, Math.max(0, this.queue.length - 1));
    const at = this.shuffle ? (this.shuffleOrder.indexOf(i) >= 0 ? this.shufflePosFor(i) : i) : i;
    this.load(this.queue[at], { autoplay: true, index: at });
  }
  shufflePosFor(realIdx) { const p = this.shuffleOrder.indexOf(realIdx); return p < 0 ? 0 : p; }
  buildShuffle() {
    this.shuffleOrder = this.queue.map((_, i) => i);
    if (this.shuffle) {
      for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
      }
    }
    this.shufflePos = this.shuffleOrder.indexOf(this.index);
  }
  enqueue(tracks) {
    const arr = Array.isArray(tracks) ? tracks : [tracks];
    this.queue.push(...arr.filter(Boolean));
    this.buildShuffle();
    this.emit();
    toast(`${arr.length} ${t('toast.added', 'أُضيفت إلى قائمة الانتظار')}`, 'ok', 2200);
  }
  playNextInQueue(tracks) {
    const arr = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean);
    this.queue.splice(this.index + 1, 0, ...arr);
    this.buildShuffle(); this.emit();
  }
  removeAt(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.queue.splice(i, 1);
    if (i < this.index) this.index--;
    this.buildShuffle(); this.emit();
  }
  /** انقل عنصرًا إلى «التالية مباشرة» */
  bump(i) {
    if (i < 0 || i >= this.queue.length || i === this.index) return;
    const [x] = this.queue.splice(i, 1);
    this.queue.splice(this.index + 1, 0, x);
    if (i < this.index) this.index--;
    this.buildShuffle(); this.emit();
  }
  clearQueue() {
    const cur = this.track;
    this.queue = cur ? [cur] : [];
    this.index = cur ? 0 : -1;
    this.buildShuffle(); this.emit();
  }
  moveInQueue(from, to) {
    if (from === to || !this.queue[from]) return;
    const [x] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, x);
    this.buildShuffle(); this.emit();
  }

  /* ------------------------------- load ------------------------------- */
  async load(track, { autoplay = true, resume = 0, index = this.index } = {}) {
    if (!track) return;
    this.track = track;
    this.error = null;
    this.retries = 0;
    this.index = index;
    this.shufflePos = this.shuffleOrder.indexOf(index);
    this._fromBlob = false;
    this._radioFails = 0;

    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null; }

    /* 1) نسخة محفوظة محليًا لها الأولوية (تعمل بدون إنترنت) */
    const dl = await store.getDownload(track.id).catch(() => null);
    if (dl?.blob) { this.blobUrl = URL.createObjectURL(dl.blob); this._fromBlob = true; }

    let url = this._fromBlob ? this.blobUrl : track.url;
    if (!url) { this.error = 'لا يوجد رابط بث'; this.emit(); return; }

    /* 2) روابط Audius موقّتة: نجدّدها عند الحاجة فقط */
    if (!this._fromBlob && track.src === 'audius') url = await this.freshStream(track) || url;

    try {
      this.el.src = url;
      this.el.load();
      this.el.playbackRate = this.rate;
      if (resume > 2 && !track.live) {
        const set = () => {
          const max = this.maxTime();
          try { this.el.currentTime = max > 4 ? Math.min(resume, max - 1) : resume; } catch {}
        };
        this.el.addEventListener('loadedmetadata', set, { once: true });
      }
    } catch (e) { this.error = String(e?.message || e); }

    this.el.dataset.trackId = track.id;
    document.title = `${track.title} — ${track.artist}`;
    this.updateMedia(track);
    this.emit();
    store.saveRecent(track, 0);
    if (autoplay) await this.play();
  }

  async freshStream(track) {
    if (!track.externalId) return track.url;
    const age = Date.now() - (track._fetchedAt || 0);
    if (track.url && track._fetchedAt && age < 4 * 60_000) return track.url;
    try {
      const d = await fetchJSON(`https://api.audius.co/v1/tracks/${track.externalId}?app_name=nagham-web`, { timeout: 9000, retries: 0 });
      const s = d?.data?.[0]?.stream?.url;
      if (s) { track.url = s; track._fetchedAt = Date.now(); }
      return s || track.url;
    } catch { return track.url; }
  }

  async play() {
    if (!this.el || !this.el.src) return;
    try {
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
      await this.el.play();
      this.playing = true; this.error = null;
    } catch (e) {
      /* سياسة المتصفح: يحتاج أول نقرة للمستخدم */
      this.playing = false;
      if (e?.name !== 'AbortError') this.error = 'اضغط زر التشغيل للمتابعة';
    }
    this.emit();
  }
  pause() { try { this.el.pause(); } catch {} this.playing = false; this.flushPosition(); this.emit(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  async stopAll() { this.pause(); this.seekTo(0); }

  seekTo(t) {
    if (!this.el || this.track?.live) return;
    const max = this.maxTime() || this.el.duration || 0;
    this.el.currentTime = clamp(t, 0, max || t);
    this.emit();
  }
  nudge(s) { if (this.el) this.seekTo((this.el.currentTime || 0) + s); }
  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.el) this.el.volume = this.volume; cfg.set('volume', this.volume); this.emit(); }
  toggleMute() { this.setVolume(this.el?.volume > 0 ? 0 : this.volume || 0.8); }
  setRate(r) { this.rate = clamp(r, 0.5, 2.5); if (this.el) this.el.playbackRate = this.rate; cfg.set('rate', this.rate); this.updatePlaybackState(); this.emit(); }
  toggleShuffle() {
    this.shuffle = !this.shuffle; cfg.set('shuffle', this.shuffle);
    const cur = this.index; this.buildShuffle();
    if (this.shuffle && cur >= 0) this.shufflePos = this.shuffleOrder.indexOf(cur);
    this.emit();
  }
  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    cfg.set('repeat', this.repeat); this.emit();
  }

  realNext() {
    if (!this.queue.length) return -1;
    if (this.shuffle) {
      this.shufflePos = (this.shufflePos + 1) % this.queue.length;
      let guard = 0;
      while (this.queue[this.shuffleOrder[this.shufflePos]]?.live === false && this.queue[this.shuffleOrder[this.shufflePos]]?.url == null && guard++ < this.queue.length) {
        this.shufflePos = (this.shufflePos + 1) % this.queue.length;
      }
      return this.shuffleOrder[this.shufflePos] ?? 0;
    }
    const n = this.index + 1;
    if (n < this.queue.length) return n;
    return this.repeat === 'all' ? 0 : -1;
  }
  realPrev() {
    if (this.el && this.el.currentTime > 4) return this.index;
    if (this.shuffle) { this.shufflePos = (this.shufflePos - 1 + this.queue.length) % this.queue.length; return this.shuffleOrder[this.shufflePos] ?? 0; }
    return this.index > 0 ? this.index - 1 : this.queue.length - 1;
  }
  async next(auto = false) {
    const i = this.realNext();
    if (i < 0) { if (auto && cfg.get('autoplaySimilar')) return this.autoplaySimilar(); this.pause(); return; }
    this.load(this.queue[i], { autoplay: true, index: i });
  }
  prev() {
    const i = this.realPrev();
    this.load(this.queue[i], { autoplay: true, index: i });
  }

  /** «شغّل التالـي تلقائيًا»: أعمال أخرى من نفس الفنان أو من الرايج. */
  async autoplaySimilar() {
    const t0 = this.track;
    if (!t0) return;
    try {
      const api = await import('./api.js');
      if (t0.src === 'audius' && t0.artistHandle) {
        const mapped = (await api.audiusArtistTracks(t0.artistHandle, { limit: 20 })).filter((x) => x.id !== t0.id);
        if (mapped.length) {
          const nxt = mapped[Math.floor(Math.random() * Math.min(6, mapped.length))] || mapped[0];
          this.queue.push(nxt); this.buildShuffle();
          return this.load(nxt, { autoplay: true, index: this.queue.length - 1 });
        }
      }
      const rnd = await (await import('./api.js')).audiusTrending({ limit: 12 });
      const nxt = rnd.find((x) => x.id !== t0.id);
      if (nxt) { this.queue.push(nxt); this.buildShuffle(); this.load(nxt, { autoplay: true, index: this.queue.length - 1 }); }
    } catch {}
  }

  /* ------------------------------ sleep ------------------------------ */
  setSleep(min) {
    clearTimeout(this.sleepTimer);
    if (!min || min <= 0) { this.sleepAt = 0; this.emit(); return; }
    this.sleepAt = Date.now() + min * 60_000;
    this.sleepTimer = setTimeout(() => {
      this.fadeOutAndPause(); this.sleepAt = 0; this.emit();
      toast(t('toast.sleep', 'انتهى وقت النوم — توقف التشغيل'), 'info', 3500);
    }, min * 60_000);
    this.emit();
  }
  async fadeOutAndPause() {
    const v = this.el.volume;
    for (let i = 10; i > 0; i--) { this.el.volume = (v * i) / 10; await sleep(140); }
    this.pause(); this.el.volume = v;
  }

  /* ---------------------------- media events ---------------------------- */
  flushPosition() {
    if (this.track && !this.track.live && this.el && this.el.currentTime > 3) {
      store.saveRecent(this.track, Math.floor(this.el.currentTime));
    }
  }
  onMedia(ev, e) {
    const el = this.el;
    switch (ev) {
      case 'play': this.playing = true; this.emit(); this.updatePlaybackState(); this.startTicker(); break;
      case 'pause': this.playing = false; this.emit(); this.updatePlaybackState(); break;
      case 'playing': this.playing = true; this.buffering = false; this._radioFails = 0; this.emit(); break;
      case 'waiting': case 'stalled':
        this.buffering = true; this.emit();
        if (this.track?.live) this.tryReconnect();
        break;
      case 'timeupdate': {
        bus.emit('time', { pos: el.currentTime, dur: this.maxTime(), buffered: this.buffered() });
        this._posTick++;
        if (this._posTick % 20 === 0) { this.flushPosition(); this.updatePlaybackState(); }
        if (this.track?.preview && el.currentTime >= 29.6) { el.pause(); el.currentTime = 0; }
        break;
      }
      case 'durationchange': case 'loadedmetadata': case 'canplay':
        this.buffering = false; this.emit(); this.updatePlaybackState(); break;
      case 'progress': bus.emit('time', { pos: el.currentTime, dur: this.maxTime(), buffered: this.buffered() }); break;
      case 'ended':
        if (this.repeat === 'one' && !this.track?.live) { el.currentTime = 0; el.play().catch(() => {}); }
        else this.next(true);
        break;
      case 'error':
        this.onError(e);
        break;
    }
  }
  buffered() {
    try {
      const b = this.el.buffered;
      if (!b.length) return 0;
      return b.end(b.length - 1);
    } catch { return 0; }
  }
  async tryReconnect() {
    if (!this.track?.live || this._radioFails > 2) return;
    this._radioFails++;
    await sleep(1200 * this._radioFails);
    if (!this.playing || !this.track?.live) return;
    try {
      const src = this.el.src;
      this.el.removeAttribute('src');
      this.el.load();
      this.el.src = src;
      this.el.load();
      await this.play();
    } catch {}
  }
  async onError() {
    const t = this.track;
    if (!t) return;
    /* 1) جرّب مرايا Audius */
    if (!this._fromBlob && t.src === 'audius' && Array.isArray(t.mirrors) && this.retries < t.mirrors.length) {
      const m = t.mirrors[this.retries++];
      if (m) { this.error = 'تبديل إلى خادم بديل…'; this.el.src = m; this.el.load(); await this.play(); return; }
    }
    /* 2) جدّد رابط البث */
    if (!this._fromBlob && t.src === 'audius' && this.retries === 0) {
      this.retries = 1;
      const fresh = await this.freshStream({ ...t, _fetchedAt: 0 });
      if (fresh) { this.el.src = fresh; this.el.load(); await this.play(); return; }
    }
    /* 3) المعادل قد يكون سبب الفشل (CORS) → عطّله وأعد المحاولة */
    if (cfg.get('eqOn')) {
      toast(t('set.eqNote', 'تم إيقاف المعادل لأن المصدر لا يدعم CORS'), 'err', 3200);
      this.setEqOn(false);
      return;
    }
    /* 4) إذاعة: أعِد المحاولة على رابط آخر أو أوقف */
    if (t.live) { await this.tryReconnect(); return; }
    this.error = t.src === 'itunes' ? 'تعذّر تحميل المعاينة' : 'تعذّر التشغيل';
    this.buffering = false;
    this.emit();
    toast(this.error + ' — ' + (t.title || ''), 'err', 3000);
  }
  startTicker() {
    if (this._tick) return;
    const loop = () => {
      if (!this.playing) { this._tick = null; return; }
      bus.emit('time', { pos: this.el?.currentTime || 0, dur: this.maxTime(), buffered: this.buffered() });
      this._tick = requestAnimationFrame(loop);
    };
    this._tick = requestAnimationFrame(loop);
  }

  /* --------------------------- offline save --------------------------- */
  async download(track, onProgress) {
    if (!track?.url) throw new Error('لا يمكن حفظ هذه المعاينة');
    if (track.src !== 'audius') { const e = new Error(t('dl.only', 'الحفظ بلا إنترنت متاح للأغاني الكاملة المجانية فقط')); e.code = 'nosrc'; throw e; }
    const res = await fetch(track.url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = +(res.headers.get('content-length') || 0);
    let blob;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        onProgress?.(total ? got / total : 0, got, total);
      }
      blob = new Blob(chunks, { type: 'audio/mpeg' });
    } else blob = await res.blob();
    await store.saveDownload(track, blob);
    return blob;
  }
  async removeDownload(track) { await store.removeDownload(track.id); toast(t('dl.removed', 'حُذف الملف المحفوظ'), 'ok', 2200); this.emit(); }
  async hasDownload(id) { return !!(await store.getDownload(id)); }
}

export const player = new Player();
