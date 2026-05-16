// <code-tiles> web component — col 3 (Executable Scripts) top section.
// 5 code tiles, each with a title + a code snippet that types out
// character-by-character on hover. All 5 snippets stream SIMULTANEOUSLY
// (no sequencing) so the column reads like a parallel multi-language
// code-generation moment.
//
// Idle state: full snippets visible. Hover (anywhere on the enclosing
// .paradigm article): clear all snippets then stream them in parallel,
// hold briefly when all done, loop. Leave: restore full text.
(function () {
  if (window.customElements && window.customElements.get('code-tiles')) return;

  // Snippets restored from the fig1 col-3 reference image — short,
  // recognisable language-specific fragments. Order MATCHES the DOM
  // order of <code class="snippet"> elements below (left col: Python,
  // SVG; right col: GeoGebra, TikZ, Post-hoc), so the JS index-map
  // assigns each snippet text to the correct tile. Lengths differ on
  // purpose so the shorter ones finish streaming early.
  const SNIPPETS = [
    { title: 'Python / Matplotlib',
      code: 'fig, ax = plt.subplots()\nax.plot(xs, ys, "-o")\nax.add_patch(Circle(c, r))\nax.set_aspect("equal")\nplt.axis("off")' },
    { title: 'SVG / DOM Markup',
      code: '<svg viewBox="-2 -2 8 8">\n<line x1="..." y1="..."\n      x2="..." y2="..." />\n<circle cx="..." cy="..."\n        r="..."/>\n</svg>' },
    { title: 'GeoGebra Script',
      code: 'A(...), B(...), C(...)\nLine(A, B), Circle(C, r)\nTangent(A, c) ...' },
    { title: 'TikZ / LaTeX',
      code: '\\draw (0,0) -- (3,0)\n   -- (1.5,2) -- cycle;\n\\node[below] at (0,0) {A};' },
    { title: 'Post-hoc Assertions',
      code: 'assert is_collinear(A,B,C)\nassert equal(ang1, ang2)\nassert length(AB) > 0' },
  ];

  const TEMPLATE = `
<style>
  :host {
    display: block;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    color: #15181c;
    --p-accent: #c2410c;
    --p-soft:   hsl(20, 60%, 97%);
  }
  /* Two independent flex columns instead of a strict grid — each column
     stacks its tiles top-to-bottom with no row-alignment between cols.
       LEFT  col: Python      → SVG (fills remaining height)
       RIGHT col: GeoGebra    → TikZ → Post-hoc (fills remaining height)
     align-items: stretch makes both columns the SAME total height, so
     the bottom-flexed tiles (SVG, Post-hoc) end at the same baseline.
     But TikZ's TOP is no longer pinned to SVG's top — it just sits
     directly under GeoGebra. Negative side margins burst the grid
     OUTSIDE the host's natural content area. */
  .grid {
    display: flex;
    flex-direction: row;
    gap: 4px;
    margin-left: -5px;
    margin-right: -5px;       /* extra rightward extension — widens
                                  the grid 8px to the right. Effect:
                                  left col's RIGHT edge moves right
                                  (≈4px wider), right col SHIFTS right
                                  as a whole and gains 4px on its
                                  right edge too. */
    align-items: stretch;
  }
  .col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .tile {
    background: #fff;
    border: 1px solid color-mix(in srgb, var(--p-accent) 28%, transparent);
    border-radius: 5px;
    padding: 7px 6px 6px;
    overflow: hidden;
  }
  /* Python tile gets extra bottom padding for breathing room under the
     last line. Safe to enlarge — SVG (.svg-tile, flex: 1) below it
     will simply shrink to compensate, so the column's TOTAL height
     stays governed by align-items: stretch on .grid, and SVG's bottom
     edge therefore still aligns with Post-hoc Assertions' bottom in
     the right column. */
  .python-tile {
    padding-bottom: 8px;
    padding-right: 4px;        /* trimmed (was 6) so the Python snippet
                                  uses more of the tile width — its longer
                                  lines now have more room before wrapping. */
  }
  /* Right-column tiles: trim right padding (less margin to outer
     border) and bump LEFT padding by +1 so the code lines have a
     hair more breathing room from the left border. */
  .col:last-child .tile {
    padding-right: 5px;
    padding-left: 5px;
  }
  /* Python snippet gets looser line spacing for breathing room. Other
     tiles keep their default 1.55. Step positions stay at 0/20/40/60/
     80% — each line still occupies 1/5 of the (now-taller) snippet
     height, so .scan-exec & .scan-check land on the correct rows
     even with the larger line-height. We do scale up .python-tile
     .scan height to match the new per-line height so the highlight
     still covers a full row. */
  .python-tile .snippet {
    line-height: 1.85;
  }
  .python-tile .scan {
    height: 0.85rem;
  }
  /* Tiles that fill the leftover vertical space at the bottom of their
     column so the two columns end at the same baseline. */
  .tile.svg-tile,
  .tile.posthoc-tile {
    flex: 1;
  }
  /* SVG/DOM tile — long inline markup needs more horizontal room.
     Right padding trimmed (was 6) so lines like
     '<line x1="..." y1="..."' don't wrap as aggressively. */
  .svg-tile {
    padding-right: 3px;
  }
  .title {
    display: block;
    /* Sans-serif (Inter) is markedly narrower than the mono stack we
       use for the code body — gives the tile labels more breathing
       room without shrinking font-size. */
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 0.52rem;
    font-weight: 700;
    color: var(--p-accent);
    letter-spacing: -0.015em;
    text-align: center;
    margin-bottom: 5px;
  }
  .snippet {
    display: block;
    font-family: 'SF Mono', Menlo, Consolas, 'Liberation Mono', ui-monospace, monospace;
    font-size: 0.46rem;
    line-height: 1.55;             /* looser code line spacing */
    letter-spacing: -0.048em;      /* tighten char spacing to keep code from overflowing now that font is larger */
    color: #15181c;
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 1em;
  }
  /* Blinking cursor tail while the snippet is mid-streaming.
     The .streaming class is JS-toggled on each snippet individually. */
  .snippet.streaming::after {
    content: '▍';
    margin-left: 1px;
    color: var(--p-accent);
    animation: cursor-blink 0.55s step-end infinite;
  }
  @keyframes cursor-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  /* Scan-bar overlays — sweep through specific code lines during the
     col-3 pipeline's Execute (49–55% of 8s cycle) and Post-hoc (62–68%)
     phases. Each tile sets per-tile --exec-start / --exec-end /
     --check-start / --check-end (as % of snippet height) via inline
     styles so the bar enters and exits the correct line range. */
  .snippet-wrap {
    position: relative;
  }
  .snippet {
    position: relative;
    z-index: 1;             /* sit above the scan-bar */
  }
  .scan {
    position: absolute;
    left: -4px;             /* extend 3px past snippet-wrap on each side
                               so the highlight bar reaches into the
                               tile padding visually wider than the code */
    right: -4px;
    height: 0.7rem;         /* about one snippet line */
    top: 0;
    background: color-mix(in srgb, var(--p-accent) 14%, transparent);
    border-left: 2px solid var(--p-accent);
    pointer-events: none;
    opacity: 0;
    z-index: 0;
  }
  /* Per-tile stepped scan animations — bar snaps line-by-line through
     discrete --*-step-N positions, holding each line for the
     full step duration before instantly jumping to the next.
     Window: Execute 48–60% (12% of cycle), Post-hoc 62–74% (12%).
     Step duration depends on N: 2→6%, 3→4%, 6→2% of cycle. */
  :host(.hover-active) .python-tile   .scan-exec  { animation: scan-exec-3 8s linear infinite; }
  :host(.hover-active) .python-tile   .scan-check { animation: scan-check-2 8s linear infinite; }
  :host(.hover-active) .geogebra-tile .scan-exec  { animation: scan-exec-3 8s linear infinite; }
  :host(.hover-active) .svg-tile      .scan-exec  { animation: scan-exec-6 8s linear infinite; }
  :host(.hover-active) .tikz-tile     .scan-exec  { animation: scan-exec-3 8s linear infinite; }
  :host(.hover-active) .posthoc-tile  .scan-check { animation: scan-check-3 8s linear infinite; }

  /* 2-step exec (TikZ): each line 6% ≈ 480ms */
  @keyframes scan-exec-2 {
    0%, 46.5%   { opacity: 0; top: var(--exec-step-1, 0%); }
    48%         { opacity: 0.9; top: var(--exec-step-1, 0%); }
    53.99%      { opacity: 0.9; top: var(--exec-step-1, 0%); }
    54%         { opacity: 0.9; top: var(--exec-step-2, 0%); }
    59.99%      { opacity: 0.9; top: var(--exec-step-2, 0%); }
    60%         { opacity: 0.9; top: var(--exec-step-2, 0%); }
    61.5%, 100% { opacity: 0; top: var(--exec-step-2, 0%); }
  }
  /* 3-step exec (Python lines 1–3, GeoGebra): each line 4% ≈ 320ms */
  @keyframes scan-exec-3 {
    0%, 46.5%   { opacity: 0; top: var(--exec-step-1, 0%); }
    48%         { opacity: 0.9; top: var(--exec-step-1, 0%); }
    51.99%      { opacity: 0.9; top: var(--exec-step-1, 0%); }
    52%         { opacity: 0.9; top: var(--exec-step-2, 0%); }
    55.99%      { opacity: 0.9; top: var(--exec-step-2, 0%); }
    56%         { opacity: 0.9; top: var(--exec-step-3, 0%); }
    59.99%      { opacity: 0.9; top: var(--exec-step-3, 0%); }
    60%         { opacity: 0.9; top: var(--exec-step-3, 0%); }
    61.5%, 100% { opacity: 0; top: var(--exec-step-3, 0%); }
  }
  /* 6-step exec (SVG): each line 2% ≈ 160ms */
  @keyframes scan-exec-6 {
    0%, 46.5%   { opacity: 0; top: var(--exec-step-1, 0%); }
    48%         { opacity: 0.9; top: var(--exec-step-1, 0%); }
    49.99%      { opacity: 0.9; top: var(--exec-step-1, 0%); }
    50%         { opacity: 0.9; top: var(--exec-step-2, 0%); }
    51.99%      { opacity: 0.9; top: var(--exec-step-2, 0%); }
    52%         { opacity: 0.9; top: var(--exec-step-3, 0%); }
    53.99%      { opacity: 0.9; top: var(--exec-step-3, 0%); }
    54%         { opacity: 0.9; top: var(--exec-step-4, 0%); }
    55.99%      { opacity: 0.9; top: var(--exec-step-4, 0%); }
    56%         { opacity: 0.9; top: var(--exec-step-5, 0%); }
    57.99%      { opacity: 0.9; top: var(--exec-step-5, 0%); }
    58%         { opacity: 0.9; top: var(--exec-step-6, 0%); }
    60%         { opacity: 0.9; top: var(--exec-step-6, 0%); }
    61.5%, 100% { opacity: 0; top: var(--exec-step-6, 0%); }
  }
  /* 2-step check (Python lines 4–5): each line 6% ≈ 480ms */
  @keyframes scan-check-2 {
    0%, 60.5%   { opacity: 0; top: var(--check-step-1, 0%); }
    62%         { opacity: 0.9; top: var(--check-step-1, 0%); }
    67.99%      { opacity: 0.9; top: var(--check-step-1, 0%); }
    68%         { opacity: 0.9; top: var(--check-step-2, 0%); }
    73.99%      { opacity: 0.9; top: var(--check-step-2, 0%); }
    74%         { opacity: 0.9; top: var(--check-step-2, 0%); }
    75.5%, 100% { opacity: 0; top: var(--check-step-2, 0%); }
  }
  /* 3-step check (Post-hoc Assertions): each line 4% ≈ 320ms */
  @keyframes scan-check-3 {
    0%, 60.5%   { opacity: 0; top: var(--check-step-1, 0%); }
    62%         { opacity: 0.9; top: var(--check-step-1, 0%); }
    65.99%      { opacity: 0.9; top: var(--check-step-1, 0%); }
    66%         { opacity: 0.9; top: var(--check-step-2, 0%); }
    69.99%      { opacity: 0.9; top: var(--check-step-2, 0%); }
    70%         { opacity: 0.9; top: var(--check-step-3, 0%); }
    73.99%      { opacity: 0.9; top: var(--check-step-3, 0%); }
    74%         { opacity: 0.9; top: var(--check-step-3, 0%); }
    75.5%, 100% { opacity: 0; top: var(--check-step-3, 0%); }
  }
</style>

<!-- Two independent flex columns. Each column stacks its tiles
     top-to-bottom: Python→SVG on the left, GeoGebra→TikZ→Post-hoc
     on the right. The flex-1 svg/posthoc tiles fill leftover height
     so the two columns share a common bottom baseline; everything
     above them just stacks naturally with no cross-column alignment.
     Inline --exec-* and --check-* CSS vars set per-tile scan ranges
     (as % of snippet height) so the highlight bar sweeps the correct
     lines during Execute (49–55%) and Post-hoc (62–68%) phases. -->
<!-- Each tile sets --*-step-N custom properties at line-top positions
     (% of snippet height) so the per-tile scan-exec-N / scan-check-N
     keyframe can snap the bar through those exact rows. -->
<div class="grid">
  <div class="col">
    <div class="tile python-tile" style="--exec-step-1:0%;--exec-step-2:20%;--exec-step-3:40%;--check-step-1:60%;--check-step-2:80%;">
      <span class="title">Python / Matplotlib</span>
      <div class="snippet-wrap">
        <div class="scan scan-exec"></div>
        <div class="scan scan-check"></div>
        <code class="snippet"></code>
      </div>
    </div>
    <div class="tile svg-tile" style="--exec-step-1:0%;--exec-step-2:16.67%;--exec-step-3:33.33%;--exec-step-4:50%;--exec-step-5:66.67%;--exec-step-6:83.33%;">
      <span class="title">SVG / DOM Markup</span>
      <div class="snippet-wrap">
        <div class="scan scan-exec"></div>
        <code class="snippet"></code>
      </div>
    </div>
  </div>
  <div class="col">
    <div class="tile geogebra-tile" style="--exec-step-1:0%;--exec-step-2:33%;--exec-step-3:66%;">
      <span class="title">GeoGebra Script</span>
      <div class="snippet-wrap">
        <div class="scan scan-exec"></div>
        <code class="snippet"></code>
      </div>
    </div>
    <div class="tile tikz-tile" style="--exec-step-1:0%;--exec-step-2:33%;--exec-step-3:66%;">
      <span class="title">TikZ / LaTeX</span>
      <div class="snippet-wrap">
        <div class="scan scan-exec"></div>
        <code class="snippet"></code>
      </div>
    </div>
    <div class="tile posthoc-tile" style="--check-step-1:0%;--check-step-2:33%;--check-step-3:66%;">
      <span class="title">Post-hoc Assertions</span>
      <div class="snippet-wrap">
        <div class="scan scan-check"></div>
        <code class="snippet"></code>
      </div>
    </div>
  </div>
</div>
`;

  class CodeTiles extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = TEMPLATE;
      const snippets = root.querySelectorAll('.snippet');
      const fullTexts = SNIPPETS.map(s => s.code);

      // Idle: every snippet shows its full text.
      snippets.forEach((el, idx) => { el.textContent = fullTexts[idx]; });

      const CHAR_MS    = 16;     // base ms per character — fast typing
      const WORD_PAUSE = 14;     // extra ms after space (word boundary)
      // Streaming SYNCS with code-flow.js's looping 8s cycle. Each cycle:
      //   0–14%   VLM / arrow phase → snippets hold full text
      //   14%+    Code orbit lit → clear & stream all 5 in parallel
      // Within each streaming pass it's single-shot — shorter snippets
      // finish early and hold their full text, longer ones keep typing.
      // Then the OUTER 8s cycle restarts and the streaming fires again
      // (same beat as the Code-orbit lighting up next time round).
      const CYCLE_MS     = 8000;
      const PRE_DELAY_MS = 1120;  // 14% × 8000 — Code-orbit lit start
      let active  = false;
      let pending = [];          // pending setTimeout IDs (cleared on leave)

      const cancelAll = () => {
        pending.forEach(t => clearTimeout(t));
        pending = [];
      };
      const clearSnippets = () => {
        snippets.forEach(s => {
          s.textContent = '';
          s.classList.remove('streaming');
        });
      };
      const fillSnippets = () => {
        snippets.forEach((s, idx) => {
          s.textContent = fullTexts[idx];
          s.classList.remove('streaming');
        });
      };

      // Stream one snippet char-by-char. When it reaches its end, the
      // streaming class drops and it just sits — no re-trigger.
      const streamOne = (el, full) => {
        let i = 0;
        el.classList.add('streaming');
        const tick = () => {
          if (!active) return;
          if (i <= full.length) {
            el.textContent = full.slice(0, i);
            const lastChar = full[i - 1] || '';
            const delay = (lastChar === ' ') ? CHAR_MS + WORD_PAUSE : CHAR_MS;
            i += 1;
            const t = setTimeout(tick, delay);
            pending.push(t);
          } else {
            el.classList.remove('streaming');
          }
        };
        tick();
      };

      // One pass per 8s cycle: hold full text during VLM/arrow phase,
      // clear + stream when Code orbit lights up at 14%, then schedule
      // the next cycle. The OUTER loop is infinite (matching the
      // 8s `:host(.hover-active)` CSS animations in code-flow.js).
      const runCycle = () => {
        if (!active) return;
        fillSnippets();                       // visible during the VLM phase
        const tStream = setTimeout(() => {
          if (!active) return;
          clearSnippets();
          Array.from(snippets).forEach((el, idx) => streamOne(el, fullTexts[idx]));
        }, PRE_DELAY_MS);
        pending.push(tStream);
        const tNext = setTimeout(runCycle, CYCLE_MS);
        pending.push(tNext);
      };

      // Hover trigger = the WHOLE enclosing .paradigm article (col 3),
      // so the streaming activates the moment the user moves into any
      // part of col 3 (header, badge, caveat, ...). Same idiom as col 1
      // / col 2 / code-flow.js.
      const trigger = this.closest('.paradigm') || this;
      trigger.addEventListener('mouseenter', () => {
        if (active) return;
        active = true;
        this.classList.add('hover-active');
        runCycle();
      });
      trigger.addEventListener('mouseleave', () => {
        active = false;
        this.classList.remove('hover-active');
        cancelAll();
        fillSnippets();
      });
    }
  }
  window.customElements.define('code-tiles', CodeTiles);
})();
