// Site-wide interactive helpers — small, content-independent UI logic
// that runs once on page load:
//   - Sticky top-nav active-link highlight (IntersectionObserver)
//   - BibTeX copy-to-clipboard buttons
// No dependencies; safe to load anywhere.

// Active-section highlight in the sticky top nav.
(function () {
  // Include the brand AND the Top icon (both #top → hero) alongside
  // the regular section links. When #top is the active section, the
  // brand gets the underline marker and the Top icon hides itself
  // (via the .at-top class on .topnav, see CSS).
  const links = document.querySelectorAll('.topnav-links a, .topnav .brand');
  const map = {};
  links.forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    const id = href.slice(1);
    const sec = document.getElementById(id);
    if (!sec) return;
    // Multiple links can share an id (Top icon + Brand → #top): store as array.
    (map[id] = map[id] || []).push(a);
  });
  if (!Object.keys(map).length) return;

  const topnav = document.querySelector('.topnav');
  const allLinks = Object.values(map).flat();

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      allLinks.forEach(a => a.classList.remove('active'));
      (map[e.target.id] || []).forEach(a => a.classList.add('active'));
      if (topnav) topnav.classList.toggle('at-top', e.target.id === 'top');
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  Object.keys(map).forEach(id => {
    const sec = document.getElementById(id);
    if (sec) observer.observe(sec);
  });
})();

// BibTeX copy buttons. Each .copy-btn has a data-copy="<sectionId>"
// pointing at a container whose <pre><code> body is copied verbatim.
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.querySelector('#' + btn.dataset.copy + ' pre code');
    if (!target) return;
    navigator.clipboard.writeText(target.innerText).then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    });
  });
});

// Paradigms focus / fullscreen mode.
//   - Click .paradigms-zoom-btn → enter focus view: the 4-col grid is
//     SCALED (transform:scale) to fill the viewport under the sticky
//     topnav. The grid's internal layout is untouched — no reflow,
//     no column re-proportioning — it's literally a magnified
//     rendering of the same DOM the page already shows below.
//   - Click .focus-exit or press ESC → leave, and the page scrolls
//     BACK to the exact Y position it was at when focus was entered
//     (or to the top if focus was entered via a deep-link URL).
//   - URL hash `#focus=paradigms` mirrors state, so the view is
//     deep-linkable from arXiv figure captions / external bookmarks.
//   - Browser back/forward toggles via popstate (pushState entries).
//   - Window resize → re-computes scale.
(function () {
  const HASH = '#focus=paradigms';
  const body = document.body;
  const enterBtn = document.querySelector('.paradigms-zoom-btn');
  const exitBtn = document.querySelector('.focus-exit');
  const paradigms = document.querySelector('.paradigms');
  if (!enterBtn || !exitBtn || !paradigms) return;

  const TOPNAV = 52;
  const MARGIN = 32;
  let savedScroll = 0;  // Y to restore on exit; captured at entry.

  function applyScale() {
    if (!body.classList.contains('focus-paradigms')) {
      paradigms.style.transform = '';
      return;
    }
    paradigms.style.transform = '';
    requestAnimationFrame(() => {
      const r = paradigms.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const availW = window.innerWidth - MARGIN;
      const availH = window.innerHeight - TOPNAV - MARGIN;
      const s = Math.min(availW / r.width, availH / r.height);
      paradigms.style.transform = `scale(${s})`;
    });
  }

  // Single source of truth: read URL hash, drive everything off it.
  // Captures scroll on entry transition; on exit, either scrolls to a
  // newly-targeted anchor (if the user clicked a topnav link like
  // #demo from inside focus mode) or restores the pre-focus scroll
  // position (if they exited via ESC / × button).
  function apply() {
    const want = (location.hash === HASH);
    const have = body.classList.contains('focus-paradigms');
    if (want && !have) savedScroll = window.scrollY;
    body.classList.toggle('focus-paradigms', want);
    applyScale();
    if (!want && have) {
      requestAnimationFrame(() => {
        const newHash = location.hash;
        // Hash points to another section (e.g. #demo, #method): honor
        // it and scroll to that element. Otherwise restore the
        // reader's pre-focus position.
        if (newHash && newHash !== HASH && newHash.length > 1) {
          const el = document.getElementById(newHash.slice(1));
          if (el) {
            el.scrollIntoView({ block: 'start', behavior: 'auto' });
            return;
          }
        }
        window.scrollTo(0, savedScroll);
      });
    }
  }

  const enter = () => {
    if (location.hash !== HASH) history.pushState(null, '', HASH);
    apply();
  };
  const exit = () => {
    if (location.hash === HASH) {
      history.pushState(null, '', location.pathname + location.search);
    }
    apply();
  };

  enterBtn.addEventListener('click', enter);
  exitBtn.addEventListener('click', exit);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && body.classList.contains('focus-paradigms')) exit();
  });
  window.addEventListener('popstate', apply);
  // Anchor link clicks (<a href="#demo">) fire `hashchange`, NOT
  // `popstate`. Without this, clicking a topnav link from inside
  // focus mode would update the URL but apply() wouldn't run, so the
  // focus class never gets removed → the new anchor is unreachable.
  window.addEventListener('hashchange', apply);
  window.addEventListener('resize', applyScale);
  apply();  // honor initial #focus=paradigms in URL on page load
})();
