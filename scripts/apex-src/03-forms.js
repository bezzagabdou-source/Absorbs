/*@meta {"id":"forms","title":"محرّك النماذج","domain":"ui","tags":["forms","validation","wizard","upload"],"order":20}*/
/* Schema-driven forms: validation in AR/FR/EN, masks, multi-step wizard, autosave, file dropzone. */
(function () {
  var A = window.APEX;
  function label(f) { return A.t("f_" + f.name, f.label || f.name); }
  var RULES = {
    required: function (v) { return (v != null && String(v).trim() !== "") || "هذا الحقل مطلوب"; },
    email: function (v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || "البريد الإلكتروني غير صحيح"; },
    phone: function (v) { return !v || /^(0|\+213)[5-7][0-9]{8}$/.test(String(v).replace(/\s/g, "")) || "رقم جزائري غير صحيح (مثال: 0555123456)"; },
    min: function (n, v) { return v === "" || v == null || Number(v) >= n || "القيمة يجب أن تكون " + n + " أو أكثر"; },
    max: function (n, v) { return v === "" || v == null || Number(v) <= n || "القيمة يجب أن تكون " + n + " أو أقل"; },
    len: function (n, v) { return !v || String(v).length >= n || "الحد الأدنى " + n + " حرفًا"; },
    rc: function (v) { return !v || /^[0-9]{9,20}$/.test(String(v).replace(/[\s-]/g, "")) || "رقم السجل التجاري غير صحيح"; },
    nin: function (v) { return !v || /^[0-9]{18}$/.test(String(v).replace(/\s/g, "")) || "رقم التعريف الوطني = 18 رقمًا"; }
  };
  var MASKS = {
    phone: function (v) { return String(v).replace(/[^\d+]/g, "").replace(/^(\d{4})(\d{0,2})(\d{0,2})(\d{0,2}).*/, function (m, a, b, c, d) { return [a, b, c, d].filter(Boolean).join(" "); }).slice(0, 14); },
    money: function (v) { var n = String(v).replace(/[^\d]/g, ""); return n ? Number(n).toLocaleString("fr-DZ").replace(/,/g, " ") : ""; },
    rc: function (v) { return String(v).replace(/[^\d]/g, "").slice(0, 20); }
  };
  function rule(raw) {
    var parts = String(raw).split(":");
    var fn = RULES[parts[0]];
    if (!fn) return null;
    return function (v) { return parts.length > 1 ? fn(parts[1], v) : fn(v); };
  }
  /** Builds a full form widget. Returns { el, values, validate, reset, setValues, onSubmit } */
  A.form = function (spec) {
    spec = spec || {};
    var fields = spec.fields || [];
    var steps = spec.steps || null;
    var store = spec.store || null;
    var stepIndex = 0;
    var subs = [], subs2 = [];
    var wrap = A.el("form", { class: "ax-form", novalidate: "novalidate" });
    var bar = A.el("div", { class: "ax-wizard" });
    var body = A.el("div", { class: "ax-form-body" });
    var foot = A.el("div", { class: "ax-form-foot" });
    var inputs = {};
    wrap.appendChild(bar); wrap.appendChild(body); wrap.appendChild(foot);

    function values() {
      var o = {};
      fields.forEach(function (f) { o[f.name] = f.type === "checkbox" ? !!(inputs[f.name] && inputs[f.name].checked) : inputs[f.name] ? inputs[f.name].value : ""; });
      return o;
    }
    function setValues(v) {
      Object.keys(v || {}).forEach(function (k) {
        var inp = inputs[k]; if (!inp) return;
        if (inp.type === "checkbox") inp.checked = !!v[k]; else inp.value = v[k] == null ? "" : v[k];
        subs.forEach(function (fn) { fn(inp.value, k); });
      });
    }
    function stepFields(i) { return steps ? fields.filter(function (f) { return (f.step || 0) === i; }) : fields; }

    function fieldNode(f) {
      var id = "axf-" + f.name;
      var box = A.el("div", { class: "ax-field ax-field-" + (f.type || "text") + (f.half ? " ax-half" : "") });
      var control;
      if (f.type === "textarea") control = A.el("textarea", { id: id, name: f.name, rows: f.rows || 4, class: "ax-input", placeholder: f.placeholder || "" });
      else if (f.type === "select") {
        control = A.el("select", { id: id, name: f.name, class: "ax-input" });
        (f.options || []).forEach(function (o) {
          var opt = typeof o === "object" ? o : { value: o, label: o };
          control.appendChild(A.el("option", { value: opt.value, text: opt.label }));
        });
      } else if (f.type === "checkbox") {
        control = A.el("input", { id: id, name: f.name, type: "checkbox", class: "ax-check" });
        control.checked = !!f.value;
      } else if (f.type === "range") {
        control = A.el("input", { id: id, name: f.name, type: "range", min: f.min || 0, max: f.max || 100, step: f.step || 1, value: f.value == null ? 50 : f.value, class: "ax-range" });
      } else if (f.type === "color") control = A.el("input", { id: id, name: f.name, type: "color", value: f.value || "#d97757", class: "ax-color" });
      else if (f.type === "files") {
        control = A.el("div", { class: "ax-drop", tabindex: "0", role: "button", "aria-label": label(f), html: A.icon("upload", 22) + "<span>" + A.esc(f.hint || "أفلت الملفات هنا أو اضغط للاختيار") + "</span><input type='file' hidden multiple accept='" + (f.accept || "*/*") + "'>" });
        var real = A.q("input", control);
        A.on(control, "click", function () { real.click(); });
        A.on(control, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); real.click(); } });
        A.on(real, "change", function () { showFiles(control, real.files); });
        ["dragenter", "dragover"].forEach(function (ev) { A.on(control, ev, function (e) { e.preventDefault(); control.classList.add("is-over"); }); });
        ["dragleave", "drop"].forEach(function (ev) { A.on(control, ev, function (e) { e.preventDefault(); control.classList.remove("is-over"); }); });
        A.on(control, "drop", function (e) { showFiles(control, e.dataTransfer.files); });
        inputs[f.name] = real;
        box.appendChild(A.el("label", { class: "ax-label", for: id, text: label(f) }));
        box.appendChild(control);
        return box;
      } else control = A.el("input", { id: id, name: f.name, type: f.type || "text", class: "ax-input", placeholder: f.placeholder || "", value: f.value == null ? "" : f.value, inputmode: f.inputmode || (f.mask === "phone" ? "tel" : f.mask === "money" ? "numeric" : null), autocomplete: f.autocomplete || "off" });
      if (f.mask && MASKS[f.mask]) A.on(control, "input", function () { var p = control.selectionStart; control.value = MASKS[f.mask](control.value); if (control.setSelectionRange) control.setSelectionRange(Math.min(p, control.value.length), Math.min(p, control.value.length)); });
      if (f.validate) A.on(control, "blur", function () { check(f, control, true); });
      if (f.validate) A.on(control, "input", function () { if (box.classList.contains("has-err")) check(f, control, true); });
      inputs[f.name] = control;
      var lab = f.type === "checkbox"
        ? A.el("label", { class: "ax-check-row", for: id })
        : A.el("label", { class: "ax-label", for: id, text: label(f) });
      if (f.type === "checkbox") { lab.appendChild(control); lab.appendChild(A.el("span", { text: label(f) })); box.appendChild(lab); }
      else { box.appendChild(lab); box.appendChild(control); }
      if (f.type === "range") {
        var out = A.el("output", { class: "ax-range-out", text: String(control.value) });
        A.on(control, "input", function () { out.textContent = control.value; });
        box.appendChild(out);
      }
      if (f.hint) box.appendChild(A.el("p", { class: "ax-hint", text: f.hint }));
      box.appendChild(A.el("p", { class: "ax-err", "aria-live": "polite" }));
      subs.push(function (v, k) { if (k === f.name && f.type === "range") box.querySelector(".ax-range-out").textContent = v; });
      return box;
    }
    function showFiles(node, list) {
      var names = Array.prototype.slice.call(list || []).map(function (f) { return f.name + " (" + A.fmt.bytes(f.size) + ")"; });
      var out = A.q(".ax-drop-list", node);
      if (!out) { out = A.el("div", { class: "ax-drop-list" }); node.appendChild(out); }
      out.innerHTML = names.map(function (n) { return "<span class='ax-chip'>" + A.esc(n) + "</span>"; }).join("");
      node.classList.toggle("has-files", names.length > 0);
    }
    function check(f, control, paint) {
      var box = control.closest ? control.closest(".ax-field") : null;
      var rules = String(f.validate || "").split("|").filter(Boolean).map(rule).filter(Boolean);
      for (var i = 0; i < rules.length; i++) {
        var msg = rules[i](control.value);
        if (msg !== true) { if (paint && box) { box.classList.add("has-err"); var e = A.q(".ax-err", box); if (e) e.textContent = msg; } return msg; }
      }
      if (paint && box) { box.classList.remove("has-err"); var e2 = A.q(".ax-err", box); if (e2) e2.textContent = ""; }
      return true;
    }
    function validateAll() {
      var bad = [];
      fields.forEach(function (f) {
        var c = inputs[f.name];
        if (!c) return;
        var msg = check(f, c, true);
        if (msg !== true) bad.push({ field: f.name, message: msg });
      });
      return bad;
    }
    function renderStep() {
      body.innerHTML = "";
      stepFields(stepIndex).forEach(function (f) { body.appendChild(fieldNode(f)); });
      bar.innerHTML = "";
      if (steps) {
        steps.forEach(function (s, i) {
          bar.appendChild(A.el("button", { type: "button", class: "ax-step" + (i === stepIndex ? " is-on" : "") + (i < stepIndex ? " is-done" : ""), html: '<span class="ax-step-n">' + (i < stepIndex ? A.icon("check", 14) : i + 1) + "</span><span>" + A.esc(s) + "</span>", onclick: function () { if (i < stepIndex || validateAll().length === 0) { stepIndex = i; renderStep(); } } }));
          if (i < steps.length - 1) bar.appendChild(A.el("span", { class: "ax-step-line" }));
        });
      }
      foot.innerHTML = "";
      if (steps && stepIndex > 0) foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", text: "السابق", onclick: function () { stepIndex--; renderStep(); } }));
      var last = !steps || stepIndex === steps.length - 1;
      if (!last) foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary", html: A.icon("check") + " " + A.esc("التالي"), onclick: function () { if (validateAll().length === 0) { stepIndex++; renderStep(); } else A.toast("راجع الحقول المعلّمة", "warn"); } }));
      else foot.appendChild(A.el("button", { type: "submit", class: "ax-btn ax-btn-primary", html: A.icon("check") + " " + A.esc(spec.submit || "حفظ") }));
      if (spec.extraActions) spec.extraActions.forEach(function (a) {
        foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", text: a.label, onclick: function () { a.onClick(values(), setValues); } }));
      });
      if (store && spec.autosave !== false) foot.appendChild(A.el("span", { class: "ax-autosave", text: "حفظ تلقائي" }));
    }
    renderStep();
    A.on(wrap, "submit", function (e) {
      e.preventDefault();
      var bad = validateAll();
      if (bad.length) { A.toast("عندك " + bad.length + " حقل غير صحيح", "warn"); var first = inputs[bad[0].field]; if (first && first.focus) first.focus(); return; }
      if (store) store.set(values(), { kind: "form" });
      if (spec.onSubmit) A.guard("form:submit", function () { spec.onSubmit(values(), { reset: reset, setValues: setValues }); });
      else A.toast("تم الحفظ", "ok");
    });
    if (store) {
      var start = values();
      var saved = store.get();
      if (saved) { try { setValues(Object.assign({}, start, saved)); } catch (e) { /* keep defaults */ } }
      subs2.push(store.sub(function () { /* external updates are applied by the owner via setValues */ }));
    }
    A.on(wrap, "input", A.debounce(function () { if (store && spec.autosave !== false) store.set(values(), { kind: "autosave" }); }, 900));
    function reset() { wrap.reset(); fields.forEach(function (f) { if (f.value != null && inputs[f.name]) inputs[f.name].value = f.value; }); A.qa(".ax-field", wrap).forEach(function (b) { b.classList.remove("has-err"); }); stepIndex = 0; renderStep(); }
    return { el: wrap, values: values, setValues: setValues, validate: validateAll, reset: reset, fields: inputs, step: function () { return stepIndex; } };
  };

  /* render a form host from a JSON spec held in the DOM (used by generated pages) */
  A.register({
    id: "forms",
    title: "محرّك النماذج",
    mount: function (host) {
      var spec = null;
      try { spec = JSON.parse(host.getAttribute("data-form") || "{}"); } catch (e) { spec = {}; }
      var f = A.form(spec);
      host.appendChild(f.el);
    }
  });
})();
