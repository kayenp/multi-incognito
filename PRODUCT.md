# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single operator — the author — running the tool locally on their own machine. There is no shared or multi-user use; no accounts, roles, or permissions.

## Product Purpose

multi-incognito is a batch automation runner. The operator configures a run, launches N headed Chromium instances in a staggered batch, and each instance executes a scripted Playwright flow. A run succeeds when every instance launched with its intended configuration and the operator can see how each one is progressing through its flow.

## Positioning

A personal control surface over a hand-written Playwright script, not a general browser-profile manager. Per-instance configuration (fingerprint seed, platform, time zone, language) is generated or chosen at launch time rather than stored as long-lived browser profiles.

## Operating Context

- Developed in WSL on Windows; the backend launches a **Windows** Chromium binary (`executablePath` in `backend/index.js`) headed, so browser windows appear on the Windows desktop alongside the dashboard.
- Backend: Node (ESM), Express on port 3000, Playwright `chromium.launch`, `backend/utils/fingerprint.js` for per-instance values. Started with `npm run dev` in `backend/`.
- Frontend: Vite + Tailwind v4, vanilla JS, in `frontend/`. Dev server proxies `/api` to Express on 3000.
- Runs are long: the default stagger is 10 s between instances, so a 30-instance batch takes ~5 minutes to ramp up. The operator watches the dashboard while windows open.

## Capabilities and Constraints

- Per-instance launch flags: `--fingerprint=<seed>` (0–2³¹−1), `--fingerprint-platform=<windows|macos|linux>`, `--timezone=<IANA zone>`, `--lang=<en|en-GB>`. The UI must only offer values the backend accepts.
- Batch controls: instance count and stagger delay.
- Desktop only (≥1024px wide). No mobile or tablet layouts.
- Run API (`backend/runner/`): `POST /api/launch`, `GET /api/runs/current`, `GET /api/runs/:id/events` (SSE), `POST /api/runs/:id/stop`, `POST /api/instances/:id/stop|retry`. One run at a time; runs live in memory and are lost on backend restart.
- Flows are plug-in modules (`FLOW` in `backend/.env`, default `backend/flows/example.js`) exporting `name`, `steps`, and `run({ page, step, config })`. Named `step()` calls are what the Run Monitor shows.
- Stall threshold is 60 s on one step (frontend constant). Retries start immediately, not on the batch stagger.
- Presets live in browser `localStorage` only.

## Brand Commitments

Name: multi-incognito (UI title currently "Chromium Launch Studio"). No logo or other identity assets. `frontend/DESIGN.md` (Stitch "Kinetic Engine") describes the current visual implementation but has **not** been confirmed as binding.

## Evidence on Hand

None. There are no real run logs, metrics, or telemetry. Memory figures in the UI are estimates (~380 MB/instance); future work must not present fabricated PIDs, heap sizes, or live metrics as real data.

## Product Principles

1. **Truthful state over decoration.** Show only what the backend actually knows; label estimates as estimates and unknowns as unknown.
2. **Config mirrors the backend.** Any option in the UI maps one-to-one to a real launch flag or batch parameter.
3. **A run is the unit of work.** Configure → launch → watch per-instance progress → review outcome.
4. **Single-operator speed.** No ceremony for accounts, sharing, or onboarding; fast repeat launches from saved presets.
