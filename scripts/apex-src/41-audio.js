/*@meta {"id":"audio","title":"الصوت والموسيقى","domain":"media","tags":["audio","sfx","music","visualizer","webaudio"],"order":61,"needs":["kernel"]}*/
/* Procedural audio: SFX synth, generative music sequencer, mixer and a live spectrum visualizer.
   Zero files, zero network — everything is synthesised in the browser. */
(function () {
  var A = window.APEX;
  var Ctx = window.AudioContext || window.webkitAudioContext;
  A.audio = (function () {
    var ctx = null, master = null, musicGain = null, sfxGain = null, timer = null, step = 0, playing = false;
    var SCALE = [0, 2, 3, 5, 7, 8, 10, 12];
    function ensure() {
      if (!Ctx) return null;
      if (!ctx) {
        ctx = new Ctx();
        master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
        musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
        sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    function tone(o) {
      var c = ensure();
      if (!c) return;
      var osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || "triangle";
      osc.frequency.setValueAtTime(o.freq, c.currentTime);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), c.currentTime + (o.dur || 0.2));
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(o.gain || 0.3, c.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (o.dur || 0.2));
      osc.connect(g);
      g.connect(o.bus === "music" ? musicGain : sfxGain);
      osc.start();
      osc.stop(c.currentTime + (o.dur || 0.2) + 0.02);
    }
    function noise(o) {
      var c = ensure();
      if (!c) return;
      var len = Math.floor(c.sampleRate * (o.dur || 0.2));
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource(); src.buffer = buf;
      var f = c.createBiquadFilter(); f.type = o.filter || "lowpass"; f.frequency.value = o.cutoff || 1200;
      var g = c.createGain(); g.gain.value = o.gain || 0.25;
      src.connect(f); f.connect(g); g.connect(o.bus === "music" ? musicGain : sfxGain);
      src.start();
    }
    var SFX = {
      click: function () { tone({ freq: 620, to: 900, dur: 0.06, gain: 0.18 }); },
      coin: function () { tone({ freq: 880, dur: 0.08, gain: 0.24 }); setTimeout(function () { tone({ freq: 1320, dur: 0.12, gain: 0.2 }); }, 70); },
      jump: function () { tone({ freq: 300, to: 760, dur: 0.18, gain: 0.24, type: "square" }); },
      hit: function () { noise({ dur: 0.16, cutoff: 900, gain: 0.3 }); tone({ freq: 160, to: 70, dur: 0.18, gain: 0.3, type: "sawtooth" }); },
      win: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone({ freq: f, dur: 0.18, gain: 0.22 }); }, i * 110); }); },
      lose: function () { [392, 330, 262, 196].forEach(function (f, i) { setTimeout(function () { tone({ freq: f, dur: 0.26, gain: 0.24, type: "sawtooth" }); }, i * 140); }); },
      power: function () { tone({ freq: 220, to: 1200, dur: 0.34, gain: 0.26, type: "square" }); }
    };
    function play(name) { if (SFX[name]) SFX[name](); else tone({ freq: 440, dur: 0.1 }); }
    function startMusic(root, bpm) {
      var c = ensure();
      if (!c) return;
      stopMusic();
      playing = true;
      var r = root || 220, beat = (60 / (bpm || 96)) * 1000;
      step = 0;
      timer = setInterval(function () {
        if (!playing) return;
        var s = step % 16;
        var semi = SCALE[(step * 3) % SCALE.length];
        if (s % 2 === 0) tone({ freq: r * Math.pow(2, semi / 12), dur: beat / 900, gain: 0.16, bus: "music", type: "triangle" });
        if (s % 4 === 0) tone({ freq: r / 2, dur: beat / 400, gain: 0.2, bus: "music", type: "sine" });
        if (s === 6 || s === 14) noise({ dur: 0.09, gain: 0.09, cutoff: 5000, bus: "music" });
        step++;
      }, beat);
    }
    function stopMusic() { playing = false; if (timer) clearInterval(timer); timer = null; }
    function spectrum(canvas) {
      var c = ensure();
      if (!c || !canvas || !c.createAnalyser) return null;
      var an = c.createAnalyser(); an.fftSize = 128;
      master.connect(an);
      var data = new Uint8Array(an.frequencyBinCount);
      var g = canvas.getContext("2d");
      function draw() {
        if (!canvas.isConnected) return;
        requestAnimationFrame(draw);
        an.getByteFrequencyData(data);
        g.clearRect(0, 0, canvas.width, canvas.height);
        var w = canvas.width / data.length;
        for (var i = 0; i < data.length; i++) {
          var h = (data[i] / 255) * canvas.height;
          g.fillStyle = A.palette()[i % 8];
          g.fillRect(i * w, canvas.height - h, Math.max(1, w - 1), h);
        }
      }
      draw();
      return an;
    }
    return {
      play: play, tone: tone, noise: noise, music: startMusic, stopMusic: stopMusic,
      spectrum: spectrum, ready: function () { return !!ensure(); },
      volume: function (v) { var c = ensure(); if (c && master) master.gain.value = A.clamp(v, 0, 1); },
      supported: function () { return !!Ctx; }
    };
  })();
  A.register({
    id: "audio",
    title: "الصوت",
    mount: function (host) {
      var ui = A.el("div", { class: "ax-card ax-grid", style: { gap: "12px" } });
      host.appendChild(ui);
      if (!A.audio.supported()) { ui.appendChild(A.el("p", { class: "ax-warn", text: "المتصفح ما يدعمش Web Audio — الصوت معطّل." })); return; }
      ui.appendChild(A.el("h3", { text: "محرّك الصوت ({ Web Audio })" }));
      var pads = A.el("div", { class: "ax-chips" });
      Object.keys({ click: 1, coin: 1, jump: 1, hit: 1, win: 1, lose: 1, power: 1 }).forEach(function (name) {
        pads.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: name, onclick: function () { A.audio.play(name); } }));
      });
      ui.appendChild(pads);
      var cv = A.el("canvas", { width: 620, height: 120, class: "ax-card", style: { width: "100%" } });
      ui.appendChild(cv);
      var vol = A.el("input", { type: "range", min: 0, max: 100, value: 60, class: "ax-range", "aria-label": "الصوت" });
      A.on(vol, "input", function () { A.audio.volume(Number(vol.value) / 100); });
      ui.appendChild(vol);
      var row = A.el("div", { class: "ax-grid-bar" });
      row.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("play", 15) + " موسيقى خلفية", onclick: function () { A.audio.music(220, 96); A.audio.spectrum(cv); A.toast("الموسيقى تشتغل — مولّدة لحظيًا بلا ملفات", "ok", 2400); } }));
      row.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("pause", 15) + " وقف", onclick: function () { A.audio.stopMusic(); } }));
      row.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "نغمة عشوائية", onclick: function () { A.audio.tone({ freq: A.rng().int(180, 880), to: A.rng().int(200, 1400), dur: 0.4, type: "triangle" }); A.audio.spectrum(cv); } }));
      ui.appendChild(row);
      ui.appendChild(A.el("p", { class: "ax-dim", style: { fontSize: "12.5px" }, text: "كل الأصوات تُولَّد بالكود: تنبيهات، أصوات لعب، وموسيقى تتغيّر مع الإيقاع — بلا ملفات MP3 وبلا إنترنت." }));
    }
  });
})();
