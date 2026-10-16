/*@meta {"id":"router","title":"الموجّه","domain":"core","tags":["router","spa","navigation"],"order":2}*/
/* Hash router: real SPA navigation with guards, transitions, scroll restore and lazy views. */
(function () {
  var A = window.APEX;
  var routes = [], current = null, history = [], listeners = [];
  var api = {
    routes: routes,
    add: function (path, view) { routes.push({ path: path, view: view, title: view.title || path }); return api; },
    go: function (path, opts) {
      opts = opts || {};
      var next = String(path || "home").replace(/^#/, "");
      if (location.hash.replace("#", "") === next && !opts.force) return api;
      if (opts.replace) location.replace("#" + next); else location.hash = next;
      return api;
    },
    back: function () { var prev = history.pop(); api.go(prev || "home"); },
    current: function () { return current; },
    on: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    match: function (path) {
      var clean = String(path || "home").split("?")[0];
      var exact = routes.filter(function (r) { return r.path === clean; })[0];
      if (exact) return exact;
      var dyn = routes.filter(function (r) { return r.path.indexOf(":") >= 0; }).map(function (r) {
        var parts = r.path.split("/"), got = clean.split("/");
        if (parts.length !== got.length) return null;
        var params = {};
        for (var i = 0; i < parts.length; i++) {
          if (parts[i][0] === ":") params[parts[i].slice(1)] = decodeURIComponent(got[i]);
          else if (parts[i] !== got[i]) return null;
        }
        return { path: r.path, view: r.view, params: params, title: r.view.title || r.path };
      }).filter(Boolean)[0];
      return dyn || routes.filter(function (r) { return r.path === "*"; })[0];
    },
    render: function (path) {
      var hit = api.match(path);
      if (!hit) return;
      var host = A.q("[data-view]") || A.q("#view");
      if (!host) return;
      if (current && current.path !== hit.path) history.push(current.path);
      current = { path: hit.path === "*" ? path : hit.path, params: hit.params || {}, view: hit.view };
      host.classList.add("ax-view-out");
      var paint = function () {
        var out = A.guard("view:" + hit.path, function () { return hit.view.render(hit.params || {}, host); });
        if (out instanceof Node) { host.innerHTML = ""; host.appendChild(out); }
        else if (typeof out === "string") host.innerHTML = out;
        host.classList.remove("ax-view-out");
        host.classList.add("ax-view-in");
        setTimeout(function () { host.classList.remove("ax-view-in"); }, 420);
        var title = A.q("[data-view-title]");
        if (title && hit.view.title) title.textContent = typeof hit.view.title === "function" ? hit.view.title() : hit.view.title;
        A.reveal(host);
        A.qa("[data-apex]", host).forEach(function (h) {
          var mod = A.modules.filter(function (m) { return m.id === h.getAttribute("data-apex"); })[0];
          if (mod && mod.mount && !h.getAttribute("data-mounted")) {
            A.guard("mount:" + mod.id, function () {
              mod.mount(h, { store: window.APEX_STORE, data: window.APEX_DATA || {}, plan: window.APEX_PLAN || {}, t: A.t, fmt: A.fmt, rng: A.rng, toast: A.toast, modal: A.modal, confirm: A.confirm, bus: A.bus, el: A.el, icon: A.icon, q: A.q, qa: A.qa, on: A.on });
              h.setAttribute("data-mounted", "1");
            });
          }
        });
        listeners.slice().forEach(function (fn) { A.guard("router:listener", function () { fn(current); }); });
        A.bus.emit("route", current.path);
      };
      setTimeout(paint, 130);
    },
    start: function () {
      A.on(window, "hashchange", function () { api.render(location.hash.replace("#", "") || "home"); });
      api.render(location.hash.replace("#", "") || "home");
    },
    /** turns every [data-route] link into a router link */
    bind: function (root) {
      A.qa("[data-route]", root || document).forEach(function (a) {
        A.on(a, "click", function (e) {
          e.preventDefault();
          api.go(a.getAttribute("data-route"));
          var shell = A.q("#ax-drawer"); if (shell) shell.classList.remove("is-open");
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    }
  };
  A.router = api;
  A.register({ id: "router", title: "الموجّه", mount: function (host) { api.bind(host); } });
})();
