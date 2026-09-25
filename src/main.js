import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/base.css";
import "./styles/map.css";
import "./styles/controls.css";
import "./styles/preflight.css";
import "./styles/hud.css";

import { Flight } from "./lib/engine.js";
import {
  loadSettings,
  saveSettings,
  saveActiveFlight,
  loadActiveFlight,
  clearActiveFlight,
  appendFlight,
} from "./lib/storage.js";
import { FlightMap } from "./ui/map.js";
import { PreflightScreen } from "./ui/preflight.js";
import { FlightHud } from "./ui/hud.js";
import { ArrivalScreen } from "./ui/arrival.js";
import { playChime } from "./ui/chime.js";

/** The active flight is written at most this often while it ticks. */
const SAVE_EVERY_MS = 5000;

const BASE_TITLE = document.title;

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
function remember(patch) {
  const changed = Object.keys(patch).some((key) => settings[key] !== patch[key]);
  if (changed) settings = saveSettings(patch);
}

function mapView() {
  return settings.mapView === "world" ? "world" : "route";
}

// ------------------------------------------------------------------ preflight

function showPreflight() {
  teardown();
  document.title = BASE_TITLE;
  map.setView(mapView());
  map.setProgress(0);
  view = new PreflightScreen(screen, {
    settings,
    onRouteChange: (route) => map.setRoute(route),
    onChange: (state) =>
      remember({
        multiplier: state.multiplier,
        lastFrom: state.from?.iata ?? null,
        lastTo: state.to?.iata ?? null,
      }),
    onTakeOff: (state) => {
      const flight = Flight.create(state).takeOff();
      saveActiveFlight(flight);
      showFlight(flight);
    },
  });
}

// --------------------------------------------------------------------- flight

function showFlight(flight) {
  teardown();
  map.setRoute({ from: flight.from, to: flight.to });
  map.setView(mapView());

  let savedAt = Date.now();
  const save = () => {
    savedAt = Date.now();
    saveActiveFlight(flight);
  };

  // A tab going away may not come back, so flush before it does.
  const onVisibility = () => {
    if (flight.isActive) save();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const hud = new FlightHud(screen, {
    flight,
    view: mapView(),
    onTick: (snapshot, model) => {
      map.setProgress(snapshot.progress);
      document.title = model.title;
      if (Date.now() - savedAt >= SAVE_EVERY_MS && flight.isActive) save();
    },
    onSpeedChange: (multiplier) => {
      remember({ multiplier });
      save();
    },
    onPauseChange: save,
    onViewChange: (next) => {
      remember({ mapView: next });
      map.setView(next);
    },
    onArrive: (arrived) => {
      if (settings.sound) playChime();
      finish(arrived);
    },
    onEnd: finish,
  });

  function finish(finished) {
    document.removeEventListener("visibilitychange", onVisibility);
    appendFlight(finished);
    clearActiveFlight();
    showArrival(finished);
  }

  view = {
    destroy: () => {
      document.removeEventListener("visibilitychange", onVisibility);
      hud.destroy();
    },
  };
}

// -------------------------------------------------------------------- arrival

function showArrival(flight) {
  const snapshot = flight.snapshot();
  teardown();
  document.title = BASE_TITLE;
  map.setProgress(snapshot.progress);
  view = new ArrivalScreen(screen, { snapshot, onAgain: showPreflight });
}

// ---------------------------------------------------------------------- start

const saved = loadActiveFlight();
const restored = saved ? Flight.restore(saved) : null;

if (restored?.isActive) {
  showFlight(restored);
} else if (restored?.status === "arrived") {
  // It landed while the tab was closed: log it now and show the arrival screen.
  appendFlight(restored);
  clearActiveFlight();
  map.setRoute({ from: restored.from, to: restored.to });
  showArrival(restored);
} else {
  if (saved) clearActiveFlight(); // a stale or unreadable record: start clean
  showPreflight();
}
