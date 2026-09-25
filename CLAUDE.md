# Project: FocusFlight Web

A browser-based focus timer modelled on FocusFlight. The user picks a departure and an arrival airport; the route's flight time becomes a focus session, and a plane travels the great-circle route on a dark, warm-toned map until the session ends. A speed multiplier scales the session: 2× halves the time, 0.5× doubles it. Built for full-screen use on a desktop monitor, deployed as a static site on Vercel.

This file loads every session. Live build status and "where to resume" live in **PROGRESS.md**. **Read both at the start of every session.**

## Tech stack
- Vite (vanilla JS template), version recorded in PROGRESS.md at scaffold time. No framework.
- Map: `d3-geo` + `topojson-client` + `world-atlas` (`countries-110m.json`), drawn on a `<canvas>`. No tile server, no map API keys.
- Tests: `vitest` for pure logic modules (geo, engine, storage).
- Fonts: `@fontsource/inter` (UI) and `@fontsource/jetbrains-mono` (numerals/timers), self-hosted via npm. No Google Fonts request.
- Airport dataset: generated once from OurAirports `airports.csv` (public domain) by `scripts/build-airports.mjs`; output `src/data/airports.json` is committed. Large airports with an IATA code, plus the `EXTRA_IATA` include list (LCY).
- Metro areas: IATA metropolitan codes (TYO, LON, NYC…) curated in `src/lib/metros.js`; they drive place names and search.
- Departures board data: OpenFlights `routes.dat`/`airlines.dat` (ODbL, 2014 snapshot) turned into `public/departures/<IATA>.json` by `scripts/build-departures.mjs` (committed), fetched at runtime for the chosen departure airport. One row per flight (destination + operating airline, no codeshares), short brand names from `src/lib/airlines.js`, deterministic invented flight numbers (`src/lib/flightnumbers.js`). No live schedule API: every one found needs a key (see Secrets policy).
- City labels: Natural Earth populated places (public domain), 400 cities in `src/data/cities.json`, built by `scripts/build-cities.mjs` (committed).
- Persistence: `localStorage` only. No backend, no database, no accounts.
- Hosting: Vercel static deploy from GitHub (build `npm run build`, output `dist`).

## Code rules
- Plain JavaScript (ES modules), no TypeScript.
- One responsibility per module; ~200 lines per file max. Pure logic (`src/lib/`) never touches the DOM, so it stays unit-testable.
- UI modules live in `src/ui/`; styles in `src/styles/` using CSS custom properties only (no CSS framework).
- All timing uses wall-clock timestamps (`Date.now()`), never tick counting, so background tabs and sleep stay accurate.
- Times are stored as ISO 8601 UTC strings and displayed in the browser's local timezone.
- Respect `prefers-reduced-motion`: disable non-essential animation (plane bobbing, panel transitions); the plane still moves.
- Ask before deleting any file.

## Core domain logic (must match exactly — do not drift)

### Routes
- Distance: haversine great-circle distance, Earth radius 6,371 km, rounded to the nearest km for display.
- Departure and arrival must differ. Routes shorter than 150 km are rejected with the message "Too short to fly — pick a further destination."
- **Base duration (minutes)** = `distance_km / 800 × 60`, rounded to the nearest whole minute. 800 km/h is the fixed effective block speed.
- The plane's position is the great-circle interpolation (slerp) between the two airports at fraction `progress` ∈ [0, 1].

### Speed multiplier
- Allowed range 0.25× to 10×, step 0.25. Default 1×. Preset chips: 0.5×, 1×, 2×, 4×, 10×.
- **Session length (minutes)** = `base_minutes / multiplier`, shown live in the pre-flight screen before take-off (e.g. HKG→LHR, ~9,600 km, base ~720 min; at 2× → ~360 min).
- Displayed ground speed = `800 × multiplier` km/h.
- The multiplier can be changed mid-flight. Progress is tracked as a fraction of base duration, so changing speed keeps the plane where it is and recomputes the remaining time as `remaining_base_minutes / new_multiplier`. Every change is recorded in the flight's `speed_changes` list.

### Flight states
- `preflight` → `inflight` → (`paused` ⇄ `inflight`) → `arrived` | `aborted`.
- Pause stops progress accrual; paused time is not counted as focus time.
- Flight phase label (cosmetic, by progress): 0–5 % "Climbing", 5–95 % "Cruising", 95–100 % "Descending".
- On arrival: a short chime generated with the Web Audio API (no audio file), an arrival screen showing route, focused time and distance, and the flight is logged.
- Abort requires a confirm click and logs the flight with status `aborted`.
- The active flight is saved to `localStorage` every 5 s and on `visibilitychange`; reloading the page resumes it at the correct position (time elapsed while the tab was closed counts, unless paused).
- While in flight, `document.title` shows remaining time as `HH:MM:SS · HKG→LHR`.

