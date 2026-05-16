// <textual-flow> web component — col 2 (Textual Traces) hover-driven
// animation. Encapsulated in Shadow DOM (like visual-flow / d2t-diagram).
//
// Structure: 3 big blocks total:
//   1. VLM / LLM      (top)
//   2. Reasoning trace block (the 4 trace lines stack inside it)
//      + a dashed self-reflect arrow looped around its RIGHT side.
//   3. Answer         (bottom)
// 2 short ↓ arrows in between, hugging the block borders.
//
// On hover: a flow streak descends ↓ arrow 1, the dashed feedback
// loop pulses, then the flow descends ↓ arrow 2 to the Answer.
// On mouseleave: every animation halts.
(function () {
  if (window.customElements && window.customElements.get('textual-flow')) return;

  const TEMPLATE = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    flex: 1;
    position: relative;
    /* Right padding pulls the trace block's right border leftward,
       leaving room for the dashed feedback loop to sit OUTSIDE the
       block's right edge without overflowing the host. Reduced by
       1px so trace-block right edge (and the loop + dash arrow that
       follow it) shifts +1 px right. */
    padding-right: 7px;
    padding-left: 3px;
    gap: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #15181c;
    --p-accent: #5c1f0a;
    --p-doubt:  #b45309;
    --p-ok:     #16a34a;
  }
  .flow-node {
    align-self: stretch;
    box-sizing: border-box;
    padding: 6px 10px;
    background: #fff;
    border: 1.4px solid rgba(92, 31, 10, 0.32);
    border-radius: 5px;
    font-size: 0.74rem;
    line-height: 1.2;
    font-weight: 600;
    color: #15181c;
    text-align: center;
    position: relative;
  }
  /* VLM block — flex COLUMN: brain icon stacked on top of the
     "VLM / LLM" label. Width 50% of host (vs default stretch),
     centered, so both side borders shrink toward the middle.
     position: relative so the .vlm-orbit child can anchor to it. */
  .vlm-node {
    position: relative;
    align-self: center;
    width: 60%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  /* VLM-block orbit — current session at the very start of the
     cycle, before the first character streams. Lights up together
     with a1 flow streak, then hands off to trace-orbit once the
     trace-block becomes the current session. Wired identically to
     .answer-orbit (JS toggles .run). */
  .vlm-orbit {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .vlm-orbit rect {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.6;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 13 87;
    stroke-dashoffset: 0;
    filter: drop-shadow(0 0 1.5px var(--p-accent));
  }
  .vlm-orbit.run .orbit-cw  {
    animation: trace-orbit-cw  1.2s linear infinite,
               trace-orbit-fade 0.2s linear forwards;
  }
  .vlm-orbit.run .orbit-ccw {
    animation: trace-orbit-ccw 1.2s linear infinite,
               trace-orbit-fade 0.2s linear forwards;
  }
  .brain-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }
  .brain-icon path {
    fill: none;
    stroke: #15181c;
    stroke-width: 1.3;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .brain-icon .fold {
    stroke-width: 1;
    opacity: 0.55;
  }
  /* Reasoning trace block — 4 lines stacked inside one box.
     flex: 1 still absorbs the extra vertical space inside the host
     (so the Answer block remains aligned horizontally with col 1's
     "Feedback / revise"), but justify-content: flex-start now packs
     the 4 chats at the TOP of the block, leaving any extra space at
     the bottom. Font size synced with col 1's "rendered bitmap"
     caption (0.6rem). */
  .trace-block {
    text-align: left;
    font-weight: 500;
    font-size: 0.58rem;
    padding: 11px 9px 4px 9px;   /* top trimmed 1px (was 12) — tighter
                                    space above the "Textual trace"
                                    title; rest of padding unchanged. */
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 7px;                    /* wider gap between chat messages */
    flex: 1;
    position: relative;          /* anchor for the .feedback-loop child */
  }
  /* Title above the 4 trace lines, sized to match the flow-node
     label font (0.72rem / 600). */
  .trace-title {
    font-size: 0.74rem;
    font-weight: 600;
    color: #15181c;
    text-align: center;
    margin-bottom: 2px;
  }
  /* Each trace line is its OWN wrapped sub-block — bordered,
     padded, with a light tint. They stack inside the outer
     .trace-block container. clip-path defaults to fully visible;
     during hover each line gets a sequenced keyframe that reveals
     it left-to-right via clip-path inset(0 100% 0 0) → (0 0% 0 0),
     with steps() timing to mimic LLM token-by-token streaming. */
  .trace-line {
    white-space: normal;
    padding: 6px 6px;            /* vertical breathing room — text not flush against top/bottom edges */
    border: 1px solid rgba(92, 31, 10, 0.25);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.7);
  }
  /* Progressive reveal: while hovering, every line is hidden by default
     and only fades in once JS adds .revealed at the start of its
     streamLine() call. Idle state (no hover) leaves all 4 lines fully
     visible — these rules are scoped to :host(.hover-active). */
  :host(.hover-active) .trace-line {
    opacity: 0;
    transform: translateY(-3px);
    transition: opacity 0.25s ease, transform 0.25s ease;
  }
  :host(.hover-active) .trace-line.revealed {
    opacity: 1;
    transform: translateY(0);
  }
  /* While a line is mid-streaming, append a blinking block cursor
     after the visible text. */
  .trace-line.streaming::after {
    content: '▍';
    margin-left: 1px;
    animation: cursor-blink 0.55s step-end infinite;
  }
  @keyframes cursor-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }
  .trace-doubt {
    color: var(--p-doubt);
    font-style: italic;
    border-color: rgba(180, 83, 9, 0.32);
    background: rgba(180, 83, 9, 0.05);
  }
  /* Answer block — green accent by default, ✓/✗ tag appears only
     when the a2 flow arrives. The block flips to a red accent when
     the random roll picks "wrong". position: relative so the
     .answer-orbit child can anchor. */
  .answer-node {
    position: relative;
    background: rgba(22,163,74,0.07);
    border-color: rgba(22,163,74,0.35);
    color: #15803d;
    /* 3-column grid: 1fr | Answer | 1fr.
       Answer (column 2, width auto) sits at the geometric center
       of the content box, so it aligns with the arrow above no
       matter what's on the sides. Brackets justify-end / start
       in the side columns to hug Answer tightly. */
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: 2px;
  }
  /* Brackets + marks share the SAME grid cells (col 1 left, col 3
     right), all at row 1 — so a ✓ stacks exactly on top of <box>
     and a ✗ stacks exactly on top of </box>. justify-self end/start
     pins them to Answer's edges (NOT the block edges), so they hug
     "Answer" tightly. */
  .answer-bracket.open,
  .answer-mark.correct { grid-column: 1; grid-row: 1; justify-self: end; }
  .answer-label         { grid-column: 2; grid-row: 1; }
  .answer-bracket.close,
  .answer-mark.wrong    { grid-column: 3; grid-row: 1; justify-self: start; }
  /* Wrong-result variant: red accent on bg/border/text/orbit. */
  .answer-node.wrong-result {
    background: rgba(185, 28, 28, 0.07);
    border-color: rgba(185, 28, 28, 0.35);
    color: #b91c1c;
  }
  .answer-node.wrong-result .answer-orbit rect {
    stroke: #b91c1c;
    filter: drop-shadow(0 0 1.5px #b91c1c);
  }
  /* XML-ish brackets around the answer — sit INLINE in the flex
     flow, hugging "Answer" on both sides. They're symmetric so
     they don't shift Answer's center; lighter weight + mono font
     reads as a code-style wrapper, not a heavy label. */
  .answer-bracket {
    color: var(--p-accent);
    font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    font-size: 0.62rem;
    font-weight: 400;
    letter-spacing: -0.01em;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }
  .answer-node.wrong-result .answer-bracket {
    color: #b91c1c;
  }
  .answer-node.show-box .answer-bracket {
    opacity: 0.65;
  }
  /* Answer text — visible by default (idle / not hovering). When
     hover starts it fades OUT during the a1 + streaming phases,
     then fades back IN once a2 arrives and STAYS visible through
     the whole Phase C (box → extract → mark). Gated by the
     .answer-active class (set from Phase C start until cycle
     restart) rather than .show-box, so the brief beat between
     brackets fading out and mark fading in doesn't blink Answer. */
  .answer-label {
    opacity: 1;
    transition: opacity 0.2s ease;
  }
  :host(.hover-active) .answer-label                       { opacity: 0; }
  :host(.hover-active) .answer-node.answer-active .answer-label { opacity: 1; }
  /* Border orbit on the Answer block — same wiring as .vlm-orbit
     but uses the green answer accent for stroke + glow. */
  .answer-orbit {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .answer-orbit rect {
    fill: none;
    stroke: var(--p-ok);
    stroke-width: 1.6;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 13 87;
    stroke-dashoffset: 0;
    filter: drop-shadow(0 0 1.5px var(--p-ok));
  }
  .answer-orbit.run .orbit-cw  {
    animation: trace-orbit-cw  1.2s linear infinite,
               trace-orbit-fade 0.2s linear forwards;
  }
  .answer-orbit.run .orbit-ccw {
    animation: trace-orbit-ccw 1.2s linear infinite,
               trace-orbit-fade 0.2s linear forwards;
  }
  /* ✓/✗ marks — grid-positioned in the SAME cells as the brackets
     (col 1 / col 3, row 1) and justify-aligned to Answer's edges
     above. So during cycle they appear in the exact slot the
     brackets vacated, tight to Answer rather than at the block
     edges. One random roll decides per cycle: ✓ (left, 60%) or
     ✗ (right, 40%). */
  .answer-mark {
    font-weight: 700;
    font-size: 0.82rem;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }
  .answer-mark.correct { color: var(--p-ok); }
  .answer-mark.wrong   { color: #b91c1c; }
  .answer-node.show-correct .answer-mark.correct { opacity: 1; }
  .answer-node.show-wrong   .answer-mark.wrong   { opacity: 1; }

  /* Down arrows (2) — tight against blocks, same negative-margin
     trick as visual-flow's arrows. */
  .arrow {
    display: block;
    align-self: center;
    overflow: visible;
    margin-top: -3px;
    margin-bottom: -3px;
  }
  .arrow line, .arrow polyline {
    stroke: var(--p-accent);
    stroke-width: 1.4;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .arrow .flow {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-dasharray: 14 86;
    stroke-dashoffset: 0;
    opacity: 0;
    filter: drop-shadow(0 0 1.5px var(--p-accent));
  }

  /* Dashed self-reflect arrow — sits OUTSIDE the trace block's
     right border (right: -10 pushes it past), spanning from between
     "But" and "No" (lower 3rd) UP to "Add" (top line). preserveAspect
     none on the SVG lets the path stretch vertically to whatever
     height the percentage offsets resolve to at runtime. */
  .feedback-loop {
    position: absolute;
    right: -19px;              /* loop right pushes well past the
                                  trace-block edge — overflows host
                                  padding so the bow tip can extend
                                  much further outward. */
    top: 50px;                 /* shifted DOWN another 5px (38 → 43) */
    bottom: -4px;               /* matched: bottom shrunk 5px (6 → 1) */
    width: 32px;               /* wide enough for a deep bow with
                                  ~NE/NW exit & entry tangents. */
    pointer-events: none;
    overflow: visible;
  }
  .feedback-loop path {
    stroke: var(--p-accent);
    stroke-width: 1.5;          /* thicker so the dashed line reads */
    fill: none;
    stroke-dasharray: 2 5;       /* sparser dashes — short on, long off */
    stroke-linecap: round;
    opacity: 0.65;
  }
  .feedback-loop polyline {
    stroke: var(--p-accent);
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.65;
  }

  /* Orbit overlay around the trace block — same idea as col 1's
     rendered-bitmap orbit. Two perimeter rects animate their
     stroke-dashoffset (one CW, one CCW) so two flow pulses race
     around the rounded-rectangle border simultaneously. */
  .trace-orbit {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .trace-orbit rect {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.6;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 13 87;     /* shorter ribbon — 2 still read as 2 */
    stroke-dashoffset: 0;
    /* Soft halo around the stroke — reads as a glow, not a sharp
       outline. */
    filter: drop-shadow(0 0 0.8px var(--p-accent));
  }

  /* ─── Hover animations ──────────────────────────────────────────
     6s cycle. Phase split:
       0–14%   flow streak on arrow 1 (VLM → trace block)
      14–80%   feedback loop pulses (subtle opacity beat) while the
               trace block is "thinking"
      80–94%   flow streak on arrow 2 (trace → Answer)
      94–100%  hold / answer settles
  */
  /* Arrow flow streaks are JS-triggered (.run class) so they run
     in lockstep with the streaming text — a2 only fires AFTER the
     4 trace lines have finished streaming. */
  .arrow .flow.run { animation: flow-once 0.8s linear forwards; }
  /* While the 4 trace lines are being typed out, a1's flow keeps
     looping so the "VLM/LLM → Textual trace" pipe reads as actively
     feeding tokens (rather than going dim mid-stream). */
  .arrow.a1 .flow.streaming {
    opacity: 1;
    animation: flow-loop 0.9s linear infinite;
  }
  @keyframes flow-loop {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: -100; }
  }
  /* Feedback loop's DASHED path flows along its tangent during
     hover — no more opacity blink. Period = dasharray total (2+5=7);
     one period per 0.9s ≈ steady leftward "marching dashes". */
  :host(.hover-active) .feedback-loop path {
    animation: fb-flow 0.9s linear infinite;
  }
  /* Two simultaneous orbit pulses around the trace block border.
     Now JS-gated (.run) instead of CSS :host(:hover): the orbit
     pauses during the a1 phase (VLM is current session) and during
     the a2 + Answer phase (Answer is current session), and only
     runs while the 4 trace lines are streaming. */
  .trace-orbit.run .orbit-cw  {
    animation: trace-orbit-cw  1.6s linear infinite,
               trace-orbit-fade 0.3s linear forwards;
  }
  .trace-orbit.run .orbit-ccw {
    animation: trace-orbit-ccw 1.6s linear infinite,
               trace-orbit-fade 0.3s linear forwards;
  }
  /* Per-line streaming text is driven by JS (mouseenter/mouseleave
     hooks update each .trace-line's textContent character by
     character). The .streaming class triggers a CSS blinking
     cursor (above) at the end of the in-progress line. */

  @keyframes flow-once {
    0%   { stroke-dashoffset: 0;    opacity: 1; }
    85%  { stroke-dashoffset: -100; opacity: 1; }
    100% { stroke-dashoffset: -100; opacity: 0; }
  }
  @keyframes fb-flow      { to { stroke-dashoffset: -7; } }
  @keyframes trace-orbit-cw  { to { stroke-dashoffset: -100; } }
  @keyframes trace-orbit-ccw { to { stroke-dashoffset:  100; } }
  @keyframes trace-orbit-fade {
    from { opacity: 0; }
    to   { opacity: 0.2; }     /* dim — doesn't compete with primary palette */
  }

  @media (prefers-reduced-motion: reduce) {
    :host(.hover-active) .arrow .flow,
    :host(.hover-active) .feedback-loop { animation: none; }
  }
</style>

<div class="flow-node vlm-node">
  <svg class="brain-icon" viewBox="0 0 22 22" aria-hidden="true">
    <!-- Brain silhouette: two hemispheres joined down the middle,
         with a couple of fold grooves on each side. -->
    <path d="M 11 3
             Q 7 3 6.5 5.5
             Q 3 5.5 3 9.5
             Q 2 12 3.5 14
             Q 3.5 17 7 17.2
             Q 8.5 19 11 19
             Q 13.5 19 15 17.2
             Q 18.5 17 18.5 14
             Q 20 12 19 9.5
             Q 19 5.5 15.5 5.5
             Q 15 3 11 3 Z"/>
    <!-- Center groove -->
    <path class="fold" d="M 11 4 V 18"/>
    <!-- Left lobe folds -->
    <path class="fold" d="M 6 9 Q 8.5 10 7.5 12"/>
    <path class="fold" d="M 5 14 Q 7 13 8 15"/>
    <!-- Right lobe folds (mirrored) -->
    <path class="fold" d="M 16 9 Q 13.5 10 14.5 12"/>
    <path class="fold" d="M 17 14 Q 15 13 14 15"/>
  </svg>
  <span>VLM / LLM</span>
  <!-- Border orbit — JS toggles .run during the a1 phase so the VLM
       block + a1 arrow light up together as the current session. -->
  <svg class="vlm-orbit" aria-hidden="true">
    <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="3.7" ry="3.7" pathLength="100"/>
    <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="3.7" ry="3.7" pathLength="100"/>
  </svg>
</div>

<svg class="arrow a1" width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
  <line x1="6" y1="0" x2="6" y2="20"/>
  <polyline points="3 13 6 20 9 13"/>
  <line class="flow" pathLength="100" x1="6" y1="0" x2="6" y2="20"/>
</svg>

<div class="flow-node trace-block">
  <div class="trace-title">Textual trace</div>
  <div class="trace-line expand">Add an auxiliary line BD …</div>
  <div class="trace-line">&lt;|reflect|&gt; make it perpendicular to BC …</div>
  <div class="trace-line trace-doubt">But wait, the intersect P …</div>
  <div class="trace-line trace-doubt">No, the angle should be …</div>
  <!-- Orbit overlay around the trace block's rounded border. No
       viewBox so the SVG uses CSS pixel coordinates directly,
       letting rect's rx/ry match the block's actual border radius
       without nonuniform stretching. -->
  <svg class="trace-orbit" aria-hidden="true">
    <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="3.7" ry="3.7" pathLength="100"/>
    <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="3.7" ry="3.7" pathLength="100"/>
  </svg>
  <!-- Dashed self-reflect arrow. viewBox 0 0 32 100, 1:1 with
       CSS width so the geometry stays predictable. Endpoints at
       x=10 sit on the trace-block right edge; Q control at (30, 50)
       pushes the bow far out (NE ~36° exit, NW ~36° entry in CSS).
       Arrowhead oriented along the control→end tangent (-20,-45). -->
  <svg class="feedback-loop" viewBox="0 0 32 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M 10 95 Q 30 50 10 5"/>
    <polyline points="13 7.5 10 5 10.6 10.5"/>
  </svg>
</div>

<svg class="arrow a2" width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
  <line x1="6" y1="0" x2="6" y2="20"/>
  <polyline points="3 13 6 20 9 13"/>
  <line class="flow" pathLength="100" x1="6" y1="0" x2="6" y2="20"/>
</svg>

<div class="flow-node answer-node">
  <!-- Brackets + ✓/✗ tag are hidden until a2 flow arrives. The JS
       roll picks 60% ✓ (green) vs 40% ✗ (red) per cycle; the
       <box>…</box> wrappers fade in first, then fade out (the
       "extracted" beat) leaving just the tag + label. -->
  <!-- Brackets show first (extract phase), then fade out; ✓ or ✗
       fades in afterward on one side only (random per cycle).
       Answer's flex position never shifts. -->
  <span class="answer-bracket open">&lt;box&gt;</span>
  <span class="answer-mark correct">&#10003;</span>
  <span class="answer-label">Answer</span>
  <span class="answer-mark wrong">&#10007;</span>
  <span class="answer-bracket close">&lt;/box&gt;</span>
  <!-- Border orbit — JS toggles .run when a2Flow plays. -->
  <svg class="answer-orbit" aria-hidden="true">
    <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="3.7" ry="3.7" pathLength="100"/>
    <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="3.7" ry="3.7" pathLength="100"/>
  </svg>
</div>
`;

  class TextualFlow extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = TEMPLATE;

      // ── LLM-style char-by-char streaming on hover ──────────────
      const lines = root.querySelectorAll('.trace-line');
      const fullTexts = Array.from(lines).map(l => l.textContent);
      const a1Flow = root.querySelector('.arrow.a1 .flow');
      const a2Flow = root.querySelector('.arrow.a2 .flow');
      const vlmOrbit    = root.querySelector('.vlm-orbit');
      const traceOrbit  = root.querySelector('.trace-orbit');
      const answerOrbit = root.querySelector('.answer-orbit');
      const answerNode  = root.querySelector('.answer-node');
      const BOX_SHOW_MS    = 850;   // brackets visible time before extract
      const EXTRACT_GAP    = 200;   // beat between brackets fading out and mark fading in
      const CORRECT_PR     = 0.6;   // 60% ✓ correct, 40% ✗ wrong
      const ANSWER_CLASSES = ['answer-active', 'show-box', 'show-correct', 'show-wrong', 'wrong-result'];
      const resetAnswer = () => {
        if (!answerNode) return;
        ANSWER_CLASSES.forEach(c => answerNode.classList.remove(c));
      };
      const CHAR_MS    = 50;     // base ms per character (~20 chars/sec)
      const WORD_PAUSE = 130;    // extra ms after a space (token boundary)
      const LINE_PAUSE = 350;    // pause before next line starts
      const CYCLE_PAUSE = 1200;  // hold time after all 4 lines done
      const ARROW_MS   = 800;    // flow-once animation duration
      const A1_TO_TRACE = 150;   // brief beat between a1 flow and line 1
      const TRACE_TO_A2 = 250;   // brief beat between line 4 and a2 flow
      let timer = null;
      let active = false;

      const clearAll = () => {
        lines.forEach(l => {
          l.textContent = '';
          l.classList.remove('streaming');
          l.classList.remove('revealed');   // hide again at cycle start; streamLine re-adds per box
        });
      };
      const fillAll = () => {
        lines.forEach((l, i) => {
          l.textContent = fullTexts[i];
          l.classList.remove('streaming');
        });
      };
      // Replay a one-shot CSS keyframe by removing+re-adding .run
      // (with a forced reflow in between so the animation restarts
      // even if the class was already present).
      const playFlow = (el) => {
        if (!el) return;
        el.classList.remove('run');
        void el.offsetWidth;
        el.classList.add('run');
      };

      const streamLine = (idx, onDone) => {
        if (!active) return;
        const el = lines[idx];
        const full = fullTexts[idx];
        let i = 0;
        el.textContent = '';
        el.classList.add('revealed');       // fade this box in just as its text begins streaming
        el.classList.add('streaming');
        const tick = () => {
          if (!active) return;
          if (i <= full.length) {
            el.textContent = full.slice(0, i);
            // Extra pause AFTER a space (word boundary) so the
            // streaming reads as token-by-token, not just char-by-char.
            const lastChar = full[i - 1] || '';
            const delay = (lastChar === ' ') ? CHAR_MS + WORD_PAUSE : CHAR_MS;
            i += 1;
            timer = setTimeout(tick, delay);
          } else {
            el.classList.remove('streaming');
            timer = setTimeout(onDone, LINE_PAUSE);
          }
        };
        tick();
      };

      const cycle = () => {
        if (!active) return;
        clearAll();
        // Reset all orbits + answer-block state at cycle start.
        if (vlmOrbit)    vlmOrbit.classList.remove('run');
        if (traceOrbit)  traceOrbit.classList.remove('run');
        if (answerOrbit) answerOrbit.classList.remove('run');
        resetAnswer();
        // 1) Phase A — VLM is current session: a1 flow + VLM orbit
        //    light up together. trace-orbit stays paused.
        playFlow(a1Flow);
        playFlow(vlmOrbit);
        // 2) After a1 + tiny beat → hand off to trace-block:
        //    VLM orbit OFF, trace orbit ON, start streaming the 4 lines.
        timer = setTimeout(() => {
          if (!active) return;
          if (vlmOrbit) vlmOrbit.classList.remove('run');
          playFlow(traceOrbit);
          // Keep a1's flow looping while text is streaming — the pipe
          // visibly carries tokens for the full duration of typing.
          if (a1Flow) { a1Flow.classList.remove('run'); a1Flow.classList.add('streaming'); }
          streamLine(0, () => streamLine(1, () => streamLine(2, () => streamLine(3, () => {
            // a1 flow stops looping the instant the last line finishes typing.
            if (a1Flow) a1Flow.classList.remove('streaming');
            // 3) All 4 lines done → trace orbit OFF, play a2 + Answer
            //    orbit, then run the box → extract → mark sequence:
            //    3a) Show "<box> Answer </box>" together (brackets
            //        fade in tight to Answer; Answer label visible
            //        for the rest of Phase C via .answer-active).
            //    3b) After BOX_SHOW_MS, brackets fade out — only
            //        "Answer" remains.
            //    3c) After EXTRACT_GAP, the random roll fades in
            //        ✓ on Answer's left OR ✗ on Answer's right
            //        (same grid cell as the bracket it replaced).
            //    Answer's position never shifts: brackets and marks
            //    share grid cells, so swapping them keeps the
            //    layout perfectly stable.
            timer = setTimeout(() => {
              if (!active) return;
              if (traceOrbit) traceOrbit.classList.remove('run');
              playFlow(a2Flow);
              playFlow(answerOrbit);
              if (answerNode) answerNode.classList.add('answer-active', 'show-box');
              timer = setTimeout(() => {
                if (!active) return;
                if (answerNode) answerNode.classList.remove('show-box');
                timer = setTimeout(() => {
                  if (!active) return;
                  if (answerNode) {
                    const correct = Math.random() < CORRECT_PR;
                    if (correct) {
                      answerNode.classList.add('show-correct');
                    } else {
                      answerNode.classList.add('show-wrong', 'wrong-result');
                    }
                  }
                  const remainder = Math.max(
                    0,
                    ARROW_MS + CYCLE_PAUSE - BOX_SHOW_MS - EXTRACT_GAP
                  );
                  timer = setTimeout(cycle, remainder);
                }, EXTRACT_GAP);
              }, BOX_SHOW_MS);
            }, TRACE_TO_A2);
          }))));
        }, ARROW_MS + A1_TO_TRACE);
      };

      // Hover trigger = the WHOLE enclosing .paradigm article (col 2),
      // not just the <textual-flow> element. So moving the cursor
      // into the header / badge / caveat regions also activates the
      // cycle. We flip a .hover-active class on the host so the
      // Shadow-DOM CSS rules above (which used :host(:hover)) can
      // pick up parent-driven hover too.
      const trigger = this.closest('.paradigm') || this;
      const enter = () => {
        if (active) return;
        active = true;
        this.classList.add('hover-active');
        cycle();
      };
      const leave = () => {
        active = false;
        this.classList.remove('hover-active');
        if (timer) { clearTimeout(timer); timer = null; }
        if (a1Flow) { a1Flow.classList.remove('run'); a1Flow.classList.remove('streaming'); }
        if (a2Flow) a2Flow.classList.remove('run');
        if (vlmOrbit)    vlmOrbit.classList.remove('run');
        if (traceOrbit)  traceOrbit.classList.remove('run');
        if (answerOrbit) answerOrbit.classList.remove('run');
        resetAnswer();
        fillAll();
      };
      trigger.addEventListener('mouseenter', enter);
      trigger.addEventListener('mouseleave', leave);
    }
  }
  window.customElements.define('textual-flow', TextualFlow);
})();
