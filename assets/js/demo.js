/* global GGBApplet */
// Live demo: data-driven trajectory replay with bench/problem
// selector and per-turn navigation tabs.
//
//   - Selector pills (above the card) switch which demo JSON to load
//     (assets/demos/<id>.json).
//   - Turn tabs (top of col-tools) switch which turn's step list is
//     visible. The active tab auto-scrolls into view.
//   - Autoplay walks ALL turns left→right, then the answer reveal,
//     then loops back to turn 1 step 1.
//   - A step with `ok: false` is shown red+strikethrough and is
//     SKIPPED during canvas replay (the real engine rejected it).
//
// Data schema:
//   data = {
//     id, meta[], question, choices[], expected, input_image,
//     viewport[xmin, xmax, ymin, ymax],
//     turns: [{ index, summary, steps: [{raw, cmd, ok, diff, note}] }],
//     answer: { value, choice }
//   }
//   (legacy: data.steps[] with no turns is auto-wrapped into 1 turn.)
//
// `GGBApplet` is a global injected by deployggb.js (loaded in <head>).

(function () {
  const card = document.querySelector('.demo-card');
  if (!card) return;
  const selectorEl = document.getElementById('demo-selector');

  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\'/g, '&#39;');
  const pad = (s, n) => { s = String(s); while (s.length < n) s += ' '; return s; };

  // ─── Mutable state per loaded demo ──────────────────────────────
  let data = null;
  let allSteps = [];      // flat: [{...step, turnIdx, stepInTurnIdx, globalIdx}]
  let activeTurn = 0;     // which turn's step list is shown
  let activeGlobalIdx = 0;
  let renderedStep = -1;  // GGB canvas state cursor
  let ggbApi = null;

  // ─── Element handles ────────────────────────────────────────────
  const list = document.getElementById('tool-list');
  const tabsEl = document.getElementById('turn-tabs');
  const rawEl = document.getElementById('raw-json');
  const diffEl = document.getElementById('engine-diff');

  // ─── JSON pretty-printer with syntax highlight (col-raw) ────────
  function highlightJSON(jsonStr) {
    return jsonStr
      .replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
      .replace(
        /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|([{}\[\],])/g,
        (m, str, colon, num, bool, punct) => {
          if (str && colon) return '<span class="j-key">' + str + '</span><span class="j-punct">' + colon + '</span>';
          if (str)          return '<span class="j-str">' + str + '</span>';
          if (num)          return '<span class="j-num">' + num + '</span>';
          if (bool)         return '<span class="j-bool">' + bool + '</span>';
          if (punct)        return '<span class="j-punct">' + punct + '</span>';
          return m;
        }
      );
  }

  function renderRaw(idx) {
    const step = allSteps[idx];
    if (step && step.isSignal) {
      return '<span class="json-head">step ' + (idx + 1) + '</span>' +
             '<span class="signal-msg">[phase signal: ' + esc(step.signal || 'done') + ']\n\n' +
             'No tool call; the model emitted this as a text token to\n' +
             'signal the end of the current phase.</span>';
    }
    if (!step || !step.raw) return '<span class="json-head">step ' + (idx + 1) + '</span>(no function call)';
    const pretty = JSON.stringify(step.raw, null, 2);
    return '<span class="json-head">step ' + (idx + 1) + '</span>' + highlightJSON(pretty);
  }

  function renderDiff(idx) {
    const step = allSteps[idx];
    if (!step) return '';
    if (step.isSignal) {
      return '<span class="diff-head">step ' + (idx + 1) + ': ' + esc(step.signal || 'phase') + '</span>\n\n' +
             '<span class="signal-msg">&rarr; phase boundary &mdash; no engine action</span>';
    }
    let html = '<span class="diff-head">step ' + (idx + 1) + ': ' + esc(step.cmd || '') + '</span>\n\n';
    if (!step.ok) {
      html += '<span class="diff-fail">engine rejected this action</span>\n';
      if (step.note) html += '<span class="diff-note">' + esc(step.note) + '</span>\n';
      return html;
    }
    for (const [name, type, val] of (step.diff || [])) {
      html += '<span class="diff-add">+</span>  ' +
              '<span class="diff-name">' + esc(pad(name, 7)) + '</span>' +
              '<span class="diff-type">: ' + esc(pad(type, 14)) + '</span>' +
              '= <span class="diff-val">' + esc(val) + '</span>\n';
    }
    return html;
  }

  // ─── Banner / selector ──────────────────────────────────────────
  function renderBanner() {
    // .demo-meta has been removed from the banner (selector pills above
    // encode the same info). Guard for backward compat if the element
    // gets re-added later.
    const metaEl = document.getElementById('demo-meta');
    if (metaEl) {
      metaEl.innerHTML = (data.meta || [])
        .map(m => '<span class="demo-pill' + (m.tag ? ' demo-tag' : '') + '">' + esc(m.label) + '</span>')
        .join('');
    }
    document.getElementById('demo-question').textContent = data.question || '';
    const choicesHtml = (data.choices || [])
      .map(c => '<span>' + esc(c.key) + '. ' + esc(c.value) + '</span>').join('') +
      (data.expected ? '<span class="demo-expected">Expected&nbsp;<strong>' + esc(data.expected) + '</strong></span>' : '');
    document.getElementById('demo-choices').innerHTML = choicesHtml;
    const imgWrap = document.getElementById('demo-input-image');
    if (imgWrap) {
      imgWrap.style.display = '';
      if (data.input_image) {
        imgWrap.classList.remove('no-image');
        imgWrap.innerHTML = '<img src="' + esc(data.input_image) +
          '" alt="Input diagram for ' + esc(data.id) + '">';
      } else {
        // GenExam / GeoGoal-style problems that ship a text-only prompt
        // get a dashed placeholder instead of a hidden slot, so the
        // banner layout doesn't reflow between demos.
        imgWrap.classList.add('no-image');
        imgWrap.innerHTML = '<div class="no-image-placeholder">text input only</div>';
      }
    }
    card.dataset.demo = data.id;
  }

  // ─── Turn tabs ──────────────────────────────────────────────────
  // EVERY turn becomes a tab (per the user's "show every turn" ask),
  // but empty turns — phase boundaries (CONSTRUCTION_DONE / RENDER_DONE
  // for GenExam) and answer-emit turns (Geo3K / PGPS9K) — render as
  // DISABLED, italic, dashed-border tabs with a signal sub-label,
  // since there's no atomic action to navigate to inside them.
  // `nonEmpty*` helpers still drive answer-card placement + initial
  // active turn selection.
  function nonEmptyTurnIndices() {
    return (data.turns || [])
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => (t.steps || []).length > 0)
      .map(({ i }) => i);
  }
  function lastVisibleTurnIdx() {
    // (kept name for backward compat — semantically "last non-empty").
    const v = nonEmptyTurnIndices();
    return v.length ? v[v.length - 1] : 0;
  }
  function renderTurnTabs() {
    if (!tabsEl) return;
    const turns = data.turns || [];
    const wrap = document.getElementById('turn-tabs-wrap');
    // Hide the whole strip when there's only ever one tab (trivial demos).
    if (wrap) wrap.style.display = (turns.length <= 1) ? 'none' : '';
    tabsEl.innerHTML = turns.map((t, i) => {
      const isEmpty = (t.steps || []).length === 0;
      const fails = (t.steps || []).some(s => !s.ok);
      // All signal turns (construct_done / render_done / answer_emit /
      // done) are clickable — each shows its prev-turn-context + a
      // phase-coded signal row in the step list, which is informative
      // even without a tool call to navigate to.
      const cls = ['turn-tab'];
      if (isEmpty) cls.push('signal');
      if (fails) cls.push('has-fails');
      if (t.phase) cls.push('phase-' + t.phase);
      if (t.signal) cls.push('signal-' + t.signal);
      const subLabel = (isEmpty && t.signal)
        ? '<span class="turn-sub"> · ' + esc(t.signal.replace(/_/g, ' ')) + '</span>'
        : '';
      return '<button type="button" class="' + cls.join(' ') +
             '" data-turn="' + i + '">Turn&nbsp;' +
             esc(t.index || (i + 1)) + subLabel + '</button>';
    }).join('');
    tabsEl.querySelectorAll('.turn-tab:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        stopAutoplay(); cancelResume();
        const ti = parseInt(btn.dataset.turn, 10);
        switchToTurn(ti);
        const firstGlobal = allSteps.findIndex(s => s.turnIdx === ti);
        if (firstGlobal >= 0) showStep(firstGlobal);
      });
    });
  }

  function switchToTurn(turnIdx) {
    // NOTE: do NOT early-return when turnIdx === activeTurn — when
    // switching DEMOS via the selector, the new demo's first visible
    // turn often happens to equal the old activeTurn (typically 0),
    // and skipping renderStepList would leak the previous demo's
    // ANSWER card into the new demo's step list.
    activeTurn = turnIdx;
    renderStepList();
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.turn-tab').forEach((b, i) =>
      b.classList.toggle('active', i === turnIdx));
    // Center the active tab WITHIN the .turn-tabs strip (manual
    // scrollLeft, not scrollIntoView — the latter would propagate and
    // scroll the outer page viewport too).
    // Use getBoundingClientRect to compute the active tab's offset
    // RELATIVE TO the strip's current scroll position, independent
    // of `offsetParent` (which may not be tabsEl since the strip
    // isn't positioned, leading to offsetLeft pointing at an outer
    // ancestor and a wildly wrong target).
    const activeBtn = tabsEl.querySelector('.turn-tab.active');
    if (activeBtn) {
      const tabsW = tabsEl.clientWidth;
      const stripRect = tabsEl.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      // Active tab's left edge in the strip's content coordinate space.
      const activeLeft = (btnRect.left - stripRect.left) + tabsEl.scrollLeft;
      const target = activeLeft - (tabsW - btnRect.width) / 2;
      const max = tabsEl.scrollWidth - tabsW;
      tabsEl.scrollTo({
        left: Math.max(0, Math.min(target, max)),
        behavior: 'smooth',
      });
    }
  }

  // Helper: find the turn that should "carry" the answer card. Prefer
  // a dedicated `answer_emit` signal turn (the empty trailing turn
  // where the model emitted the final answer text). If none exists,
  // fall back to the last non-empty turn so the answer still trails
  // the construction.
  function answerTurnIdx() {
    if (!data || !data.answer) return -1;
    const turns = data.turns || [];
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].signal === 'answer_emit') return i;
    }
    return lastVisibleTurnIdx();
  }
  function renderAnswerCard(globalIdx) {
    const a = data.answer;
    const li = document.createElement('li');
    li.className = 'tool-step answer-step';
    if (globalIdx != null && globalIdx >= 0) li.dataset.step = String(globalIdx);
    const sameAsChoice = a.choice && String(a.value).trim() === String(a.choice).trim();
    const choiceFrag = (a.choice && !sameAsChoice) ? ' (choice ' + esc(a.choice) + ')' : '';
    li.innerHTML =
      '<span class="step-num">&#10003;</span>' +
      '<code class="step-cmd">ANSWER:<span class="answer-value"> ' +
      esc(a.value) + choiceFrag + '</span></code>';
    return li;
  }

  // Render one normal action step <li>. Extracted so signal-turn
  // views can show the previous turn's steps verbatim followed by
  // the new signal/answer row, conveying "appended onto the prev
  // turn" rather than "view swapped to a fresh list".
  function renderActionStepLi(s, globalIdx) {
    const li = document.createElement('li');
    li.className = 'tool-step' + (s.ok === false ? ' failed' : '');
    li.dataset.step = String(globalIdx);
    li.tabIndex = 0;
    const num = s.ok === false ? '&#x2717;' : String(globalIdx + 1);
    li.innerHTML =
      '<span class="step-num">' + num + '</span>' +
      '<code class="step-cmd">' + esc(s.cmd) + '</code>' +
      '<span class="step-note">' + esc(s.note || '') + '</span>';
    return li;
  }
  function renderSignalRow(turn, globalIdx) {
    const li = document.createElement('li');
    li.className = 'tool-step signal-step signal-' + turn.signal;
    if (globalIdx != null && globalIdx >= 0) li.dataset.step = String(globalIdx);
    const label = turn.signal.replace(/_/g, ' ').toUpperCase();
    li.innerHTML =
      '<span class="step-num">&rarr;</span>' +
      '<code class="step-cmd">' + esc(label) + '</code>';
    return li;
  }

  // ─── Step list for active turn ──────────────────────────────────
  function renderStepList() {
    if (!list) return;
    // Reset scroll BEFORE clearing content. Without this, browsers
    // sometimes retain the previous demo's scrollTop, and the subsequent
    // smooth-scroll-to-center animates from the bottom upward, giving
    // the user a momentary "bottom flash" when switching problems.
    list.scrollTop = 0;
    list.innerHTML = '';
    const turns = data.turns || [];
    const turn = turns[activeTurn];
    if (!turn) return;
    const steps = turn.steps || [];
    const isAnswerTurn = (activeTurn === answerTurnIdx() && data.answer);
    const isSignalTurn = steps.length === 0 && turn.signal;

    if (isSignalTurn) {
      // Empty signal turn → show the PREVIOUS non-empty turn's steps
      // first (carried over as context) and APPEND the signal row at
      // the bottom, so visually it reads as "the previous turn plus
      // this new tail entry" rather than a fresh disjoint view.
      let prevIdx = activeTurn - 1;
      while (prevIdx >= 0 && (turns[prevIdx].steps || []).length === 0) prevIdx--;
      if (prevIdx >= 0) {
        turns[prevIdx].steps.forEach((s, i) => {
          const gi = allSteps.findIndex(x => x.turnIdx === prevIdx && x.stepInTurnIdx === i);
          list.appendChild(renderActionStepLi(s, gi));
        });
      }
      const signalIdx = allSteps.findIndex(x => x.turnIdx === activeTurn && x.isSignal);
      if (turn.signal === 'answer_emit' && data.answer) {
        list.appendChild(renderAnswerCard(signalIdx));
      } else {
        list.appendChild(renderSignalRow(turn, signalIdx));
      }
    } else {
      steps.forEach((s, i) => {
        const gi = allSteps.findIndex(x => x.turnIdx === activeTurn && x.stepInTurnIdx === i);
        list.appendChild(renderActionStepLi(s, gi));
      });
      // Legacy fallback: answer trails the last non-empty turn when
      // no dedicated answer_emit signal turn exists.
      if (isAnswerTurn) list.appendChild(renderAnswerCard());
    }
    bindStepListeners();
    // Force-interrupt any in-flight smooth-scroll animation left over
    // from the previous demo's autoplay. Without this, switching demos
    // while the previous list was mid-scroll lets the old animation
    // finish on the new content — landing the new step 0's list near
    // the bottom (where the old demo had scrolled to). Setting
    // scrollTop directly is the standardized way to cancel a smooth
    // scroll. `scrollTo({behavior: 'instant'})` is also valid but less
    // portable across older browsers.
    list.scrollTop = 0;
  }

  // Track real mouse movement so we can distinguish "user moved the
  // cursor onto a step" from "autoplay scrolled a step under the
  // stationary cursor, firing a spurious mouseenter".
  let lastMouseMove = 0;
  if (list) {
    list.addEventListener('mousemove', () => { lastMouseMove = Date.now(); });
  }
  function bindStepListeners() {
    list.querySelectorAll('.tool-step[data-step]').forEach(el => {
      const idx = parseInt(el.dataset.step, 10);
      // If the user manually navigates to the answer-emit phantom
      // step (by clicking, focusing, or hovering on the answer tab),
      // jump straight to `.revealed` so the answer card is visible
      // immediately. The autoplay-driven path keeps its dramatic
      // thinking → revealed beat (triggered separately in stepNext).
      const manualReveal = () => {
        const meta = allSteps[idx];
        if (meta && meta.isSignal && meta.signal === 'answer_emit') {
          requestAnimationFrame(() => {
            const ans = card.querySelector('.tool-step.answer-step');
            if (ans) { ans.classList.remove('thinking'); ans.classList.add('revealed'); }
          });
        }
      };
      el.addEventListener('mouseenter', () => {
        // Only honor mouseenter if a real mousemove happened within
        // the last 120ms. Otherwise it was the autoplay's smooth
        // scroll moving the row under a stationary cursor (DOM-shift
        // mouseenter), which would otherwise race with autoplay and
        // make the active step jitter between targets.
        if (Date.now() - lastMouseMove > 120) return;
        stopAutoplay(); cancelResume(); hover(idx); manualReveal();
      });
      el.addEventListener('focus',      () => { stopAutoplay(); cancelResume(); showStep(idx); manualReveal(); });
      el.addEventListener('click',      () => { stopAutoplay(); cancelResume(); showStep(idx); manualReveal(); });
    });
  }

  // ─── Native dispatch for GeoGebra render/scripting commands ─────
  // The browser applet's `evalCommand("SetColor(...)", ...)` returns
  // FALSE for scripting commands (SetColor, SetCoordSystem, SetLabel*,
  // SetCaption, SetDecoration, ...) — same gotcha the dev Python
  // pipeline hit. The fix used there is to call the GeoGebra apps API
  // setters natively. We mirror that here, dispatching on the tool's
  // structured `raw.tool` name (preserved by the converter).
  //
  // Without this, GenExam / GeoGoal demos' styling phase (colors,
  // labels, captions, viewport) is silently dropped from the canvas.
  const COLOR_MAP = {
    black: [0,0,0], red: [255,0,0], blue: [0,0,255], green: [0,128,0],
    orange: [255,165,0], purple: [128,0,128], cyan: [0,255,255],
    gray: [128,128,128], brown: [139,69,19], magenta: [255,0,255],
    maroon: [128,0,0], gold: [255,215,0], pink: [255,192,203],
    yellow: [255,255,0], white: [255,255,255],
    'dark blue': [0,0,139], 'dark green': [0,100,0],
    'light gray': [192,192,192], 'dark gray': [64,64,64],
    indigo: [75,0,130], violet: [238,130,238], crimson: [220,20,60],
    lime: [0,255,0], turquoise: [64,224,208], aqua: [0,255,255],
    silver: [192,192,192], 'light blue': [173,216,230],
  };
  const _bool = (v) => (v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true');
  const NATIVE_DISPATCH = {
    render_set_color: (api, a) => {
      const rgb = COLOR_MAP[String(a.color || '').toLowerCase()] || [0, 0, 0];
      api.setColor(a.obj, rgb[0], rgb[1], rgb[2]);
    },
    render_set_line_thickness: (api, a) => api.setLineThickness(a.obj, +a.thickness),
    render_set_line_style:     (api, a) => api.setLineStyle(a.obj, +a.style),
    render_set_point_style:    (api, a) => api.setPointStyle(a.obj, +a.style),
    render_set_point_size:     (api, a) => api.setPointSize(a.obj, +a.size),
    render_set_filling:        (api, a) => api.setFilling(a.obj, +a.opacity),
    render_show_axes:          (api, a) => { const v = _bool(a.visible); api.setAxesVisible(v, v); },
    render_show_grid:          (api, a) => api.setGridVisible(_bool(a.visible)),
    render_set_caption:        (api, a) => {
      try { api.setCaption(a.obj, a.caption); } catch (_) {}
      try { api.setLabelStyle(a.obj, 3); } catch (_) {}      // 3 = Caption
    },
    render_set_label_mode:     (api, a) => {
      try { api.setLabelStyle(a.obj, +a.mode); } catch (_) {}
      try { api.setLabelVisible(a.obj, true); } catch (_) {}
    },
    render_set_coord_system:   (api, a) =>
      // Aspect-correct the model's intended bbox the same way fitViewport
      // does — otherwise a non-1:1 bbox in the square drawing area
      // distorts circles into ellipses.
      applyCoordSystemFitted([a.x_min, a.x_max, a.y_min, a.y_max]),
    render_set_decoration:     (api, a) => {
      // SetDecoration: evalCommand returns false even on success; just
      // run it and trust the result (dev pipeline does the same).
      try { api.evalCommand('SetDecoration(' + a.obj + ', ' + (+a.decoration) + ')'); } catch (_) {}
    },
    // Non-render display tools that also misbehave under evalCommand.
    set_label_visible:         (api, a) => api.setLabelVisible(a.name, _bool(a.visible)),
    set_object_visible:        (api, a) => api.setVisible(a.name, _bool(a.visible)),
    rename_object:             (api, a) => {
      try { api.renameObject(a.old, a.new); }
      catch (_) { try { api.evalCommand('Rename(' + a.old + ', "' + a.new + '")'); } catch (_2) {} }
    },
  };

  function applyStep(api, st) {
    if (!st || st.ok === false || !st.cmd) return false;
    const tool = st.raw && st.raw.tool;
    const fn = tool && NATIVE_DISPATCH[tool];
    if (fn) {
      try { fn(api, st.raw.args || {}); }
      catch (e) { console.warn('native dispatch failed for ' + tool, e); }
      return true;  // signal: this step was a styling/setting call
    }
    try { api.evalCommand(st.cmd); }
    catch (e) { console.warn('evalCommand failed at: ' + st.cmd, e); }
    return false;
  }

  // ─── Step display (active highlight + columns + canvas replay) ──
  function showStep(globalIdx, fromAutoplay) {
    if (globalIdx < 0 || globalIdx >= allSteps.length) return;
    activeGlobalIdx = globalIdx;
    const meta = allSteps[globalIdx];
    if (meta.turnIdx !== activeTurn) switchToTurn(meta.turnIdx);

    // Active highlight + visited dimming WITHIN the current turn list.
    list.querySelectorAll('.tool-step[data-step]').forEach(el => {
      const i = parseInt(el.dataset.step, 10);
      el.classList.toggle('active', i === globalIdx);
      el.classList.toggle('visited', i <= globalIdx);
    });
    // Center the active step VERTICALLY within .tool-list, using
    // getBoundingClientRect for the active row's position relative to
    // the list's CURRENT scroll origin. `offsetTop` is unreliable
    // here because the list isn't `position: relative` — its
    // offsetParent climbs out to .demo-card, so `activeEl.offsetTop`
    // can include hundreds of px of banner/header height above the
    // list, and the centering math produces a target that clamps to
    // max → looks like a one-step jump to the bottom.
    const activeEl = list.querySelector('.tool-step.active');
    if (activeEl) {
      const listRect   = list.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      const aTopInList = (activeRect.top - listRect.top) + list.scrollTop;
      const listH = list.clientHeight;
      const target = aTopInList - (listH - activeRect.height) / 2;
      const max = list.scrollHeight - listH;
      const next = Math.max(0, Math.min(target, max));
      if (next !== list.scrollTop) {
        list.scrollTo({ top: next, behavior: 'smooth' });
      }
    }

    if (rawEl)  rawEl.innerHTML  = renderRaw(globalIdx);
    if (diffEl) diffEl.innerHTML = renderDiff(globalIdx);

    // Phantom signal steps (CONSTRUCTION_DONE / RENDER_DONE / answer_emit)
    // have no engine action — keep whatever the canvas was showing at
    // the previous step. Don't touch renderedStep either, so when we
    // step forward to a real action again, the rebuild correctly
    // re-runs from scratch.
    if (meta && meta.isSignal) return;

    if (!ggbApi || globalIdx === renderedStep) return;
    renderedStep = globalIdx;
    try {
      ggbApi.reset();
      // Default canvas = clean white paper. The trajectory can turn
      // axes / grid back on explicitly via `render_show_axes` /
      // `render_show_grid` (mapped through NATIVE_DISPATCH). GenExam
      // render trajectories typically do call them when they want the
      // axes for an analytic-geometry plot.
      ggbApi.setAxesVisible(false, false);
      ggbApi.setGridVisible(false);
      // Replay ALL ok-true commands. ok-false steps, styling commands
      // (render_*, set_label_visible, ...), and phantom signal entries
      // go through applyStep — which (a) dispatches scripting commands
      // to the native GGB API (evalCommand returns false for those),
      // and (b) skips phantom signals entirely.
      let modelSetCoord = false;
      for (let i = 0; i <= globalIdx; i++) {
        const st = allSteps[i];
        if (!st || st.ok === false || st.isSignal) continue;
        applyStep(ggbApi, st);
        if (st.raw && st.raw.tool === 'render_set_coord_system') modelSetCoord = true;
      }
      // Only fit to the demo's natural viewport when the model didn't
      // already pick its own. For GenExam render trajectories the
      // model's final `SetCoordSystem` is the intended camera — don't
      // overwrite it with our aspect-corrected default.
      if (!modelSetCoord) fitViewport();
    } catch (e) { console.warn('Canvas replay failed:', e); }
  }

  // ─── Viewport / aspect handling ─────────────────────────────────
  function getCanvasDims() {
    const wrap = document.querySelector('.canvas-wrap');
    return { W: (wrap && wrap.clientWidth) || 1024, H: (wrap && wrap.clientHeight) || 480 };
  }
  const DEFAULT_GRAPHICS_WIDTH_RATIO = 0.590;
  /* Aspect-correct a TARGET bbox (xmin, xmax, ymin, ymax) so that
     1 x-unit = 1 y-unit in pixels (circles stay circular). Caller's
     bbox is a hint; we expand whichever axis needs growing to match
     the drawing area's aspect. Used by BOTH the initial fitViewport
     (for data.viewport) AND the trajectory's render_set_coord_system
     dispatch — without this, a model command like
     `SetCoordSystem(-7, 7, -6, 6)` (aspect 14:12) crammed into the
     square drawing area would stretch y and squash circles. */
  function applyCoordSystemFitted(v) {
    if (!ggbApi || !v || v.length < 4) return;
    // Prefer GGB's own reported graphics-view pixel size — way more
    // accurate than estimating `wrap_w × DEFAULT_GRAPHICS_WIDTH_RATIO`,
    // which can be off by a few % when the algebra panel doesn't
    // happen to land exactly at 38.5% of the wrap width.
    let drawingW = 0, drawingH = 0;
    if (typeof ggbApi.getGraphicsViewWidth === 'function') {
      try { drawingW = ggbApi.getGraphicsViewWidth(1) || 0; } catch (_) {}
    }
    if (typeof ggbApi.getGraphicsViewHeight === 'function') {
      try { drawingH = ggbApi.getGraphicsViewHeight(1) || 0; } catch (_) {}
    }
    if (!drawingW || !drawingH) {
      const { W, H } = getCanvasDims();
      const r = (data && data.graphics_ratio) || DEFAULT_GRAPHICS_WIDTH_RATIO;
      drawingW = W * r; drawingH = H;
    }
    const displayAspect = drawingW / drawingH;
    const tXR = +v[1] - +v[0], tYR = +v[3] - +v[2];
    const tAspect = tXR / tYR;
    let xmin, xmax, ymin, ymax;
    if (displayAspect > tAspect) {
      const newXR = tYR * displayAspect, xC = (+v[0] + +v[1]) / 2;
      xmin = xC - newXR / 2; xmax = xC + newXR / 2; ymin = +v[2]; ymax = +v[3];
    } else {
      const newYR = tXR / displayAspect, yC = (+v[2] + +v[3]) / 2;
      ymin = yC - newYR / 2; ymax = yC + newYR / 2; xmin = +v[0]; xmax = +v[1];
    }
    ggbApi.setCoordSystem(xmin, xmax, ymin, ymax);
    setTimeout(() => rebalanceAxes('post-fit'), 60);
  }
  function fitViewport() {
    if (!ggbApi || !data) return;
    applyCoordSystemFitted(data.viewport || [-10, 10, -10, 10]);
  }
  function rebalanceAxes() {
    if (!ggbApi || typeof ggbApi.getXscale !== 'function') return;
    const xs = ggbApi.getXscale(), ys = ggbApi.getYscale();
    if (!xs || !ys || Math.abs(xs - ys) < 0.005) return;
    const xmin = ggbApi.getXmin(), xmax = ggbApi.getXmax();
    const ymin = ggbApi.getYmin(), ymax = ggbApi.getYmax();
    if (xs > ys) {
      const f = xs / ys, xC = (xmin + xmax) / 2, span = (xmax - xmin) * f;
      ggbApi.setCoordSystem(xC - span / 2, xC + span / 2, ymin, ymax);
    } else {
      const f = ys / xs, yC = (ymin + ymax) / 2, span = (ymax - ymin) * f;
      ggbApi.setCoordSystem(xmin, xmax, yC - span / 2, yC + span / 2);
    }
  }
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!ggbApi) return;
      const { W, H } = getCanvasDims();
      if (typeof ggbApi.setSize === 'function') ggbApi.setSize(W, H);
      fitViewport();
    }, 120);
  });

  // ─── Autoplay state machine (now traverses ALL turns) ───────────
  let autoplayTimer = null;
  let autoplayActive = false;
  let answerEl = null;

  function clearAnswerState() { if (answerEl) answerEl.classList.remove('thinking', 'revealed'); }
  function stepPace(idx) {
    // Slow down slightly when crossing a turn boundary so the tab
    // switch + step-list rerender don't feel like a jitter. Phantom
    // signal steps get an extra-long pause so the user has time to
    // register the phase change.
    if (idx === 0) return 600;
    const prev = allSteps[idx - 1], cur = allSteps[idx];
    if (cur && cur.isSignal) return 1600;
    if (prev && cur && prev.turnIdx !== cur.turnIdx) return 1400;
    return 850;
  }
  function stepNext(idx) {
    if (!autoplayActive) return;
    showStep(idx);
    if (idx < allSteps.length - 1) {
      autoplayTimer = setTimeout(() => stepNext(idx + 1), stepPace(idx + 1));
      return;
    }
    // Final step shown → thinking pulse → reveal → loop.
    autoplayTimer = setTimeout(() => {
      if (!autoplayActive) return;
      answerEl = card.querySelector('.tool-step.answer-step');
      if (answerEl) answerEl.classList.add('thinking');
      autoplayTimer = setTimeout(() => {
        if (!autoplayActive) return;
        if (answerEl) { answerEl.classList.remove('thinking'); answerEl.classList.add('revealed'); }
        autoplayTimer = setTimeout(() => {
          if (!autoplayActive) return;
          clearAnswerState();
          // Loop back to turn 0 step 0.
          stepNext(0);
        }, 3000);
      }, 1000);
    }, 1000);
  }
  function startAutoplay(fromIdx) {
    if (autoplayActive) return;
    autoplayActive = true;
    clearAnswerState();
    // Default: restart from step 0 (initial load / loop wrap).
    // When called from `scheduleResume` after the user paused via
    // hover/click, `fromIdx` is the last step the cursor visited so
    // autoplay resumes there instead of jumping back to the top.
    const idx = (typeof fromIdx === 'number' && fromIdx >= 0 && fromIdx < allSteps.length)
      ? fromIdx : 0;
    stepNext(idx);
  }
  function stopAutoplay() {
    autoplayActive = false;
    if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
    clearAnswerState();
  }

  let resumeTimer;
  function scheduleResume() {
    clearTimeout(resumeTimer);
    // Resume from wherever the user left off (the last hover/click step
    // is tracked in `activeGlobalIdx` by showStep).
    resumeTimer = setTimeout(() => startAutoplay(activeGlobalIdx), 1500);
  }
  function cancelResume() { clearTimeout(resumeTimer); }
  let hoverTimer;
  function hover(idx) { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => showStep(idx), 80); }

  // ─── Demo loading + bench/problem selector ──────────────────────
  function flattenTurns() {
    allSteps = [];
    let g = 0;
    // Backward-compat: wrap legacy flat `steps[]` into a single turn.
    if (!data.turns && Array.isArray(data.steps)) {
      data.turns = [{ index: 1, summary: data.steps.length + ' ok', steps: data.steps }];
    }
    (data.turns || []).forEach((t, ti) => {
      const steps = t.steps || [];
      if (steps.length === 0) {
        // Empty turn → emit a phantom "signal" entry so autoplay's
        // sliding active highlight still visits it. The phantom has
        // no cmd, no diff, and is skipped during canvas replay; it
        // exists purely to drive the tab activation + a brief beat in
        // the step-list view. The tab itself stays user-disabled
        // (renderTurnTabs adds the `disabled` attribute).
        allSteps.push({
          raw: null, cmd: '', ok: true, diff: [], note: '',
          turnIdx: ti, stepInTurnIdx: 0, globalIdx: g++,
          isSignal: true, signal: t.signal || 'phase',
          phase: t.phase || '',
        });
      } else {
        steps.forEach((s, si) => {
          allSteps.push(Object.assign({}, s, {
            turnIdx: ti, stepInTurnIdx: si, globalIdx: g++,
          }));
        });
      }
    });
  }

  async function loadDemo(demoId) {
    stopAutoplay(); cancelResume();
    try {
      const res = await fetch('assets/demos/' + demoId + '.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (err) {
      console.error('Demo JSON load failed:', err);
      return;
    }
    flattenTurns();
    renderedStep = -1;
    renderBanner();
    renderTurnTabs();
    // Start at the FIRST visible (non-empty) turn — a demo can begin
    // with an empty "thinking" turn that has 0 steps.
    const visible = nonEmptyTurnIndices();
    activeTurn = visible.length ? visible[0] : 0;
    switchToTurn(activeTurn);
    const firstGlobal = allSteps.findIndex(s => s.turnIdx === activeTurn);
    showStep(firstGlobal >= 0 ? firstGlobal : 0);
    // Unconditional reset on every demo switch — guarantees the new
    // demo opens with step 1 anchored at the top of .tool-list (so
    // PGPS opens showing steps 1–6, not the previous demo's scroll
    // position bleed-over). Re-fired in rAF too so any focus-event /
    // browser scroll-restoration that lands after the synchronous
    // path gets overridden.
    if (list) {
      list.scrollTop = 0;
      requestAnimationFrame(() => { list.scrollTop = 0; });
    }
    if (ggbApi) startAutoplay();
  }

  function bindSelector() {
    if (!selectorEl) return;
    selectorEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-demo-id]');
      if (!btn) return;
      selectorEl.querySelectorAll('[data-demo-id]').forEach(b =>
        b.classList.toggle('active', b === btn));
      loadDemo(btn.dataset.demoId);
    });
  }

  // Resume autoplay only when leaving the Engine command column.
  const toolsCol = card.querySelector('.col-tools');
  if (toolsCol) {
    toolsCol.addEventListener('mouseleave', scheduleResume);
    toolsCol.addEventListener('mouseenter', cancelResume);
  }

  // ─── Bootstrap ──────────────────────────────────────────────────
  bindSelector();
  const initBtn = selectorEl && (selectorEl.querySelector('.active[data-demo-id]') ||
                                  selectorEl.querySelector('[data-demo-id]'));
  const initId = (initBtn && initBtn.dataset.demoId) || card.dataset.demo || 'geometry3k_2103';
  if (initBtn) initBtn.classList.add('active');

  loadDemo(initId).then(() => {
    if (typeof GGBApplet === 'undefined') {
      console.warn('GGBApplet not loaded; canvas will stay blank.');
      return;
    }
    // Defer applet creation until .canvas-wrap is actually visible.
    // When the page loads with #focus=paradigms, body.focus-paradigms
    // hides #demo via display:none, so wrap.clientWidth/Height are 0.
    // Initializing GGB at 0×0 traps the applet at its 1024×480
    // fallback — even after focus exits, the canvas renders with the
    // wrong aspect because the internal scaling is locked from init.
    // Instead we WAIT for the wrap to have real dims (focus exit
    // restores #demo's display) before injecting the applet.
    const wrapEl = document.querySelector('.canvas-wrap');
    let injected = false;
    function tryInjectApplet() {
      if (injected) return;
      const W = wrapEl ? wrapEl.clientWidth : 0;
      const H = wrapEl ? wrapEl.clientHeight : 0;
      if (!W || !H) return;
      injected = true;
      const applet = new GGBApplet({
        appName: 'classic',
        width: W, height: H,
        showToolBar: false, showAlgebraInput: false, showMenuBar: false,
        showResetIcon: false, enableLabelDrags: false, enableShiftDragZoom: false,
        enableRightClick: false, showZoomButtons: false, showFullscreenButton: false,
        preventFocus: false,
        appletOnLoad: function (api) {
          ggbApi = api;
          renderedStep = -1;
          requestAnimationFrame(() => requestAnimationFrame(() => { startAutoplay(); }));
        },
      }, true);
      if (document.readyState === 'complete') applet.inject('ggb-applet');
      else window.addEventListener('load', () => applet.inject('ggb-applet'));
    }
    tryInjectApplet();   // try immediately (Case A: page loaded outside focus)
    if (!injected && wrapEl && typeof ResizeObserver !== 'undefined') {
      // Case B: deferred — applet inits the moment focus exit makes the
      // wrap visible with real dims.
      const ro = new ResizeObserver(() => {
        tryInjectApplet();
        if (injected) ro.disconnect();
      });
      ro.observe(wrapEl);
    }
  });
})();
