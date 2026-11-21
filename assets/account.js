// Tabi — вход на сайте tabimobile.com (18.11.2026, слово Андрея: полноценный вход на всём сайте; справа сверху видно,
// кто вошёл; вход сохраняется после закрытия браузера). Одна учётная запись Tabi — та же, что в приложении: Google или
// код на почту. Ключ входа хранится в этом браузере (localStorage «tabiAcc») до «Выйти»; прежний вход страницы
// компьютера жил только во вкладке (sessionStorage «tabiPc») и переносится сюда при первом открытии.
//
// Шапка каждой страницы: элемент с атрибутом data-tabi-acc (ссылка «Войти» на страницу учётной записи) — вошедшему он
// показывает ник и знак с первой буквой; у подписчика Tabi Plus знак — золотой с бликом. Сведения учётной записи
// (site_me: ник, подписка, телефоны, число стран, городов и особых мест) — один запрос на открытие страницы, копия в
// этом браузере не дольше десяти минут.
//
// Страницы зовут window.TabiAcc: get, keep, fresh, exchange, google, captcha, otp, verify, out, me, uid, on.
(function () {
  "use strict";
  var SB = "https://ogrdnhwfgasbgcespsou.supabase.co",
    KEY = "sb_publishable_lrMZwDEvMLZLgofMLje33Q_E8KB0Tq5",
    CAPTCHA = "0x4AAAAAAFWBXZyDQ9TZ6MkF",
    K = "tabiAcc", KM = "tabiAccMe", KV = "tabiAccVer";
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set = function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  function load() {
    try { var s = JSON.parse(get(K) || "null"); if (s && s.rt) return s; } catch (e) {}
    try {
      var o = JSON.parse(sessionStorage.getItem("tabiPc") || "null");
      if (o && o.rt) { set(K, JSON.stringify(o)); sessionStorage.removeItem("tabiPc"); return o; }
    } catch (e) {}
    return null;
  }
  var S = load(), subs = [], meP = null;
  var emit = function () { subs.forEach(function (f) { try { f(S); } catch (e) {} }); };
  function keep(s) {
    var was = uid();
    S = s && s.rt ? s : null;
    set(K, S ? JSON.stringify(S) : null);
    (!S || uid() !== was) && (set(KM, null), (meP = null));
    emit();
  }
  // Вход или выход в другой вкладке этого сайта — и здесь.
  window.addEventListener("storage", function (e) { if (e.key === K) { S = load(); meP = null; emit(); } });
  function uid() {
    try { return S ? JSON.parse(atob(S.at.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub || null : null; } catch (e) { return null; }
  }
  function auth(path, body) {
    return fetch(SB + "/auth/v1/" + path, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  function fromToken(j, mail) {
    return j && j.access_token ? { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, mail: (j.user && j.user.email) || mail || (S && S.mail) || "" } : null;
  }
  // Свежий ключ входа: за две минуты до срока — продление. Отказ сервера (ключ отозван) — выход; сбой сети — прежний ключ.
  var freshP = null;
  function fresh() {
    if (!S) return Promise.resolve(null);
    if (S.exp - Date.now() > 120000) return Promise.resolve(S);
    if (freshP) return freshP;
    var rt = S.rt;
    freshP = auth("token?grant_type=refresh_token", { refresh_token: rt }).then(function (r) {
      freshP = null;
      if (r.ok) { var s = fromToken(r.j); keep(s); return s; }
      if (r.status >= 400 && r.status < 500 && S && S.rt === rt) keep(null);
      return S && S.exp > Date.now() ? S : null;
    }).catch(function () { freshP = null; return S && S.exp > Date.now() ? S : null; });
    return freshP;
  }
  var b64u = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  // Вход через Google (PKCE): окном, страница остаётся на месте; окно не открылось — переходом (before — сохранить
  // состояние страницы перед уходом). Код из окна приходит странице сообщением, его обменивает exchange.
  function google(back, before) {
    var v = b64u(crypto.getRandomValues(new Uint8Array(32)).buffer);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(function (d) {
      set(KV, v);
      var sep = back.indexOf("?") < 0 ? "?" : "&";
      var url = function (w) { return SB + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(back + (w ? sep + "w=1" : "")) + "&code_challenge=" + b64u(d) + "&code_challenge_method=s256"; };
      var win = null;
      try { win = window.open(url(true), "tabiAuth", "width=520,height=700"); } catch (e) {}
      if (!win) return Promise.resolve(before ? before() : null).then(function () { location.href = url(false); });
    });
  }
  function exchange(code) {
    var ver = get(KV);
    return auth("token?grant_type=pkce", { auth_code: code, code_verifier: ver }).then(function (r) {
      var s = r.ok && fromToken(r.j);
      s && (keep(s), set(KV, null));
      return s || null;
    }).catch(function () { return null; });
  }
  // Окно входа Google вернулось с кодом: код — открывшей странице, окно закрывается.
  (function () {
    var q = new URLSearchParams(location.search), code = q.get("code");
    if (code && q.get("w") === "1" && window.opener) {
      try { window.opener.postMessage({ tabiCode: code }, location.origin); } catch (e) {}
      setTimeout(function () { window.close(); }, 50);
    }
  })();
  // Капча Cloudflare Turnstile для письма с кодом: скрипт грузится только по нажатию.
  function captcha() {
    return new Promise(function (ok, bad) {
      var go = function () {
        var box = document.createElement("div");
        box.style.cssText = "position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:40";
        document.body.appendChild(box);
        window.turnstile.render(box, {
          sitekey: CAPTCHA, appearance: "interaction-only",
          callback: function (tk) { ok(tk); setTimeout(function () { box.remove(); }, 0); },
          "error-callback": function () { box.remove(); bad(); }
        });
      };
      if (window.turnstile) return go();
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.onload = go; s.onerror = bad;
      document.head.appendChild(s);
    });
  }
  // Код на почту: и вход, и новая учётная запись — одно действие, как в приложении.
  // kind — вид письма (21.11.2026): «sitedelete» — «Код для удаления учётной записи» без кнопки приложения, только для
  // существующей учётной записи.
  function otp(mail, lang, kind) {
    return captcha().then(function (tk) {
      return kind
        ? auth("otp?redirect_to=" + encodeURIComponent("https://tabimobile.com/auth?otp=" + kind), { email: mail, create_user: false, gotrue_meta_security: { captcha_token: tk } })
        : auth("otp", { email: mail, create_user: true, data: { lang: lang || "en" }, gotrue_meta_security: { captcha_token: tk } });
    }).then(function (r) { return !!r.ok; });
  }
  function verify(mail, code) {
    return auth("verify", { type: "email", email: mail, token: code }).then(function (r) {
      var s = r.ok && fromToken(r.j, mail);
      s && keep(s);
      return s || null;
    });
  }
  // Выход: ключ отзывается на сервере, в этом браузере ничего не остаётся.
  function out() {
    var s = S;
    keep(null);
    s && fetch(SB + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.at } }).catch(function () {});
  }
  // Сведения учётной записи (site_me): один запрос на открытие страницы, копия — десять минут.
  function me(force) {
    if (!S) return Promise.resolve(null);
    var u = uid();
    if (!force) {
      try { var c = JSON.parse(get(KM) || "null"); if (c && c.u === u && Date.now() - c.t < 600000) return Promise.resolve(c.v); } catch (e) {}
      if (meP) return meP;
    }
    meP = fresh().then(function (s) {
      if (!s) return null;
      return fetch(SB + "/rest/v1/rpc/site_me", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.at, "Content-Type": "application/json" }, body: "{}" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (v) { v && set(KM, JSON.stringify({ u: u, t: Date.now(), v: v })); return v; });
    }).catch(function () { return null; });
    return meP;
  }
  // Знак учётной записи в шапке.
  var css = ".tacc{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;background:var(--panel,#fff);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.12));color:var(--ink,#1b1715);text-decoration:none;font-weight:700;font-size:14px;max-width:220px;white-space:nowrap}" +
    ".tacc.in{padding:9px 16px;background:var(--accent,#b3321f);color:#fff;box-shadow:none}" +
    ".tacc .av{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft,#f3dcd6);color:var(--accent,#b3321f);font-size:14px;font-weight:800;position:relative;overflow:hidden}" +
    ".tacc .nm{overflow:hidden;text-overflow:ellipsis}.tacc .pi{display:none;flex:none;width:19px;height:19px}" +
    ".tacc.plus .av{background:linear-gradient(135deg,#f6d36b,#d79b20 55%,#f8e3a0);color:#5a3c00;box-shadow:0 0 0 2px #e9b949,0 0 12px rgba(233,185,73,.55)}" +
    ".tacc.plus .av::after{content:'';position:absolute;inset:-40%;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.75) 50%,transparent 60%);animation:taccShine 3.2s ease-in-out infinite}" +
    "@keyframes taccShine{0%,55%{transform:translateX(-60%)}100%{transform:translateX(60%)}}" +
    "@media (prefers-reduced-motion:reduce){.tacc.plus .av::after{animation:none;opacity:0}}";
  var repaintFn = null;
  function chips() {
    var els = document.querySelectorAll("[data-tabi-acc]");
    if (!els.length) return;
    if (!document.getElementById("taccCss")) { var st = document.createElement("style"); st.id = "taccCss"; st.textContent = css; document.head.appendChild(st); }
    var paint = function (v) {
      [].forEach.call(els, function (el) {
        var lang = el.getAttribute("data-lang") || "en";
        el.href = "/account/?lang=" + lang;
        el.className = "tacc" + (S ? "" : " in") + (S && v && v.plus ? " plus" : "");
        el.textContent = "";
        // «Войти» — значок человека и подпись; на самых узких экранах подпись скрыта (site.css), название — у ссылки.
        if (!S) {
          var lbl = el.getAttribute("data-in") || "Sign in";
          el.innerHTML = '<svg class="pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span class="nm"></span>';
          el.lastChild.textContent = lbl; el.title = lbl; el.setAttribute("aria-label", lbl);
          return;
        }
        el.removeAttribute("aria-label");
        var name = (v && v.nick) || (S.mail || "").split("@")[0] || "Tabi";
        var av = document.createElement("span"); av.className = "av"; av.textContent = name.charAt(0).toUpperCase();
        var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = name;
        el.appendChild(av); el.appendChild(nm);
        el.title = S.mail || name;
      });
    };
    var run = function () { paint(null); fitHead(); S && me().then(function (v) { paint(v); fitHead(); }); };
    run();
    subs.push(run);
    repaintFn = run;
  }
  // Шапка не шире своей полосы (21.11.2026, план Андрея: на узких экранах и на ширине чуть больше 1100 точек по-немецки и
  // по-французски шапка выходила за край): не помещается — вкладки уходят в «Меню»; и так тесно — язык и знак учётной
  // записи одними значками.
  function fitHead() {
    var h = document.querySelector("header.top"), w = h && h.querySelector(".wrap");
    if (!w) return;
    // Не помещается — правый край содержимого шапки заходит за поле полосы (полоса прокрутки окна тоже отнимает ширину).
    var over = function () {
      var edge = w.getBoundingClientRect().right - parseFloat(getComputedStyle(w).paddingRight) + 1, m = 0;
      // Все видимые части шапки, не только её прямые потомки: вкладка или кнопка может выйти и за край своего блока.
      var all = w.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) { var r = all[i].getBoundingClientRect(); r.width && r.right > m && (m = r.right); }
      return m > edge || w.scrollWidth > w.clientWidth + 1;
    };
    h.classList.remove("tight", "tighter");
    over() && h.classList.add("tight");
    over() && h.classList.add("tighter");
  }
  var fitQ = 0;
  window.addEventListener("resize", function () { fitLater(); });
  var fitLater = function () { fitQ || (fitQ = requestAnimationFrame(function () { fitQ = 0; fitHead(); })); };
  document.fonts && document.fonts.ready && document.fonts.ready.then(fitHead);
  // Шрифт пришёл позже, страница дописала вкладки или ник — шапка меряется снова (размеры частей шапки изменились).
  var fitWatch = function () {
    var w = document.querySelector("header.top .wrap");
    if (!w || !window.ResizeObserver) return;
    var ro = new ResizeObserver(fitLater);
    for (var i = 0; i < w.children.length; i++) ro.observe(w.children[i]);
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fitWatch) : fitWatch();
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", chips) : chips();
  window.TabiAcc = {
    get: function () { return S; }, keep: keep, fresh: fresh, exchange: exchange, google: google, captcha: captcha,
    otp: otp, verify: verify, out: out, me: me, uid: uid, on: function (f) { subs.push(f); },
    repaint: function () { repaintFn && repaintFn(); }
  };
})();
