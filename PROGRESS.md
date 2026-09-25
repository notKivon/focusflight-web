# FocusFlight Web — Build Progress

**Current step:** 7 — Map renderer
**Next step:** 8 — Pre-flight screen
**Last verified healthy:** 2026-09-25 — `npm install && npm run build && npm test` all pass

## Checklist
- [x] 1. Scaffold: `npm create vite@latest` (vanilla JS) in this folder, add `vitest`, `d3-geo`, `topojson-client`, `world-atlas`, `@fontsource/inter`, `@fontsource/jetbrains-mono`. Create `src/lib/`, `src/ui/`, `src/styles/tokens.css` with the colour tokens from CLAUDE.md, and a placeholder page on `--bg`. Add `npm test` script. Record Vite version below. **Vite 8.3.1.** Test: `npm run build` and `npm test` (one trivial test) pass. `git init`, commit.
- [x] 2. ⏸️ GitHub repo — **user:** create an empty private repo named `focusflight-web` on GitHub (no README/licence), then report the repo URL. Agent then adds the remote, pushes, and writes the URL into CLAUDE.md → Project values.
- [x] 3. Airport dataset: `scripts/build-airports.mjs` downloads OurAirports `airports.csv`, keeps rows with `type = large_airport` and a non-empty IATA code, writes `src/data/airports.json` as `[{iata, name, city, country, lat, lon}]`. Test: plausible count (see gotcha below); unique IATA codes; HKG, LHR, JFK, LAX, SIN, NRT present with correct coordinates. **1,171 airports.**
- [x] 4. Geo core (`src/lib/geo.js`): haversine, slerp interpolation, initial bearing, base duration, duration formatting. Vitest: HKG→LHR within 1 % of 9,630 km; HKG→LAX interpolation at 0.5 lies over the North Pacific; 150 km rejection rule.
- [x] 5. Flight engine (`src/lib/engine.js`): state machine, timestamp-based progress, pause/resume, mid-flight speed changes, arrival detection, serialise/restore. Vitest with a fake clock: 2× halves the session; changing 1×→4× at 50 % leaves remaining time at ¼; pause excludes time; restore after simulated reload gives the right progress. **26 engine tests, 68 total.**
- [x] 6. Storage (`src/lib/storage.js`): `ffw.*` keys with `schemaVersion: 1`, logbook append/sort, stats. Vitest with a mocked `localStorage`. **18 storage tests, 86 total.**
- [ ] 7. Map renderer (`src/ui/map.js`): canvas world map, Route/World views, flown vs remaining arc, airports, rotated plane, HiDPI scaling, resize handling. Test: dev page renders HKG→LHR and HKG→LAX (antimeridian) correctly; screenshot check.
- [ ] 8. Pre-flight screen: boarding-pass card, airport autocomplete (IATA, city, name), speed slider + preset chips, live distance / base time / session length, optional label, Take-off button. Test: invalid routes blocked with the exact message.
- [ ] 9. In-flight HUD: countdown, progress bar, phase label, ground speed, live speed control, pause/resume, abort with confirm, Route/World toggle, `document.title` updates, arrival chime + arrival screen, logging. Test: full short flight at 10× completes and logs; reload mid-flight resumes.
- [ ] 10. Full screen & immersion: Fullscreen API button, `F`/`Space` shortcuts, 3 s HUD auto-hide, responsive layout 360 px → 4K, reduced-motion handling. Test: manual check in Chrome and Firefox/Zen at 1440p and mobile width.
- [ ] 11. Logbook view: list newest first, stats header, delete single entry (with confirm). Test: entries from step 9 display correctly.
- [ ] 12. Polish: transitions, focus-visible outlines, empty states, favicon + meta tags. Test: Lighthouse accessibility ≥ 95 and performance ≥ 90 on the production build (`npm run preview`).
- [ ] 13. ⏸️ Vercel — **user:** on vercel.com, Add New → Project → import `focusflight-web`; framework preset Vite, build command `npm run build`, output `dist`, no env vars; deploy and report the production URL. Agent first confirms no `.env*` files exist in the repo, then writes the URL into CLAUDE.md → Project values.
- [ ] 14. Final hand-back: verify the production URL (a flight at 10×, reload-resume, full screen), write README (run locally, deploy, keyboard shortcuts), tag `v1.0.0`.

