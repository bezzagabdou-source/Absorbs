/*@meta {"id":"search","title":"محرّك البحث","domain":"data","tags":["search","bm25","index","fuzzy","facets"],"order":23}*/
/* A real full-text index: BM25 scoring, fuzzy fallback, Arabic normalisation, facets and highlights. */
(function () {
  var A = window.APEX;
  var AR_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(AR_DIACRITICS, "")
      .replace(/[إأآا]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
      .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }
  function stem(w) {
    if (w.length <= 4) return w;
    return w.replace(/^(ال|وال|بال|فال|كال|لل)/, "").replace(/(ات|ون|ين|يه|ها|هم|كم|نا|ه)$/, "");
  }
  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    var m = a.length, n = b.length, prev = new Array(n + 1), cur = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      cur[0] = i;
      for (var j2 = 1; j2 <= n; j2++) cur[j2] = Math.min(prev[j2] + 1, cur[j2 - 1] + 1, prev[j2 - 1] + (a[i - 1] === b[j2 - 1] ? 0 : 1));
      var t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }
  /** idx = new A.Index(docs, { fields:["title","body"], weights:{title:3}, facets:["tag"] }) */
  A.Index = function (docs, opts) {
    opts = opts || {};
    var fields = opts.fields || ["title", "body"];
    var weights = opts.weights || {};
    var k1 = 1.4, b = 0.72;
    var postings = {}, lens = [], avg = 0, termsIn = [];
    docs.forEach(function (doc, i) {
      var bag = {}, len = 0;
      fields.forEach(function (f) {
        var w = weights[f] || 1;
        var text = norm(doc[f]);
        text.split(" ").forEach(function (raw) {
          var t = stem(raw);
          if (!t || t.length < 2) return;
          bag[t] = (bag[t] || 0) + w;
          len += w;
        });
      });
      lens[i] = len || 1;
      avg += lens[i];
      termsIn[i] = bag;
      Object.keys(bag).forEach(function (t) { (postings[t] = postings[t] || []).push(i); });
    });
    avg = avg / Math.max(1, docs.length);
    var N = docs.length;
    function score(q, i) {
      var bag = termsIn[i], s = 0;
      q.forEach(function (t) {
        var tf = bag[t] || 0;
        if (!tf) return;
        var df = (postings[t] || []).length;
        var idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (lens[i] / avg))));
      });
      return s;
    }
    var api = {
      size: N,
      search: function (query, o) {
        o = o || {};
        var q = norm(query).split(" ").map(stem).filter(function (t) { return t.length >= 2; });
        if (!q.length) {
          var all = docs.slice(0, o.limit || 20);
          return o.facets ? { hits: all.map(function (d) { return { doc: d, score: 0 }; }), facets: api.facets() } : all;
        }
        var hits = [];
        for (var i = 0; i < N; i++) {
          var s = score(q, i);
          if (s > 0) hits.push({ doc: docs[i], score: s });
        }
        /* fuzzy pass when BM25 found nothing (typos in Arabic/Darija are common) */
        if (!hits.length && q.length) {
          for (var j = 0; j < N; j++) {
            var bag = termsIn[j];
            var best = 99;
            Object.keys(bag).forEach(function (t) { q.forEach(function (term) { best = Math.min(best, levenshtein(term, t)); }); });
            if (best <= 2) hits.push({ doc: docs[j], score: 0.4 / (best + 1), fuzzy: true });
          }
        }
        hits.sort(function (a, c) { return c.score - a.score || String(a.doc.title || "").localeCompare(String(c.doc.title || ""), "ar"); });
        if (o.facetFilter) {
          var k = o.facetFilter.key;
          hits = hits.filter(function (h) { return String(h.doc[k]) === String(o.facetFilter.value); });
        }
        var out = o.limit ? hits.slice(0, o.limit) : hits;
        if (o.facets) return { hits: out, facets: api.facets(hits), total: hits.length };
        return out.map(function (h) { return h.doc; });
      },
      facets: function (subset) {
        var keys = opts.facets || [];
        var rows = subset ? subset.map(function (h) { return h.doc; }) : docs;
        var out = {};
        keys.forEach(function (k) {
          var map = {};
          rows.forEach(function (d) {
            var v = d[k];
            (Array.isArray(v) ? v : [v]).filter(Boolean).forEach(function (val) { map[val] = (map[val] || 0) + 1; });
          });
          out[k] = Object.keys(map).map(function (val) { return { value: val, count: map[val] }; }).sort(function (a, c) { return c.count - a.count; });
        });
        return out;
      },
      suggest: function (prefix, limit) {
        var p = norm(prefix);
        if (!p) return [];
        return Object.keys(postings).filter(function (t) { return t.indexOf(p) === 0; }).slice(0, limit || 8);
      },
      highlight: function (text, query) {
        var q = norm(query).split(" ").filter(function (t) { return t.length >= 2; });
        var html = A.esc(text);
        q.forEach(function (t) { html = html.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), "<mark>$1</mark>"); });
        return html;
      }
    };
    return api;
  };
  /** search UI any page can drop in: input + facet chips + result cards */
  A.searchUI = function (host, o) {
    var idx = o.index;
    var box = A.el("div", { class: "ax-search-ui" });
    var bar = A.el("div", { class: "ax-search-bar", html: A.icon("search") + '<input type="search" class="ax-input" placeholder="' + A.esc(o.placeholder || "ابحث…") + '" aria-label="بحث"><kbd class="ax-kbd">/</kbd>' });
    var input = A.q("input", bar);
    var facetBox = A.el("div", { class: "ax-facets" });
    var out = A.el("div", { class: "ax-results" });
    box.appendChild(bar); box.appendChild(facetBox); box.appendChild(out);
    host.appendChild(box);
    var facet = null;
    function paint() {
      var res = idx.search(input.value, { facets: true, facetFilter: facet, limit: o.limit || 30 });
      var hits = Array.isArray(res) ? res : res.hits;
      var facets = Array.isArray(res) ? null : res.facets;
      if (facets && o.facetKeys) {
        facetBox.innerHTML = "";
        o.facetKeys.forEach(function (k) {
          (facets[k] || []).slice(0, 8).forEach(function (f) {
            facetBox.appendChild(A.el("button", {
              type: "button", class: "ax-chip ax-chip-btn" + (facet && facet.value === f.value ? " is-on" : ""),
              text: f.value + " (" + f.count + ")",
              onclick: function () { facet = facet && facet.value === f.value && facet.key === k ? null : { key: k, value: f.value }; paint(); }
            }));
          });
        });
      }
      out.innerHTML = "";
      if (!hits.length) { out.appendChild(A.el("p", { class: "ax-empty", text: o.emptyText || "ما لقيناش نتائج — جرّب كلمة أخرى" })); return; }
      hits.forEach(function (h, i) {
        var d = h.doc || h;
        var card = A.el("article", { class: "ax-result", style: { animationDelay: (i * 24) + "ms" } });
        card.appendChild(A.el("h4", { html: idx.highlight(d[o.titleField || "title"] || d.label || "", input.value) }));
        if (o.snippetField) card.appendChild(A.el("p", { class: "ax-dim", html: idx.highlight(String(d[o.snippetField]).slice(0, 190) + "…", input.value) }));
        if (d.tags) card.appendChild(A.el("div", { class: "ax-chips", html: (Array.isArray(d.tags) ? d.tags : [d.tags]).map(function (t) { return '<span class="ax-chip">' + A.esc(t) + "</span>"; }).join("") }));
        A.on(card, "click", function () { if (o.onPick) o.onPick(d); });
        out.appendChild(card);
      });
    }
    A.on(input, "input", A.debounce(paint, 120));
    A.on(window, "keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });
    paint();
    return { el: box, paint: paint, setQuery: function (q) { input.value = q; paint(); } };
  };
  A.normalizeAr = norm;
  A.register({ id: "search", title: "محرّك البحث", mount: function (host) { A.guard("search:mount", function () { A.searchUI(host, { index: A.Index(window.APEX_DATA.search || [], { fields: ["title", "body", "tags"], facets: ["tags"] }), titleField: "title", snippetField: "body", facetKeys: ["tags"] }); }); } });
})();
