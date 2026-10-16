/*@meta {"id":"kernel","title":"النواة","domain":"core","tags":["core","runtime"],"order":1,"always":true}*/
/* NEXUS APEX kernel — the runtime every generated project boots on. No deps, no network. */
(function () {
  var A = window.APEX || (window.APEX = {});
  A.version = "18.0";
  A.modules = A.modules || [];
  A.failed = [];
  A.register = function (m) { A.modules.push(m); return m; };

  /* ---------- errors: one broken widget must never kill the page ---------- */
  A.guard = function (label, fn) {
    try { return fn(); } catch (e) {
      A.failed.push({ label: label, error: String((e && e.message) || e) });
      if (window.console && console.warn) console.warn("[apex:" + label + "]", e);
      return null;
    }
  };

  /* ---------- DOM ---------- */
  A.q = function (sel, root) { return (root || document).querySelector(sel); };
  A.qa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  A.on = function (el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts || false); return el; };
  A.once = function (el, ev, fn) { return A.on(el, ev, fn, { once: true }); };
  A.uid = function (p) { return (p || "id") + "-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); };
  A.ready = function (fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  };
  A.debounce = function (fn, ms) {
    var t = null;
    return function () { var args = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, args); }, ms || 180); };
  };
  A.throttle = function (fn, ms) {
    var last = 0, timer = null;
    return function () {
      var args = arguments, self = this, now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(self, args); }
      else if (!timer) { timer = setTimeout(function () { timer = null; last = Date.now(); fn.apply(self, args); }, ms - (now - last)); }
    };
  };
  A.clamp = function (n, a, b) { return n < a ? a : n > b ? b : n; };
  A.deep = function (v) { return JSON.parse(JSON.stringify(v)); };
  A.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  /** hyperscript: el("div", {class:"x"}, "text", childNode) */
  A.el = function (tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k === "style" && typeof v === "object") for (var s in v) node.style[s] = v[s];
      else if (k === "dataset" && typeof v === "object") for (var d in v) node.dataset[d] = v[d];
      else if (k.slice(0, 2) === "on" && typeof v === "function") A.on(node, k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    A.kids(node, kids);
    return node;
  };
  A.kids = function (node, kids) {
    if (kids == null) return node;
    var arr = Array.isArray(kids) ? kids : [kids];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "object" && c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  };
  A.icon = function (name, size) {
    var d = (A.icons && A.icons[name]) || A.icons.dot;
    return '<svg class="ax-i" viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  };
  /* 34 hand-written stroke icons: the whole app draws with these, no icon font, no CDN */
  A.icons = {
    dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/>',
    chart: '<path d="M4 20V6"/><path d="M4 20h16"/><path d="M8 20v-6"/><path d="M13 20V9"/><path d="M18 20v-9"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 11a3 3 0 1 0 0-6"/><path d="M18 20a5 5 0 0 0-3-4.6"/>',
    cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.3a2 2 0 0 0 2 1.7h8.6a2 2 0 0 0 2-1.6L22 7H6"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    bell: '<path d="M18 15V10a6 6 0 1 0-12 0v5l-2 3h16Z"/><path d="M10 21h4"/>',
    star: '<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9Z"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.4A4 4 0 0 1 12 7.6 4 4 0 0 1 19 10.6c0 5-7 9.4-7 9.4Z"/>',
    play: '<path d="M7 4.5 19 12 7 19.5Z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    upload: '<path d="M12 20V8"/><path d="m7 12 5-5 5 5"/><path d="M4 4h16"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L20 8l-4-4L4 16Z"/><path d="m14 6 4 4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.4"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.4l3.6 2.2"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    shield: '<path d="M12 3 5 6v6c0 5 7 9 7 9s7-4 7-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
    crm: '<rect x="3" y="4" width="18" height="4.5" rx="1.6"/><rect x="3" y="11" width="8.5" height="9" rx="1.6"/><rect x="13.5" y="11" width="7.5" height="9" rx="1.6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    lock: '<rect x="4.5" y="10" width="15" height="11" rx="2.4"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="m3.6 7 8.4 6 8.4-6"/>',
    phone: '<path d="M6 3h3l2 5-2.4 1.6a11 11 0 0 0 5.8 5.8L16 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    book: '<path d="M4 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4Z"/><path d="M20 4h-4a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20Z"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    truck: '<path d="M3 7h11v9H3Z"/><path d="M14 10h4l3 3v3h-7Z"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17" cy="18.5" r="1.6"/>'
  };

  /* ---------- number / date formatting (DZ first) ---------- */
  A.fmt = {
    int: function (n) { return new Intl.NumberFormat(A.i18n ? A.i18n.locale() : "ar-DZ").format(Math.round(n || 0)); },
    num: function (n, d) { return new Intl.NumberFormat(A.i18n ? A.i18n.locale() : "ar-DZ", { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 2 : d }).format(n || 0); },
    dzd: function (n, withCurrency) {
      var v = A.fmt.num(n, 0);
      return withCurrency === false ? v : v + " دج";
    },
    pct: function (n, d) { return A.fmt.num(n, d == null ? 1 : d) + "%"; },
    bytes: function (b) {
      var u = ["B", "KB", "MB", "GB"], i = 0;
      while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
      return (b < 10 && i > 0 ? b.toFixed(1) : Math.round(b)) + " " + u[i];
    },
    date: function (d, style) {
      var dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return "—";
      var o = style === "long" ? { day: "numeric", month: "long", year: "numeric" } : style === "short" ? { day: "2-digit", month: "2-digit", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" };
      return new Intl.DateTimeFormat(A.i18n ? A.i18n.locale() : "ar-DZ", o).format(dt);
    },
    time: function (d) {
      var dt = d instanceof Date ? d : new Date(d);
      return isNaN(dt.getTime()) ? "—" : new Intl.DateTimeFormat(A.i18n ? A.i18n.locale() : "ar-DZ", { hour: "2-digit", minute: "2-digit" }).format(dt);
    },
    dur: function (ms) {
      var s = Math.floor((ms || 0) / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
      if (h) return h + "س " + (m % 60) + "د";
      if (m) return m + "د " + (s % 60) + "ث";
      return s + "ث";
    },
    ago: function (d) {
      var diff = (Date.now() - new Date(d).getTime()) / 1000;
      if (isNaN(diff)) return "—";
      var steps = [[60, "ثانية"], [60, "دقيقة"], [24, "ساعة"], [30, "يوم"], [12, "شهر"], [Infinity, "سنة"]];
      var n = diff, unit = "ثانية", prev = 1;
      for (var i = 0; i < steps.length; i++) { if (n < steps[i][0]) { unit = steps[i][1]; break; } n = n / steps[i][0]; prev = steps[i][0]; }
      n = Math.max(1, Math.round(n));
      return "قبل " + n + " " + unit;
    },
    day: function (d) { return new Date(d).toISOString().slice(0, 10); },
    monthKey: function (d) { return new Date(d).toISOString().slice(0, 7); }
  };

  /* ---------- deterministic randomness (a project always rebuilds identically) ---------- */
  A.rng = function (seed) {
    var s = (seed || 1) >>> 0;
    var api = {
      next: function () { s |= 0; s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
      int: function (a, b) { return a + Math.floor(api.next() * (b - a + 1)); },
      float: function (a, b, d) { var v = a + api.next() * (b - a); return d == null ? v : Math.round(v * Math.pow(10, d)) / Math.pow(10, d); },
      pick: function (arr) { return arr[Math.floor(api.next() * arr.length)]; },
      some: function (arr, n) { return api.shuffle(arr.slice()).slice(0, n); },
      shuffle: function (arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(api.next() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; },
      chance: function (p) { return api.next() < (p == null ? 0.5 : p); },
      id: function (p) { return (p || "k") + api.int(100000, 999999); },
      seed: function () { return s; }
    };
    return api;
  };

  /* ---------- persisted reactive store with undo/redo ---------- */
  A.store = function (key, initial, opts) {
    opts = opts || {};
    var state = initial;
    try {
      var saved = localStorage.getItem("apex:" + key);
      if (saved) {
        var parsed = JSON.parse(saved);
        state = opts.merge && typeof initial === "object" ? Object.assign({}, initial, parsed) : parsed;
      }
    } catch (e) { /* private mode / quota */ }
    var subs = [], past = [], future = [], writing = false;
    function persist() {
      if (writing) return;
      writing = true;
      try { localStorage.setItem("apex:" + key, JSON.stringify(state)); } catch (e) { /* quota */ }
      writing = false;
    }
    function emit(meta) { persist(); subs.slice().forEach(function (fn) { A.guard("store:sub", function () { fn(state, meta); }); }); }
    var api = {
      key: key,
      get: function (sel) { return sel ? sel(state) : state; },
      set: function (next, meta) {
        past.push(state); if (past.length > 60) past.shift(); future.length = 0;
        state = typeof next === "function" ? next(state) : next;
        emit(meta || { kind: "set" });
        return state;
      },
      patch: function (part, meta) { return api.set(Object.assign({}, state, part), meta); },
      undo: function () { if (!past.length) return false; future.push(state); state = past.pop(); emit({ kind: "undo" }); return true; },
      redo: function () { if (!future.length) return false; past.push(state); state = future.pop(); emit({ kind: "redo" }); return true; },
      canUndo: function () { return past.length > 0; },
      canRedo: function () { return future.length > 0; },
      sub: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
      reset: function () { return api.set(initial, { kind: "reset" }); },
      clear: function () { try { localStorage.removeItem("apex:" + key); } catch (e) {} return api.set(initial, { kind: "clear" }); }
    };
    return api;
  };

  /* ---------- tiny event bus ---------- */
  A.bus = (function () {
    var map = {};
    return {
      on: function (ev, fn) { (map[ev] = map[ev] || []).push(fn); return function () { map[ev] = (map[ev] || []).filter(function (f) { return f !== fn; }); }; },
      emit: function (ev, payload) { (map[ev] || []).slice().forEach(function (fn) { A.guard("bus:" + ev, function () { fn(payload); }); }); }
    };
  })();

  /* ---------- i18n ---------- */
  A.i18n = (function () {
    var dict = { ar: window.APEX_STRINGS || {} };
    var lang = (window.APEX_PLAN && window.APEX_PLAN.lang) || "ar";
    var api = {
      lang: function () { return lang; },
      locale: function () { return lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-DZ" : "en-US"; },
      rtl: function () { return lang === "ar"; },
      dict: function (l, d) { dict[l] = d; return api; },
      set: function (l) {
        if (!dict[l]) return api;
        lang = l;
        document.documentElement.lang = l;
        document.documentElement.dir = api.rtl() ? "rtl" : "ltr";
        A.qa("[data-i18n]").forEach(function (n) { var k = n.getAttribute("data-i18n"); var v = api.t(k, null); if (v != null) n.textContent = v; });
        A.bus.emit("lang", l);
        return api;
      },
      t: function (k, fallback) {
        var d = dict[lang] || {};
        var base = dict.ar || {};
        return d[k] != null ? d[k] : base[k] != null ? base[k] : fallback == null ? k : fallback;
      },
      list: function () { return Object.keys(dict); }
    };
    return api;
  })();
  A.t = function (k, fb) { return A.i18n.t(k, fb); };

  /* ---------- toasts / modal / confirm ---------- */
  A.toast = function (msg, kind, ms) {
    var host = A.q("#ax-toasts");
    if (!host) { host = A.el("div", { id: "ax-toasts", class: "ax-toasts" }); document.body.appendChild(host); }
    var ic = kind === "ok" ? A.icon("check") : kind === "warn" ? A.icon("bell") : kind === "err" ? A.icon("x") : A.icon("spark");
    var t = A.el("div", { class: "ax-toast ax-toast-" + (kind || "info"), html: '<span class="ax-toast-ic">' + ic + "</span><span>" + A.esc(msg) + "</span>" });
    host.appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260); }, ms || 3200);
    return t;
  };
  A.modal = function (o) {
    o = o || {};
    var title = o.title || "";
    var body = o.html || "";
    var back = A.el("div", { class: "ax-modal-back", role: "dialog", "aria-modal": "true", "aria-label": title });
    var box = A.el("div", { class: "ax-modal ax-in" + (o.wide ? " ax-modal-wide" : "") });
    var head = A.el("div", { class: "ax-modal-head", html: '<strong>' + A.esc(title) + "</strong>" });
    var closeBtn = A.el("button", { class: "ax-icon-btn", type: "button", "aria-label": "إغلاق", html: A.icon("x"), onclick: function () { api.close(); } });
    head.appendChild(closeBtn);
    var content = A.el("div", { class: "ax-modal-body", html: body });
    var foot = A.el("div", { class: "ax-modal-foot" });
    (o.actions || [{ label: "حسنًا", kind: "primary", close: true }]).forEach(function (a) {
      foot.appendChild(A.el("button", {
        type: "button", class: "ax-btn ax-btn-" + (a.kind || "ghost"), html: a.icon ? A.icon(a.icon) + " " + A.esc(a.label) : A.esc(a.label),
        onclick: function () {
          if (a.onClick) a.onClick(content, api);
          if (a.close !== false) api.close();
        }
      }));
    });
    box.appendChild(head); box.appendChild(content);
    if (foot.children.length) box.appendChild(foot);
    back.appendChild(box);
    document.body.appendChild(back);
    document.body.classList.add("ax-lock");
    var api = {
      el: content, close: function () {
        back.classList.add("is-out");
        setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); document.body.classList.remove("ax-lock"); }, 200);
        A.once(window, "keydown", function () {});
      },
      set: function (html) { content.innerHTML = html; }
    };
    A.on(back, "click", function (e) { if (e.target === back) api.close(); });
    A.on(window, "keydown", function (e) { if (e.key === "Escape") api.close(); }, { once: true });
    if (o.onOpen) A.guard("modal:open", function () { o.onOpen(content, api); });
    return api;
  };
  A.confirm = function (msg, o) {
    o = o || {};
    return new Promise(function (res) {
      A.modal({
        title: o.title || "تأكيد", html: "<p>" + A.esc(msg) + "</p>",
        actions: [
          { label: o.cancel || "إلغاء", kind: "ghost", onClick: function () { res(false); }, close: true },
          { label: o.ok || "تأكيد", kind: o.danger ? "danger" : "primary", onClick: function () { res(true); }, close: true }
        ]
      });
    });
  };

  /* ---------- file helpers ---------- */
  A.download = function (name, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    A.downloadUrl(name, url);
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  };
  A.downloadUrl = function (name, url) {
    var a = A.el("a", { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
  };
  A.csv = function (rows, headers) {
    var keys = headers || Object.keys(rows[0] || {});
    var out = [keys.join(",")];
    rows.forEach(function (r) {
      out.push(keys.map(function (k) { return '"' + String(r[k] == null ? "" : r[k]).replace(/"/g, '""') + '"'; }).join(","));
    });
    return "\ufeff" + out.join("\n");
  };
  A.parseCsv = function (text) {
    var lines = String(text).replace(/\r/g, "").split("\n").filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var heads = A.splitCsvLine(lines[0]);
    return lines.slice(1).map(function (l) {
      var cells = A.splitCsvLine(l), o = {};
      heads.forEach(function (h, i) { o[h.trim()] = cells[i] == null ? "" : cells[i]; });
      return o;
    });
  };
  A.splitCsvLine = function (line) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  A.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { A.toast("تم النسخ", "ok", 1400); }, function () { A.toast("تعذّر النسخ", "warn"); });
    } else {
      var ta = A.el("textarea", { style: { position: "fixed", opacity: "0" } }); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); A.toast("تم النسخ", "ok", 1400); } catch (e) { A.toast("تعذّر النسخ", "warn"); }
      ta.remove();
    }
  };

  /* ---------- scroll reveal + counters ---------- */
  A.reveal = function (root) {
    var nodes = A.qa("[data-reveal]", root || document);
    if (!("IntersectionObserver" in window)) { nodes.forEach(function (n) { n.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    nodes.forEach(function (n) { io.observe(n); });
  };
  A.countUp = function (node, to, ms) {
    var from = parseFloat(node.getAttribute("data-from") || "0");
    var start = performance.now();
    function step(now) {
      var p = A.clamp((now - start) / (ms || 900), 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = A.fmt.num(from + (to - from) * eased, node.getAttribute("data-decimals") || 0);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
  A.activeNav = function () {
    var path = location.hash.replace("#", "") || "home";
    A.qa("[data-nav]").forEach(function (a) {
      var on = a.getAttribute("data-nav") === path || (path.indexOf(a.getAttribute("data-nav")) === 0 && a.getAttribute("data-nav") !== "home");
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  };

  /* ---------- documents: invoice + print/PDF window (shared by every module) ---------- */
  A.invoice = function (o) {
A.invoice = function (o) {
    var ht = 0;
    var lines = (o.lines || []).map(function (l, i) {
      var tot = l.qty * l.price; ht += tot;
      return "<tr><td>" + (i + 1) + "</td><td>" + A.esc(l.label) + "</td><td class='n'>" + l.qty + "</td><td class='n'>" + A.fmt.dzd(l.price) + "</td><td class='n'>" + A.fmt.dzd(tot) + "</td></tr>";
    }).join("");
    var tva = Math.round(ht * ((o.tva || 0) / 100));
    return '<div class="ax-doc" dir="rtl"><header class="ax-doc-head"><div><h2>' + A.esc(o.company || (window.APEX_DATA && window.APEX_DATA.brand) || "المؤسسة") + "</h2><p class='ax-dim'>" + A.esc(o.companyLine || "الجزائر · هاتف 0555 000 000") + "</p></div><div class='ax-doc-meta'><b>فاتورة</b><span>رقم: " + A.esc(o.number) + "</span><span>التاريخ: " + A.fmt.date(o.date || new Date(), "long") + "</span></div></header>" +
      '<section class="ax-doc-client"><b>العميل:</b> ' + A.esc(o.client.client || o.client.name || "—") + (o.client.nif ? " · NIF: " + A.esc(o.client.nif) : "") + (o.client.phone ? " · " + A.esc(o.client.phone) : "") + "</section>" +
      "<table class='ax-doc-table'><thead><tr><th>#</th><th>البيان</th><th class='n'>الكمية</th><th class='n'>السعر</th><th class='n'>المجموع</th></tr></thead><tbody>" + lines + "</tbody></table>" +
      '<div class="ax-doc-totals"><div><span>المجموع قبل الرسم (HT)</span><b>' + A.fmt.dzd(ht) + "</b></div><div><span>الرسم TVA " + (o.tva || 0) + "%</span><b>" + A.fmt.dzd(tva) + "</b></div><div class='ax-doc-grand'><span>المجموع للدفع (TTC)</span><b>" + A.fmt.dzd(ht + tva) + "</b></div></div>" +
      (o.note ? '<p class="ax-doc-note">' + A.esc(o.note) + "</p>" : "") +
      '<footer class="ax-doc-foot">تُسوّى هذه الفاتورة داخل 30 يومًا · شكرًا لتعاملكم معنا</footer></div>';
  };
  };

  A.printDoc = function (html, title) {
    var w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { A.toast("المتصفح منع النافذة — استعمل Ctrl+P", "warn"); return; }
    var css = A.qa("style").map(function (s) { return s.textContent; }).join("\n");
    w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>' + A.esc(title || "طباعة") + "</title><style>" + css + "body{background:#fff}@page{size:A4;margin:14mm}</style></head><body>" + html + "<scr" + "ipt>window.onload=function(){setTimeout(function(){window.print();},320);}<\\/scr" + "ipt></body></html>");
    w.document.close();
  };

  /* ---------- boot ---------- */
  A.mountAll = function () {
    var hosts = A.qa("[data-apex]");
    hosts.forEach(function (host) {
      var id = host.getAttribute("data-apex");
      var mod = A.modules.filter(function (m) { return m.id === id; })[0];
      if (!mod || !mod.mount) return;
      A.guard("mount:" + id, function () {
        mod.mount(host, {
          store: window.APEX_STORE,
          data: window.APEX_DATA || {},
          plan: window.APEX_PLAN || {},
          t: A.t, fmt: A.fmt, rng: A.rng, toast: A.toast, modal: A.modal, confirm: A.confirm,
          bus: A.bus, el: A.el, icon: A.icon, q: A.q, qa: A.qa, on: A.on
        });
        host.setAttribute("data-mounted", "1");
      });
    });
  };
  A.ready(function () {
    window.APEX_STORE = A.store("app", window.APEX_STATE || {}, { merge: true });
    A.guard("boot:theme", function () {
      var pref = A.i18n.lang();
      document.documentElement.lang = pref;
      document.documentElement.dir = A.i18n.rtl() ? "rtl" : "ltr";
    });
    A.mountAll();
    A.guard("boot:reveal", function () { A.reveal(); });
    A.guard("boot:nav", function () { A.activeNav(); A.on(window, "hashchange", function () { A.activeNav(); A.bus.emit("route", location.hash.replace("#", "") || "home"); }); });
    A.guard("boot:counters", function () {
      A.qa("[data-count]").forEach(function (n) {
        var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) { A.countUp(n, parseFloat(n.getAttribute("data-count")), 1100); io.unobserve(n); } });
        }, { threshold: 0.3 }) : null;
        if (io) io.observe(n); else A.countUp(n, parseFloat(n.getAttribute("data-count")), 900);
      });
    });
    A.bus.emit("ready", { modules: A.modules.length });
    if (window.console && console.info) console.info("%cNEXUS APEX v" + A.version + " — " + A.modules.length + " modules mounted, " + A.failed.length + " guarded", "color:#d97757;font-weight:700");
  });
  if (typeof window !== "undefined") window.addEventListener("error", function (e) {
    A.failed.push({ label: "window", error: String(e.message || "error") });
  });
})();
