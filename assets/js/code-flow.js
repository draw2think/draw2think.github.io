// <code-flow> web component — col 3 (Executable Scripts) bottom flow.
// 4 blocks in a single horizontal row:
//   VLM / agent  →solid→  Code / script  →solid→  Execute / render  ⇢dash⇢  Post-hoc check
// Two dashed feedback arcs swing UNDER the row, both returning into VLM:
//   Execute / render  ⇢dash⇢  VLM
//   Post-hoc check    ⇢dash⇢  VLM   (longer / lower arc)
//
// Animation cycle (8s, hover-driven, same idiom as visual-flow / textual-flow):
//   0–10%   VLM block lit
//   10–18%  flow streak on VLM→Code (solid)
//   18–28%  Code block lit
//   28–36%  flow streak on Code→Execute (solid)
//   36–46%  Execute block lit
//   46–54%  flow streak on Execute→Post-hoc (dashed)
//   54–64%  Post-hoc block lit
//   64–76%  flow streak on Post-hoc→VLM feedback arc (dashed, long)
//   76–86%  flow streak on Execute→VLM feedback arc (dashed, short)
//   86–100% idle hold, then loop
(function () {
  if (window.customElements && window.customElements.get('code-flow')) return;

  const TEMPLATE = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    /* Anchor this row of 4 pipeline blocks to the BOTTOM of the
       .paradigm-flow container. No flex-grow (content-height only)
       and margin-top:auto consumes leftover space ABOVE us, so the
       dynamically-tall <code-tiles> sibling above can grow/shrink
       freely without pushing us downward — we stay pinned to the
       same bottom offset regardless. */
    flex: 0 0 auto;
    margin-top: auto;
    position: relative;
    margin-bottom: -5px;       /* further downward shift — pulls the
                                   4-card row deeper toward / into the
                                   paradigm-badge below. */
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #15181c;
    --p-accent: #c2410c;
    --p-soft:   hsl(20, 60%, 97%);
  }
  /* Row of 4 blocks — each block sized to its text content (no flex
     grow/shrink). justify-content: space-between distributes the
     remaining row width as gaps where the arrows sit, so the shorter
     blocks (VLM/agent, Code/script) naturally compact while the longer
     ones (Execute/render, Post-hoc check) take the room they need. */
  .code-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;   /* pack cards+arrows tight; spare row width
                                  goes to the row's two end-margins, not
                                  to gaps between items — keeps arrows
                                  flush against the adjacent block edges
                                  (with the .arrow's -3px overlap margin
                                  ensuring an exact touch). */
    gap: 0;
    position: relative;        /* anchor for absolute arrows + arcs */
    transform: translateY(-2px); /* nudge the 4 cards + 3 inter-arrows
                                    up 2px. Transform leaves document
                                    flow untouched, so the .feedback-arcs
                                    sibling below stays exactly put. */
  }
  .code-node {
    position: relative;        /* anchor for per-block orbit overlays */
    flex: 1 1 0;               /* equal share of row width — all 4 cards same width */
    min-width: 0;
    max-width: 46px;           /* cap so cards stay narrow even on a wide column */
    box-sizing: border-box;
    padding: 5px 4px 4px;
    background: #fff;
    border: 1.4px solid color-mix(in srgb, var(--p-accent) 32%, transparent);
    border-radius: 6px;
    font-size: 0.5rem;
    font-weight: 600;
    color: #15181c;
    text-align: center;
    line-height: 1.35;         /* roomier row spacing between the 2 label lines */
    letter-spacing: -0.01em;
    white-space: nowrap;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  /* Icon sits BELOW the label inside each block. Per-icon sizes are
     dialed in independently:
        brain (VLM/agent)        +15% → 21px
        code glyph (Code/script) +20% → 22px (also the base size)
        monitor (Execute/render) +20% → 22px
        checklist (Post-hoc)     +15% → 21px
     Base .code-icon sits at 22px (the code-glyph size); .brain /
     .checklist scale back down via class overrides. */
  /* All 4 icons share a SHARED 22×22 layout footprint so the 4
     pipeline cards have identical outer height — top/bottom edges
     align across the row regardless of which icon is inside. Visual
     scaling per icon is done purely via transform: scale(), which
     does NOT change layout (and therefore not block height). */
  .code-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }
  .code-icon path { fill: #15181c; }
  /* Per-icon visual scale (transform-only, layout unchanged):
        brain (VLM/agent)      ~21px visually
        code glyph             22px (no scale)
        monitor                ~24px visually (slight emphasis)
        checklist              ~21px visually */
  .code-icon.brain     { transform: scale(0.955); }
  .code-icon.monitor   { transform: scale(1.09);  }
  .code-icon.checklist { transform: scale(0.955); }
  /* Brain icon (VLM / agent) — copied from col-2 textual-flow:
     stroked silhouette + thinner fold grooves at 55% opacity. */
  .code-icon.brain path { fill: none; stroke: #15181c; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
  .code-icon.brain .fold { stroke-width: 1; opacity: 0.55; }
  /* Monitor icon — keeps the yellow stripe accent. Screen fill
     restored to white so the large upper area uses the icon's
     original colour. */
  .code-icon.monitor .accent { fill: var(--p-accent); }
  .code-icon.monitor .screen { fill: #fff; }
  /* Horizontal arrows between blocks. margin: 0 -3px pulls each arrow
     INTO the adjacent block's edge a hair, same trick col1 uses on
     vertical arrows (so the arrow head visually touches the block). */
  .arrow {
    display: block;
    flex-shrink: 0;
    overflow: visible;
    margin: 0 -3px;
    position: relative;
    z-index: 2;             /* float ABOVE the card backgrounds/borders
                               so the arrowhead chevron is never clipped
                               or covered when it overlaps a card edge. */
  }
  .arrow line, .arrow polyline {
    stroke: var(--p-accent);
    stroke-width: 1.4;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  /* Dashed forward arrow (Execute → Post-hoc): stroke-dasharray on the
     main line. Arrowhead polyline stays solid for legibility. */
  .arrow.dashed line:not(.flow) {
    stroke-dasharray: 4 3;
  }
  /* Per-block orbit: subtle border glow when the block is the current
     active session in the cycle. */
  .code-orbit {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .code-orbit rect {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.6;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 10 90;
    stroke-dashoffset: 0;
    filter: drop-shadow(0 0 1.5px var(--p-accent));
  }
  /* Flow streak on every forward arrow + on the feedback arcs.
     Drop-shadow halo gives the streak the same luminous glow used on
     the per-block orbit borders. */
  .arrow .flow, .feedback-arc .flow {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 15 85;
    stroke-dashoffset: 0;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 1.5px var(--p-accent));
  }
  /* Two feedback arcs swinging under the row. preserveAspectRatio="none"
     stretches them across the full row width, so the arc endpoints
     dynamically follow the block midpoints regardless of column width. */
  .feedback-arcs {
    position: relative;
    width: 100%;
    height: 24px;           /* reduced from 38px — shorter vertical drop */
    margin-top: -2px;       /* pull arcs up a hair to hug the row bottom */
    pointer-events: none;
  }
  .feedback-arc {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .feedback-arc path:not(.flow) {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
  }
  .feedback-arc polyline {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  /* ─── Hover-driven 8s cycle ───
     Each block orbit has TWO simultaneous streaks: orbit-cw slides
     clockwise (offset 0 → -100), orbit-ccw slides counter-clockwise
     (offset 0 → +100). Both start at the top-left corner, so they
     visibly spread apart — one travels the TOP edge left→right while
     the other travels the LEFT edge down to BOTTOM → "一上一下平行散开".
     The per-block fade keyframes gate WHEN each block's orbit is
     visible (sequential cycle), while the CW/CCW spin runs at the
     same 1.4s period whenever visible. */
  :host(.hover-active) .code-orbit.orbit-vlm   .orbit-cw  { animation: orbit-cw-spin  1.4s linear infinite, vlm-orbit-fade   8s linear infinite; }
  :host(.hover-active) .code-orbit.orbit-vlm   .orbit-ccw { animation: orbit-ccw-spin 1.4s linear infinite, vlm-orbit-fade   8s linear infinite; }
  :host(.hover-active) .code-orbit.orbit-code  .orbit-cw  { animation: orbit-cw-spin  1.4s linear infinite, code-orbit-fade  8s linear infinite; }
  :host(.hover-active) .code-orbit.orbit-code  .orbit-ccw { animation: orbit-ccw-spin 1.4s linear infinite, code-orbit-fade  8s linear infinite; }
  :host(.hover-active) .code-orbit.orbit-exec  .orbit-cw  { animation: orbit-cw-spin  1.4s linear infinite, exec-orbit-fade  8s linear infinite; }
  :host(.hover-active) .code-orbit.orbit-exec  .orbit-ccw { animation: orbit-ccw-spin 1.4s linear infinite, exec-orbit-fade  8s linear infinite; }
  :host(.hover-active) .code-orbit.orbit-check .orbit-cw  { animation: orbit-cw-spin  1.4s linear infinite, check-orbit-fade 8s linear infinite; }
  :host(.hover-active) .code-orbit.orbit-check .orbit-ccw { animation: orbit-ccw-spin 1.4s linear infinite, check-orbit-fade 8s linear infinite; }
  :host(.hover-active) .arrow.vlm-to-code  .flow   { animation: flow-vlm-code   8s linear infinite; }
  :host(.hover-active) .arrow.code-to-exec .flow   { animation: flow-code-exec  8s linear infinite; }
  :host(.hover-active) .arrow.exec-to-check .flow  { animation: flow-exec-check 8s linear infinite; }
  :host(.hover-active) .arc-posthoc .flow          { animation: flow-arc-posthoc 8s linear infinite; }
  :host(.hover-active) .arc-execute .flow          { animation: flow-arc-execute 8s linear infinite; }
  /* During 86–100% (after both feedback streaks have arrived at VLM)
     the underlying STATIC dashed L itself "marches" — its
     stroke-dashoffset shifts so the dashes appear to keep flowing
     into VLM even when the streak overlays are gone. Exec/Check
     orbits are already dark in this window, so the column transitions
     from "blocks active" to "data still draining" → "next cycle".
     Period is 7 (dasharray 4+3); offset goes 0 → -21 (3 periods) so
     the wrap at 100%→0% is invisible. */
  :host(.hover-active) .feedback-arc path:not(.flow) { animation: feedback-dash-march 8s linear infinite; }
  @keyframes feedback-dash-march {
    0%, 86%   { stroke-dashoffset: 0; }
    100%      { stroke-dashoffset: -21; }
  }

  @keyframes orbit-cw-spin  { to { stroke-dashoffset: -100; } }
  @keyframes orbit-ccw-spin { to { stroke-dashoffset:  100; } }

  /* Cycle map (8s total, hover-driven):
       0%–9%   VLM orbit lit
       9%–13%  VLM→Code arrow streak
       14%–42% Code orbit lit (28% window — code-tiles.js streams its
               5 snippets simultaneously starting at the 14% mark)
       43%–47% Code→Exec arrow streak
       49%–55% Exec orbit lit
       56%–64% Exec→Check arrow streak (slow 8% drift)
       56%–85% Exec→VLM short feedback (slow 29% drop, simultaneous with
               the right-side path so the two feedbacks converge at 85%)
       66%–84% Check orbit lit
       70%–85% Post-hoc→VLM long feedback (15% window)
       86%–100% idle hold, then loop. */
  /* VLM orbit bridges across the cycle wrap: lights at 86% (when both
     feedback streaks finish converging at VLM) and stays lit through
     100% → 0% → 9% — so the cycle has no dead pause at the seam. */
  @keyframes vlm-orbit-fade {
    0%, 9%      { opacity: 0.6; }
    11%, 84%    { opacity: 0; }
    86%, 100%   { opacity: 0.6; }
  }
  @keyframes code-orbit-fade {
    0%, 12%   { opacity: 0; }
    14%, 42%  { opacity: 0.6; }
    44%, 100% { opacity: 0; }
  }
  /* Exec orbit lights TWICE per cycle:
       49–55% own active session (Exec is current phase)
       57–68% rest while only Check orbit is lit
       70–84% lights up AGAIN as Exec drips feedback back to VLM
              (parallel with the Post-hoc feedback streak). */
  @keyframes exec-orbit-fade {
    0%, 47%   { opacity: 0; }
    49%, 55%  { opacity: 0.6; }
    57%, 68%  { opacity: 0; }
    70%, 84%  { opacity: 0.6; }
    86%, 100% { opacity: 0; }
  }
  /* Check orbit start pushed 62% → 66% so there's a small idle beat
     between the Exec scan ending (~55%) + the slow Exec→Check arrow
     (now 56–64%) and the Check scan starting. End stays at 84% so
     the orbit still spins through the Post-hoc→VLM feedback. */
  @keyframes check-orbit-fade {
    0%, 64%   { opacity: 0; }
    66%, 84%  { opacity: 0.6; }
    86%, 100% { opacity: 0; }
  }

  /* Each flow keyframe ramps stroke-dashoffset from 0 to -115 across
     its window. Outside the window: opacity 0. dasharray "15 85" +
     pathLength=100 gives one visible 15-long dash sliding across. */
  /* VLM→Code arrow:
     - 9%-13%: initial handoff sweep at "fast" pace (offset 0 → -115),
       same as the other inter-block arrows.
     - 13%-42%: KEEP the streak flowing at a slower sustained pace
       while the Code orbit is lit. Reads as "VLM continuously
       guiding the code generation" — not a one-shot baton-pass.
       Offset advances another 300 units = ~3 more sweeps over 29%.
     - 43%+: fade out as the Code orbit fades and the Code→Exec
       handoff begins. */
  @keyframes flow-vlm-code {
    0%, 8%    { stroke-dashoffset: 0;    opacity: 0; }
    9%        { stroke-dashoffset: 0;    opacity: 1; }
    13%       { stroke-dashoffset: -115; opacity: 1; }
    42%       { stroke-dashoffset: -415; opacity: 1; }
    43%, 100% { stroke-dashoffset: -415; opacity: 0; }
  }
  @keyframes flow-code-exec {
    0%, 42%   { stroke-dashoffset: 0;    opacity: 0; }
    43%       { stroke-dashoffset: 0;    opacity: 1; }
    47%       { stroke-dashoffset: -115; opacity: 1; }
    48%, 100% { stroke-dashoffset: -115; opacity: 0; }
  }
  /* Exec→Check arrow: slowed from 4% (56–60%) → 8% (56–64%) so the
     dashed horizontal streak takes visibly longer to traverse,
     giving a clearer "drift" beat between the Exec scan and the
     Check scan instead of an instant baton-pass. */
  @keyframes flow-exec-check {
    0%, 55%   { stroke-dashoffset: 0;    opacity: 0; }
    56%       { stroke-dashoffset: 0;    opacity: 1; }
    64%       { stroke-dashoffset: -115; opacity: 1; }
    65%, 100% { stroke-dashoffset: -115; opacity: 0; }
  }
  @keyframes flow-arc-posthoc {
    0%, 69%   { stroke-dashoffset: 0;    opacity: 0; }
    70%       { stroke-dashoffset: 0;    opacity: 1; }
    85%       { stroke-dashoffset: -115; opacity: 1; }
    86%, 100% { stroke-dashoffset: -115; opacity: 0; }
  }
  /* Execute→VLM short feedback: now starts at 70%, SAME moment as the
     Post-hoc→VLM long feedback (flow-arc-posthoc). Both drips begin
     simultaneously and both reach VLM at 85%. The two streaks pour
     into VLM together. */
  @keyframes flow-arc-execute {
    0%, 69%   { stroke-dashoffset: 0;    opacity: 0; }
    70%       { stroke-dashoffset: 0;    opacity: 1; }
    85%       { stroke-dashoffset: -115; opacity: 1; }
    86%, 100% { stroke-dashoffset: -115; opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    :host(.hover-active) .arrow .flow,
    :host(.hover-active) .feedback-arc .flow,
    :host(.hover-active) .code-orbit .orbit-rect { animation: none; }
  }
</style>

<div class="code-row">
  <div class="code-node">
    <span>VLM /<br/>agent</span>
    <!-- Brain icon (col-2 brain silhouette + fold grooves) -->
    <svg class="code-icon brain" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M 11 3 Q 7 3 6.5 5.5 Q 3 5.5 3 9.5 Q 2 12 3.5 14 Q 3.5 17 7 17.2 Q 8.5 19 11 19 Q 13.5 19 15 17.2 Q 18.5 17 18.5 14 Q 20 12 19 9.5 Q 19 5.5 15.5 5.5 Q 15 3 11 3 Z"/>
      <path class="fold" d="M 11 4 V 18"/>
      <path class="fold" d="M 6 9 Q 8.5 10 7.5 12"/>
      <path class="fold" d="M 5 14 Q 7 13 8 15"/>
      <path class="fold" d="M 16 9 Q 13.5 10 14.5 12"/>
      <path class="fold" d="M 17 14 Q 15 13 14 15"/>
    </svg>
    <svg class="code-orbit orbit-vlm" aria-hidden="true">
      <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
      <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    </svg>
  </div>
  <svg class="arrow vlm-to-code" width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
    <line x1="2" y1="7" x2="20" y2="7"/>
    <polyline points="15 3 20 7 15 11"/>
    <line class="flow" pathLength="100" x1="2" y1="7" x2="20" y2="7"/>
  </svg>
  <div class="code-node">
    <span>Code /<br/>script</span>
    <!-- Code icon (</>) — svgrepo code glyph -->
    <svg class="code-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.4425 7.32787C16.7196 7.01999 17.1938 6.99503 17.5017 7.27213L19.2392 8.83587C19.9756 9.49853 20.5864 10.0482 21.0058 10.5468C21.4468 11.071 21.7603 11.6343 21.7603 12.3296C21.7603 13.0249 21.4468 13.5882 21.0058 14.1124C20.5864 14.611 19.9756 15.1607 19.2392 15.8233L17.5017 17.3871C17.1938 17.6642 16.7196 17.6392 16.4425 17.3313C16.1654 17.0234 16.1904 16.5492 16.4983 16.2721L18.1947 14.7453C18.9826 14.0362 19.5138 13.5558 19.8579 13.1468C20.1882 12.7542 20.2603 12.525 20.2603 12.3296C20.2603 12.1342 20.1882 11.905 19.8579 11.5124C19.5138 11.1034 18.9826 10.623 18.1947 9.91389L16.4983 8.38707C16.1904 8.10997 16.1654 7.63576 16.4425 7.32787Z"/>
      <path d="M7.50178 8.38707C7.80966 8.10997 7.83462 7.63576 7.55752 7.32787C7.28043 7.01999 6.80621 6.99503 6.49833 7.27213L4.76084 8.83587C4.0245 9.49853 3.41369 10.0482 2.99428 10.5468C2.55325 11.071 2.23975 11.6343 2.23975 12.3296C2.23975 13.0249 2.55325 13.5882 2.99428 14.1124C3.41369 14.611 4.02449 15.1607 4.76082 15.8233L6.49833 17.3871C6.80621 17.6642 7.28043 17.6392 7.55752 17.3313C7.83462 17.0234 7.80966 16.5492 7.50178 16.2721L5.80531 14.7453C5.01743 14.0362 4.48623 13.5558 4.14213 13.1468C3.81188 12.7542 3.73975 12.525 3.73975 12.3296C3.73975 12.1342 3.81188 11.905 4.14213 11.5124C4.48623 11.1034 5.01743 10.623 5.80531 9.91389L7.50178 8.38707Z"/>
      <path opacity="0.5" d="M14.1816 4.2755C14.5817 4.3827 14.8191 4.79396 14.7119 5.19406L10.7383 20.0238C10.6311 20.4239 10.2198 20.6613 9.81974 20.5541C9.41964 20.4469 9.18221 20.0356 9.28941 19.6355L13.263 4.80583C13.3702 4.40573 13.7815 4.16829 14.1816 4.2755Z"/>
    </svg>
    <svg class="code-orbit orbit-code" aria-hidden="true">
      <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
      <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    </svg>
  </div>
  <svg class="arrow code-to-exec" width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
    <line x1="2" y1="7" x2="20" y2="7"/>
    <polyline points="15 3 20 7 15 11"/>
    <line class="flow" pathLength="100" x1="2" y1="7" x2="20" y2="7"/>
  </svg>
  <div class="code-node">
    <span>Execute /<br/>render</span>
    <!-- Monitor icon — screen + frame + waveform content + accent stripe.
         Stand (trapezoid) and base bar removed for a cleaner look; the
         remaining bottom-banner bar uses a lighter fill via .bottom-bar. -->
    <svg class="code-icon monitor" viewBox="0 0 1024 1024" aria-hidden="true">
      <path class="screen" d="M225.1 251.9h592.7c14.2 0 25.8 11.5 25.8 25.8V690c0 14.2-11.5 25.8-25.8 25.8H225.1c-14.2 0-25.8-11.5-25.8-25.8V277.6c0-14.2 11.6-25.7 25.8-25.7z"/>
      <path d="M817.9 741.5H225.1c-28.4 0-51.5-23.1-51.5-51.5V277.6c0-28.4 23.1-51.5 51.5-51.5h592.7c28.4 0 51.5 23.1 51.5 51.5V690c0.1 28.4-23 51.5-51.4 51.5zM225.1 277.6V690h592.7V277.6H225.1z"/>
      <path d="M379.7 544.1c-6 0-12.1-2.1-17-6.4-10.7-9.4-11.7-25.7-2.3-36.4l92.2-104.8c4.8-5.5 11.8-8.7 19.1-8.8 7.2 0.3 14.3 3 19.3 8.3l70.9 77.2L659.2 362c9.4-10.7 25.7-11.8 36.4-2.4s11.8 25.7 2.4 36.4L581.6 528.8c-4.8 5.5-11.8 8.7-19.1 8.8-7.1 0.1-14.3-2.9-19.3-8.3L472.3 452l-73.2 83.3c-5.1 5.8-12.2 8.8-19.4 8.8z"/>
      <path class="accent" d="M225.1 638.4h592.7v51.5H225.1z"/>
      <path d="M212.2 586.9h631.4v51.5H212.2z"/>
    </svg>
    <svg class="code-orbit orbit-exec" aria-hidden="true">
      <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
      <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    </svg>
  </div>
  <svg class="arrow exec-to-check dashed" width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
    <line x1="2" y1="7" x2="20" y2="7"/>
    <polyline points="15 3 20 7 15 11"/>
    <line class="flow" pathLength="100" x1="2" y1="7" x2="20" y2="7"/>
  </svg>
  <div class="code-node">
    <span>Post-hoc<br/>check</span>
    <!-- Checklist icon — first-row ✓ kept; second-row ✓ replaced with
         a bullet • dot. 5 sub-paths from the original ✓ have been
         stripped from the path d (the second ✓ arrows + their rounded
         end caps), and a <circle> bullet sits at the second-row label's
         vertical centre (y=15.12). -->
    <svg class="code-icon checklist" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.8491 8.86899C7.55621 8.5761 7.08134 8.5761 6.78844 8.86899C6.49555 9.16188 6.49555 9.63676 6.78844 9.92965L7.8491 8.86899ZM8.35904 10.4396L7.82871 10.9699C8.12161 11.2628 8.59648 11.2628 8.88937 10.9699L8.35904 10.4396ZM10.9699 8.88938C11.2628 8.59648 11.2628 8.12161 10.9699 7.82872C10.677 7.53582 10.2022 7.53582 9.90926 7.82872L10.9699 8.88938ZM13.0403 9.16946C12.6261 9.16946 12.2903 9.50524 12.2903 9.91946C12.2903 10.3337 12.6261 10.6695 13.0403 10.6695V9.16946ZM16.6812 10.6695C17.0954 10.6695 17.4312 10.3337 17.4312 9.91946C17.4312 9.50524 17.0954 9.16946 16.6812 9.16946V10.6695ZM13.0403 14.3708C12.6261 14.3708 12.2903 14.7066 12.2903 15.1208C12.2903 15.535 12.6261 15.8708 13.0403 15.8708V14.3708ZM16.6812 15.8708C17.0954 15.8708 17.4312 15.535 17.4312 15.1208C17.4312 14.7066 17.0954 14.3708 16.6812 14.3708V15.8708ZM4.08306 14.8783C3.63898 12.9851 3.63898 11.0149 4.08306 9.12171L2.6227 8.77915C2.12577 10.8976 2.12577 13.1024 2.6227 15.2209L4.08306 14.8783ZM19.9169 9.12171C20.361 11.0149 20.361 12.9851 19.9169 14.8783L21.3773 15.2208C21.8742 13.1024 21.8742 10.8976 21.3773 8.77916L19.9169 9.12171ZM14.8783 19.9169C12.9851 20.361 11.0149 20.361 9.12171 19.9169L8.77916 21.3773C10.8976 21.8742 13.1024 21.8742 15.2208 21.3773L14.8783 19.9169ZM9.12171 4.08306C11.0149 3.63898 12.9851 3.63898 14.8783 4.08306L15.2208 2.6227C13.1024 2.12577 10.8976 2.12577 8.77916 2.6227L9.12171 4.08306ZM9.12171 19.9169C6.62161 19.3305 4.6695 17.3784 4.08306 14.8783L2.6227 15.2209C3.33924 18.2756 5.72441 20.6608 8.77916 21.3773L9.12171 19.9169ZM15.2208 21.3773C18.2756 20.6608 20.6608 18.2756 21.3773 15.2208L19.9169 14.8783C19.3305 17.3784 17.3784 19.3305 14.8783 19.9169L15.2208 21.3773ZM14.8783 4.08306C17.3784 4.6695 19.3305 6.62161 19.9169 9.12171L21.3773 8.77916C20.6608 5.72441 18.2756 3.33924 15.2208 2.6227L14.8783 4.08306ZM8.77916 2.6227C5.72441 3.33924 3.33924 5.72441 2.6227 8.77915L4.08306 9.12171C4.6695 6.6216 6.62161 4.6695 9.12171 4.08306L8.77916 2.6227ZM6.78844 9.92965L7.82871 10.9699L8.88937 9.90926L7.8491 8.86899L6.78844 9.92965ZM8.88937 10.9699L10.9699 8.88938L9.90926 7.82872L7.82871 9.90926L8.88937 10.9699ZM13.0403 10.6695H16.6812V9.16946H13.0403V10.6695ZM13.0403 15.8708H16.6812V14.3708H13.0403V15.8708Z"/>
      <circle cx="8.4" cy="15.12" r="1.3"/>
    </svg>
    <svg class="code-orbit orbit-check" aria-hidden="true">
      <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
      <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    </svg>
  </div>
</div>

<!-- Feedback paths form a shared "comb" under the row: both Execute and
     Post-hoc drop down to the same horizontal beam (y=28), which runs
     left and turns UP into VLM with an arrowhead. Visually the two
     dashed L-shapes merge into one bottom horizontal line.

     Block x-midpoints in viewBox 100 wide: VLM 12.5 / Code 37.5 /
     Execute 62.5 / Post-hoc 87.5. preserveAspectRatio="none" stretches
     the layout to match the row's CSS width responsively.

     Implementation:
     - .arc-posthoc draws the FULL long L (Post-hoc drop → beam → VLM
       riser + arrow). This statically renders the bottom horizontal +
       the VLM up-tip for both feedbacks.
     - .arc-execute draws ONLY the Execute drop (static segment); its
       hidden flow path traces the FULL Execute→VLM L so the animated
       streak slides down then across the (shared) beam then up to VLM. -->
<div class="feedback-arcs">
  <!-- Long L: Post-hoc check (87.5) → drop → Q corner → beam → Q corner
       → up to VLM (12.5) with arrowhead. 6-unit-radius corners at
       (87.5,28) and (12.5,28) for a softer turn. -->
  <svg class="feedback-arc arc-posthoc" preserveAspectRatio="none" viewBox="0 0 100 24" aria-hidden="true">
    <path d="M 90.5 0 L 90.5 14 Q 90.5 20 83.5 20 L 16 20 Q 10 20 10 14 L 10 0" />
    <polyline points="12 6 10 0 8 6" />
    <path class="flow" pathLength="100" d="M 90.5 0 L 90.5 14 Q 90.5 20 83.5 20 L 16 20 Q 10 20 10 14 L 10 0" />
  </svg>
  <!-- Short drop+corner: Execute (62.5) drops, turns LEFT with a Q
       corner (radius 6), terminates at (56.5,28) — landing inside the
       Post-hoc beam (which spans 81.5→18.5 at y=28) so the comb merges
       seamlessly. The flow path matches the static segment EXACTLY
       (just the drop + corner) — the streak only animates the DOWN
       portion. The shared beam + VLM riser are animated solely by
       the Post-hoc flow, so the two streaks don't double-trace the
       left segment of the comb. -->
  <svg class="feedback-arc arc-execute" preserveAspectRatio="none" viewBox="0 0 100 24" aria-hidden="true">
    <path d="M 63.5 0 L 63.5 14 Q 63.5 20 57.5 20" />
    <path class="flow" pathLength="100" d="M 63.5 0 L 63.5 14 Q 63.5 20 57.5 20" />
  </svg>
</div>
`;

  class CodeFlow extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = TEMPLATE;
      // Hover trigger = the whole enclosing .paradigm article (col 3),
      // not just <code-flow>. Toggle .hover-active on the host so the
      // shadow-DOM :host(.hover-active) selectors above pick it up.
      const trigger = this.closest('.paradigm') || this;
      trigger.addEventListener('mouseenter', () => this.classList.add('hover-active'));
      trigger.addEventListener('mouseleave', () => this.classList.remove('hover-active'));
    }
  }
  window.customElements.define('code-flow', CodeFlow);
})();
