// Tabi — вход на сайте tabimobile.com (18.11.2026, слово Андрея: полноценный вход на всём сайте; справа сверху видно,
// кто вошёл; вход сохраняется после закрытия браузера). Одна учётная запись Tabi — та же, что в приложении: Google или
// код на почту. Ключ входа хранится в этом браузере (localStorage «tabiAcc») до «Выйти»; прежний вход страницы
// компьютера жил только во вкладке (sessionStorage «tabiPc») и переносится сюда при первом открытии. С 22.11.2026 (слово
// Андрея) — и Facebook, как в приложении.
//
// Шапка каждой страницы: элемент с атрибутом data-tabi-acc (ссылка «Войти» на страницу учётной записи) — вошедшему он
// показывает ник и знак с первой буквой; у подписчика Tabi Plus знак — золотой с бликом. Сведения учётной записи
// (site_me: ник, подписка, телефоны, число стран, городов и особых мест) — один запрос на открытие страницы, копия в
// этом браузере не дольше десяти минут.
//
// Страницы зовут window.TabiAcc: get, keep, fresh, exchange, google, gis, fb, captcha, otp, verify, out, me, uid, on.
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
    // Google — синей кнопкой в обеих темах (23.11.2026, Андрей: тёмная кнопка Google терялась рядом с синей Facebook, а
    // Google для Tabi предпочтительнее); Facebook — спокойной кнопкой под ней.
    var th = "filled_blue", lang = (document.documentElement.lang || "en").slice(0, 2),
      bw = Math.max(200, Math.min(400, w)), key = bw + th + lang;
    if (el._gis === key) return;
    el._gis = key; el.innerHTML = "";
    GA().renderButton(el, { type: "standard", theme: th, size: "large", text: "continue_with", shape: "pill", logo_alignment: "center", width: bw, locale: GLOC[lang] || lang });
  }
  // Своя кнопка, когда кнопка Google не загрузилась (блокировщик): тот же вид, что у кнопки Google filled_blue, — синяя, знак
  // «G» в белом круге, того же размера, что кнопка Facebook (23.11.2026, Андрей: без значка Google кнопку не узнать).
  var GI = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17z"/><path fill="#FBBC05" d="M10.5 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.2 1.5-5.1 2.4-8.7 2.4-6.3 0-11.6-4.2-13.5-10l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';
  function gisFallback(el, o) {
    el.innerHTML = "";
    var b = document.createElement("button");
    b.type = "button"; b.className = "tgfb"; b.innerHTML = "<i>" + GI + "</i><span></span>"; b.lastChild.textContent = o.label();
    if (!document.getElementById("tgfbCss")) {
      var st = document.createElement("style"); st.id = "tgfbCss";
      st.textContent = ".tgfb{appearance:none;border:0;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:400px;min-width:200px;height:40px;padding:0 16px 0 4px;border-radius:999px;background:#1a73e8;color:#fff;font:500 14px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;cursor:pointer;box-sizing:border-box;position:relative}.tgfb:hover{background:#1b66c9}.tgfb i{position:absolute;left:4px;top:4px;width:32px;height:32px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center}.tgfb svg{width:18px;height:18px}.tgfb span{padding-left:28px}";
      document.head.appendChild(st);
    }
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
    gisEls.forEach(function (it) { it.el._fb ? (it.el._fb.lastChild.textContent = it.o.label()) : it.on && gisDraw(it.el); });
    fbEls.forEach(fbLabel);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "lang"] });
  // Вход переходом через Supabase в этой же вкладке (PKCE): запасной вход Google и вход Facebook; код возврата обменивает
  // exchange, отказ сервиса приходит в адресе возврата полем error (страница показывает строку об ошибке).
  function oauth(provider, back, before) {
    var v = b64u(crypto.getRandomValues(new Uint8Array(32)).buffer);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(function (d) {
      set(KV, v);
      var url = SB + "/auth/v1/authorize?provider=" + provider + "&redirect_to=" + encodeURIComponent(back) + "&code_challenge=" + b64u(d) + "&code_challenge_method=s256";
      return Promise.resolve(before ? before() : null).then(function () { location.href = url; });
    });
  }
  function google(back, before) { return oauth("google", back, before); }
  // Кнопка Facebook (22.11.2026, слово Андрея) — под кнопкой Google, той же высоты и формы; с 23.11.2026 спокойная (цвет
  // панели, рамка, синий знак «f» Facebook), чтобы главной оставалась Google; подпись — на языке страницы. o — то же, что у
  // gis: back, before, start.
  var FBL = { en: "Continue with Facebook", ru: "Вход с аккаунтом Facebook", cs: "Pokračovat s účtem Facebook", de: "Weiter mit Facebook",
    fr: "Continuer avec Facebook", es: "Continuar con Facebook", it: "Continua con Facebook", pt: "Continuar com o Facebook",
    ja: "Facebookで続行", ko: "Facebook으로 계속하기" };
  var FBI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>';
  var fbEls = [];
  function fbLabel(b) { b.lastChild.textContent = FBL[(document.documentElement.lang || "en").slice(0, 2)] || FBL.en; }
  function fb(el, o) {
    if (!document.getElementById("tfbCss")) {
      var st = document.createElement("style"); st.id = "tfbCss";
      st.textContent = ".tfb{appearance:none;border:1px solid var(--line,#dadce0);display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:400px;min-width:200px;height:40px;min-height:40px;padding:0 16px;border-radius:999px;background:var(--panel,#fff);color:var(--ink,#1f1f1f);font:500 14px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;cursor:pointer;box-sizing:border-box}" +
        ".tfb:hover{border-color:#1877F2}.tfb:focus-visible{outline:2px solid #1877F2;outline-offset:2px}.tfb svg{width:20px;height:20px;flex:none}";
      document.head.appendChild(st);
    }
    el.innerHTML = "";
    var b = document.createElement("button");
    b.type = "button"; b.className = "tfb"; b.innerHTML = FBI + "<span></span>";
    fbLabel(b);
    b.onclick = function () { o.start && o.start(); oauth("facebook", o.back(), o.before); };
    el.appendChild(b);
    fbEls.push(b);
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
    "@media (prefers-reduced-motion:reduce){.tacc.plus .av::after{animation:none;opacity:0}}" +
    ".thq{flex:none;display:inline-flex;align-items:center;height:40px;padding:0 14px;border-radius:999px;background:var(--panel,#fff);box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.12));color:var(--ink,#1b1715);text-decoration:none;font-weight:700;font-size:14px;white-space:nowrap}" +
    ".thq:hover,.thq[aria-current]{color:var(--accent,#b3321f)}@media (max-width:480px){.thq{height:38px;padding:0 12px}}";
  // Ссылка «Штаб» перед знаком учётной записи (27.11.2026): только владельцу — по признаку owner сведений учётной записи
  // (site_me); остальные её никогда не видят. Сами данные штаба сервер отдаёт только владельцу, ссылка — лишь путь к ним.
  // on: true — показать, false — убрать, null — сведения ещё не пришли, ссылка остаётся как была у той же учётной записи.
  function hqLink(el, on) {
    var a = el.previousElementSibling, has = !!(a && a.classList && a.classList.contains("thq"));
    if (has && (on === false || a._u !== uid())) { a.remove(); has = false; }
    if (!on || has) return;
    a = document.createElement("a");
    a.className = "thq"; a.href = "/hq/"; a.textContent = "Штаб"; a._u = uid();
    location.pathname.indexOf("/hq/") === 0 && a.setAttribute("aria-current", "page");
    el.parentNode.insertBefore(a, el);
  }
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
        el.parentNode && hqLink(el, S ? (v ? v.owner === true : null) : false);
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
    get: function () { return S; }, keep: keep, fresh: fresh, exchange: exchange, google: google, gis: gis, fb: fb, captcha: captcha,
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