## Decisions & gotchas
- 2026-09-25: Map chosen as 2D canvas (d3-geo, Natural Earth projection) rather than a 3D globe — no tile keys, fully themeable in the warm dark palette, cheaper to render in full screen for hours.
- 2026-09-25: Speed multiplier scales session length (2× = half the time) and can be changed mid-flight; progress is stored as a fraction of base duration.
- 2026-09-25: Scaffolded with `create-vite@9.2.1`, vanilla template → **Vite 8.3.1**, **vitest 5.0.2**. Pinned `world-atlas@^2.0.2` (v3 does not exist; 2.0.2 ships `countries-110m.json`), `d3-geo@^3.1.1`, `topojson-client@^3.1.0`, `@fontsource/*@^5.3.0`.
- 2026-09-25: Tests live in `test/` (not beside sources) so `src/lib/` stays pure app code; `npm test` runs `vitest run` (single pass, CI-friendly).
- 2026-09-25: Dropped the Vite template's `public/` favicon and demo `counter.js`/`style.css`; a real favicon lands in step 12.
- 2026-09-25: Stack is vanilla JS + Vite (no React) — the app is a single view with a canvas; a framework adds nothing here.
- 2026-09-25: Remote `origin` = https://github.com/notKivon/focusflight-web (private). `main` is the only branch; every step commits and pushes there.
- 2026-09-25: OurAirports has reclassified airports since this plan was written — `type = large_airport` with an IATA code now yields **1,171** rows, not the 400–650 the step assumed. Kept the filter rule as specified and widened the guard to 800–1,600 (script and test). `airports.json` is 146 kB, fine to ship and commit. Country names come from OurAirports `countries.csv` so the UI can search by country.
- 2026-09-25: `geo.js` also owns the display formatters (`formatClock`, `formatTitleClock`, `formatDuration`, `phaseLabel`) so the UI layer holds no time maths. HKG→LHR computes to exactly 9,630 km / 722 base minutes with the dataset coordinates. `headingAt` takes the tangent from a 1e-4 slerp step rather than the endpoint bearing, so the plane stays tangent to the arc mid-flight.
- 2026-09-25: `engine.js` exports a `Flight` class; every mutator takes an explicit `now` (defaulting to `Date.now()`), which is what makes the fake-clock tests possible without timers. Progress lives in two fields — `progressAtMark` plus `markAt` — and a private `#settle` folds elapsed wall time in; `update(now)` is the only thing that advances progress, so the UI can call it as often as it likes.
- 2026-09-25: Arrival is dated at the moment it *actually* happened (`markAt + remaining/multiplier`), not at the update that noticed it. A tab closed for hours over a finished flight therefore logs the true focused time, not the time until reopening.
- 2026-09-25: `speed_changes` records the take-off multiplier as `{at_progress: 0, multiplier}` so an entry is self-describing; later changes append. Re-selecting the current multiplier is a no-op and is not logged.
- 2026-09-25: `engine.js` is 254 lines but only 198 lines of code — the rest is JSDoc. Splitting the state machine to satisfy the line count literally would have been worse, so it stays whole.
- 2026-09-25: `storage.js` stays ignorant of flights: it saves `flight.toJSON()` / `flight.toLogEntry()` when handed a `Flight`, but `loadActiveFlight` returns the plain record and the caller runs `Flight.restore`. Keeps the module a pure envelope layer.
- 2026-09-25: Every storage function takes the store as an optional last argument (mirroring how engine methods take `now`), defaulting to `defaultStore()`. That is what the mocked-`localStorage` tests use; no globals are patched.
- 2026-09-25: Storage never throws. Blocked/absent `localStorage`, corrupt JSON, a wrong `schemaVersion` and malformed logbook rows all read back as "nothing stored"; failed writes return `false`. `defaultStore()` resolves per call because touching `localStorage` can itself throw in a locked-down context.
- 2026-09-25: `appendFlight` replaces an entry with a matching `id` instead of adding a second one, so a duplicate save (e.g. arrival plus a `visibilitychange` flush) cannot double-log a flight.
- 2026-09-25: `ffw.settings` holds `{multiplier, mapView, sound, lastFrom, lastTo}`; loads merge over `DEFAULT_SETTINGS` and drop unknown keys. `lastFrom`/`lastTo` are IATA codes for pre-filling the boarding pass in step 8.
