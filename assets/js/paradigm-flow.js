// ─── <d2t-diagram> web component ─────────────────────────────
// The Draw2Think paradigm flow lives inside a Shadow DOM so injected
// extension styles (Dark Reader, Stylus, …) can't reach into it. All
// internal CSS is private to the shadow tree. Hover the host element
// to start the green / blue flow-pulse animations.
//
// This file owns the entire visual / layout side of the paradigm card:
//   - shadow-DOM-scoped CSS (block layout, arrows, flow pulses, icons)
//   - the inline SVG icons (compass, magnifier, bin, frame, primitives)
//   - the inline ABCD canvas figure inside Constraint Engine
//   - the absolute-positioned L-return arrow + feedback label
// No external state or app logic — drop-in custom element.
(function () {
  if (window.customElements && window.customElements.get('d2t-diagram')) return;

  const TEMPLATE = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    flex: 1;
    position: relative;
    /* Reduce right-padding so both ToolSpecs and Engine east edges
       extend further right (Engine more than ToolSpecs via fr ratios). */
    padding-right: 22px;
    margin-bottom: 12px;
    gap: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #15181c;
  }
  /* Observation block has empty right area in the original fig — shrink
     it so the label has room and the L bottom-horizontal segment can
     start cleanly at the obs east edge. The geogebra canvas snapshot
     occupies the previously-empty right column, vertically centred
     parallel to the title + bullets text block. */
  /* Two-class .node.observation beats the bare .node flex-column rule
     declared below; without that extra specificity the image just
     stacks as a third flex child instead of taking column 2.
     margin-right stays at 50px so the node's right border keeps its
     original position flush with the L-return's left endpoint — the
     image must fit inside the existing internal space, with title and
     bullets shrinking to accommodate it. */
  .node.observation {
    margin-right: 50px;
    background: #fff;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 6px;
    align-items: center;
  }
  /* Allow title to wrap when col 1 is narrow (originally white-space:
     nowrap on .title forces single line and pushes col 2 out). */
  .node.observation .title {
    grid-column: 1;
    grid-row: 1;
    white-space: normal;
    line-height: 1.15;
  }
  .node.observation .bullets { grid-column: 1; grid-row: 2; min-width: 0; }
  /* Image is wrapped in <a download> so users can click to save the
     canvas snapshot. Position: relative anchors the corner download
     icon overlay. */
  .node.observation .obs-illustration-wrap {
    grid-column: 2;
    grid-row: 1 / span 2;
    position: relative;
    display: block;
    align-self: center;
    text-decoration: none;
    line-height: 0;
    /* shift the image + icon group left 5px so the icon doesn't hug
       the obs node's right border too tightly */
    margin-right: 5px;
  }
  .node.observation .obs-illustration {
    width: 76px;
    height: auto;
    object-fit: contain;
    opacity: 0.92;
    display: block;
  }
  /* Tiny download icon (8x8) positioned OUTSIDE the image's right edge,
     top-aligned with the image. Sits in the obs node's padding-right
     area to the right of the canvas snapshot, not overlaid on top of
     it. left:100% places the icon just past the wrap's right edge. */
  .node.observation .obs-download-icon {
    position: absolute;
    top: 0;
    /* small breathing room between image right edge and icon left edge */
    left: calc(100% + 3px);
    width: 8px;
    height: 8px;
    color: #095462;
    /* circular hover halo (transparent until hover) — affords clickability */
    border-radius: 50%;
    background: transparent;
    box-shadow: 0 0 0 0 rgba(22, 163, 74, 0);
    transition: transform 0.15s ease, color 0.15s ease,
                background 0.15s ease, box-shadow 0.15s ease;
  }
  .node.observation .obs-illustration-wrap:hover .obs-download-icon {
    transform: scale(1.08);
    color: #06414c;
    /* gentle teal disc + soft outer glow — subtle button affordance. */
    background: rgba(9, 84, 98, 0.07);
    box-shadow:
      0 0 0 1.5px rgba(9, 84, 98, 0.10),
      0 0 4px 1px rgba(9, 84, 98, 0.06);
  }
  .node.observation .obs-illustration-wrap:hover .obs-illustration {
    opacity: 1;
  }
  .node {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 7px 10px;
    background: #fff;
    border: 1.6px solid rgba(13,116,136, 0.32);
    border-radius: 6px;
    font-size: 0.78rem;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }
  /* Per-node uppercase mini badges (model / propose / verify / observe)
     are hidden — fig1 doesn't show them in the constraint-agentic column. */
  .tag { display: none; }
  .title {
    white-space: nowrap;
    font-weight: 600;
    color: #095462;            /* accent-dark teal, matches border */
  }
  .sub {
    display: block;
    font-size: 0.62rem;
    color: #5d6470;
    font-style: italic;
    margin-top: 1px;
    letter-spacing: 0;
  }
  /* Mini icon grid (2 rows × 4 cols) used in ToolSpecs.
     Top row = tool categories; bottom row = primitive types. */
  .tool-icons {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 5px;
    width: 100%;
  }
  /* Dashed divider — used between the two icon rows in ToolSpecs
     AND between the ce-rules and the verdict block in Engine. Needs
     an explicit width because the parent .node has align-items:
     flex-start, which would otherwise collapse an empty div to 0. */
  .tool-icons-sep {
    height: 0;
    width: 100%;
    border-top: 1px dashed rgba(13,116,136, 0.45);
    margin: 2px 0;
  }
  .tool-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  /* Each cell = SVG above + tiny text label below. No border / bg.
     Grid template 1fr/auto: SVG occupies the flexible top row and is
     centered vertically inside it (align-self on the SVG below), so
     all icon CENTERS line up across cells; the label sits in the
     auto-sized bottom row of every cell, so all labels share the
     same baseline. Horizontal centering = justify-items: center. */
  .tool-icon {
    display: grid;
    grid-template-rows: 1fr auto;
    justify-items: center;
    gap: 1px;
    background: transparent;
    border: none;
    padding: 0;
    color: #095462;
    line-height: 1;
  }
  .tool-icon svg {
    width: 100%;
    height: auto;
    stroke: #095462;
    fill: none;
    stroke-width: 0.8;            /* very fine line art */
    stroke-linecap: round;
    stroke-linejoin: round;
    align-self: center;           /* center icon vertically in 1fr row */
  }
  /* Top row (categories) — 3:4 PORTRAIT, larger overall.
     Padding on cats row gives extra vertical breathing room above
     and below the construct/query/delete/render icons. */
  .tool-row.cats { padding: 6px 0; }
  .tool-row.cats .tool-icon svg { max-width: 21px; max-height: 28px; }
  /* Visual balance: because "construct" is a longer label than the
     others, query feels like it has too much breathing room on its
     LEFT. Shifting delete and render slightly right re-balances:
       :nth-child(3) (delete) margin-left 2px -> query<->delete +2px
       :nth-child(4) (render) margin-left 3px -> delete<->render +1px
                                                  (3 - 2 = 1) */
  .tool-row.cats > :nth-child(3) { margin-left: 2px; }
  .tool-row.cats > :nth-child(4) { margin-left: 3px; }
  .tool-row.cats .eraser-icon {
    transform: translateY(1px) scale(0.9);
    transform-origin: center;
  }
  /* Bottom row (primitives) — smaller 1:1 square.
     The 1fr top row in .tool-icon is sized exactly to the SVG max
     height, so align-self has no slack to work with. translateY is
     a pure visual shift (doesn't affect layout, so the cell height
     and block bottom line stay put) — pushes each prims SVG down by
     3px, away from the dashed sep above and closer to its label. */
  .tool-row.prims .tool-icon svg {
    max-width: 14px;
    max-height: 14px;
    transform: translateY(3px);
  }
  /* Prims labels pushed down 1.5px (relative to default 1px margin
     above) — grows the auto row, shifts the prims row bottom-line. */
  .tool-row.prims .icon-label { margin-top: 2.5px; }
  /* Visually shift the whole prims (cubes) row downward to close the
     gap between the cubes and the ToolSpecs node's bottom border.
     transform is a pure visual offset — doesn't alter document flow,
     so the bottom border position stays put. */
  .tool-row.prims { transform: translateY(4px); }

  /* ─── 3D flip cubes for the prims row ───────────────────────────
     Each prim cell is a 4-face cube that rotates around its X axis:
     front → bottom → back → top, completing a full 360° per cycle.
     "Front goes UP, bottom comes to FRONT" (rotateX(+90deg)) matches
     the airport flip-board metaphor the user asked for.
     Face content map (per slot):
       front + top    = state 1  (simplest, also the "rest" state on wrap)
       bottom         = state 2  (mid-complexity construction tool)
       back           = state 3  (most complex / family-completing tool)
     State 1 lives on TWO faces so the 100%→0% wrap (rotateX(270deg)→0deg)
     stays visually seamless — both faces show the same icon. */
  .tool-icon.cube {
    position: relative;
    height: 28px;
    perspective: 300px;
  }
  .cube-spin {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    /* Animation only attaches on hover (option B) — cube sits on state 1
       (front face) when col4 isn't hovered, then plays the full 4s cycle
       fresh on each hover-enter. */
  }
  :host(.hover-active) .cube-spin {
    animation: tool-cube-flip 5s linear infinite;
  }
  .cube-face {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    justify-items: center;
    gap: 1px;
    backface-visibility: hidden;
  }
  /* Back face uses rotateX(180) (NOT rotateY) so that when the cube
     finishes its rotateX(180deg) phase, the back face's own pre-rotation
     cancels the cube's rotation → content shows right-side-up at front.
     With rotateY(180) we got an upside-down + mirrored render at that
     phase. */
  .cube-face.front  { transform: translateZ(14px); }
  .cube-face.bottom { transform: rotateX(-90deg) translateZ(14px); }
  .cube-face.back   { transform: rotateX(180deg) translateZ(14px); }
  .cube-face.top    { transform: rotateX(90deg) translateZ(14px); }
  /* Per-cube label: tighter than the default .icon-label so longer
     labels like "parallel"/"bisector"/"intersect" don't overflow into
     adjacent cells. */
  .cube-face .icon-label {
    font-size: 0.42rem;
    letter-spacing: -0.015em;
  }
  /* Left-to-right cascade — each successive cube starts 0.2s later
     so the row "ripples" like an airport flip board. (Scoped under
     :host(.hover-active) so it only kicks in alongside the animation.) */
  :host(.hover-active) .tool-row.prims .tool-icon.cube:nth-child(1) .cube-spin { animation-delay: 0s; }
  :host(.hover-active) .tool-row.prims .tool-icon.cube:nth-child(2) .cube-spin { animation-delay: 0.1s; }
  :host(.hover-active) .tool-row.prims .tool-icon.cube:nth-child(3) .cube-spin { animation-delay: 0.2s; }
  :host(.hover-active) .tool-row.prims .tool-icon.cube:nth-child(4) .cube-spin { animation-delay: 0.3s; }
  @keyframes tool-cube-flip {
    0%, 15%   { transform: rotateX(0deg); }
    19%, 44%  { transform: rotateX(90deg); }
    48%, 73%  { transform: rotateX(180deg); }
    77%, 100% { transform: rotateX(270deg); }
  }
  .icon-label {
    font-family: 'Noto Sans', 'Inter', sans-serif;
    font-size: 0.5rem;
    font-weight: 500;
    color: #095462;               /* same as observation bullet color */
    letter-spacing: 0;
    line-height: 1;
    white-space: nowrap;
    margin-top: 1px;
  }
  /* Engine canvas figure — quadrilateral ABCD with the 4 predicate
     symbols (= equal, perp perpendicular, // parallel, arc angle).
     Coordinates picked so angle ACD = 55deg EXACTLY (verified via
     dot-product: cos(55deg)=0.5736), with CD horizontal and AB
     parallel to CD. The figure plays the same schematic role as the
     old 4 mini "rule" boxes, but reads as a real verified state. */
  .ce-fig {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 0;            /* sit right under (verification backend) */
  }
  /* Fill polygon (no stroke — edges are drawn separately so each can
     be highlighted individually during the Angle / IsPerp phases). */
  .ce-fig .quad-fill {
    fill: rgba(13,116,136, 0.05);
    stroke: none;
  }
  /* Four edges as individual lines so each can be highlighted. */
  .ce-fig .quad-edge {
    stroke: #095462;
    stroke-width: 0.6;
    stroke-linecap: round;
    fill: none;
  }
  .ce-fig .vx {
    fill: #fff;
    stroke: #095462;
    stroke-width: 0.5;
  }
  .ce-fig .vt {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 4px;
    font-weight: 700;
    fill: #095462;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .ce-fig .mk {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 5px;
    font-weight: 600;
    fill: #095462;
    text-anchor: middle;
    dominant-baseline: central;
  }
  /* "//" is two glyphs wide, so it visually outweighs the single-glyph
     marks; shrink + tighten letter-spacing to balance. */
  .ce-fig .mk.par {
    font-size: 3.6px;
    letter-spacing: -0.6px;
  }
  /* "=" is two horizontal bars stacked, which reads as heavier than
     "perp" or "angle" at the same weight — lighten it. */
  .ce-fig .mk.eq {
    font-size: 5px;
    font-weight: 500;
  }
  small { color: #5d6470; font-size: 0.72em; font-weight: 400; }
  /* Caption + arrow row mirrors the twin grid so the green ↓ lands
     exactly under Constraint Engine's centerline. No margin-top so
     the arrow's top sits flush against the twin (Engine) bottom edge;
     column-gap: 0 so vertical arrow alignment isn't affected. */
  .dag-row {
    display: grid;
    grid-template-columns: 1.55fr auto 1.55fr;
    align-items: center;
    column-gap: 2px;
    padding: 0;
    margin-top: 12px;
  }
  .dag-row .dag-caption {
    font-size: 0.66rem;
    color: #095462;
    text-align: center;         /* two lines center-aligned to each other */
    line-height: 1.3;
    letter-spacing: -0.005em;
    padding-left: 32px;         /* shift the whole caption right ~1 word */
  }
  /* Each caption line stays on its own row — no mid-sentence wrapping.
     If the line is wider than the grid cell it overflows visually
     (overflow: visible by default), preferable to wrapping at random. */
  .dag-row .dag-caption .cap-line {
    display: block;
    white-space: nowrap;
  }
  .dag-row .arrow {
    justify-self: start;        /* pull arrow toward caption */
    /* Stretch the green arrow up 3px (into the dag-row margin-top
       gap above) and down 2px (into Observation's top padding), so
       it visually spans more of the verify->observe travel without
       changing the row height. */
    margin-top: -4px;
    margin-bottom: -2px;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    justify-items: center;
    /* Pull arrow up into VLM's bottom padding and down into twin's
       top padding — so the arrow visually traverses the internal
       whitespace zones without changing the block heights. */
    margin-top: -3px;
    margin-bottom: -3px;
  }
  /* Twin: both cells widen — ToolSpecs slightly, Engine more so.
     Tiny column-gap (1px) gives a hairline separation between the
     horizontal arrow tips and the adjacent block borders. */
  .twin {
    display: grid;
    grid-template-columns: 1.55fr auto 1.55fr;
    align-items: stretch;
    column-gap: 1px;
  }
  .twin .node {
    height: 100%;
    /* Tighter vertical padding than the default 7px — the figure/icon
       grids already provide their own breathing room, so the extra
       block padding just inflates the row height. */
    padding-top: 4px;
    padding-bottom: 3px;
    /* Center the title + sub text horizontally inside ToolSpecs and
       Engine. Other children (tool-icons, ce-fig, sep, verdicts) are
       width: 100% so this only affects the two title spans. */
    align-items: center;
  }
  /* Solid-line arrows. Explicit min-width prevents grid stretch from
     squishing the horizontal arrow flat; align-self centers it inside
     the twin row so it doesn't grab the full row height. */
  .arrow {
    display: block;
    overflow: visible;
    flex-shrink: 0;
    align-self: center;
    justify-self: center;
    min-width: 0;
  }
  .arrow line, .arrow polyline,
  .ret path, .ret polyline {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .blue line, .blue polyline { stroke: #095462; stroke-width: 1.6; }  /* teal, matches card accent */
  .green line, .green polyline { stroke: #16a34a; stroke-width: 2.2; }
  /* Laser-pen flow streak: a wider, same-color overlay with a single
     visible dash that slides along the line via stroke-dashoffset. The
     pulse appears as a brief "thickening" wave of light over the arrow.
     pathLength=100 on every flow element normalizes any path length so
     the same keyframes work universally. */
  .flow {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 15 85;
    stroke-dashoffset: 0;
    opacity: 0;
  }
  .blue  .flow { stroke: #095462; stroke-width: 2.8; filter: drop-shadow(0 0 1.5px #095462); }
  .green .flow { stroke: #16a34a; stroke-width: 3.6; filter: drop-shadow(0 0 1.5px #16a34a); }

  /* L-return spans from observation's east edge (bottom-left of SVG)
     all the way to VLM's east-edge region (top-left of SVG via the
     long top-horizontal segment). Width is large enough to bridge the
     horizontal segments AND the vertical column on the right. */
  .ret {
    position: absolute;
    top: 7px;                  /* top horizontal (viewBox y=8) lands on VLM right midpoint */
    right: 4px;
    width: 84px;
    /* SVG is a replaced element — top + bottom + height:auto does NOT
       auto-stretch the way it does for divs. We MUST set an explicit
       height. calc(100% - top - bottom) gives the same effect as
       top+bottom would on a regular block. Adjust the second value
       to move the L's bottom-horizontal up/down toward obs east. */
    height: calc(100% - 7px - 30px);
    pointer-events: none;
    overflow: visible;
  }
  .ret path, .ret polyline {
    stroke: #16a34a;
    stroke-width: 2.2;
    vector-effect: non-scaling-stroke;
  }
  /* L-return overlay path uses non-scaling-stroke so the width stays
     constant despite preserveAspectRatio="none" stretching the viewBox. */
  .ret .flow {
    stroke: #16a34a;
    stroke-width: 3.6;
    vector-effect: non-scaling-stroke;
  }
  /* 3-line stacked upright label, sits in the L's interior corner
     (just above the bottom-horizontal east-exit, left of vertical). */
  .feedback-label {
    position: absolute;
    bottom: 50px;       /* clearly above the L's bottom-horizontal (which sits near container bottom now) */
    right: 14px;
    width: 56px;
    font-family: 'Noto Sans', 'Inter', sans-serif;
    font-size: 0.55rem;
    font-weight: 600;
    color: #16a34a;
    text-align: center;
    line-height: 1.2;
    letter-spacing: 0;
    pointer-events: none;
  }

  /* VLM block: narrower than twin/observation, with the title
     centered horizontally inside the block. */
  .vlm-node {
    margin: 0 30px;
    align-items: center;
  }
  /* Title becomes a flex row so the snowflake's vertical center
     aligns exactly with the text's visual centerline (vertical-align
     on inline-block would lock to the baseline / x-height instead). */
  .vlm-node .title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* "Frozen" snowflake to the left of the VLM title. Teal-blue so it
     reads as cool/ice without competing with the card accent. Source
     based on svgrepo snow-alt-1 (Y bifurcations on the INNER part of
     each spoke, not at the very tips — reads as real snowflake). */
  .vlm-frozen {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    stroke: #0891b2;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .verdicts {
    display: flex;
    flex-direction: column;
    /* gap 2 -> 4 adds 2px between each of the 3 verdict rows
       (total +4px). margin-bottom -4 pulls the whole verdicts block
       up by the same amount so the Engine block bottom stays put. */
    gap: 4px;
    margin-top: 4px;
    margin-bottom: -4px;
    width: 100%;
  }
  .verdict-row {
    display: flex;
    gap: 8px;
    font-size: 0.5rem;          /* match .icon-label size */
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    align-items: center;
  }
  .v-ok, .v-bad {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    /* tiny padding so the highlighter-background pulse has visible bleed
       around the text; negative margin keeps the layout from shifting. */
    padding: 1px 3px;
    margin: -1px -3px;
    border-radius: 3px;
  }
  .verdict-badge {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
  }
  .verdict-line {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.5rem;          /* match .icon-label size */
    color: #16a34a;             /* same green as accepted badge */
    background: transparent;
    /* tiny padding so the highlighter-background pulse has visible bleed;
       negative margin keeps the layout from shifting. */
    padding: 1px 3px;
    margin: -1px -3px;
    border-radius: 3px;
    white-space: nowrap;
    letter-spacing: -0.02em;
  }
  .v-ok  { color: #16a34a; }
  .v-bad { color: #dc2626; }
  /* ─── Verdict tick "playback" cycle (hover-driven, 6s) ──────────────
     Default state: ticks and crosses are FULLY VISIBLE (offset 0) so
     when the card is idle the badges read as "✓ green / ✗ red" right
     away — no missing glyphs. On hover we drive a per-row playback:
     each glyph briefly retracts, then redraws in its own phase, then
     stays visible until the next cycle wrap. The 4 verdict items each
     get their own phase so they appear sequentially rather than firing
     together:
       Phase 1 (accepted):    retract @3%, redraw @12%
       Phase 2 (rejected):    retract @26%, redraw @35%
       Phase 3 (Angle=55°):   retract @46%, redraw @55%
       Phase 4 (IsPerp=True): retract @66%, redraw @75%
     Polyline tick path length ≈ 7.5; dasharray 8 + offset 8 fully hides
     it during the retract pulse. Cross strokes length ≈ 5.7 each so
     dasharray 6 + offset 6 hides them. Keyframes both start AND end at
     offset 0 → seamless loop wrap, no flash. */
  .v-tick { stroke-dasharray: 8; stroke-dashoffset: 0; }
  .v-cross { stroke-dasharray: 6; stroke-dashoffset: 0; }
  :host(.hover-active) .t-accept  { animation: tick-cycle-accept 6s linear infinite; }
  :host(.hover-active) .v-cross-a { animation: tick-cycle-reject 6s linear infinite; }
  :host(.hover-active) .v-cross-b { animation: tick-cycle-reject 6s linear infinite; }
  :host(.hover-active) .t-angle   { animation: tick-cycle-angle 6s linear infinite; }
  :host(.hover-active) .t-perp    { animation: tick-cycle-perp 6s linear infinite; }
  /* Negative-offset trick for "left-to-right" retract:
     - Positive offset N hides the END of the path first (visible region
       drifts off the end side) → retract reads right→left.
     - Negative offset N hides the START first (visible region drifts off
       the start side) → retract reads left→right.
     So we retract toward -dasharray (start vanishes first), then
     teleport via period-equivalence to +dasharray (also fully hidden),
     and draw back to 0 (start appears first). The teleport step is
     0.01% wide → ~0.6ms at 6s cycle, imperceptible. */
  @keyframes tick-cycle-accept {
    0%        { stroke-dashoffset: 0; }
    3%        { stroke-dashoffset: -8; }
    3.01%     { stroke-dashoffset: 8; }
    12%, 100% { stroke-dashoffset: 0; }
  }
  @keyframes tick-cycle-reject {
    0%, 23%   { stroke-dashoffset: 0; }
    26%       { stroke-dashoffset: -6; }
    26.01%    { stroke-dashoffset: 6; }
    35%, 100% { stroke-dashoffset: 0; }
  }
  @keyframes tick-cycle-angle {
    0%, 43%   { stroke-dashoffset: 0; }
    46%       { stroke-dashoffset: -8; }
    46.01%    { stroke-dashoffset: 8; }
    55%, 100% { stroke-dashoffset: 0; }
  }
  @keyframes tick-cycle-perp {
    0%, 63%   { stroke-dashoffset: 0; }
    66%       { stroke-dashoffset: -8; }
    66.01%    { stroke-dashoffset: 8; }
    75%, 100% { stroke-dashoffset: 0; }
  }
  /* ─── Verdict row glow (hover-driven, 6s) ──────────────────────────
     Each text row pulses a drop-shadow in sync with its tick's redraw
     window: green for accept/angle/perp, red for reject. */
  :host(.hover-active) .v-ok                  { animation: row-pulse-accept 6s linear infinite; }
  :host(.hover-active) .v-bad                 { animation: row-pulse-reject 6s linear infinite; }
  :host(.hover-active) .verdict-line.va-angle { animation: row-pulse-angle 6s linear infinite; }
  :host(.hover-active) .verdict-line.va-perp  { animation: row-pulse-perp 6s linear infinite; }
  /* Highlighter-pen feel: pale yellow background pulses behind the
     text, plus a faint colored drop-shadow keeps the green/red
     accept-vs-reject semantics readable. */
  /* Row drop-shadow swapped to soft pale yellow so it melts into the
     highlighter background (was a sharper green/red outline that read
     too heavy). Canvas atoms got the green glow instead. */
  @keyframes row-pulse-accept {
    0%, 3%    { background-color: transparent; filter: none; }
    8%, 14%   { background-color: rgba(254, 240, 138, 0.55); filter: drop-shadow(0 0 0.5px rgba(253, 224, 71, 0.85)); }
    18%, 100% { background-color: transparent; filter: none; }
  }
  @keyframes row-pulse-reject {
    0%, 23%   { background-color: transparent; filter: none; }
    28%, 34%  { background-color: rgba(254, 240, 138, 0.55); filter: drop-shadow(0 0 0.5px rgba(253, 224, 71, 0.85)); }
    38%, 100% { background-color: transparent; filter: none; }
  }
  @keyframes row-pulse-angle {
    0%, 43%   { background-color: transparent; filter: none; }
    48%, 54%  { background-color: rgba(254, 240, 138, 0.55); filter: drop-shadow(0 0 0.5px rgba(253, 224, 71, 0.85)); }
    58%, 100% { background-color: transparent; filter: none; }
  }
  @keyframes row-pulse-perp {
    0%, 63%   { background-color: transparent; filter: none; }
    68%, 74%  { background-color: rgba(254, 240, 138, 0.55); filter: drop-shadow(0 0 0.5px rgba(253, 224, 71, 0.85)); }
    78%, 100% { background-color: transparent; filter: none; }
  }
  /* Canvas element highlights — synced with tick draw-in windows.
     Each element gets a SINGLE keyframe that bakes in every phase it
     participates in. We can't stack independent animations on filter
     because the last one in the list wins and its idle filter: none
     would override the active phase's green glow.
     Phase 1 (8-14%, accept): all atoms briefly flash.
     Phase 3 (48-54%, Angle): A, C, D, e-ca, e-dc, m-ang glow.
     Phase 4 (68-74%, Perp):  B, C, D, e-bd, e-dc, m-perp glow.
     Phase 2 (reject) does not animate canvas atoms — the red cross +
     red row glow alone reads as "this constraint failed". */
  @keyframes ce-scan-only {
    0%, 5%    { filter: none; }
    8%, 14%   { filter: drop-shadow(0 0 0.9px #16a34a); }
    17%, 100% { filter: none; }
  }
  @keyframes ce-scan-angle {
    0%, 5%    { filter: none; }
    8%, 14%   { filter: drop-shadow(0 0 0.9px #16a34a); }
    17%, 45%  { filter: none; }
    48%, 54%  { filter: drop-shadow(0 0 0.9px #16a34a); }
    57%, 100% { filter: none; }
  }
  @keyframes ce-scan-perp {
    0%, 5%    { filter: none; }
    8%, 14%   { filter: drop-shadow(0 0 0.9px #16a34a); }
    17%, 65%  { filter: none; }
    68%, 74%  { filter: drop-shadow(0 0 0.9px #16a34a); }
    77%, 100% { filter: none; }
  }
  @keyframes ce-scan-angle-perp {
    0%, 5%    { filter: none; }
    8%, 14%   { filter: drop-shadow(0 0 0.9px #16a34a); }
    17%, 45%  { filter: none; }
    48%, 54%  { filter: drop-shadow(0 0 0.9px #16a34a); }
    57%, 65%  { filter: none; }
    68%, 74%  { filter: drop-shadow(0 0 0.9px #16a34a); }
    77%, 100% { filter: none; }
  }
  /* Phase 1 only — atoms not in Angle or Perp phases. */
  :host(.hover-active) .ce-fig .e-ab,
  :host(.hover-active) .ce-fig .m-eq,
  :host(.hover-active) .ce-fig .m-par {
    animation: ce-scan-only 6s linear infinite;
  }
  /* Phase 1 + Phase 2 — atoms in scan + Angle only. */
  :host(.hover-active) .ce-fig .v-a,
  :host(.hover-active) .ce-fig .vt-a,
  :host(.hover-active) .ce-fig .e-ca,
  :host(.hover-active) .ce-fig .m-ang {
    animation: ce-scan-angle 6s linear infinite;
  }
  /* Phase 1 + Phase 3 — atoms in scan + Perp only. */
  :host(.hover-active) .ce-fig .v-b,
  :host(.hover-active) .ce-fig .vt-b,
  :host(.hover-active) .ce-fig .e-bd,
  :host(.hover-active) .ce-fig .m-perp {
    animation: ce-scan-perp 6s linear infinite;
  }
  /* All three phases — C, D, e-dc participate in scan + Angle + Perp. */
  :host(.hover-active) .ce-fig .v-c,
  :host(.hover-active) .ce-fig .vt-c,
  :host(.hover-active) .ce-fig .v-d,
  :host(.hover-active) .ce-fig .vt-d,
  :host(.hover-active) .ce-fig .e-dc {
    animation: ce-scan-angle-perp 6s linear infinite;
  }
  .bullets {
    list-style: none;
    /* Was padding-top: 4 + margin-top: 4 (= 8px above bullets). Both
       set to 0 raises the 3-bullet stack by ~half a line, sitting
       tighter under "Structured observation". */
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 0.66rem;
    line-height: 1.45;
    width: 100%;
  }
  .bullets li { padding-left: 12px; position: relative; }
  .bullets li::before {
    content: '\\2022';
    position: absolute;
    left: 2px; top: -1px;
    color: #095462;
    font-weight: 700;
  }

  /* Hover triggers continuous laser-pulse flow on every arrow. With
     pathLength="100" on every .flow shape, the same keyframes work for
     all paths regardless of their geometric length — only duration
     varies per arrow. The pulse traverses the path once per cycle,
     fades in at start and fades out at end. */
  :host(.hover-active) .arrow .flow      { animation: flow-pulse 1.5s linear infinite; }
  :host(.hover-active) .arrow.green .flow { animation-duration: 0.8s; }
  :host(.hover-active) .ret .flow        { animation: flow-pulse 1.5s linear infinite; }
  @keyframes flow-pulse {
    0%   { stroke-dashoffset: 0;     opacity: 0; }
    8%   { opacity: 1; }
    92%  { opacity: 1; }
    100% { stroke-dashoffset: -100;  opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    :host(.hover-active) .flow { animation: none; opacity: 0; }
  }
</style>

<div class="node vlm-node">
  <span class="title">
    <svg class="vlm-frozen" viewBox="0 0 24 24" aria-hidden="true">
      <!-- svgrepo snow-alt-1: 3 spokes (vertical + 2 diagonals) with
           Y-bifurcations on the inner third of each spoke. Single path
           keeps stroke-linecap consistent across all 6 arms. -->
      <path d="M 12 3 V 7 M 12 7 V 17 M 12 7 L 9 4 M 12 7 L 15 4
               M 12 17 V 21 M 12 17 L 9 20 M 12 17 L 15 20
               M 4.21 7.5 L 7.67 9.5 M 7.67 9.5 L 16.33 14.5
               M 7.67 9.5 L 3.57 10.6 M 7.67 9.5 L 6.57 5.4
               M 16.33 14.5 L 19.79 16.5
               M 16.33 14.5 L 17.43 18.6 M 16.33 14.5 L 20.43 13.4
               M 4.21 16.5 L 7.67 14.5 M 7.67 14.5 L 16.33 9.5
               M 7.67 14.5 L 3.57 13.4 M 7.67 14.5 L 6.57 18.6
               M 16.33 9.5 L 19.79 7.5
               M 16.33 9.5 L 17.43 5.4 M 16.33 9.5 L 20.43 10.6" />
    </svg>VLM / agentic system</span>
</div>

<div class="row">
  <svg class="arrow blue" width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">
    <line x1="8" y1="0" x2="8" y2="20" />
    <polyline points="4 12 8 20 12 12" />
    <line class="flow" pathLength="100" x1="8" y1="0" x2="8" y2="20" />
  </svg>
  <span></span>
</div>

<div class="twin">
  <div class="node">
    <span class="title">ToolSpecs</span>
    <span class="sub">(typed actions)</span>
    <div class="tool-icons">
      <!-- Row 1: tool categories — 3:4 PORTRAIT (taller than wide), larger -->
      <div class="tool-row cats">
        <span class="tool-icon">
          <!-- Compass: pivot ring + center dot at top, two diverging
               legs, a Q-curve V-shape constraint bar joining them at
               the mid section, a pencil body (rect + filled tip) on
               the left leg, and an outer-curve needle on the right
               leg. All line elements share the same stroke-width via
               .tool-icon svg; the pivot dot and pencil tip are the
               only filled accents (same style). -->
          <svg viewBox="0 0 18 24">
            <!-- short vertical stem rising above the pivot ring -->
            <line x1="9" y1="0.5" x2="9" y2="2.2"/>
            <!-- pivot ring + center dot -->
            <circle cx="9" cy="4" r="1.8"/>
            <circle cx="9" cy="4" r="0.7" fill="#095462" stroke="none"/>
            <!-- Left leg: long straight line from pivot down to the
                 lower-left. Passes BEHIND the pencil rect (which is
                 white-filled below). -->
            <line x1="9" y1="5.8" x2="4.5" y2="22.0"/>
            <!-- Right leg + needle = ONE continuous straight line from
                 pivot down to the needle tip area. The "needle" is
                 simply the lower part of the leg ending in a small
                 filled triangular spike. -->
            <line x1="9" y1="5.8" x2="13.5" y2="22.0"/>
            <!-- V-shape constraint bar: arc between the two (now
                 symmetric) legs, endpoints 0.5 units OUTSIDE each leg
                 (overshoot). Bulges downward. -->
            <path d="M 6.2 14 Q 9 15.7 11.8 14" fill="none"/>
            <!-- Pencil rect: WHITE-filled so it visually hides the
                 portion of the left leg passing through it; rendered
                 AFTER the leg so the fill wins. -->
            <rect x="5.0" y="16.0" width="1.6" height="4.7" fill="#fff"/>
            <!-- Pencil tip: filled triangle, the only "fill accent"
                 on the pencil. -->
            <polygon points="5.0 20.7 5.8 23.5 6.6 20.7" fill="#095462" stroke="none"/>
            <!-- Needle tip: small filled triangle attached to the end
                 of the needle line, giving it a sharp spike look
                 without breaking the "one continuous line" feel. -->
            <polygon points="13.0 22.0 13.5 23.5 14.0 22.0" fill="#095462" stroke="none"/>
          </svg>
          <span class="icon-label">construct</span>
        </span>
        <span class="tool-icon">
          <!-- Magnifier — steeper handle (~51deg, slope 1.21) still
               on a ray through the lens center. Two-segment handle
               for a "candle in holder" look: thin neck + thick body.
               Lens center shifted left to (6.5, 8) so the overall
               composition's visual center balances the right-heavy
               handle. Handle lengthened to ~7 units total (thin 2.6
               + thick 4.5) so it reads as a natural-length stick;
               viewBox 18x19 accommodates the longer tip. -->
          <svg viewBox="0 0 18 19">
            <circle cx="6.5" cy="8" r="5.5"/>
            <!-- Thin connecting neck (inherits stroke-width 0.8).
                 Length 2.6 along the ray so ~1.5 units remain visible
                 after the thick body's round cap (radius 1.1) takes
                 a 1.1-unit bite at the join. -->
            <line x1="10.0" y1="12.25" x2="11.65" y2="14.26"/>
            <!-- Thicker candle body, longer (4.5 units along the ray)
                 so the whole handle has a natural stick proportion. -->
            <line x1="11.65" y1="14.26" x2="14.51" y2="17.73" stroke-width="2.2"/>
          </svg>
          <span class="icon-label">query</span>
        </span>
        <span class="tool-icon">
          <!-- Eraser — paths copied verbatim from eraser-clean-svgrepo-com
               (viewBox 0 0 512 512, 3 filled paths: short pill +
               diagonal stroke + main eraser+ground silhouette with an
               inner cutout). The original fill is recolored to the
               icon accent; stroke disabled per-path so it doesn't pick
               up the .tool-icon svg outline rule. -->
          <svg class="eraser-icon" viewBox="0 0 512 512">
            <path fill="#095462" stroke="none" d="M60.197,418.646H27.571c-6.978,0-12.634,5.657-12.634,12.634s5.656,12.634,12.634,12.634h32.627c6.978,0,12.634-5.657,12.634-12.634C72.831,424.304,67.174,418.646,60.197,418.646z"/>
            <path fill="#095462" stroke="none" d="M114.205,467.363c-4.934-4.932-12.933-4.934-17.867,0l-23.07,23.07c-4.934,4.934-4.935,12.933,0,17.868c2.467,2.466,5.7,3.701,8.933,3.701c3.233,0,6.467-1.234,8.933-3.701l23.07-23.07C119.139,480.297,119.14,472.298,114.205,467.363z"/>
            <path fill="#095462" stroke="none" d="M400.431,424.963H262.965l226.699-226.688c9.851-9.852,9.852-25.881,0.001-35.733L334.522,7.388c-9.853-9.851-25.882-9.851-35.735,0l-247.99,247.99c-14.318,14.318-22.203,33.354-22.203,53.602c0,20.247,7.885,39.284,22.203,53.602l74.701,74.699c8.351,8.351,19.455,12.951,31.266,12.951H400.43c6.978,0,12.634-5.657,12.634-12.634C413.065,430.621,407.409,424.963,400.431,424.963z M156.765,424.963c-5.062,0-9.82-1.972-13.401-5.551l-74.699-74.699c-19.704-19.704-19.704-51.765,0-71.468l40.557-40.557l133.335,133.336c2.467,2.466,5.7,3.7,8.933,3.7s6.467-1.234,8.933-3.7c4.934-4.934,4.935-12.933,0.001-17.868L127.09,214.821L316.655,25.254l155.142,155.155L227.23,424.963H156.765z"/>
            <!-- Two trailing "dust" dots replacing the chopped-off
                 ground-bar end. Diameter (~25) matches the bar
                 thickness (y=425..450), so the dots read as a
                 continuation of the line itself. cy = bar center. -->
            <circle fill="#095462" stroke="none" cx="445" cy="437.6" r="12.6"/>
            <circle fill="#095462" stroke="none" cx="492" cy="437.6" r="12.6"/>
          </svg>
          <span class="icon-label">delete</span>
        </span>
        <span class="tool-icon">
          <!-- Picture frame: sun + mountain, in a 1:1 viewBox.
               Frame is a 14x14 square with rx=0.8 corners. Mountain
               redrawn to fill the now-taller interior so the
               composition still spans the frame fully. -->
          <svg viewBox="0 0 18 18">
            <rect x="2" y="2" width="14" height="14" rx="0.8"/>
            <circle cx="5.5" cy="5.5" r="1.0"/>
            <!-- Mountain: base lifted to y=15 (was 16) so the bottom
                 gap to the outer frame (y=16) is 1 unit, matching the
                 side-wall gaps (mountain walls at x=3/15, frame at
                 x=2/16). Rounded corners radius 0.8. -->
            <path d="M 3 11 Q 6 5 8.6 9.5 Q 12 3.5 15 10 V 14.2 Q 15 15 14.2 15 H 3.8 Q 3 15 3 14.2 Z"/>
          </svg>
          <span class="icon-label">render</span>
        </span>
      </div>
      <!-- Dashed separator between the two rows -->
      <div class="tool-icons-sep"></div>
      <!-- Row 2: geometric primitives — 4 flip-cubes cycling through
           3 tool states each (mapped to appendix Table B.1 categories).
           Slot 1 (Points):     point  → midpoint → intersect
           Slot 2 (Lines):      segment → parallel → tangent
           Slot 3 (Circles):    circle  → arc      → polygon
           Slot 4 (Angles):     angle   → bisector → "..."   -->
      <div class="tool-row prims">
        <!-- ──────── Slot 1: Points family ──────── -->
        <span class="tool-icon cube">
          <span class="cube-spin">
            <span class="cube-face front">
              <!-- point -->
              <svg viewBox="0 0 12 12"><circle cx="6" cy="6.5" r="1.6" fill="#095462" stroke="none"/></svg>
              <span class="icon-label">point</span>
            </span>
            <span class="cube-face bottom">
              <!-- midpoint: segment with bigger midpoint dot -->
              <svg viewBox="0 0 12 13">
                <line x1="1.2" y1="11.1" x2="10.8" y2="3.9"/>
                <circle cx="1.2" cy="11.1" r="1.0" fill="#095462" stroke="none"/>
                <circle cx="10.8" cy="3.9" r="1.0" fill="#095462" stroke="none"/>
                <circle cx="6" cy="7.5" r="1.5" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">midpoint</span>
            </span>
            <span class="cube-face back">
              <!-- intersect: straight line (upper-left to lower-right) +
                   circular arc (upper-right to lower-left) with arc
                   centre in the lower-right (around (11.4, 13)). The
                   arc bows toward the upper-left, intersecting the
                   straight line near (4.4, 5.8). -->
              <svg viewBox="0 0 12 13">
                <line x1="1.5" y1="3" x2="10.5" y2="11.5"/>
                <path d="M 10.5 3 A 10 10 0 0 0 1.5 11.5" fill="none"/>
                <circle cx="4.4" cy="5.8" r="1.5" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">intersect</span>
            </span>
            <span class="cube-face top">
              <!-- point (same as front for seamless wrap) -->
              <svg viewBox="0 0 12 12"><circle cx="6" cy="6.5" r="1.6" fill="#095462" stroke="none"/></svg>
              <span class="icon-label">point</span>
            </span>
          </span>
        </span>
        <!-- ──────── Slot 2: Lines family ──────── -->
        <span class="tool-icon cube">
          <span class="cube-spin">
            <span class="cube-face front">
              <!-- segment -->
              <svg viewBox="0 0 12 13">
                <line x1="1.2" y1="11.1" x2="10.8" y2="3.9"/>
                <circle cx="1.2" cy="11.1" r="1.2" fill="#095462" stroke="none"/>
                <circle cx="10.8" cy="3.9" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">segment</span>
            </span>
            <span class="cube-face bottom">
              <!-- parallel: two parallel lines + point through which the
                   constructed parallel passes -->
              <svg viewBox="0 0 12 13">
                <line x1="1.2" y1="5" x2="10.8" y2="3"/>
                <line x1="1.2" y1="11" x2="10.8" y2="9"/>
                <circle cx="6" cy="10" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">parallel</span>
            </span>
            <span class="cube-face back">
              <!-- tangent: horizontal line above + upper-half arc below
                   with a tangent-point dot bridging them. Line is bumped
                   up to y=3.8 (was 4.6) so the stroke widths don't visually
                   "cross" the circle outline. The full circle is replaced
                   by an arc — the UPPER half of the same circle, span
                   from (2.1,8) to (8.9,8) curving through apex (5.5,4.6). -->
              <svg viewBox="0 0 12 13">
                <!-- 3 elements wrapped in a <g> so they all shift
                     together; translate(0 2) moves the whole tangent
                     icon DOWN 2 viewBox units while keeping their
                     relative positions intact. -->
                <g transform="translate(0 2)">
                  <line x1="0.5" y1="3.3" x2="11.5" y2="5.5"/>
                  <path d="M 2.1 8 A 3.4 3.4 0 0 1 8.9 8" fill="none"/>
                  <circle cx="6.1" cy="4.4" r="1" fill="#095462" stroke="none"/>
                </g>
              </svg>
              <span class="icon-label">tangent</span>
            </span>
            <span class="cube-face top">
              <!-- segment (same as front) -->
              <svg viewBox="0 0 12 13">
                <line x1="1.2" y1="11.1" x2="10.8" y2="3.9"/>
                <circle cx="1.2" cy="11.1" r="1.2" fill="#095462" stroke="none"/>
                <circle cx="10.8" cy="3.9" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">segment</span>
            </span>
          </span>
        </span>
        <!-- ──────── Slot 3: Circles/Polygons family ──────── -->
        <span class="tool-icon cube">
          <span class="cube-spin">
            <span class="cube-face front">
              <!-- circle -->
              <svg viewBox="0 0 12 13">
                <circle cx="6" cy="7.5" r="4.32"/>
                <circle cx="9.05" cy="4.45" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">circle</span>
            </span>
            <span class="cube-face bottom">
              <!-- arc: curved arc (apex ~y=6) + 2 endpoint dots at the
                   chord (y=8) + a small center dot (y=10). Center sits
                   visibly BELOW the chord, giving the icon vertical
                   structure (apex → chord → center) rather than the
                   previous nearly-flat semi-arc. -->
              <svg viewBox="0 0 12 13">
                <path d="M 1.1 8 A 5.6 5.6 0 0 1 10.9 8" fill="none"/>
                <circle cx="1.1" cy="8" r="1" fill="#095462" stroke="none"/>
                <circle cx="10.9" cy="8" r="1" fill="#095462" stroke="none"/>
                <circle cx="6" cy="10.71" r="0.8" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">arc</span>
            </span>
            <span class="cube-face back">
              <!-- polygon: regular PENTAGON + 5 vertex dots (instead of
                   a triangle — clearer "polygon ≠ triangle" semantics,
                   avoids overlap with common commercial triangle icons).
                   Centred at (6, 7.25), radius 3.2 — vertical centroid
                   matches the other state-3 icons (intersect / tangent
                   / ellipsis). -->
              <svg viewBox="0 0 12 13">
                <polygon points="6 3.25, 2.2 6, 3.65 10.5, 8.35 10.5, 9.8 6" fill="none"/>
                <circle cx="6" cy="3.25" r="0.9" fill="#095462" stroke="none"/>
                <circle cx="2.2" cy="6" r="0.9" fill="#095462" stroke="none"/>
                <circle cx="3.65" cy="10.5" r="0.9" fill="#095462" stroke="none"/>
                <circle cx="8.35" cy="10.5" r="0.9" fill="#095462" stroke="none"/>
                <circle cx="9.8" cy="6" r="0.9" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">polygon</span>
            </span>
            <span class="cube-face top">
              <!-- circle (same as front) -->
              <svg viewBox="0 0 12 13">
                <circle cx="6" cy="7.5" r="4.32"/>
                <circle cx="9.05" cy="4.45" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">circle</span>
            </span>
          </span>
        </span>
        <!-- ──────── Slot 4: Angles / Measurements ──────── -->
        <span class="tool-icon cube">
          <span class="cube-spin">
            <span class="cube-face front">
              <!-- angle -->
              <svg viewBox="0 0 12 13">
                <polyline points="11.2 11.5 2 11.5 10.06 3.44"/>
                <path d="M 6.6 11.5 A 4.6 4.6 0 0 0 5.25 8.25" fill="none"/>
                <circle cx="2" cy="11.5" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">angle</span>
            </span>
            <span class="cube-face bottom">
              <!-- bisector: angle (70° opening, was 45°) + dashed
                   bisector line at 35° from horizontal (exact midline
                   between arm-1 at 0° and arm-2 at 70°). Dash pattern
                   widened to "1.8 1.4" so dashes read as distinct
                   instead of looking like a solid line. -->
              <svg viewBox="0 0 12 13">
                <polyline points="11.2 11.5 2 11.5 5.2 2.7"/>
                <line x1="2" y1="11.5" x2="8.6" y2="6.9" stroke-dasharray="1.8 1.4"/>
                <circle cx="2" cy="11.5" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">bisector</span>
            </span>
            <span class="cube-face back">
              <!-- ellipsis: three dots (indicates "and many more").
                   No icon-label — the 3 dots ARE the caption. -->
              <svg viewBox="0 0 12 13">
                <circle cx="2.5" cy="7" r="1.1" fill="#095462" stroke="none"/>
                <circle cx="6" cy="7" r="1.1" fill="#095462" stroke="none"/>
                <circle cx="9.5" cy="7" r="1.1" fill="#095462" stroke="none"/>
              </svg>
            </span>
            <span class="cube-face top">
              <!-- angle (same as front) -->
              <svg viewBox="0 0 12 13">
                <polyline points="11.2 11.5 2 11.5 10.06 3.44"/>
                <path d="M 6.6 11.5 A 4.6 4.6 0 0 0 5.25 8.25" fill="none"/>
                <circle cx="2" cy="11.5" r="1.2" fill="#095462" stroke="none"/>
              </svg>
              <span class="icon-label">angle</span>
            </span>
          </span>
        </span>
      </div>
    </div>
  </div>
  <svg class="arrow blue" width="20" height="18" viewBox="0 0 20 18" aria-hidden="true">
    <line x1="0" y1="9" x2="20" y2="9" />
    <polyline points="12 4 20 9 12 14" />
    <line class="flow" pathLength="100" x1="0" y1="9" x2="20" y2="9" />
  </svg>
  <div class="node">
    <span class="title">Constraint Engine</span>
    <span class="sub">(verification backend)</span>
    <!-- Schematic canvas figure: quadrilateral ABCD with 4 predicate
         marks (= perp // and the angle symbol). Angle ACD = 55deg holds
         EXACTLY by construction — see comment above on .ce-fig. All
         four marks sit OUTSIDE their respective segments. -->
    <svg class="ce-fig" viewBox="0 0 60 30" aria-hidden="true">
      <!-- Outline: A(25.6,5) -> B(47,5) -> D(47,23) -> C(13,23).
           All y shifted -3 vs previous draft to reduce ce-fig render
           height (viewBox 36 -> 30) and pull Engine bottom up. BD is
           strictly vertical (B and D share x=47). Angle ACD = 55deg
           unchanged: shifting all y by the same amount preserves the
           relative geometry / dot-product. -->
      <!-- Fill polygon stays a single shape (no stroke); the 4 edges
           are drawn as separate lines so each can be highlighted
           individually during the Angle / IsPerp phases. -->
      <polygon class="quad-fill" points="25.6,5 47,5 47,23 13,23" />
      <line class="quad-edge e-ab" x1="25.6" y1="5"  x2="47"   y2="5"  />
      <line class="quad-edge e-bd" x1="47"   y1="5"  x2="47"   y2="23" />
      <line class="quad-edge e-dc" x1="47"   y1="23" x2="13"   y2="23" />
      <line class="quad-edge e-ca" x1="13"   y1="23" x2="25.6" y2="5"  />
      <text class="mk eq m-eq"  x="36.3" y="2">=</text>
      <text class="mk m-perp"   x="50"   y="14">&perp;</text>
      <text class="mk par m-par" x="30"  y="26.5">//</text>
      <text class="mk m-ang"    x="14.8" y="11.5">&ang;</text>
      <circle class="vx v-a" cx="25.6" cy="5" r="3.4" />
      <text class="vt vt-a" x="25.6" y="5">A</text>
      <circle class="vx v-b" cx="47" cy="5" r="3.4" />
      <text class="vt vt-b" x="47" y="5">B</text>
      <circle class="vx v-c" cx="13" cy="23" r="3.4" />
      <text class="vt vt-c" x="13" y="23">C</text>
      <circle class="vx v-d" cx="47" cy="23" r="3.4" />
      <text class="vt vt-d" x="47" y="23">D</text>
    </svg>
    <!-- Dashed separator above the verdict block, mirrors the
         tool-icons-sep divider used in ToolSpecs. -->
    <div class="tool-icons-sep"></div>
    <div class="verdicts">
      <div class="verdict-row">
        <span class="v-ok">
          <svg class="verdict-badge" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="5" fill="#16a34a" stroke="none"/>
            <polyline class="v-tick t-accept" points="3.4 6.2 5.2 8 8.6 4.4" stroke="#fff" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          accepted
        </span>
        <span class="v-bad">
          <svg class="verdict-badge" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="5" fill="#dc2626" stroke="none"/>
            <!-- v-cross-a: starts at (4,4) [left-top], ends at (8,8) [right-bot] — natural left-to-right.
                 v-cross-b: starts at (4,8) [left-bot], ends at (8,4) [right-top] — also left-to-right
                 (the visual diagonal still crosses correctly because line is bidirectional). -->
            <line class="v-cross v-cross-a" x1="4" y1="4" x2="8" y2="8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
            <line class="v-cross v-cross-b" x1="4" y1="8" x2="8" y2="4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          rejected
        </span>
      </div>
      <code class="verdict-line va-angle">
        <svg class="verdict-badge" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill="#16a34a" stroke="none"/>
          <polyline class="v-tick t-angle" points="3.4 6.2 5.2 8 8.6 4.4" stroke="#fff" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Angle(A,C,D) = 55&deg;
      </code>
      <code class="verdict-line va-perp">
        <svg class="verdict-badge" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill="#16a34a" stroke="none"/>
          <polyline class="v-tick t-perp" points="3.4 6.2 5.2 8 8.6 4.4" stroke="#fff" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        IsPerpendicular = True
      </code>
    </div>
  </div>
</div>

<!-- Caption (left) and green ↓ arrow (right) on the same row,
     mirroring fig1 where the descriptive text sits beside the
     verify-to-observation arrow. -->
<div class="dag-row">
  <!-- col 1 (2fr): caption aligns under ToolSpecs cell -->
  <div class="dag-caption">
    <span class="cap-line">Builds an engine-valid canvas state</span>
    <span class="cap-line">and dependency DAG</span>
  </div>
  <!-- col 2 (auto): empty spacer matching twin's horizontal arrow column -->
  <span></span>
  <!-- col 3 (1fr): green ↓ aligns under Constraint Engine's centerline -->
  <svg class="arrow green" width="18" height="37" viewBox="0 0 18 37" aria-hidden="true">
    <line x1="9" y1="0" x2="9" y2="37" />
    <polyline points="3 27 9 37 15 27" />
    <line class="flow" pathLength="100" x1="9" y1="0" x2="9" y2="37" />
  </svg>
</div>

<div class="node observation">
  <span class="title">Structured observation</span>
  <ul class="bullets">
    <li>accept / reject verdicts</li>
    <li>canvas state / object deltas</li>
    <li>exact query values</li>
  </ul>
  <a class="obs-illustration-wrap"
     href="assets/demos/canvas_op.xml"
     download="draw2think_engine_canvas.xml"
     title="Download GeoGebra source (XML)">
    <img class="obs-illustration"
         src="assets/demos/canvas_op.png"
         alt="engine canvas snapshot: triangle with inscribed circle" />
    <svg class="obs-download-icon"
         viewBox="0 0 12 12" aria-hidden="true"
         fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 1.5 v6.5" />
      <polyline points="3.5 5.5 6 8 8.5 5.5" />
      <path d="M2 10.2 h8" />
    </svg>
  </a>
</div>

<!-- L-return (asymmetric horizontals): obs is shrunk by margin-right
     so its east-edge sits LEFT of the L vertical (long bottom-horiz);
     VLM is full-width so its east-edge sits RIGHT of the L vertical
     (short top-horiz, ending at viewBox x=50 = VLM east). -->
<svg class="ret" preserveAspectRatio="none" viewBox="0 0 84 240" aria-hidden="true">
  <!-- viewBox aspect (84:240) now ≈ rendered SVG aspect, so 1 unit ≈
       1 CSS px. Circles stay circular; 8-unit Q corners look like
       actual 8px-radius rounded turns instead of stretched ellipses. -->
  <!-- Endpoints recalculated after padding-right reduced (38→22):
       observation east edge → viewBox x=16 (was 0)
       VLM east edge        → viewBox x=36 (was 20). -->
  <path d="M 16 232 L 76 232 Q 84 232 84 224 L 84 16 Q 84 8 76 8 L 36 8" />
  <polyline points="44 4 36 8 44 12" />
  <path class="flow" pathLength="100" d="M 16 232 L 76 232 Q 84 232 84 224 L 84 16 Q 84 8 76 8 L 36 8" />
</svg>
<span class="feedback-label">per-action<br>engine<br>feedback</span>
`;

  class D2TDiagram extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = TEMPLATE;
      // Hover trigger = the WHOLE enclosing .paradigm article (col 4),
      // not just <d2t-diagram>. Mirrors col 1 / 2 / 3: toggle a
      // .hover-active class on the host so the shadow-DOM
      // :host(.hover-active) selectors pick up parent-driven hover too.
      const trigger = this.closest('.paradigm') || this;
      trigger.addEventListener('mouseenter', () => this.classList.add('hover-active'));
      trigger.addEventListener('mouseleave', () => this.classList.remove('hover-active'));
    }
  }
  window.customElements.define('d2t-diagram', D2TDiagram);
})();
