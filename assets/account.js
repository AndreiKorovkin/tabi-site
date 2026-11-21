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
// Страницы зовут window.TabiAcc: get, keep, fresh, exchange, google, gis, captcha, otp, verify, out, me, uid, on.
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
  // ===== Вход через Google (21.11.2026, план Андрея) =====
  // Кнопку рисует сам Google (Google Identity Services): подтверждение входа Google выдаёт только своей кнопке. В Chrome
  // выбор учётной записи открывается внутри вкладки (FedCM), в остальных браузерах — окном Google; везде Google называет
  // tabimobile.com, а не адрес сервера. Подтверждение (ID-токен) сайт обменивает в Supabase на вход в ту же учётную запись
  // Tabi, что в приложении. На каждую попытку — одноразовое число: Google вписывает в подтверждение его отпечаток SHA-256,
  // сервер сверяет его с самим числом, поэтому чужое или старое подтверждение не подойдёт. Сценарий Google грузится, только
  // когда кнопка входа появилась на экране. Не загрузился (блокировщик) — на месте кнопки своя, и вход идёт прежним путём
  // через Supabase, переходом в этой же вкладке (before — сохранить состояние страницы перед уходом).
  var GID = "533059625327-7e0mf9mc0u64i8vcmuv1aj76veo1pa8m.apps.googleusercontent.com",
    GLOC = { pt: "pt-BR" }, gisP = null, gisRaw = "", gisDone = null, gisEls = [];
  // Библиотека Google — только как window.google: имя google в этом сценарии занято запасным входом (21.11.2026: из-за
  // этого кнопка Google не появлялась, и страница показывала запасную).
  var GA = function () { return window.google && window.google.accounts && window.google.accounts.id; };
  var hex = function (buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); };
  function gisLoad() {
    return gisP || (gisP = new Promise(function (ok, bad) {
      var sc = document.createElement("script");
      sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
      sc.onload = function () { GA() ? ok() : bad(); };
      sc.onerror = bad;
      setTimeout(bad, 10000);
      document.head.appendChild(sc);
    }).then(gisInit));
  }
  function gisInit() {
    var raw = b64u(crypto.getRandomValues(new Uint8Array(24)).buffer);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(function (d) {
      gisRaw = raw;
      GA().initialize({ client_id: GID, nonce: hex(d), callback: gisCred, use_fedcm_for_button: true, auto_select: false, context: "signin", ux_mode: "popup" });
    });
  }
  function gisCred(r) {
    var raw = gisRaw, done = gisDone;
    // Следующая попытка — со своим числом; кнопки перерисовываются под новое.
    gisInit().then(function () { gisEls.forEach(function (it) { it.el._gis = ""; gisDraw(it.el); }); });
    auth("token?grant_type=id_token", { provider: "google", id_token: r && r.credential, nonce: raw }).then(function (x) {
      var s = x.ok && fromToken(x.j);
      s && keep(s);
      done && done(s || null, s ? null : "eGoogle");
    }).catch(function () { done && done(null, "eNet"); });
  }
  function gisLight() {
    var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(getComputedStyle(document.body).backgroundColor || "");
    return !!m && +m[1] + +m[2] + +m[3] > 384;
  }
  // Кнопка Google в элементе el: по ширине элемента (Google допускает 200–400 точек), тёмная или светлая под тему, на
  // языке страницы; перерисовывается, только если что-то из этого изменилось.
  function gisDraw(el) {
    var w = el.clientWidth;
    if (!w || el._fb || !GA()) return;
    var th = gisLight() ? "outline" : "filled_black", lang = (document.documentElement.lang || "en").slice(0, 2),
      bw = Math.max(200, Math.min(400, w)), key = bw + th + lang;
    if (el._gis === key) return;
    el._gis = key; el.innerHTML = "";
    GA().renderButton(el, { type: "standard", theme: th, size: "large", text: "continue_with", shape: "pill", logo_alignment: "center", width: bw, locale: GLOC[lang] || lang });
  }
  function gisFallback(el, o) {
    el.innerHTML = "";
    var b = document.createElement("button");
    b.type = "button"; b.className = o.cls; b.textContent = o.label();
    b.onclick = function () { o.start && o.start(); google(o.back(), o.before); };
    el.appendChild(b); el._fb = b;
  }
  // Страница отдаёт место под кнопку: o.done(сессия или null, код ошибки) — итог входа; запасная кнопка — o.cls, o.label(),
  // o.back() (адрес возврата), o.before, o.start (что сделать перед уходом).
  function gis(el, o) {
    gisDone = o.done;
    var it = { el: el, o: o, on: false };
    gisEls.push(it);
    var go = function () {
      if (!el.clientWidth) return;
      if (it.on) return void gisDraw(el);
      it.on = true;
      gisLoad().then(function () { gisDraw(el); }, function () { gisFallback(el, o); });
    };
    window.ResizeObserver ? new ResizeObserver(go).observe(el) : go();
  }
  // Тема или язык страницы сменились — кнопки Google заново, подпись запасной — на новом языке.
  new MutationObserver(function () {
    gisEls.forEach(function (it) { it.el._fb ? (it.el._fb.textContent = it.o.label()) : it.on && gisDraw(it.el); });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "lang"] });
  // Запасной вход (PKCE) — переходом к Google через Supabase в этой же вкладке; код возврата обменивает exchange.
  function google(back, before) {
    var v = b64u(crypto.getRandomValues(new Uint8Array(32)).buffer);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(function (d) {
      set(KV, v);
      var url = SB + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(back) + "&code_challenge=" + b64u(d) + "&code_challenge_method=s256";
      return Promise.resolve(before ? before() : null).then(function () { location.href = url; });
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
  // Выход — только из этого браузера (scope=local): без него сервер по умолчанию закрывает вход на всех устройствах
  // учётной записи, и 21.11.2026 выход на сайте выкинул Андрея из приложения на телефоне. В браузере ничего не остаётся.
  function out() {
    var s = S;
    keep(null);
    s && fetch(SB + "/auth/v1/logout?scope=local", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.at } }).catch(function () {});
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
    ".tacc.in{padding:9px 16px;background:var(--accent,#b3321f);color:var(--on-accent,#fff);box-shadow:none}" +
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
    get: function () { return S; }, keep: keep, fresh: fresh, exchange: exchange, google: google, gis: gis, captcha: captcha,
    otp: otp, verify: verify, out: out, me: me, uid: uid, on: function (f) { subs.push(f); },
    repaint: function () { repaintFn && repaintFn(); }
  };
})();

