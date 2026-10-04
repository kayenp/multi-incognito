---
target: critique (frontend/index.html — launcher + run monitor)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/ken/personal_projects/multi-incognito/frontend/index.html"
target_fingerprint: "sha256:151d559e98ff67c996f995c9be5b4ed0483634875984f66410362741d0d65512"
target_path: /home/ken/personal_projects/multi-incognito/frontend/index.html
timestamp: 2026-10-01T03-50-09Z
slug: frontend-index-html
---
Method: dual-agent (A: design review · B: detector + browser overlay), isolated stub sandbox (:5179 → :3001)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Matrix excellent; header pill says "Ready to Launch" mid-run; hung steps look healthy until 60 s |
| 2 | Match System / Real World | 3 | Flags map 1:1; theatrical copy ("Runtime Orchestrator", fake flags.conf) |
| 3 | User Control and Freedom | 2 | Enter in any launcher input launches; bare S stops; preset delete has no undo |
| 4 | Consistency and Standards | 2 | Cyan overloaded (brand/done/slow/current/focus/CTA); native prompt(); 3/5 nav dead ends |
| 5 | Error Prevention | 1 | "30" + Enter launched 30 instances; no friction scaling with batch size |
| 6 | Recognition Rather Than Recall | 3 | Legend + kbd hints; legend omits stopped/queued/1.25x tier |
| 7 | Flexibility and Efficiency | 3 | Arrow/Enter/S/R + presets; no retry-all-failed, relaunch, problems-first |
| 8 | Aesthetic and Minimalist Design | 2 | Decorative launcher chips; matrix emphasis inverted |
| 9 | Error Recovery | 3 | Drawer error/stack/copy/retry; launch failure names recovery |
| 10 | Help and Documentation | 2 | Stall rule, median shading, stagger math unexplained |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict
Run Monitor: product-specific (instance × step matrix, per-step median shading, queued countdowns, timeline offsets). Launcher: category-interchangeable Stitch console; decorative chips; violates Principle 1 (fake flags.conf, hardcoded ":3000 online", invented Host Budget via navigator.deviceMemory ?? 16).
Detector: index.html 1 advisory (icon span rgb(0,0,0), false positive); src 1 side-tab warning main.js:265 (2px nav accent; DESIGN.md sanctions it for active profile instance only). In-page: 123–332 findings/view, ~205 from hidden panels (detector scans [hidden]); undersized-ui-text & ai-color-palette mandated by DESIGN.md; nested-cards/text-occlusion/option findings false positives. Confirmed by both: 1.25–2x tier done cells (on-surface on cyan/55) 3.1:1.

## Priority Issues
1. [P0] Accidental mass launch — main.js:390–398 Enter from any input launches; no confirm. Fix: Ctrl+Enter to launch; summary confirm above ~5 instances. → /impeccable harden
2. [P1] Inverted matrix emphasis + contrast — slow-done solid cyan loudest (monitor.js:254); failed = 1px outline, 4.02:1 text; running cells ignore median; 1.25x tier noise at 3.1:1. Fix: filled failed cells w/ text-error; quiet amber mark for slow-done; drop 1.25x tier; amber running cell at >3x median; problems-first sort. → /impeccable colorize
3. [P1] Monitor keyboard/SR inaccessible — non-focusable rows; drawer doesn't take/restore focus; 1px focus ring invisible on Launch; .icon spans read aloud. Fix: roving-tabindex grid; focus mgmt; 2px offset ring; aria-hidden icons. → /impeccable audit
4. [P1] Launcher displays untruths — "Ready to Launch" mid-run (main.js:154), hardcoded :3000 (main.js:159), invented Host Budget, decorative chips. → /impeccable clarify
5. [P2] Drawer covers run header/Stop Run; half the matrix at 1024. Fix: start below run header or shrink matrix beside it. → /impeccable layout

## Persona Red Flags
Alex: no retry-all/relaunch; prompt() overwrites presets silently; hover-only instant preset delete; bare S stops without confirm.
Sam: rows unfocusable; drawer no focus; icon ligatures announced; gauges/dots no text equivalent; seed-copy feedback color-only.
Solo operator (second monitor): static tab title; 3rd failure below fold at 30 rows; hung step healthy-looking for 60 s; no ETA despite known ramp.

## Minor Observations
No end-of-run summary or Relaunch/Retry-failed; Stop Run copy leads with "0 queued", omits interrupted running instances; run header height shifts; 1024 truncation of step headers/error names; CLI preview hidden overflow; elapsed "0:00" vs "–" inconsistency; "Ramp-up 0 ms" + ms input vs s presets; duplicated RAM display; placeholder nav; 10 em-dashes; 32-char all-caps label.

## Questions to Consider
- Should launch config collapse to a bar above the matrix, since the monitor is where time is spent?
- Should healthy cells go near-invisible so the matrix shows only exceptions?
- What should a run's ending feel like?
- Is the 10px floor right for second-monitor reading?
