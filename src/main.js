import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/base.css";
import "./styles/map.css";
import "./styles/preflight.css";

import { Flight } from "./lib/engine.js";
import { formatClock } from "./lib/geo.js";
import {
  loadSettings,
  saveSettings,
  saveActiveFlight,
  loadActiveFlight,
  clearActiveFlight,
} from "./lib/storage.js";
import { FlightMap } from "./ui/map.js";
import { PreflightScreen } from "./ui/preflight.js";

const app = document.querySelector("#app");
app.innerHTML = `<div class="map-stage"></div><main class="screen" data-screen></main>`;

const map = new FlightMap(app.querySelector(".map-stage"));
const screen = app.querySelector("[data-screen]");
let settings = loadSettings();
let view = null; // the screen currently mounted, so it can be torn down

/** Clears the stage. Always called before a screen renders into it. */
function teardown() {
  view?.destroy?.();
  view = null;
  screen.innerHTML = "";
}

/** Saves only what actually changed, so typing does not hammer localStorage. */
function rememberChoice(state) {
  const patch = {
    multiplier: state.multiplier,
    lastFrom: state.from?.iata ?? null,
    lastTo: state.to?.iata ?? null,
  };
  const changed = Object.keys(patch).some((key) => settings[key] !== patch[key]);
  if (changed) settings = saveSettings(patch);
}

function showPreflight() {
  teardown();
  map.setView(settings.mapView === "world" ? "world" : "route");
  map.setProgress(0);
  view = new PreflightScreen(screen, {
    settings,
    onRouteChange: (route) => map.setRoute(route),
    onChange: rememberChoice,
    onTakeOff: (state) => {
      const flight = Flight.create(state).takeOff();
      saveActiveFlight(flight);
      showFlight(flight);
    },
  });
}

// Step 8 placeholder: enough to prove take-off works and the flight persists.
// Step 9 replaces it with the real HUD (countdown, controls, arrival, logging).
function showFlight(flight) {
  teardown();
  screen.innerHTML = `
    <div class="pass">
      <header class="pass-header">
        <span class="pass-brand">${flight.from.iata} → ${flight.to.iata}</span>
        <span class="pass-kind">In flight</span>
      </header>
      <p class="pass-message">Cruising — the in-flight HUD lands in step 9.</p>
      <dl class="pass-stats">
        <div class="pass-stat"><dt>Remaining</dt><dd data-remaining>—</dd></div>
        <div class="pass-stat"><dt>Progress</dt><dd data-progress>—</dd></div>
      </dl>
      <button type="button" class="takeoff" data-end>End flight</button>
    </div>
  `;
  map.setRoute({ from: flight.from, to: flight.to });

  const tick = () => {
    const snapshot = flight.snapshot();
    map.setProgress(snapshot.progress);
    screen.querySelector("[data-remaining]").textContent = formatClock(snapshot.remainingSeconds);
    screen.querySelector("[data-progress]").textContent = `${Math.round(snapshot.progress * 100)}%`;
    if (snapshot.status !== "inflight") end();
  };
  const timer = setInterval(tick, 1000);
  tick();

  function end() {
    flight.abort();
    clearActiveFlight();
    showPreflight();
  }

  screen.querySelector("[data-end]").addEventListener("click", end);
  view = { destroy: () => clearInterval(timer) };
}

const saved = loadActiveFlight();
const restored = saved ? Flight.restore(saved) : null;
if (restored?.isActive) showFlight(restored);
else showPreflight();