### Logbook
- Each entry: `id` (crypto.randomUUID), `from` (IATA), `to` (IATA), `distance_km`, `base_minutes`, `speed_changes` (list of `{at_progress, multiplier}`), `focused_seconds` (unpaused in-flight wall time), `started_at`, `ended_at`, `status` (`arrived` | `aborted`), `label` (optional free text, ≤ 60 chars).
- Sorted newest first by `ended_at`. Stats shown: total focus hours (arrived + aborted), total distance of arrived flights, number of arrived flights.
- `localStorage` keys: `ffw.activeFlight`, `ffw.logbook`, `ffw.settings`. Each value carries `schemaVersion: 1`. Settings include `theme`, `cityLabels` (default off) and `chaseTilt` (0–60°, default 40).

### Full screen and immersion
- Full-screen toggle button (Fullscreen API) plus the `F` key. `Space` pauses/resumes in flight. `Esc` exits full screen (browser default).
- In flight, the HUD fades out after 3 s without pointer movement and returns on any pointer movement or key press.
- Layout works from 360 px wide up to 4K; the map always fills the viewport behind the HUD.

### Map
- Two views, toggleable in flight: **Route** (default: `geoNaturalEarth1`, rotated so the route's midpoint longitude is centred, fitted to the route with 12 % padding and a minimum visible span of 2,000 km) and **World** (whole globe, same projection). Two camera views, in flight only: **Follow** (orthographic globe centred on the plane, heading-up) and **Chase** (tilted satellite perspective from behind the plane, tilt 0–60° by slider or vertical drag). Selector: Route · World · Follow · Chase.
- City labels (toggle in Settings and the HUD): density by local map scale and rank, never overlapping each other, the airports, the plane or the route.
- Pan (drag) and zoom (wheel, pinch, double-click) on top of either view, 0.5× to 16×, clamped so the map always covers the viewport centre. A reset button appears once the view has moved; changing route or view resets it.
- Routes crossing the antimeridian (e.g. HKG→LAX) must render as one continuous arc.
- Draw order: ocean, land, graticule (10°), flown portion of the arc (solid amber), remaining portion (dashed, muted), airports, plane (rotated to its current heading).

### Visual identity
- Dark themes, chosen in Settings (⚙): **Ember** (default, the spec palette below), Harbor (blue), Steel (blue-grey), Slate (grey), Fjord (sea green). Each theme redefines the same tokens under `[data-theme]` in `tokens.css`; no other stylesheet names a colour.
- Ember tokens: `--bg #14100d`, `--surface #1f1814`, `--surface-2 #2a211b`, `--land #2e241d`, `--ocean #120e0b`, `--accent #f0a24a` (amber), `--accent-2 #c8733c` (copper), `--text #f3e9df`, `--muted #a8978a`, `--danger #e05a47`.
- HUD panels: translucent `--surface` at 72 % opacity with `backdrop-filter: blur(12px)`, 16 px radius.
- Pre-flight screen is styled as a boarding pass.

## Secrets policy
- This project has no secrets and no environment variables. Nothing to hide in the bundle.
- If any key is ever proposed (e.g. a map tile service), that is a spec change: stop and ask first. Before the deploy step, confirm the repo contains no `.env*` files.

## Project values
- GitHub repo URL: https://github.com/notKivon/focusflight-web
- Vercel production URL: https://focusflight-web-gamma.vercel.app

## Working agreement (multi-session build)
- Build in the order in PROGRESS.md, one step at a time.
- After finishing each step: test it, update PROGRESS.md (tick the box, set Current/Next, note decisions or gotchas), then commit and push. A commit is always a working, tested state — never commit a half-finished step.
- At the start of every session: read the planning files; reconcile PROGRESS.md against `git log` and the working tree; run `npm install && npm run build && npm test` to confirm the tree is healthy before continuing. If sources disagree, trust git + working tree over PROGRESS.md, and fix PROGRESS.md.
- Steps marked ⏸️ require the user: stop, give exact instructions, wait for confirmation and any values produced.
- Only stop to ask otherwise when: a command needs approval, an error survives a real fix attempt, or the final hand-back step is reached.
