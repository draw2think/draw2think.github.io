# Draw2Think — Project Page

Static site for the Draw2Think paper. Deployed to
[**draw2think.github.io**](https://draw2think.github.io/) via GitHub Pages.

## How to read the page

| Interaction | What happens |
|---|---|
| **Hover** over any of the four paradigm cards in *Overview* | The mini flow-diagram inside the card animates (data streaks, orbiting borders, code streaming, ...) showing how that paradigm's loop runs. |
| Click **Focus** button (top-right of the Overview grid) | Zooms the 4-column grid into a near-fullscreen view; ESC or the floating **×** exits. The state is URL-addressable as `#focus=paradigms`, so external links (e.g. an arXiv figure) can deep-link straight into the zoomed view. |
| In *Live walk-through*, click a **bench / problem pill** (Geo3K, PGPS9K, GeoGoal, GenExam ×2) | Loads that demo's trajectory: the GeoGebra canvas, engine command list, and JSON-format model response all re-render in sync. |
| Click or hover an **Engine command** step | Snaps all three text columns + the live canvas to that step's state. Autoplay pauses; releasing the cursor resumes from where you stopped. |
| Click a **Turn tab** at the top of the command column | Switches the visible turn. Long trajectories scroll horizontally; phase-boundary turns (`construct_done`, `render_done`, `answer_emit`) are color-coded. |
| Click any topnav link | Smooth-scrolls the section flush against the sticky navbar. The "Top" icon and the **Draw2Think** brand both link back to the hero. |

## Local preview

```bash
python -m http.server 8765
# open http://127.0.0.1:8765
```

## Deployment

`.github/workflows/deploy-pages.yml` publishes the repository root to GitHub
Pages on every push to `main`. Configure **Settings → Pages → Source: GitHub
Actions** in the repo to enable the workflow.
