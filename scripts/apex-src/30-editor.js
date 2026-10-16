/*@meta {"id":"editor","title":"محرّر النصوص","domain":"content","tags":["editor","markdown","rich-text","export"],"order":50,"needs":["kernel"]}*/
/* Markdown editor with toolbar, live preview, autosave, word count, export MD/HTML and print. */
(function () {
  var A = window.APEX;
  function md2html(md) {
    var out = A.esc(md);
    out = out.replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/^\> (.*)$/gm, "<blockquote>$1</blockquote>")
      .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
      .replace(/^\s*\d+\. (.*)$/gm, "<li>$1</li>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");
    return out.split(/\n{2,}/).map(function (chunk) { return /^<(h\d|ul|blockquote|pre)/.test(chunk.trim()) ? chunk : chunk.trim() ? "<p>" + chunk.replace(/\n/g, "<br>") + "</p>" : ""; }).join("\n");
  }
  A.md2html = md2html;
  A.register({
    id: "editor",
    title: "محرّر النصوص",
    mount: function (host, ctx) {
      var store = A.store("editor", { doc: "", title: "", tags: [] });
      if (!store.get().doc) store.set({ doc: "# مقال جديد\n\nاكتب هنا…\n\n## عنوان فرعي\n\n- نقطة أولى\n- نقطة ثانية\n\n**نص عريض** و*مائل* و`كود`.\n\n> اقتباس ملهم\n", title: "مقال بلا عنوان" });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "12px" } });
      host.appendChild(ui);
      var toolbar, area, preview, status;
      function render() {
        ui.innerHTML = "";
        var s = store.get();
        var head = A.el("div", { class: "ax-grid-bar" });
        var titleIn = A.el("input", { class: "ax-input", value: s.title, "aria-label": "عنوان المستند", style: { maxWidth: "340px", fontWeight: "800" } });
        A.on(titleIn, "input", A.debounce(function () { store.set({ title: titleIn.value }, { kind: "title" }); }, 400));
        head.appendChild(titleIn);
        head.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("copy", 15) + " نسخ Markdown", onclick: function () { A.copy(store.get().doc); } }));
        head.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " .md", onclick: function () { A.download(s.title + ".md", store.get().doc); } }));
        head.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " .html", onclick: function () { A.download(s.title + ".html", "<!doctype html><html dir='rtl'><meta charset='utf-8'><body>" + md2html(store.get().doc) + "</body></html>", "text/html;charset=utf-8"); } }));
        head.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("download", 15) + " طباعة / PDF", onclick: function () { A.printDoc('<div class="ax-doc" dir="rtl"><h1>' + A.esc(store.get().title) + "</h1>" + md2html(store.get().doc) + "</div>", store.get().title); } }));
        ui.appendChild(head);

        toolbar = A.el("div", { class: "ax-chips" });
        [["# ", "عنوان 1"], ["## ", "عنوان 2"], ["**", "عريض"], ["*", "مائل"], ["`", "كود"], ["> ", "اقتباس"], ["- ", "قائمة"], ["1. ", "مرقّمة"], ["[نص](رابط)", "رابط"], ["---", "فاصل"]].forEach(function (btn) {
          toolbar.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: btn[1], onclick: function () { wrap(btn[0]); } }));
        });
        toolbar.appendChild(A.el("span", { class: "ax-spacer" }));
        toolbar.appendChild(A.el("span", { class: "ax-dim", style: { fontSize: "12.5px" } }));
        ui.appendChild(toolbar);

        var two = A.el("div", { class: "ax-two", style: { alignItems: "stretch" } });
        area = A.el("textarea", { class: "ax-input", style: { minHeight: "52vh", fontFamily: "ui-monospace,Menlo,monospace", lineHeight: "1.8", fontSize: "14.5px" }, spellcheck: "false", "aria-label": "نص Markdown" });
        area.value = s.doc;
        preview = A.el("div", { class: "ax-card ax-prose", style: { overflowY: "auto", maxHeight: "52vh" } });
        A.on(area, "input", function () { paintPreview(); });
        A.on(area, "keydown", function (e) {
          if (e.key === "Tab") { e.preventDefault(); wrap("  "); }
          if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); store.set({ doc: area.value }, { kind: "save" }); A.toast("حُفظ", "ok", 1200); }
        });
        var left = A.el("div", { class: "ax-grid", style: { gap: "8px" } }, [area]);
        two.appendChild(left);
        two.appendChild(preview);
        ui.appendChild(two);
        status = A.el("div", { class: "ax-dim", style: { fontSize: "12.5px" } });
        ui.appendChild(status);
        paintPreview();
      }
      function paintPreview() {
        store.set({ doc: area.value }, { kind: "edit" });
        preview.innerHTML = '<h2 style="margin-top:0">' + A.esc(store.get().title) + "</h2>" + md2html(area.value);
        var words = area.value.trim().split(/\s+/).filter(Boolean).length;
        status.textContent = words + " كلمة · " + area.value.length + " حرف · ≈ " + Math.max(1, Math.round(words / 200)) + " دقيقة قراءة · يُحفظ تلقائيًا";
      }
      function wrap(token) {
        var start = area.selectionStart, end = area.selectionEnd, val = area.value;
        var sel = val.slice(start, end) || "نص";
        var pre = val.slice(0, start), post = val.slice(end);
        var isLine = /^[#\->\d]|^\d+\.\s$/.test(token) || token === "---";
        var insert = isLine ? token + sel + "\n" : token + sel + (token === "**" || token === "*" || token === "`" ? token : "");
        area.value = pre + insert + post;
        area.focus();
        area.selectionStart = start + token.length;
        area.selectionEnd = start + token.length + sel.length;
        paintPreview();
      }
      render();
    }
  });
})();
