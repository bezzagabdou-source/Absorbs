/*@meta {"id":"scores","title":"لوحة النتائج","domain":"game","tags":["scores","leaderboard","localStorage"],"order":56,"needs":["kernel"]}*/
/* Leaderboard for the games: reads scores written by any game module, keeps the
   top 50 per title in localStorage, and shows medals, dates and progress bars. */
(function () {
  var A = window.APEX;
  var KEY = "apex:scores:v1";
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "[]") || []; } catch (e) { return []; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch (e) { /* quota */ } }
  A.scores = {
    add: function (game, score, extra) {
      var list = load();
      list.push({ game: game, score: Number(score) || 0, at: new Date().toISOString(), extra: extra || "" });
      save(list);
      A.bus.emit("scores:changed");
      return list;
    },
    top: function (game, n) {
      return load().filter(function (s) { return !game || s.game === game; }).sort(function (a, b) { return b.score - a.score; }).slice(0, n || 10);
    },
    all: load,
    clear: function () { save([]); A.bus.emit("scores:changed"); }
  };
  A.register({
    id: "scores",
    title: "لوحة النتائج",
    mount: function (host) {
      var ui = A.el("div", { class: "ax-card ax-scores" });
      host.appendChild(ui);
      function render() {
        ui.innerHTML = "";
        var list = load();
        var games = [];
        list.forEach(function (s) { if (games.indexOf(s.game) < 0) games.push(s.game); });
        ui.appendChild(A.el("div", { class: "ax-row-between" }, [
          A.el("h3", { text: "أفضل النتائج" }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "تفريغ", onclick: function () { A.confirm("تحب تمسح كل النتائج؟").then(function (ok) { if (ok) { A.scores.clear(); A.toast("تم التفريغ", "ok"); } }); } })
        ]));
        if (!list.length) {
          ui.appendChild(A.el("div", { class: "ax-empty", text: "ما زال ما لعبتش — ابدأ لعبة وسجّل نتيجتك 🎮" }));
          ui.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary", text: "▶ ابدأ اللعب", onclick: function () { A.bus.emit("game:start"); } }));
          return;
        }
        games.forEach(function (g) {
          var rows = A.scores.top(g, 8);
          var box = A.el("div", { class: "ax-score-group" });
          box.appendChild(A.el("b", { text: g }));
          var wrap = A.el("div", { class: "ax-table-wrap" });
          var t = A.el("table", { class: "ax-table ax-table-sm" });
          t.appendChild(A.el("thead", { html: "<tr><th>#</th><th>النتيجة</th><th>التاريخ</th><th>الترتيب</th></tr>" }));
          var tb = A.el("tbody", {});
          var best = rows[0] ? rows[0].score : 1;
          rows.forEach(function (s, i) {
            var medal = ["🥇", "🥈", "🥉"][i] || String(i + 1);
            tb.appendChild(A.el("tr", { html: "<td>" + medal + "</td><td class='ax-num'><b>" + A.fmt.int(s.score) + "</b></td><td>" + A.fmt.ago(s.at) + "</td><td><span class='ax-bar'><span style='width:" + Math.round((s.score / best) * 100) + "%'></span></span></td>" }));
          });
          t.appendChild(tb);
          wrap.appendChild(t);
          box.appendChild(wrap);
          ui.appendChild(box);
        });
      }
      render();
      A.bus.on("scores:changed", render);
      window.addEventListener("message", function (e) {
        var d = e.data || {};
        if (d.apex === "gameover" && typeof d.score === "number") { A.scores.add(d.kind || "لعبة", d.score); }
      });
    }
  });
})();
