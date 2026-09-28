/* Pausely - breathing engine, presets and stats */
(function () {
  'use strict';

  /* ---------- Config ---------- */

  var CIRC = 1056;          // ring circumference (SVG circle r = 168)
  var SCALE_MIN = 0.78;     // orb scale when lungs are empty
  var SCALE_MAX = 1.10;     // orb scale when lungs are full
  var STORE_KEY = 'pausely-stats-v1';

  var PATTERNS = {
    box: {
      label: 'Box',
      sequence: [
        { type: 'inhale', secs: 4 },
        { type: 'hold', secs: 4 },
        { type: 'exhale', secs: 4 },
        { type: 'hold', secs: 4 }
      ]
    },
    relaxed: {
      label: 'Relaxed',
      sequence: [
        { type: 'inhale', secs: 4 },
        { type: 'hold', secs: 7 },
        { type: 'exhale', secs: 8 }
      ]
    },
    calm: {
      label: 'Calm',
      sequence: [
        { type: 'inhale', secs: 4 },
        { type: 'exhale', secs: 6 }
      ]
    },
    coherent: {
      label: 'Coherent',
      sequence: [
        { type: 'inhale', secs: 5 },
        { type: 'exhale', secs: 5 }
      ]
    }
  };

  var PHASE_LABEL = { inhale: 'Breathe in', hold: 'Hold', exhale: 'Breathe out' };
  var PHASE_TEXT = {
    inhale: 'breathe in slowly through your nose',
    hold: 'hold - stay soft and still',
    exhale: 'breathe out gently, let the day go'
  };

  /* ---------- Elements ---------- */

  var orbWrap = document.getElementById('orbWrap');
  var orb = document.getElementById('orb');
  var orbPulse = document.getElementById('orbPulse');
  var ring = document.getElementById('ringProgress');
  var phaseLabelEl = document.getElementById('phaseLabel');
  var countEl = document.getElementById('countNum');
  var cycleEl = document.getElementById('cycleNum');
  var appNow = document.getElementById('app-now');
  var presets = document.getElementById('presets');
  var pills = Array.prototype.slice.call(presets.querySelectorAll('.pill'));
  var startBtn = document.getElementById('startBtn');
  var pauseBtn = document.getElementById('pauseBtn');
  var resetBtn = document.getElementById('resetBtn');
  var statSessions = document.getElementById('statSessions');
  var statMinutes = document.getElementById('statMinutes');
  var statBreaths = document.getElementById('statBreaths');
  var statStreak = document.getElementById('statStreak');
  var yearEl = document.getElementById('year');

  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- State ---------- */

  var currentPattern = 'box';
  var running = false;
  var paused = false;
  var phaseIndex = 0;
  var phaseElapsed = 0;
  var phaseFrom = SCALE_MIN;
  var phaseTo = SCALE_MIN;
  var lastFrame = 0;
  var rafId = null;
  var sessionMs = 0;
  var completedCycles = 0;
  var completedBreaths = 0;
  var lastCount = '';

  /* ---------- Helpers ---------- */

  function seq() { return PATTERNS[currentPattern].sequence; }
  function patternLabel() { return PATTERNS[currentPattern].label; }
  function phaseDurationMs() { return seq()[phaseIndex].secs * 1000; }

  function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function easeInOut(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function currentOrbScale() {
    var tr = getComputedStyle(orb).transform;
    if (tr && tr !== 'none') {
      var m = tr.match(/matrix\(([^)]+)\)/);
      if (m) { return parseFloat(m[1].split(',')[0]); }
    }
    return 0.9;
  }

  function updateCycleText() {
    cycleEl.textContent = completedCycles + (completedCycles === 1 ? ' cycle' : ' cycles');
  }

  /* ---------- Phase engine ---------- */

  function enterPhase(idx, fromOverride) {
    var s = seq();
    var ph = s[idx];
    var prev = s[(idx - 1 + s.length) % s.length];
    var holdScale = prev.type === 'inhale' ? SCALE_MAX : SCALE_MIN;

    phaseFrom = (typeof fromOverride === 'number') ? fromOverride :
      ph.type === 'inhale' ? SCALE_MIN :
      ph.type === 'exhale' ? SCALE_MAX : holdScale;
    phaseTo = ph.type === 'inhale' ? SCALE_MAX :
      ph.type === 'exhale' ? SCALE_MIN : holdScale;

    orbWrap.setAttribute('data-phase', ph.type);
    phaseLabelEl.textContent = PHASE_LABEL[ph.type];
    appNow.textContent = patternLabel() + ' - ' + PHASE_TEXT[ph.type];

    if (ph.type === 'inhale') {
      orbPulse.classList.remove('go');
      void orbPulse.offsetWidth; /* restart the pulse animation */
      if (!REDUCED) { orbPulse.classList.add('go'); }
    }
    if (REDUCED) { orb.style.transform = 'scale(' + phaseTo + ')'; }
  }

  function advancePhase() {
    var s = seq();
    if (s[phaseIndex].type === 'inhale') { completedBreaths += 1; }
    phaseIndex = (phaseIndex + 1) % s.length;
    if (phaseIndex === 0) {
      completedCycles += 1;
      updateCycleText();
    }
    enterPhase(phaseIndex, null);
  }

  function tick(now) {
    if (!running || paused) { return; }
    var dt = now - lastFrame;
    if (dt < 0) { dt = 0; }
    if (dt > 250) { dt = 250; } /* clamp long gaps (tab throttling) */
    lastFrame = now;
    sessionMs += dt;
    phaseElapsed += dt;

    var guard = 0;
    var dur = phaseDurationMs();
    while (phaseElapsed >= dur && guard < 120) {
      phaseElapsed -= dur;
      advancePhase();
      dur = phaseDurationMs();
      guard += 1;
    }

    paint(now);
    rafId = requestAnimationFrame(tick);
  }

  function paint(now) {
    var dur = phaseDurationMs();
    var t = clamp01(phaseElapsed / dur);

    if (!REDUCED) {
      var scale = lerp(phaseFrom, phaseTo, easeInOut(t));
      if (seq()[phaseIndex].type === 'hold') { scale += Math.sin(now / 650) * 0.01; }
      orb.style.transform = 'scale(' + scale.toFixed(4) + ')';
    }

    ring.style.strokeDashoffset = (CIRC * (1 - t)).toFixed(1);

    var remain = Math.ceil((dur - phaseElapsed) / 1000);
    var txt = String(remain > 0 ? remain : 0);
    if (txt !== lastCount) { countEl.textContent = txt; lastCount = txt; }
  }

  /* ---------- Session control ---------- */

  function startSession() {
    if (running && !paused) { return; }

    if (!running) {
      running = true;
      paused = false;
      completedCycles = 0;
      completedBreaths = 0;
      sessionMs = 0;
      phaseIndex = 0;
      phaseElapsed = 0;
      updateCycleText();

      var from = currentOrbScale(); /* read before dropping the idle animation */
      orbWrap.classList.remove('idle');
      enterPhase(0, from);
      lastFrame = performance.now();
    } else if (paused) {
      paused = false;
      lastFrame = performance.now();
    }

    presets.classList.add('locked');
    updateButtons();
    if (rafId !== null) { cancelAnimationFrame(rafId); }
    rafId = requestAnimationFrame(tick);
  }

  function pauseSession() {
    if (!running || paused) { return; }
    paused = true;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    appNow.textContent = 'Paused - press Resume whenever you are ready.';
    updateButtons();
  }

  function finishSession() {
    if (!running) { return; }
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }

    var hadProgress = completedBreaths > 0;
    if (hadProgress) {
      recordSession(Math.round(sessionMs / 1000), completedBreaths);
    }
    var msg = hadProgress
      ? 'Session saved - ' + completedBreaths + ' breaths and ' + completedCycles + ' cycles. Well done.'
      : 'Session ended before a full breath - start again whenever you like.';
    resetToIdle();
    appNow.textContent = msg;
  }

  function resetToIdle() {
    running = false;
    paused = false;
    phaseIndex = 0;
    phaseElapsed = 0;
    completedCycles = 0;
    completedBreaths = 0;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }

    orbWrap.setAttribute('data-phase', 'idle');
    orbWrap.classList.add('idle');
    orb.style.transform = '';
    ring.style.strokeDashoffset = CIRC;
    phaseLabelEl.textContent = 'Ready';
    countEl.textContent = '-';
    lastCount = '';
    updateCycleText();
    presets.classList.remove('locked');
    updateButtons();
  }

  function updateButtons() {
    if (!running) {
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      pauseBtn.textContent = 'Pause';
      resetBtn.disabled = true;
    } else {
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      resetBtn.disabled = false;
    }
  }

  /* ---------- Stats (localStorage) ---------- */

  function loadStats() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') { return parsed; }
      }
    } catch (e) { /* storage unavailable */ }
    return { sessions: 0, totalSeconds: 0, breaths: 0, streak: 0, lastDay: '' };
  }

  function saveStats(s) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  function dayString(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function recordSession(seconds, breaths) {
    var s = loadStats();
    s.sessions = (s.sessions || 0) + 1;
    s.totalSeconds = (s.totalSeconds || 0) + seconds;
    s.breaths = (s.breaths || 0) + breaths;

    var today = dayString(new Date());
    if (s.lastDay !== today) {
      var y = new Date();
      y.setDate(y.getDate() - 1);
      s.streak = (s.lastDay === dayString(y)) ? (s.streak || 0) + 1 : 1;
      s.lastDay = today;
    }

    saveStats(s);
    renderStats(s);
  }

  function renderStats(s) {
    s = s || loadStats();
    statSessions.textContent = String(s.sessions || 0);
    statMinutes.textContent = String(Math.round((s.totalSeconds || 0) / 60));
    statBreaths.textContent = String(s.breaths || 0);
    statStreak.textContent = String(s.streak || 0);
  }

  /* ---------- Preset selection ---------- */

  function setPattern(name) {
    if (running || !PATTERNS[name]) { return; }
    currentPattern = name;
    pills.forEach(function (p) {
      var active = p.getAttribute('data-pattern') === name;
      p.classList.toggle('is-active', active);
      p.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    appNow.textContent = patternLabel() + ' - press Start when you are ready.';
  }

  /* ---------- Wire up ---------- */

  pills.forEach(function (p) {
    p.addEventListener('click', function () { setPattern(p.getAttribute('data-pattern')); });
  });

  startBtn.addEventListener('click', startSession);

  pauseBtn.addEventListener('click', function () {
    if (paused) { startSession(); } else { pauseSession(); }
  });

  resetBtn.addEventListener('click', finishSession);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running && !paused) { pauseSession(); }
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    Array.prototype.slice.call(document.querySelectorAll('.reveal')).forEach(function (el) {
      io.observe(el);
    });
  } else {
    Array.prototype.slice.call(document.querySelectorAll('.reveal')).forEach(function (el) {
      el.classList.add('in');
    });
  }

  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }
  renderStats();
  resetToIdle();
})();