// Окна сайта (21.11.2026, Андрей: окно — общий элемент): dialog.win с крестиком [data-close] закрывается крестиком и
// щелчком мимо окна (по затемнённому фону); окна подтверждения без крестика так не закрываются.
// Закрытие плавное (21.11.2026, Андрей): класс closing, по концу анимации — close(); Esc — так же.
function winShut(d) {
  if (!d || !d.open || d.classList.contains("closing")) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !d.close) return void (d.close ? d.close() : d.removeAttribute("open"));
  d.classList.add("closing");
  var done = function () {
    if (!d.classList.contains("closing")) return;
    d.removeEventListener("animationend", done);
    d.classList.remove("closing");
    d.close();
  };
  d.addEventListener("animationend", done);
  setTimeout(done, 300);
}
window.TabiWin = { close: winShut };
// Пока открыто хоть одно окно — страница за ним стоит (стили html.win-lock в site.css): прокрутка выключена, а место под
// полосой прокрутки сохраняется, только если полоса была, — содержимое не сдвигается ни на точку.
(function () {
  var root = document.documentElement, locked = false;
  function sync() {
    var open = !!document.querySelector("dialog.win[open]");
    if (open === locked) return;
    locked = open;
    if (open) root.classList.toggle("win-sb", window.innerWidth - root.clientWidth > 0);
    root.classList.toggle("win-lock", open);
  }
  new MutationObserver(sync).observe(root, { subtree: true, attributes: true, attributeFilter: ["open"] });
  sync();
})();
document.addEventListener("cancel", function (e) {
  var d = e.target;
  if (d && d.matches && d.matches("dialog.win")) { e.preventDefault(); winShut(d); }
}, true);
document.addEventListener("click", function (e) {
  var d = e.target && e.target.closest ? e.target.closest("dialog.win") : null;
  if (!d || !d.open) return;
  if (e.target.closest("[data-close]")) return void winShut(d);
  if (e.target !== d || !d.querySelector("[data-close]")) return;
  var r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) winShut(d);
});
