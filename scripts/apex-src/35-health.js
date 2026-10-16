/*@meta {"id":"health","title":"الصحة واللياقة","domain":"health","tags":["health","patients","bmi","nutrition","tracker"],"order":55,"needs":["kernel"]}*/
/* Patient/clinic table + personal health tracker: BMI, water, calories, workouts, printable plan. */
(function () {
  var A = window.APEX;
  function bmiInfo(b) {
    if (b < 18.5) return { ar: "نقص وزن", tone: "warn" };
    if (b < 25) return { ar: "وزن مثالي", tone: "ok" };
    if (b < 30) return { ar: "زيادة وزن", tone: "warn" };
    return { ar: "سمنة", tone: "err" };
  }
  A.register({
    id: "health",
    title: "الصحة",
    mount: function (host, ctx) {
      var patients = (ctx.data.patients || []).slice();
      var services = (ctx.data.services || []).slice();
      var store = A.store("health", { water: 0, meals: [], workouts: [], vitals: [] });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var tab = patients.length ? "patients" : "me";
      function render() {
        ui.innerHTML = "";
        var seg = A.el("div", { class: "ax-seg" });
        [["patients", "المرضى"], ["vitals", "العلامات الحيوية"], ["me", "صحتي اليومية"]].forEach(function (v) {
          seg.appendChild(A.el("button", { type: "button", class: "ax-seg-btn" + (tab === v[0] ? " is-on" : ""), text: v[1], onclick: function () { tab = v[0]; render(); } }));
        });
        ui.appendChild(seg);
        if (tab === "patients") return patientsView();
        if (tab === "vitals") return vitalsView();
        return meView();
      }
      function patientsView() {
        var rowsK = [
          ["مرضى مسجّلون", String(patients.length), "users", "info"],
          ["زيارات هذا الشهر", String(patients.filter(function (p) { return String(p.lastVisit).slice(0, 7) === new Date().toISOString().slice(0, 7); }).length), "calendar", "ok"],
          ["خدمات متوفرة", String(services.length), "shield", "info"],
          ["متوسط العمر", String(Math.round(patients.reduce(function (s, p) { return s + p.age; }, 0) / Math.max(1, patients.length))) + " سنة", "clock", "ok"]
        ];
        var kpis = A.el("div", { class: "ax-kpis", html: rowsK.map(function (r) { return '<div class="ax-kpi ax-kpi-' + r[3] + ' ax-in"><div class="ax-kpi-top">' + A.icon(r[2], 16) + "<span>" + r[0] + "</span></div><strong class='ax-kpi-v'>" + A.esc(r[1]) + "</strong></div>"; }).join("") });
        ui.appendChild(kpis);
        var two = A.el("div", { class: "ax-two" });
        var bySpec = {};
        patients.forEach(function (p) { bySpec[p.specialty] = (bySpec[p.specialty] || 0) + 1; });
        two.appendChild(A.chart({ kind: "donut", title: "المرضى حسب التخصص", centerLabel: "مريض", data: Object.keys(bySpec).map(function (k) { return { label: k, value: bySpec[k] }; }) }));
        two.appendChild(A.chart({ kind: "bar", title: "الفئات العمرية", unit: "مريض", data: [["0-14", 0], ["15-29", 1], ["30-44", 2], ["45-59", 3], ["60+", 4]].map(function (b) {
          return { label: b[0], value: patients.filter(function (p) { return p.age >= b[1] * 15 && p.age < (b[1] + 1) * 15 + (b[1] === 0 ? 15 : 0); }).length };
        }) }));
        ui.appendChild(two);
        A.grid(ui, {
          name: "patients", rows: patients, pageSize: 10,
          columns: [
            { key: "name", label: "المريض" }, { key: "age", label: "العمر", numeric: true },
            { key: "sex", label: "الجنس" }, { key: "condition", label: "الحالة المزمنة" },
            { key: "bmi", label: "BMI", numeric: true, render: function (v) { var i = bmiInfo(v); return "<b>" + v + "</b> <span class='ax-pill ax-pill-" + (i.tone === "ok" ? "ok" : i.tone === "warn" ? "warn" : "err") + "'>" + i.ar + "</span>"; } },
            { key: "specialty", label: "التخصص" },
            { key: "lastVisit", label: "آخر زيارة" }, { key: "nextVisit", label: "الموعد القادم" },
            { key: "phone", label: "الهاتف" }
          ],
          filterCols: ["specialty", "condition"],
          onEditRow: function (row, rerender) {
            var f = A.form({ fields: [{ name: "name", label: "الاسم", value: row.name }, { name: "condition", label: "الحالة", value: row.condition }, { name: "notes", label: "ملاحظات", type: "textarea", value: row.notes }], submit: "حدّث", onSubmit: function (v) { Object.assign(row, v); m.close(); rerender(); A.toast("حُدّث الملف", "ok"); } });
            var m = A.modal({ title: "ملف المريض", html: f.el, actions: [{ label: "إغلاق", kind: "ghost" }] });
          }
        });
      }
      function vitalsView() {
        var vitals = store.get().vitals;
        var card = A.el("div", { class: "ax-card" });
        card.appendChild(A.el("h3", { text: "سجّل قياسًا جديدًا" }));
        var f = A.form({
          fields: [
            { name: "systolic", label: "الضغط الانقباضي", type: "number", value: 120, validate: "min:60|max:250" },
            { name: "diastolic", label: "الضغط الانبساطي", type: "number", value: 80 },
            { name: "pulse", label: "النبض", type: "number", value: 72 },
            { name: "sugar", label: "السكر (g/L)", type: "number", value: 1.0, step: "0.01" },
            { name: "temp", label: "الحرارة", type: "number", value: 36.8, step: "0.1" }
          ],
          submit: "أضف للقياسات",
          onSubmit: function (v) {
            var all = [Object.assign({ at: new Date().toISOString(), id: A.uid("v") }, v)].concat(store.get().vitals);
            store.set({ vitals: all }, { kind: "vital" });
            render(); A.toast("سُجّل القياس", "ok");
          }
        });
        card.appendChild(f.el);
        ui.appendChild(card);
        if (vitals.length) {
          ui.appendChild(A.chart({ kind: "line", title: "تطور الضغط", unit: "mmHg", data: vitals.slice().reverse().map(function (v) { return { label: A.fmt.date(v.at), value: Number(v.systolic) }; }) }));
        } else {
          ui.appendChild(A.el("p", { class: "ax-empty", text: "بلا قياسات بعد — أضف أول قياس فوق" }));
        }
        A.grid(ui, { name: "vitals", rows: vitals, pageSize: 8, columns: [
          { key: "at", label: "التاريخ", render: function (v) { return A.fmt.date(v, "long") + " " + A.fmt.time(v); } },
          { key: "systolic", label: "انقباضي", numeric: true }, { key: "diastolic", label: "انبساطي", numeric: true },
          { key: "pulse", label: "النبض", numeric: true }, { key: "sugar", label: "السكر", numeric: true }, { key: "temp", label: "الحرارة", numeric: true }
        ] });
      }
      function meView() {
        var s = store.get();
        var water = s.water, goal = 8;
        var card = A.el("div", { class: "ax-card ax-center" });
        card.appendChild(A.el("h3", { text: "شرب الماء اليوم" }));
        card.appendChild(A.el("div", { style: { fontSize: "46px" }, text: "💧" }));
        card.appendChild(A.el("strong", { class: "ax-grad-text", style: { fontSize: "30px" }, text: water + " / " + goal + " أكواب" }));
        card.appendChild(A.el("div", { class: "ax-progressbar", style: { maxWidth: "320px", margin: "12px auto" }, html: "<i style='width:" + Math.min(100, (water / goal) * 100) + "%'></i>" }));
        card.appendChild(A.el("div", { class: "ax-grid-bar", style: { justifyContent: "center" } }, [
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary", html: A.icon("plus") + " زيد كأس", onclick: function () { store.set({ water: store.get().water + 1 }); render(); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", text: "صفّر", onclick: function () { store.set({ water: 0 }); render(); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", html: A.icon("check") + " أكملت الهدف", onclick: function () { A.motion.confetti(60); A.toast("مبروك! هدف الماء اليومي ✅", "ok"); } })
        ]));
        ui.appendChild(card);
        var two = A.el("div", { class: "ax-two" });
        var meals = A.el("div", { class: "ax-card" });
        meals.appendChild(A.el("h3", { text: "الوجبات والسعرات" }));
        var mealsList = s.meals;
        mealsList.forEach(function (m) { meals.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "6px" }, html: "<strong>" + A.esc(m.name) + "</strong><div class='ax-dim'>" + m.kcal + " كالوري · " + A.fmt.time(m.at) + "</div>" })); });
        var addMeal = A.el("div", { class: "ax-grid-bar" });
        var mName = A.el("input", { class: "ax-input", placeholder: "وجبة (مثال: كسكس بالخضر)", "aria-label": "وجبة" });
        var mKcal = A.el("input", { class: "ax-input", type: "number", placeholder: "كالوري", style: { maxWidth: "110px" }, "aria-label": "كالوري" });
        addMeal.appendChild(mName); addMeal.appendChild(mKcal);
        addMeal.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", text: "أضف", onclick: function () {
          if (!mName.value.trim()) return;
          store.set({ meals: [{ id: A.uid("m"), name: mName.value.trim(), kcal: Number(mKcal.value) || 350, at: new Date().toISOString() }].concat(store.get().meals).slice(0, 30) }, { kind: "meal" });
          render();
        } }));
        meals.appendChild(addMeal);
        two.appendChild(meals);
        var total = mealsList.reduce(function (a, m) { return a + Number(m.kcal); }, 0);
        two.appendChild(A.chart({ kind: "gauge", title: "السعرات مقابل الهدف (2000)", value: total, max: 2000, centerLabel: "كالوري", color: A.palette()[3], onChange: function () { /* live */ } }));
        ui.appendChild(two);
        var plan = A.el("div", { class: "ax-card" });
        plan.appendChild(A.el("h3", { text: "برنامج يومي مقترح" }));
        plan.appendChild(A.el("div", { class: "ax-timeline", html: [["07:00", "فطور متوازن: حليب، خبز كامل، تمر"], ["10:00", "كأس ماء + حصة فاكهة"], ["12:30", "غداء: بروتين + خضر + نشويات معتدلة"], ["16:00", "مشي 30 دقيقة"], ["19:00", "عشاء خفيف قبل 3 ساعات من النوم"], ["22:30", "نوم 7-8 ساعات"]].map(function (r) { return '<div class="ax-timeline-item"><strong>' + r[0] + " — " + r[1] + "</strong></div>"; }).join("") }));
        plan.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " اطبع البرنامج", onclick: function () {
          A.printDoc('<div class="ax-doc" dir="rtl"><h2>برنامج يومي صحي</h2><ul>' + ["شرب 8 أكواب ماء", "مشي 30 دقيقة يوميًا", "3 وجبات + حصتين فاكهة", "نوم منتظم 7-8 ساعات", "تجنّب السكر المضاف", "قياس الضغط أسبوعيًا"].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul></div>", "برنامج صحي");
        } }));
        ui.appendChild(plan);
      }
      render();
      A.bus.on("route", function () { A.guard("health:route", render); });
    }
  });
})();
