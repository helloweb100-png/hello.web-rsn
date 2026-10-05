/* ==========================================================================
   RSN Mantenimiento e Instalación Eléctrica
   Script principal (JavaScript nativo, sin dependencias)

   Índice
   01. Utilidades y configuración
   02. Motor de scroll (inercia suave + bucle único de animación)
   03. Pantalla de carga
   04. Navegación y menú móvil
   05. Titulares por palabra y revelado al hacer scroll
   06. Contadores
   07. Hero: palabra rotatoria, parallax y campo de ondas (canvas)
   08. Banda de servicios (marquee reactivo al scroll)
   09. Texto que se ilumina con el scroll
   10. Tarjetas apiladas de servicios
   11. Galería horizontal fijada
   12. Línea de tiempo del proceso
   13. Efectos de cursor (magnético y foco)
   14. Sectores y preguntas frecuentes
   15. Formulario y enlaces de WhatsApp
   16. Arranque
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     01. UTILIDADES Y CONFIGURACIÓN
     ------------------------------------------------------------------------ */
  var WA_NUMBER = '523331184077'; /* WhatsApp de RSN (formato internacional, sin +) */

  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var mqDesktop = window.matchMedia('(min-width: 1024px)');
  var REDUCE = mqReduce.matches;
  mqReduce.addEventListener && mqReduce.addEventListener('change', function (e) { REDUCE = e.matches; });

  function onMQ(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  /* Marca de "cerca de la pantalla" para no calcular nada fuera de vista */
  var nearIO = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.__near = e.isIntersecting; });
    }, { rootMargin: '60% 0px 60% 0px' })
    : null;
  function watchNear(els) {
    els.forEach(function (el) {
      el.__near = !nearIO;
      if (nearIO) nearIO.observe(el);
    });
  }

  /* ------------------------------------------------------------------------
     02. MOTOR DE SCROLL
     Un solo bucle requestAnimationFrame lee la posición de scroll una vez por
     cuadro y alimenta a todos los efectos (sin listeners de "scroll").
     Incluye scroll con inercia para ruedas de ratón en escritorio.
     ------------------------------------------------------------------------ */
  var Engine = (function () {
    var consumers = [];
    var frameFns = [];
    var y = window.scrollY, lastY = y, vel = 0;
    var target = y, current = y, lastSet = y;
    var maxScroll = 0;
    var smoothOn = false;
    var locks = 0;
    var prev = performance.now();
    var LERP = 0.085;

    function measureMax() {
      maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
    }
    function updateSmoothFlag() {
      smoothOn = mqFine.matches && !REDUCE;
    }
    updateSmoothFlag();
    onMQ(mqFine, updateSmoothFlag);

    window.addEventListener('wheel', function (e) {
      if (!smoothOn || e.ctrlKey || e.defaultPrevented) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      var t = e.target;
      if (t && t.closest && t.closest('textarea, select, [data-no-smooth]')) return;
      e.preventDefault();
      if (locks > 0) return;
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 32;
      else if (e.deltaMode === 2) d *= window.innerHeight;
      measureMax();
      target = clamp(target + d, 0, maxScroll);
    }, { passive: false });

    window.addEventListener('resize', measureMax, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(measureMax).observe(document.body);

    function frame(now) {
      var dt = Math.min(64, now - prev);
      prev = now;
      var sy = window.scrollY;

      if (smoothOn && locks === 0) {
        if (Math.abs(sy - lastSet) > 2.5) {
          /* el scroll cambió por otro medio (teclado, barra, enlace) */
          current = target = sy;
        } else {
          var k = 1 - Math.pow(1 - LERP, dt / 16.667);
          current += (target - current) * k;
          if (Math.abs(target - current) < 0.2) current = target;
          if (current !== sy) window.scrollTo(0, current);
        }
        lastSet = current;
      } else {
        current = target = sy;
        lastSet = sy;
      }

      y = window.scrollY;
      vel = y - lastY;
      var changed = y !== lastY;
      lastY = y;

      var ctx = { y: y, vel: vel, vh: window.innerHeight, t: now, dt: dt, changed: changed };
      var i;
      for (i = 0; i < consumers.length; i++) if (consumers[i].measure) consumers[i].measure(ctx);
      for (i = 0; i < consumers.length; i++) if (consumers[i].apply) consumers[i].apply(ctx);
      for (i = 0; i < frameFns.length; i++) frameFns[i](ctx);

      requestAnimationFrame(frame);
    }

    return {
      start: function () { measureMax(); requestAnimationFrame(frame); },
      add: function (c) { consumers.push(c); },
      onFrame: function (fn) { frameFns.push(fn); },
      lock: function () { locks++; },
      unlock: function () { locks = Math.max(0, locks - 1); target = current = window.scrollY; },
      scrollTo: function (top) {
        measureMax();
        top = clamp(top, 0, maxScroll);
        if (smoothOn) target = top;
        else window.scrollTo({ top: top, behavior: REDUCE ? 'auto' : 'smooth' });
      },
      get y() { return y; },
      get vel() { return vel; }
    };
  })();

  /* Puntero compartido (hero) */
  var pointer = { nx: 0, ny: 0, tx: 0, ty: 0, px: 0, py: 0, inside: false, energy: 0 };

  /* ------------------------------------------------------------------------
     03. PANTALLA DE CARGA
     ------------------------------------------------------------------------ */
  function runLoader(done) {
    var loader = $('#loader');
    if (!loader || REDUCE) {
      if (loader) loader.classList.add('is-gone');
      return done();
    }
    var pctEl = $('[data-loader-pct]', loader);
    var textEl = $('[data-loader-text]', loader);
    var prog = $('.lr--prog', loader);
    var msgs = ['Verificando conexiones', 'Midiendo tensión', 'Cerrando interruptores', 'Sistema energizado'];
    var MIN = 2400;
    var start = performance.now();
    var loaded = document.readyState === 'complete';
    var fontsOk = false;
    var pct = 0, msgIdx = 0, finished = false;

    if (!loaded) window.addEventListener('load', function () { loaded = true; });
    if (document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 2600); })]).then(function () { fontsOk = true; });
    } else fontsOk = true;

    function finish() {
      if (finished) return;
      finished = true;
      loader.classList.add('is-done');
      setTimeout(function () {
        loader.classList.add('is-out');
        done();
        setTimeout(function () { loader.classList.add('is-gone'); }, 1300);
      }, 520);
    }

    function swap(i) {
      if (i === msgIdx) return;
      msgIdx = i;
      textEl.classList.add('is-swap');
      setTimeout(function () { textEl.textContent = msgs[i]; textEl.classList.remove('is-swap'); }, 220);
    }

    function tick(now) {
      var el = now - start;
      var ready = loaded && fontsOk && el > MIN;
      var timeTarget = 100 * (1 - Math.pow(1 - clamp(el / MIN), 3)) * 0.93;
      var tgt = ready || el > 8000 ? 100 : Math.min(timeTarget, 93);
      pct += (tgt - pct) * 0.1;
      if (tgt === 100 && pct > 99.4) pct = 100;
      pctEl.textContent = Math.round(pct);
      prog.style.strokeDashoffset = (100 - pct).toFixed(2);
      swap(Math.min(3, Math.floor(pct / 26)));
      if (pct >= 100) { finish(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------------
     04. NAVEGACIÓN Y MENÚ MÓVIL
     ------------------------------------------------------------------------ */
  function initNav() {
    var nav = $('#nav');
    var burger = $('#burger');
    var menu = $('#menu');
    var navSections = $$('[data-nav]');
    var menuOpen = false;
    var state = { stuck: false, theme: 'dark', p: 0 };

    /* Estado del nav según scroll y la sección que queda debajo */
    Engine.add({
      measure: function (c) {
        var max = Math.max(1, root.scrollHeight - c.vh);
        state.p = clamp(c.y / max);
        state.stuck = c.y > 24;
        var probe = 36, theme = state.theme;
        for (var i = 0; i < navSections.length; i++) {
          var r = navSections[i].getBoundingClientRect();
          if (r.top <= probe && r.bottom > probe) { theme = navSections[i].dataset.nav; }
        }
        state.theme = theme;
      },
      apply: function () {
        nav.style.setProperty('--sp', state.p.toFixed(4));
        nav.classList.toggle('is-stuck', state.stuck && !menuOpen);
        var theme = menuOpen ? 'dark' : state.theme;
        nav.classList.toggle('nav--dark', theme === 'dark');
        nav.classList.toggle('nav--light', theme === 'light');
      }
    });

    /* Enlace activo */
    var links = $$('.nav__links a[data-link]');
    if ('IntersectionObserver' in window && links.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id); });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      $$('main > section[id]').forEach(function (s) { io.observe(s); });
    }

    /* Menú móvil */
    $$('.menu__list li').forEach(function (li, i) { li.style.setProperty('--k', i); });
    function setMenu(open) {
      menuOpen = open;
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      root.style.overflow = open ? 'hidden' : '';
      nav.classList.toggle('is-menu-open', open);
      /* mientras el menú está abierto, el resto de la página no recibe foco */
      $$('#contenido, .footer, .wa').forEach(function (el) {
        if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert');
      });
      if (open) { Engine.lock(); setTimeout(function () { var a = $('.menu__list a', menu); a && a.focus({ preventScroll: true }); }, 450); }
      else { Engine.unlock(); }
    }
    burger.addEventListener('click', function () { setMenu(!menuOpen); if (!menuOpen) burger.focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });
    onMQ(mqDesktop, function (e) { if (e.matches && menuOpen) setMenu(false); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });

    /* Enlaces internos con scroll suave */
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var hash = a.getAttribute('href');
      if (hash.length < 2) return;
      var el = $(hash);
      if (!el) return;
      e.preventDefault();
      if (a.classList.contains('skip')) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
      var off = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      var top = hash === '#inicio' ? 0 : el.getBoundingClientRect().top + window.scrollY - off;
      /* si el menú se acaba de cerrar, esperar a que se libere el bloqueo */
      setTimeout(function () { Engine.scrollTo(top); }, menuOpen ? 60 : 0);
      if (history.pushState) history.pushState(null, '', hash);
    });

    var totop = $('[data-totop]');
    totop && totop.addEventListener('click', function () { Engine.scrollTo(0); });
  }

  /* ------------------------------------------------------------------------
     05. TITULARES POR PALABRA Y REVELADO
     ------------------------------------------------------------------------ */
  function initReveal() {
    /* Separar titulares en palabras con máscara */
    $$('[data-split]').forEach(function (el) {
      var text = el.textContent.trim().replace(/\s+/g, ' ');
      el.setAttribute('aria-label', text);
      el.innerHTML = text.split(' ').map(function (w, i) {
        return '<span class="w" aria-hidden="true"><span style="--wi:' + i + '">' + w + '</span></span>';
      }).join(' ');
    });

    var targets = $$('.reveal, .media-reveal, [data-split]');
    function show(el) {
      el.classList.add('is-in');
      if (el.classList.contains('reveal')) {
        var d = parseInt((el.style.getPropertyValue('--d') || '0'), 10) || 0;
        setTimeout(function () { el.classList.add('is-done'); }, 1300 + d);
      }
    }
    if (REDUCE || !('IntersectionObserver' in window)) { targets.forEach(show); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        show(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* Parallax suave de imágenes dentro de marcos con overflow */
  function initParallax() {
    var els = $$('[data-parallax]');
    if (!els.length || REDUCE) return;
    watchNear(els);
    var jobs = [];
    Engine.add({
      measure: function (c) {
        jobs.length = 0;
        if (!c.changed) return;
        els.forEach(function (el) {
          if (!el.__near) return;
          var r = el.parentElement.getBoundingClientRect();
          var off = (r.top + r.height / 2 - c.vh / 2) / c.vh;
          var k = (parseFloat(el.dataset.parallax) || 0.08) / 0.08;
          jobs.push([el, -clamp(off, -1, 1) * r.height * 0.045 * k]);
        });
      },
      apply: function () {
        jobs.forEach(function (j) { j[0].style.translate = '0 ' + j[1].toFixed(1) + 'px'; });
      }
    });
  }

  /* ------------------------------------------------------------------------
     06. CONTADORES
     ------------------------------------------------------------------------ */
  function initCounters() {
    var els = $$('[data-count]');
    if (!els.length) return;
    function run(el) {
      var to = parseInt(el.dataset.count, 10) || 0;
      if (REDUCE) { el.textContent = to; return; }
      var t0 = null, dur = 1600;
      el.textContent = '0';
      requestAnimationFrame(function step(ts) {
        if (!t0) t0 = ts;
        var p = clamp((ts - t0) / dur);
        var e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        el.textContent = Math.round(e * to);
        if (p < 1) requestAnimationFrame(step);
      });
    }
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     07. HERO
     ------------------------------------------------------------------------ */
  function initRotator() {
    var rot = $('[data-rotator]');
    if (!rot) return;
    var words = $$('.rot__w', rot);
    if (words.length < 2 || REDUCE) return;
    var idx = 0;
    setInterval(function () {
      if (document.hidden) return;
      var cur = words[idx];
      idx = (idx + 1) % words.length;
      var nxt = words[idx];
      cur.classList.remove('is-on');
      cur.classList.add('is-out');
      nxt.classList.add('is-on');
      setTimeout(function () {
        cur.style.transition = 'none';
        cur.classList.remove('is-out');
        void cur.offsetWidth;
        cur.style.transition = '';
      }, 900);
    }, 2800);
  }

  function initHeroMotion() {
    var hero = $('#inicio');
    if (!hero) return;
    var copy = $('[data-hero-copy]', hero);
    var visual = $('[data-hero-visual]', hero);
    $$('[data-depth]', hero).forEach(function (el) { el.style.setProperty('--depth', el.dataset.depth); });
    if (REDUCE) return;
    hero.__near = true;
    watchNear([hero]);

    if (mqFine.matches) {
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
        pointer.px = e.clientX - r.left;
        pointer.py = e.clientY - r.top;
        pointer.inside = true;
      }, { passive: true });
      hero.addEventListener('pointerleave', function () { pointer.tx = 0; pointer.ty = 0; pointer.inside = false; });
    }

    var s = { p: 0, copyY: 0, op: 1, visY: 0, mx: 0, my: 0 };
    Engine.add({
      measure: function (c) {
        if (!hero.__near) return;
        var h = hero.offsetHeight || 1;
        s.p = clamp(c.y / h);
        s.copyY = c.y * 0.22;
        s.op = clamp(1 - s.p * 1.25);
        s.visY = c.y * 0.1;
        pointer.nx = lerp(pointer.nx, pointer.tx, 0.06);
        pointer.ny = lerp(pointer.ny, pointer.ty, 0.06);
        pointer.energy = lerp(pointer.energy, pointer.inside ? 1 : 0, 0.05);
      },
      apply: function () {
        if (!hero.__near) return;
        if (copy) { copy.style.transform = 'translate3d(0,' + s.copyY.toFixed(1) + 'px,0)'; copy.style.opacity = s.op.toFixed(3); }
        if (visual) {
          visual.style.transform = 'translate3d(0,' + s.visY.toFixed(1) + 'px,0)';
          visual.style.setProperty('--mx', pointer.nx.toFixed(3));
          visual.style.setProperty('--my', pointer.ny.toFixed(3));
        }
      }
    });
  }

  /* Campo de ondas trifásicas + circuitos con pulsos de corriente (canvas) */
  function WaveField(canvas, cfg) {
    var ctx = canvas.getContext('2d');
    var st = { w: 0, h: 0, dpr: 1, traces: [], layer: null };
    var host = canvas.parentElement;
    var seed = cfg.seed || 7;
    function rng() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

    function glowSprite(rgb) {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d');
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + rgb + ',1)');
      gr.addColorStop(0.3, 'rgba(' + rgb + ',.5)');
      gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return c;
    }
    var glows = { gold: glowSprite('248,199,71'), green: glowSprite('166,207,114') };
    var rgbs = { gold: '248,199,71', green: '166,207,114' };

    function build() {
      st.traces = [];
      st.layer = null;
      if (!cfg.traces) return;
      var w = st.w, h = st.h;
      var n = Math.round(clamp((w * h) / 62000, 6, 18));
      for (var i = 0; i < n; i++) {
        var x = rng() * w, y = rng() * h, horiz = rng() < 0.5;
        var pts = [[x, y]];
        var segs = 3 + Math.floor(rng() * 4);
        for (var s = 0; s < segs; s++) {
          var len = 70 + rng() * 230, dir = rng() < 0.5 ? -1 : 1;
          if (horiz) x = clamp(x + dir * len, 16, w - 16); else y = clamp(y + dir * len, 16, h - 16);
          pts.push([x, y]); horiz = !horiz;
        }
        var L = 0, cum = [0];
        for (var k = 1; k < pts.length; k++) { L += Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]); cum.push(L); }
        if (L < 60) continue;
        st.traces.push({ pts: pts, cum: cum, L: L, s: rng() * L, speed: 80 + rng() * 120, col: rng() < 0.38 ? 'gold' : 'green', flash: 0, wait: 0 });
      }
      var layer = document.createElement('canvas');
      layer.width = Math.round(w * st.dpr); layer.height = Math.round(h * st.dpr);
      var g = layer.getContext('2d');
      g.scale(st.dpr, st.dpr);
      g.lineJoin = 'round'; g.lineWidth = 1;
      st.traces.forEach(function (tr) {
        g.strokeStyle = 'rgba(166,207,114,.11)';
        g.beginPath(); g.moveTo(tr.pts[0][0], tr.pts[0][1]);
        for (var q = 1; q < tr.pts.length; q++) g.lineTo(tr.pts[q][0], tr.pts[q][1]);
        g.stroke();
        var e = tr.pts[tr.pts.length - 1], b = tr.pts[0];
        g.strokeStyle = 'rgba(166,207,114,.34)';
        g.beginPath(); g.arc(e[0], e[1], 3.5, 0, 6.2832); g.stroke();
        g.fillStyle = 'rgba(166,207,114,.3)';
        g.beginPath(); g.arc(b[0], b[1], 2, 0, 6.2832); g.fill();
      });
      st.layer = layer;
    }

    function pointAt(tr, s) {
      var i = 1;
      while (i < tr.cum.length - 1 && tr.cum[i] < s) i++;
      var a = tr.pts[i - 1], b = tr.pts[i];
      var seg = (tr.cum[i] - tr.cum[i - 1]) || 1;
      var t = clamp((s - tr.cum[i - 1]) / seg);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }

    function resize() {
      var r = host.getBoundingClientRect();
      var cap = r.width < 700 ? 1.5 : 1.75;
      st.dpr = Math.min(window.devicePixelRatio || 1, cap);
      st.w = Math.max(1, Math.round(r.width));
      st.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(st.w * st.dpr);
      canvas.height = Math.round(st.h * st.dpr);
      build();
    }

    function drawWaves(t, usePointer) {
      var w = st.w, h = st.h;
      var A = cfg.amp * h, base = cfg.base * h;
      var freq = (Math.PI * 2) / (cfg.wavelength * (w < 700 ? 0.6 : 1));
      var cols = cfg.colors;
      var step = w < 700 ? 8 : 6;
      ctx.lineJoin = 'round';
      for (var k = 0; k < 3; k++) {
        var phase = t * cfg.speed + k * 2.0944;
        var breathe = 0.78 + 0.22 * Math.sin(t * 0.00035 + k * 1.7);
        var pts = [];
        for (var x = 0; x <= w + step; x += step) {
          var env = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, x / w))), 0.65);
          var yy = base + Math.sin(x * freq + phase) * A * env * breathe;
          if (usePointer && pointer.energy > 0.01) {
            var dx = (x - pointer.px) / (w * 0.11);
            yy += Math.exp(-dx * dx) * pointer.energy * A * 1.1 * Math.sin(x * freq * 2.4 + t * 0.006 + k);
          }
          pts.push(x, yy);
        }
        for (var pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]);
          for (var q = 2; q < pts.length; q += 2) ctx.lineTo(pts[q], pts[q + 1]);
          ctx.strokeStyle = 'rgba(' + cols[k] + ',' + (pass === 0 ? cfg.glowAlpha : cfg.alpha) + ')';
          ctx.lineWidth = pass === 0 ? 7 : 1.6;
          ctx.stroke();
        }
      }
    }

    function drawTraces(dt) {
      if (st.layer) ctx.drawImage(st.layer, 0, 0, st.w, st.h);
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (var i = 0; i < st.traces.length; i++) {
        var tr = st.traces[i];
        var end = tr.pts[tr.pts.length - 1];
        if (tr.wait > 0) tr.wait -= dt;
        else {
          tr.s += tr.speed * dt / 1000;
          if (tr.s >= tr.L) { tr.s = 0; tr.flash = 1; tr.wait = 700 + rng() * 2600; }
          var head = pointAt(tr, tr.s);
          var prev = head, steps = 7, tail = 80;
          ctx.strokeStyle = 'rgb(' + rgbs[tr.col] + ')';
          for (var k = 1; k <= steps; k++) {
            var p = pointAt(tr, Math.max(0, tr.s - tail * k / steps));
            ctx.globalAlpha = (1 - k / steps) * 0.8;
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
            prev = p;
          }
          ctx.globalAlpha = 1;
          ctx.drawImage(glows[tr.col], head[0] - 13, head[1] - 13, 26, 26);
        }
        if (tr.flash > 0) {
          tr.flash -= dt / 800;
          ctx.globalAlpha = clamp(tr.flash);
          ctx.drawImage(glows[tr.col], end[0] - 20, end[1] - 20, 40, 40);
          ctx.globalAlpha = 1;
        }
      }
    }

    this.draw = function (t, dt, usePointer) {
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, st.w, st.h);
      if (cfg.traces) drawTraces(dt);
      drawWaves(t, usePointer);
    };
    this.resize = resize;
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); if (REDUCE) this.draw(2400, 16, false); }.bind(this)).observe(host);
  }

  function initWaveFields() {
    var canvases = $$('canvas[data-wavefield]');
    if (!canvases.length) return;
    var fields = canvases.map(function (cv) {
      var kind = cv.dataset.wavefield;
      var cfg = kind === 'hero'
        ? { traces: true, seed: 11, amp: 0.075, base: 0.8, wavelength: 520, speed: 0.0011, alpha: 0.85, glowAlpha: 0.09, colors: ['248,199,71', '166,207,114', '255,255,255'] }
        : { traces: false, seed: 5, amp: 0.2, base: 0.62, wavelength: 640, speed: 0.0009, alpha: 0.75, glowAlpha: 0.08, colors: ['248,199,71', '255,255,255', '166,207,114'] };
      var f = new WaveField(cv, cfg);
      cv.__near = !('IntersectionObserver' in window);
      return { cv: cv, f: f, usePointer: kind === 'hero' };
    });
    if (REDUCE) { fields.forEach(function (o) { o.f.draw(2400, 16, false); }); return; }
    watchNear(canvases);
    Engine.onFrame(function (c) {
      for (var i = 0; i < fields.length; i++) {
        var o = fields[i];
        if (o.cv.__near) o.f.draw(c.t, c.dt, o.usePointer);
      }
    });
  }

  /* ------------------------------------------------------------------------
     08. BANDA DE SERVICIOS (marquee que reacciona a la velocidad del scroll)
     ------------------------------------------------------------------------ */
  function initMarquee() {
    var track = $('[data-marquee]');
    if (!track) return;
    if (REDUCE || !track.animate) { track.style.animation = 'none'; return; }
    track.style.animation = 'none';
    var anim = track.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
      { duration: 60000, iterations: Infinity, easing: 'linear' }
    );
    var rate = 1, lastRate = 1, hovered = false;
    track.addEventListener('pointerenter', function () { hovered = true; });
    track.addEventListener('pointerleave', function () { hovered = false; });
    track.addEventListener('focusin', function () { hovered = true; });
    track.addEventListener('focusout', function () { hovered = false; });
    Engine.onFrame(function (c) {
      var want = hovered ? 0.15 : 1 + clamp(Math.abs(c.vel) * 0.45, 0, 7);
      rate = lerp(rate, want, 0.07);
      if (Math.abs(rate - lastRate) > 0.01) {
        lastRate = rate;
        if (anim.updatePlaybackRate) anim.updatePlaybackRate(rate); else anim.playbackRate = rate;
      }
    });
  }

  /* ------------------------------------------------------------------------
     09. TEXTO QUE SE ILUMINA CON EL SCROLL
     ------------------------------------------------------------------------ */
  function initScrub() {
    var el = $('[data-scrub]');
    if (!el || REDUCE) return;
    var text = el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('aria-label', text);
    var words = text.split(' ');
    el.innerHTML = words.map(function (w) { return '<span class="sw" aria-hidden="true">' + w + '</span>'; }).join(' ');
    var spans = $$('.sw', el);
    var n = spans.length;
    watchNear([el]);
    var vals = new Array(n).fill(-1);
    var out = [];
    Engine.add({
      measure: function (c) {
        out.length = 0;
        if (!el.__near || !c.changed && vals[0] !== -1) return;
        var r = el.getBoundingClientRect();
        var p = clamp((c.vh * 0.9 - r.top) / (r.height + c.vh * 0.38));
        var count = p * (n + 4);
        for (var i = 0; i < n; i++) {
          var o = 0.16 + 0.84 * clamp((count - i) / 4);
          if (Math.abs(o - vals[i]) > 0.01) { vals[i] = o; out.push(i); }
        }
      },
      apply: function () {
        for (var i = 0; i < out.length; i++) spans[out[i]].style.setProperty('--o', vals[out[i]].toFixed(2));
      }
    });
  }

  /* ------------------------------------------------------------------------
     10. TARJETAS APILADAS DE SERVICIOS (solo escritorio)
     ------------------------------------------------------------------------ */
  function initStack() {
    var wrap = $('[data-stack]');
    if (!wrap) return;
    var cards = $$('[data-stack-card]', wrap);
    if (cards.length < 2) return;
    var shades = cards.map(function (c) { return $('.svc__shade', c); });
    watchNear([wrap]);
    var active = false;
    var vals = cards.map(function () { return 0; });
    var dirty = false;

    function reset() {
      cards.forEach(function (c, i) { c.style.transform = ''; shades[i].style.opacity = ''; vals[i] = 0; });
    }
    function sync() { active = mqDesktop.matches && !REDUCE; if (!active) reset(); }
    sync(); onMQ(mqDesktop, sync);

    Engine.add({
      measure: function () {
        dirty = false;
        if (!active || !wrap.__near) return;
        for (var i = 0; i < cards.length - 1; i++) {
          var next = cards[i + 1];
          var nTop = next.getBoundingClientRect().top;
          var sticky = parseFloat(getComputedStyle(next).top) || 0;
          var h = cards[i].offsetHeight || 1;
          var p = 1 - clamp((nTop - sticky) / (h * 0.92));
          if (Math.abs(p - vals[i]) > 0.002) { vals[i] = p; dirty = true; }
        }
      },
      apply: function () {
        if (!dirty) return;
        for (var i = 0; i < cards.length - 1; i++) {
          var p = vals[i];
          cards[i].style.transform = 'scale(' + (1 - 0.06 * p).toFixed(4) + ')';
          shades[i].style.opacity = (p * 0.62).toFixed(3);
        }
      }
    });
  }

  /* ------------------------------------------------------------------------
     11. GALERÍA HORIZONTAL FIJADA (escritorio) / carrusel con snap (móvil)
     ------------------------------------------------------------------------ */
  function initHPan() {
    var sec = $('[data-hpan]');
    if (!sec) return;
    var stage = $('[data-hpan-stage]', sec);
    var viewport = $('[data-hpan-viewport]', sec);
    var track = $('[data-hpan-track]', sec);
    var bar = $('[data-hpan-bar]', sec);
    var on = false, dist = 0, x = 0, targetX = 0, p = 0;
    watchNear([sec]);

    function teardown() {
      on = false;
      sec.classList.remove('is-pinned');
      sec.style.height = '';
      track.style.transform = '';
      bar.style.transform = '';
    }
    function setup() {
      if (!mqDesktop.matches || REDUCE) { teardown(); return; }
      sec.classList.add('is-pinned');
      on = true;
      dist = Math.max(0, track.scrollWidth - viewport.clientWidth);
      sec.style.height = Math.round(dist + window.innerHeight) + 'px';
    }
    setup();
    onMQ(mqDesktop, setup);
    window.addEventListener('resize', setup, { passive: true });
    window.addEventListener('load', setup);
    $$('img', track).forEach(function (img) { if (!img.complete) img.addEventListener('load', setup); });

    Engine.add({
      measure: function (c) {
        if (!on || !sec.__near) return;
        var r = sec.getBoundingClientRect();
        var span = Math.max(1, r.height - c.vh);
        p = clamp(-r.top / span);
        targetX = -p * dist;
        x = lerp(x, targetX, 0.14);
        if (Math.abs(x - targetX) < 0.1) x = targetX;
      },
      apply: function () {
        if (!on || !sec.__near) return;
        track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
        bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      }
    });
  }

  /* ------------------------------------------------------------------------
     12. LÍNEA DE TIEMPO DEL PROCESO
     ------------------------------------------------------------------------ */
  function initTimeline() {
    var tl = $('[data-timeline]');
    if (!tl) return;
    var items = $$('[data-tl]', tl);
    var nodes = items.map(function (li) { return $('.tl__node', li); });
    watchNear([tl]);
    var p = 0, flags = items.map(function () { return false; }), dirty = true;
    if (REDUCE) { tl.style.setProperty('--tp', 1); items.forEach(function (li) { li.classList.add('is-on'); }); return; }
    Engine.add({
      measure: function (c) {
        if (!tl.__near) return;
        var r = tl.getBoundingClientRect();
        var trigger = c.vh * 0.62;
        var np = clamp((trigger - (r.top + 24)) / Math.max(1, r.height - 48));
        if (Math.abs(np - p) > 0.0005) { p = np; dirty = true; }
        for (var i = 0; i < items.length; i++) {
          var nr = nodes[i].getBoundingClientRect();
          var on = nr.top + nr.height / 2 <= trigger;
          if (on !== flags[i]) { flags[i] = on; dirty = true; }
        }
      },
      apply: function () {
        if (!dirty) return;
        dirty = false;
        tl.style.setProperty('--tp', p.toFixed(4));
        for (var i = 0; i < items.length; i++) items[i].classList.toggle('is-on', flags[i]);
      }
    });
  }

  /* ------------------------------------------------------------------------
     13. EFECTOS DE CURSOR (solo punteros finos)
     ------------------------------------------------------------------------ */
  function initPointerFx() {
    if (!mqFine.matches || REDUCE) return;

    /* Botones magnéticos */
    $$('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        var dy = (e.clientY - (r.top + r.height / 2)) * 0.3;
        el.style.translate = clamp(dx, -9, 9).toFixed(1) + 'px ' + clamp(dy, -7, 7).toFixed(1) + 'px';
      });
      el.addEventListener('pointerleave', function () { el.style.translate = ''; });
    });

    /* Foco de luz que sigue al cursor en tarjetas */
    $$('[data-spot]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--sx', (e.clientX - r.left).toFixed(0) + 'px');
        el.style.setProperty('--sy', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
  }

  /* ------------------------------------------------------------------------
     14. SECTORES Y PREGUNTAS FRECUENTES
     ------------------------------------------------------------------------ */
  function initSectors() {
    var acc = $('[data-acc]');
    if (!acc) return;
    var panels = $$('[data-panel]', acc);
    var timer = null;
    function activate(p) {
      panels.forEach(function (q) {
        var on = q === p;
        q.classList.toggle('is-active', on);
        $('.panel__btn', q).setAttribute('aria-expanded', String(on));
      });
    }
    function sync() {
      if (!mqDesktop.matches) {
        panels.forEach(function (q) { q.classList.add('is-active'); $('.panel__btn', q).setAttribute('aria-expanded', 'true'); });
      } else {
        var cur = panels.filter(function (q) { return q.classList.contains('is-active'); })[0] || panels[0];
        activate(cur);
      }
    }
    sync(); onMQ(mqDesktop, sync);

    panels.forEach(function (p) {
      p.addEventListener('mouseenter', function () {
        if (!mqDesktop.matches) return;
        clearTimeout(timer);
        timer = setTimeout(function () { activate(p); }, 70);
      });
      p.addEventListener('mouseleave', function () { clearTimeout(timer); });
      p.addEventListener('click', function (e) {
        if (!mqDesktop.matches || e.target.closest('a')) return;
        activate(p);
      });
      p.addEventListener('focusin', function () { if (mqDesktop.matches) activate(p); });
    });
  }

  function initFaq() {
    var list = $('[data-faq]');
    if (!list) return;
    var items = $$('.qa', list);
    items.forEach(function (item) {
      var btn = $('.qa__q', item);
      btn.addEventListener('click', function () {
        var open = !item.classList.contains('is-open');
        items.forEach(function (q) {
          var on = q === item && open;
          q.classList.toggle('is-open', on);
          $('.qa__q', q).setAttribute('aria-expanded', String(on));
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     15. FORMULARIO Y ENLACES DE WHATSAPP
     ------------------------------------------------------------------------ */
  function waUrl(msg) {
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
  }

  function initWhatsApp() {
    $$('[data-wa]').forEach(function (a) { a.href = waUrl(a.dataset.wa); });

    /* Botón flotante: aparece al terminar la carga y saluda una vez */
    var wrap = $('[data-wa-float]');
    if (!wrap) return;
    var bubble = $('[data-wa-bubble]', wrap);
    var close = $('[data-wa-close]', wrap);
    var seen = false;
    try { seen = sessionStorage.getItem('rsn-wa-bubble') === '1'; } catch (e) { /* sin almacenamiento */ }
    wrap.classList.add('is-in');
    function hide() {
      bubble.classList.remove('is-show');
      try { sessionStorage.setItem('rsn-wa-bubble', '1'); } catch (e) { /* sin almacenamiento */ }
    }
    close.addEventListener('click', hide);
    /* en pantallas pequeñas el globo taparía los botones: solo el icono */
    if (!seen && window.innerWidth >= 640) {
      setTimeout(function () { bubble.classList.add('is-show'); }, 5200);
      setTimeout(function () { if (bubble.classList.contains('is-show')) bubble.classList.remove('is-show'); }, 13000);
    }
  }

  function initForm() {
    var form = $('#quote-form');
    if (!form) return;
    var status = $('[data-form-status]', form);
    var label = $('[data-submit-label]', form);
    var fields = {
      nombre: { el: $('#f-name'), err: $('#e-name'), test: function (v) { return v.trim().length >= 2; }, msg: 'Escribe tu nombre para saber con quién hablamos.' },
      telefono: { el: $('#f-phone'), err: $('#e-phone'), test: function (v) { return v.replace(/\D/g, '').length >= 10; }, msg: 'Escribe un teléfono de 10 dígitos.' },
      servicio: { el: $('#f-service'), err: $('#e-service'), test: function (v) { return v !== ''; }, msg: 'Elige el servicio que necesitas.' },
      mensaje: { el: $('#f-msg'), err: $('#e-msg'), test: function (v) { return v.trim().length >= 8; }, msg: 'Cuéntanos un poco más de tu proyecto (mínimo 8 caracteres).' }
    };

    function check(key) {
      var f = fields[key];
      var ok = f.test(f.el.value);
      f.el.closest('.field').classList.toggle('has-error', !ok);
      f.el.setAttribute('aria-invalid', String(!ok));
      f.err.textContent = ok ? '' : f.msg;
      return ok;
    }
    Object.keys(fields).forEach(function (k) {
      fields[k].el.addEventListener('blur', function () { check(k); });
      fields[k].el.addEventListener('input', function () {
        if (fields[k].el.closest('.field').classList.contains('has-error')) check(k);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = null;
      Object.keys(fields).forEach(function (k) { if (!check(k) && !first) first = fields[k].el; });
      if (first) { first.focus(); status.textContent = ''; return; }

      var msg = 'Hola RSN, soy ' + fields.nombre.el.value.trim() + '. ' +
        'Me interesa: ' + fields.servicio.el.value + '. ' +
        fields.mensaje.el.value.trim() + ' ' +
        'Mi teléfono: ' + fields.telefono.el.value.trim() + '.';
      var url = waUrl(msg);
      var w = window.open(url, '_blank', 'noopener');
      label.textContent = 'Abriendo WhatsApp...';
      status.innerHTML = 'Listo, abrimos WhatsApp con tu mensaje. Si no se abrió, <a href="' + url + '" target="_blank" rel="noopener">toca aquí</a>.';
      if (!w) { /* bloqueador de ventanas: el enlace de arriba funciona igual */ }
      setTimeout(function () { label.textContent = 'Enviar mi solicitud'; }, 3500);
    });
  }

  /* ------------------------------------------------------------------------
     16. ARRANQUE
     ------------------------------------------------------------------------ */
  function start() {
    if ('scrollRestoration' in history && !location.hash) history.scrollRestoration = 'manual';
    if (!location.hash) window.scrollTo(0, 0);

    var y = $('[data-year]');
    if (y) y.textContent = new Date().getFullYear();

    Engine.lock();
    Engine.start();

    initWhatsApp();
    initNav();
    initReveal();
    initParallax();
    initCounters();
    initHeroMotion();
    initWaveFields();
    initMarquee();
    initScrub();
    initStack();
    initHPan();
    initTimeline();
    initPointerFx();
    initSectors();
    initFaq();
    initForm();

    runLoader(function () {
      root.classList.remove('is-loading');
      root.classList.add('is-ready');
      Engine.unlock();
      setTimeout(initRotator, 2600);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
