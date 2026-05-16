// <visual-flow> web component — col 1 (Visual Artifacts) hover-driven
// animation. Encapsulated in Shadow DOM (like d2t-diagram for col 4).
//
// Cycle (8s total, restarts on each hover-in, halts on hover-out):
//   0–10%   prompt → render: flow streak descends the top arrow
//   10–25%  wave 0  (heavy blur, 3 loading dots pulse, orbits start)
//   25–40%  wave 1  (medium blur)
//   40–55%  wave 2  (light blur)
//   55–70%  wave 3  (image fully sharp; dots fade out; orbits fade)
//   70–82%  render → critic: flow streak descends mid arrow
//   82–94%  critic → loop:   flow streak descends bottom arrow
//   94–100% L-return on the LEFT brings flow back to prompt's west
//
// 3 orbit cycles (1.6s each) fit inside the 25–70% clarification
// phase; each completion lines up with one blur-stage transition.
(function () {
  if (window.customElements && window.customElements.get('visual-flow')) return;

  const TEMPLATE = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    flex: 1;
    position: relative;
    padding-right: 4px;
    padding-left: 22px;        /* room on the left for the L-return */
    margin-bottom: 12px;
    gap: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #15181c;
    --p-accent: #be185d;
    --p-soft:   hsl(340, 30%, 97%);
  }
  .flow-node {
    position: relative;          /* anchor for the per-block orbit SVGs */
    align-self: center;
    width: 140px;                /* matches .flow-render below */
    box-sizing: border-box;
    padding: 6px 12px;
    background: #fff;
    border: 1.4px solid rgba(190, 24, 93, 0.32);
    border-radius: 6px;
    font-size: 0.74rem;
    line-height: 1.2;
    letter-spacing: -0.01em;
    font-weight: 600;
    color: #15181c;
    text-align: center;
    white-space: nowrap;
  }
  /* Per-block orbit overlays — same wiring as .orbit-overlay on
     the rendered-bitmap block, parameterised by which fade
     keyframe the host(:hover) selectors above pick. */
  .prompt-orbit, .critic-orbit, .loop-orbit {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .prompt-orbit rect,
  .critic-orbit rect,
  .loop-orbit rect {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.6;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 13 87;
    stroke-dashoffset: 0;
    filter: drop-shadow(0 0 1.5px var(--p-accent));
  }
  /* Prompt block is two-line + has an MLP icon on its left, so it
     becomes a horizontal flex row instead of the default centered
     single line. */
  .prompt-node {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: normal;
    padding-top: 7px;          /* +1 above the default 6 from .flow-node */
    padding-bottom: 7px;       /* +1 below */
  }
  .prompt-node .node-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
  }
  /* Tiny MLP graphic: 3 input nodes <-> 3 output nodes, 9 full
     connections. Black-bordered circles, blue-filled inputs (left
     column) + grey-filled outputs (right column). */
  .mlp-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }
  .mlp-icon line {
    stroke: #1f2937;            /* near-black, like the node borders */
    stroke-width: 0.5;
    opacity: 0.5;
  }
  .mlp-icon circle {
    stroke: #15181c;            /* black outline on every node */
    stroke-width: 0.5;
  }
  .mlp-icon .in  { fill: #3b82f6; }   /* blue inputs */
  .mlp-icon .out { fill: #9ca3af; }   /* grey outputs */
  /* Critic block: same flex-row layout as the prompt block, with an
     eye glyph on the left of the "VLM judge" label. */
  .critic-node {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    white-space: normal;
  }
  .eye-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
  .eye-icon path { fill: #15181c; }
  /* Loop block: same flex-row layout, with a recycle icon on the
     left of the "Feedback / revise" label. Gap tightened so the icon
     sits closer to the text (other blocks keep their gap: 8px). */
  .loop-node {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: normal;
  }
  .recycle-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }
  .recycle-icon path { fill: #15181c; }
  .arrow {
    display: block;
    align-self: center;
    overflow: visible;
    /* Pull each arrow up into the upper block's bottom padding and
       down into the lower block's top padding — visually the arrow
       reaches from block-content edge to block-content edge, while
       the block borders themselves stay put (same trick as col 4's
       .row arrow). */
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
  /* Render block — matches .flow-node styling exactly (same border,
     padding, background) so the rendered image sits in a container
     visually identical to the other flow nodes. Orbit + dots are
     absolute children aligned to this container's border. */
  .flow-render {
    position: relative;
    align-self: center;
    width: 140px;                /* matches .flow-node above for an
                                    aligned column of blocks */
    box-sizing: border-box;
    padding: 6px 12px;
    background: #fff;
    border: 1.4px solid rgba(190, 24, 93, 0.32);
    border-radius: 6px;
    font-size: 0.74rem;
    line-height: 1.2;
    letter-spacing: -0.01em;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  /* Inner wrapper sized exactly to the image — mask + loading dots
     use inset: 0 / 50% offsets RELATIVE to this wrapper, so they're
     guaranteed to be the same size and centered on the image
     regardless of its natural aspect. */
  .render-wrap {
    position: relative;
    display: block;
    line-height: 0;          /* kill the inline gap below <img> */
  }
  .mini-render {
    display: block;
    width: 110px;
    height: auto;            /* natural aspect from the image file */
    filter: blur(0);
    transition: filter 0.2s ease-out;
  }
  /* Wave-0 white-out: covers the image exactly via inset: 0. */
  .render-mask {
    position: absolute;
    inset: 0;
    background: #fff;
    opacity: 0;
    pointer-events: none;
    border-radius: 2px;
    z-index: 1;
  }
  .flow-cap {
    font-size: 0.6rem;
    color: var(--p-accent);
    letter-spacing: 0;
  }
  /* Loading dots: centered exactly on the image (via 50%/translate
     against .render-wrap, which is sized to the image). z-index 2
     keeps them above the white render-mask. */
  .loading-dots {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    gap: 4px;
    opacity: 0;
    pointer-events: none;
    z-index: 2;
  }
  .loading-dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--p-accent);
    opacity: 0.3;
  }
  /* Orbit overlay — SVG is a "replaced element", so absolute +
     inset: 0 alone lets the browser size it via the viewBox's
     intrinsic 1:1 ratio (width=parent_width => height=parent_width
     ≈ 140px, much taller than the actual ~117px .flow-render). The
     explicit width:100%/height:100% bypasses intrinsic sizing and
     forces the SVG to exactly fill the padding box of .flow-render. */
  .orbit-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .orbit-overlay rect {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 1.6;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    /* Shorter visible dash so the orbit flow reads as a short pulse,
       not a long bar sweeping the border. */
    stroke-dasharray: 7 93;
    stroke-dashoffset: 0;
    /* Soft halo around the stroke — same glow treatment as col 2. */
    filter: drop-shadow(0 0 1.5px var(--p-accent));
  }
  /* Flow streak on every downward arrow + on the L-return. Drop-shadow
     halo matches the luminous orbit borders. */
  .arrow .flow,
  .ret .flow {
    fill: none;
    stroke: var(--p-accent);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-dasharray: 15 85;
    stroke-dashoffset: 0;
    opacity: 0;
    filter: drop-shadow(0 0 1.5px var(--p-accent));
  }
  /* L-return on the LEFT — mirror of col 4's right-side .ret.
     Bottom offset = 5 puts the bottom-horiz (viewBox y=232/240 of
     SVG height) at host_bottom - 14 ≈ loop block's left midpoint
     (assuming the single-line loop block is ~28px tall). top: 14
     keeps the top-horiz (viewBox y=8) just above the prompt block's
     top — into the new 2-line prompt block's west midpoint.
     Width is set via right: calc(50% + 61px) so the SVG's right
     edge lands exactly at the block's left edge — block is 140 wide
     and centered, so its left edge sits at host_padding_box/2 - 61
     (where 61 = 70 half-width - 9 host padding offset). Setting
     left: 8 (was 7) pulls the vertical riser slightly to the right
     so the L hugs closer to the blocks while keeping the flow
     streak path identical in shape. */
  .ret {
    position: absolute;
    top: 14px;
    left: 2px;
    right: calc(50% + 65px);
    height: calc(100% - 14px - 5px);
    pointer-events: none;
    overflow: visible;
  }
  .ret path, .ret polyline {
    stroke: var(--p-accent);
    stroke-width: 1.6;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .ret .flow {
    stroke-width: 3;
    opacity: 0;
    vector-effect: non-scaling-stroke;
    /* Period (15+110=125) > pathLength (100) so only ONE visible
       dash exists on the path at a time. Animating offset 0 -> -115
       in flow-lret lets the streak ENTER at path start and EXIT
       past path end without ever wrapping back. */
    stroke-dasharray: 15 110;
  }

  /* ─── Hover-driven animations ───────────────────────────────────
     All keyframes share an 8s cycle. Different segments use the
     keyframe's % to gate when they're visible/active. */
  :host(.hover-active) .mini-render            { animation: blur-stages 8s linear infinite; }
  :host(.hover-active) .render-mask            { animation: mask-fade   8s linear infinite; }
  :host(.hover-active) .loading-dots           { animation: dots-fade   8s linear infinite; }
  :host(.hover-active) .loading-dots span      { animation: dot-pulse 0.9s ease-in-out infinite; }
  :host(.hover-active) .loading-dots span:nth-child(2) { animation-delay: 0.3s; }
  :host(.hover-active) .loading-dots span:nth-child(3) { animation-delay: 0.6s; }
  :host(.hover-active) .orbit-overlay .orbit-cw  { animation: orbit-cw 1.6s linear infinite, orbit-fade 8s linear infinite; }
  :host(.hover-active) .orbit-overlay .orbit-ccw { animation: orbit-ccw 1.6s linear infinite, orbit-fade 8s linear infinite; }
  /* Per-block orbits — each lights up during the phase when its
     INCOMING arrow flows into it (the block is the current session). */
  :host(.hover-active) .prompt-orbit .orbit-cw  { animation: orbit-cw 1.2s linear infinite, prompt-orbit-fade 8s linear infinite; }
  :host(.hover-active) .prompt-orbit .orbit-ccw { animation: orbit-ccw 1.2s linear infinite, prompt-orbit-fade 8s linear infinite; }
  :host(.hover-active) .critic-orbit .orbit-cw  { animation: orbit-cw 1.2s linear infinite, critic-orbit-fade 8s linear infinite; }
  :host(.hover-active) .critic-orbit .orbit-ccw { animation: orbit-ccw 1.2s linear infinite, critic-orbit-fade 8s linear infinite; }
  :host(.hover-active) .loop-orbit .orbit-cw    { animation: orbit-cw 1.2s linear infinite, loop-orbit-fade 8s linear infinite; }
  :host(.hover-active) .loop-orbit .orbit-ccw   { animation: orbit-ccw 1.2s linear infinite, loop-orbit-fade 8s linear infinite; }
  :host(.hover-active) .arrow.from-prompt .flow { animation: flow-prompt 8s linear infinite; }
  :host(.hover-active) .arrow.from-render .flow { animation: flow-render 8s linear infinite; }
  :host(.hover-active) .arrow.from-critic .flow { animation: flow-critic 8s linear infinite; }
  :host(.hover-active) .ret .flow               { animation: flow-lret   8s linear infinite; }

  @keyframes blur-stages {
    0%, 9%        { filter: blur(0); }        /* before the descend */
    10%, 24%      { filter: blur(10px); }     /* wave 0 — paired with
                                                 white render-mask so
                                                 visually it's pure white */
    25%, 39%      { filter: blur(6.5px); }    /* wave 1 (strong) — deepened from 4px */
    40%, 54%      { filter: blur(3px); }      /* wave 2 (light)  — deepened from 1.5px */
    55%, 100%     { filter: blur(0); }        /* wave 3 (clear) */
  }
  /* render-mask sits ON TOP of the SVG with opacity 1 during wave 0,
     then fades to 0 entering wave 1 — giving the "pure white = full
     gaussian" look at the start of each cycle. */
  @keyframes mask-fade {
    0%            { opacity: 1; }     /* white from the very start —
                                         covers the image during the a1
                                         phase too, not just wave 0 */
    24%           { opacity: 1; }
    26%, 100%     { opacity: 0; }
  }
  @keyframes dots-fade {
    0%, 9%        { opacity: 0; }
    11%           { opacity: 1; }
    54%           { opacity: 1; }
    58%, 100%     { opacity: 0; }
  }
  @keyframes dot-pulse {
    0%, 80%, 100% { opacity: 0.3; }
    40%           { opacity: 1; }
  }
  /* Rendered bitmap block — orbit lights up from the START of the
     cycle, in sync with the a1 (prompt → render) flow streak. */
  @keyframes orbit-fade {
    0%            { opacity: 0.5; }
    58%           { opacity: 0.5; }
    60%, 100%     { opacity: 0; }
  }
  /* Critic block — orbit lights up during the render → critic phase
     (matches @keyframes flow-render: 65–76%). */
  @keyframes critic-orbit-fade {
    0%, 64%       { opacity: 0; }
    66%           { opacity: 0.5; }
    75%           { opacity: 0.5; }
    77%, 100%     { opacity: 0; }
  }
  /* Loop block — orbit lights up during the critic → loop phase
     (matches @keyframes flow-critic: 76–87%). */
  @keyframes loop-orbit-fade {
    0%, 75%       { opacity: 0; }
    77%           { opacity: 0.5; }
    86%           { opacity: 0.5; }
    88%, 100%     { opacity: 0; }
  }
  /* Prompt block — orbit lights up TWICE per cycle:
     0–9%  : at cycle start, in sync with a1 (prompt → render) flow
             and the rendered-bitmap orbit kicking in.
     88–98%: during the L-return, when the flow loops back into
             the prompt's west. */
  @keyframes prompt-orbit-fade {
    0%            { opacity: 0.5; }
    9%            { opacity: 0.5; }
    10%, 86%      { opacity: 0; }
    88%           { opacity: 0.5; }
    98%           { opacity: 0.5; }
    99%, 100%     { opacity: 0; }
  }
  @keyframes orbit-cw  { to { stroke-dashoffset: -100; } }
  @keyframes orbit-ccw { to { stroke-dashoffset:  100; } }

  /* Each down-arrow's streak is visible only during its slice.
     Re-balanced so the L-return gets 20% of the cycle (~1.6s) — the
     long path needs more time to read as a single deliberate flow. */
  /* Prompt→Render arrow flow keeps LOOPING throughout the rendering
     phase (0–56%): 7 back-to-back slides (8% each, ~640ms), so the
     arrow visibly carries pixels into the bitmap for the full duration
     of the blur-clarification waves. Then it fades out at 57% — handing
     off to flow-render which takes over at 65%. */
  @keyframes flow-prompt {
    0%     { stroke-dashoffset: 0;    opacity: 1; }
    8%     { stroke-dashoffset: -100; opacity: 1; }
    8.01%  { stroke-dashoffset: 0;    opacity: 1; }
    16%    { stroke-dashoffset: -100; opacity: 1; }
    16.01% { stroke-dashoffset: 0;    opacity: 1; }
    24%    { stroke-dashoffset: -100; opacity: 1; }
    24.01% { stroke-dashoffset: 0;    opacity: 1; }
    32%    { stroke-dashoffset: -100; opacity: 1; }
    32.01% { stroke-dashoffset: 0;    opacity: 1; }
    40%    { stroke-dashoffset: -100; opacity: 1; }
    40.01% { stroke-dashoffset: 0;    opacity: 1; }
    48%    { stroke-dashoffset: -100; opacity: 1; }
    48.01% { stroke-dashoffset: 0;    opacity: 1; }
    56%    { stroke-dashoffset: -100; opacity: 1; }
    57%, 100% { stroke-dashoffset: -100; opacity: 0; }
  }
  @keyframes flow-render {
    0%, 64%   { stroke-dashoffset: 0;    opacity: 0; }
    65%       { stroke-dashoffset: 0;    opacity: 1; }
    75%       { stroke-dashoffset: -100; opacity: 1; }
    76%, 100% { stroke-dashoffset: -100; opacity: 0; }
  }
  @keyframes flow-critic {
    0%, 75%   { stroke-dashoffset: 0;    opacity: 0; }
    76%       { stroke-dashoffset: 0;    opacity: 1; }
    86%       { stroke-dashoffset: -100; opacity: 1; }
    87%, 100% { stroke-dashoffset: -100; opacity: 0; }
  }
  @keyframes flow-lret {
    0%, 86%   { stroke-dashoffset: 0;    opacity: 0; }
    87%       { stroke-dashoffset: 0;    opacity: 1; }
    98%       { stroke-dashoffset: -115; opacity: 1; }
    99%, 100% { stroke-dashoffset: -115; opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    :host(.hover-active) .mini-render,
    :host(.hover-active) .loading-dots,
    :host(.hover-active) .loading-dots span,
    :host(.hover-active) .orbit-cw,
    :host(.hover-active) .orbit-ccw,
    :host(.hover-active) .arrow .flow,
    :host(.hover-active) .ret .flow { animation: none; opacity: 0; filter: blur(0); }
  }
</style>

<!-- Prompt block — top. MLP icon (3 left nodes ↔ 3 right nodes, fully
     connected) on the left; two-line label on the right.
     Border orbit lights up during the L-return phase. -->
<div class="flow-node prompt-node">
  <svg class="prompt-orbit" aria-hidden="true">
    <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
  </svg>
  <svg class="mlp-icon" viewBox="0 0 20 20" aria-hidden="true">
    <!-- Full-connection lines first (under the nodes) -->
    <line x1="2" y1="4" x2="18" y2="4"/>
    <line x1="2" y1="4" x2="18" y2="10"/>
    <line x1="2" y1="4" x2="18" y2="16"/>
    <line x1="2" y1="10" x2="18" y2="4"/>
    <line x1="2" y1="10" x2="18" y2="10"/>
    <line x1="2" y1="10" x2="18" y2="16"/>
    <line x1="2" y1="16" x2="18" y2="4"/>
    <line x1="2" y1="16" x2="18" y2="10"/>
    <line x1="2" y1="16" x2="18" y2="16"/>
    <!-- 3 inputs (blue) on the left -->
    <circle class="in" cx="2" cy="4"  r="1.8"/>
    <circle class="in" cx="2" cy="10" r="1.8"/>
    <circle class="in" cx="2" cy="16" r="1.8"/>
    <!-- 3 outputs (grey) on the right -->
    <circle class="out" cx="18" cy="4"  r="1.8"/>
    <circle class="out" cx="18" cy="10" r="1.8"/>
    <circle class="out" cx="18" cy="16" r="1.8"/>
  </svg>
  <div class="node-text">
    <div>VLM / </div>
    <div>T2I Renderer</div>
  </div>
</div>

<!-- Arrow: prompt → rendered image -->
<svg class="arrow from-prompt" width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
  <line x1="7" y1="0" x2="7" y2="20"/>
  <polyline points="3 13 7 20 11 13"/>
  <line class="flow" pathLength="100" x1="7" y1="0" x2="7" y2="20"/>
</svg>

<!-- Rendered image block. The .render-wrap is sized to the image
     (110 × natural) for the mask + dot overlays. The .orbit-overlay
     sits at the .flow-render level so its perimeter rect wraps the
     entire visible block (image + caption + padding), and explicit
     width:100%/height:100% CSS keeps the SVG from defaulting to its
     viewBox's intrinsic 1:1 ratio (which would overshoot downward). -->
<div class="flow-render">
  <div class="render-wrap">
    <img class="mini-render" src="assets/demos/visual_rendering_output.png" alt="rendered bitmap" />
    <div class="render-mask" aria-hidden="true"></div>
    <div class="loading-dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
  </div>
  <span class="flow-cap">rendered bitmap</span>
  <svg class="orbit-overlay" aria-hidden="true">
    <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
  </svg>
</div>

<!-- Arrow: render → critic -->
<svg class="arrow from-render" width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
  <line x1="7" y1="0" x2="7" y2="20"/>
  <polyline points="3 13 7 20 11 13"/>
  <line class="flow" pathLength="100" x1="7" y1="0" x2="7" y2="20"/>
</svg>

<!-- Critic block — svgrepo eye-16px path (almond eye + iris circle
     + highlight dot), recolored to near-black.
     Border orbit lights up during the render→critic arrow phase. -->
<div class="flow-node critic-node">
  <svg class="critic-orbit" aria-hidden="true">
    <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
  </svg>
  <svg class="eye-icon" viewBox="0 -2.96 15.929 15.929" aria-hidden="true">
    <path d="M-3.768,6.232l-.416-.416A9.609,9.609,0,0,0-11,2.993a9.609,9.609,0,0,0-6.816,2.823l-.416.416a2.5,2.5,0,0,0,0,3.536l.416.416A9.609,9.609,0,0,0-11,13.007a9.609,9.609,0,0,0,6.816-2.823l.416-.416A2.5,2.5,0,0,0-3.768,6.232ZM-11,4a.5.5,0,0,1,.5.5A.5.5,0,0,1-11,5a2,2,0,0,0-2,2,.5.5,0,0,1-.5.5A.5.5,0,0,1-14,7,3,3,0,0,1-11,4Zm6.525,5.061-.416.416A8.581,8.581,0,0,1-11,12.007a8.581,8.581,0,0,1-6.109-2.53l-.416-.416A1.493,1.493,0,0,1-17.964,8a1.493,1.493,0,0,1,.439-1.061l.416-.416A8.624,8.624,0,0,1-14.183,4.6,3.964,3.964,0,0,0-15,7a4,4,0,0,0,4,4A4,4,0,0,0-7,7a3.964,3.964,0,0,0-.817-2.4A8.624,8.624,0,0,1-4.891,6.523l.416.416A1.493,1.493,0,0,1-4.036,8,1.493,1.493,0,0,1-4.475,9.061Z" transform="translate(18.965 -2.993)"/>
  </svg>
  <div class="node-text">VLM judge</div>
</div>

<!-- Arrow: critic → loop (was loop-arc, now plain down arrow) -->
<svg class="arrow from-critic" width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
  <line x1="7" y1="0" x2="7" y2="20"/>
  <polyline points="3 13 7 20 11 13"/>
  <line class="flow" pathLength="100" x1="7" y1="0" x2="7" y2="20"/>
</svg>

<!-- Loop / feedback block — svgrepo cycle path (two opposing
     arrows forming a horizontal swap/cycle), recolored.
     Border orbit lights up during the critic→loop arrow phase. -->
<div class="flow-node loop-node">
  <svg class="loop-orbit" aria-hidden="true">
    <rect class="orbit-cw"  x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
    <rect class="orbit-ccw" x="0" y="0" width="100%" height="100%" rx="4.6" ry="4.6" pathLength="100"/>
  </svg>
  <svg class="recycle-icon" viewBox="0 0 512 512" aria-hidden="true">
    <g transform="translate(64 58.823665)">
      <path d="M384,175.843 L384,197.176335 C384,267.868783 326.692448,325.176335 256,325.176335 L256,325.176335 L97.849,325.176 L136.836556,364.18278 L106.666667,394.352669 L16.1569987,303.843001 L106.666667,213.333333 L136.836556,243.503223 L97.849,282.509 L256,282.509668 C302.657016,282.509668 340.56834,245.064914 341.321901,198.587477 L341.333333,197.176335 L341.333,175.843 L384,175.843 Z M277.333333,1.42108547e-14 L367.843001,90.509668 L277.333333,181.019336 L247.163444,150.849447 L286.15,111.843 L128,111.843001 C81.3429843,111.843001 43.4316597,149.287756 42.6780989,195.765192 L42.6666667,197.176335 L42.666,218.509 L1.42108547e-14,218.509 L1.42108547e-14,197.176335 C-8.42864619e-15,127.190811 56.1671317,70.3238242 125.883286,69.193483 L128,69.1763347 L286.151,69.176 L247.163444,30.1698893 L277.333333,1.42108547e-14 Z"/>
    </g>
  </svg>
  <div class="node-text">Feedback / revise</div>
</div>

<svg class="ret" preserveAspectRatio="none" viewBox="0 0 40 240" aria-hidden="true">
  <path d="M 20 226 L 12 226 Q 4 226 4 218 L 4 16 Q 4 8 12 8 L 20 8" />
  <polyline points="15 5 20 8 15 11"/>
  <path class="flow" pathLength="100" d="M 20 226 L 12 226 Q 4 226 4 218 L 4 16 Q 4 8 12 8 L 20 8" />
</svg>
`;

  class VisualFlow extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = TEMPLATE;
      // Hover trigger = the WHOLE enclosing .paradigm article (col 1),
      // not just the <visual-flow> element. So moving the cursor
      // into the header / badge / caveat regions also activates the
      // 8s cycle. We toggle a .hover-active class on the host so the
      // Shadow-DOM CSS rules (which were :host(:hover)) can react to
      // parent-driven hover too.
      const trigger = this.closest('.paradigm') || this;
      trigger.addEventListener('mouseenter', () => this.classList.add('hover-active'));
      trigger.addEventListener('mouseleave', () => this.classList.remove('hover-active'));

      // ─── L-return arrow alignment ────────────────────────────────
      // The .ret SVG's horizontal stubs (viewBox y=8 top, y=226 bottom)
      // must land at the LEFT midpoint of the prompt-node (top) and
      // loop-node (bottom). Previously the SVG was sized with
      // `top: 14px; height: calc(100% - 14px - 5px)` — anchored to
      // BOTH host top AND host bottom — so when browser zoom stretches
      // the column card, the SVG's bottom drifts with the host bottom
      // and the bottom stub slides past the loop block.
      // Fix: measure the two blocks each layout pass and set `top` +
      // `height` in absolute px from the host's top. Bottom is no
      // longer anchored to the host, so column stretching can't drag
      // the stub.
      const promptBlk = root.querySelector('.prompt-node');
      const loopBlk   = root.querySelector('.loop-node');
      const retEl     = root.querySelector('.ret');
      const renderImg = root.querySelector('.mini-render');
      const alignRet = () => {
        if (!retEl || !promptBlk || !loopBlk) return;
        // Use offsetTop/offsetHeight (CSSOM layout coordinates) rather
        // than getBoundingClientRect (visual coordinates). The Focus
        // mode applies `transform: scale(N)` to an ancestor; rect-based
        // measurements come back scaled, and the resulting CSS px we
        // write to .ret end up wrong both inside AND after exiting
        // focus. offset* properties report unscaled layout px, so the
        // math stays correct regardless of any ancestor transform.
        if (promptBlk.offsetHeight === 0) return;  // not yet laid out
        const promptMid = promptBlk.offsetTop + promptBlk.offsetHeight / 2;
        const loopMid   = loopBlk.offsetTop   + loopBlk.offsetHeight   / 2;
        // viewBox 0 0 40 240; stubs at y=8 and y=226.
        // Solve: top + (8/240)*h = promptMid, top + (226/240)*h = loopMid.
        const h = (loopMid - promptMid) * 240 / (226 - 8);
        const t = promptMid - 8 * h / 240;
        retEl.style.top = t + 'px';
        retEl.style.height = h + 'px';
      };
      // Stability layers — the L arrow has been "jumping" because the
      // single rAF after innerHTML doesn't wait for: web fonts loaded,
      // image dims known, sibling card heights settled, or hover anim
      // transitions. Belt-and-suspenders:
      //   1. Double rAF + final on window.load (catches font + image)
      //   2. ResizeObserver on the HOST and the two anchor blocks
      //      (any inner reflow re-aligns)
      //   3. fonts.ready + image.load (cheap signals)
      const burst = () => requestAnimationFrame(() =>
                          requestAnimationFrame(alignRet));
      burst();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(burst);
      }
      window.addEventListener('load', burst);
      if (renderImg) {
        if (renderImg.complete) burst();
        else renderImg.addEventListener('load', burst);
      }
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(alignRet);
        ro.observe(this);
        if (promptBlk) ro.observe(promptBlk);
        if (loopBlk)   ro.observe(loopBlk);
      } else {
        window.addEventListener('resize', alignRet);
      }
    }
  }
  window.customElements.define('visual-flow', VisualFlow);
})();
