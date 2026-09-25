import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/base.css";
import "./styles/map.css";

import airports from "./data/airports.json";
import { FlightMap } from "./ui/map.js";

// Step 7 harness: routes to eyeball the renderer with, replaced by the
// boarding pass in step 8.
const byIata = new Map(airports.map((a) => [a.iata, a]));
const ROUTES = [
  ["HKG", "LHR"],
  ["HKG", "LAX"],
  ["SIN", "KUL"],
  ["JFK", "NRT"],
];

const app = document.querySelector("#app");
app.innerHTML = `
  <div class="map-stage"></div>
  <div class="dev-bar">
    <div class="dev-routes">
      ${ROUTES.map(
        ([from, to], i) =>
          `<button type="button" data-route="${i}" aria-pressed="${i === 0}">${from}→${to}</button>`,
      ).join("")}
    </div>
    <div class="dev-views">
      <button type="button" data-view="route" aria-pressed="true">Route</button>
      <button type="button" data-view="world" aria-pressed="false">World</button>
    </div>
    <label>
      Progress
      <input type="range" id="dev-progress" min="0" max="1000" value="350" />
      <output id="dev-progress-out">35%</output>
    </label>
  </div>
`;

// `#HKG-LAX/world/0.5` opens straight onto a case, so a headless screenshot
// can check any combination without clicking.
function fromHash() {
  const [pair, view, progress] = decodeURIComponent(location.hash.slice(1)).split("/");
  const index = ROUTES.findIndex(([from, to]) => `${from}-${to}` === pair);
  return {
    index: index === -1 ? 0 : index,
    view: view === "world" ? "world" : "route",
    progress: Number.isFinite(Number(progress)) && progress !== "" ? Number(progress) : 0.35,
  };
}

const start = fromHash();
const map = new FlightMap(app.querySelector(".map-stage"));
const routeOf = ([from, to]) => ({ from: byIata.get(from), to: byIata.get(to) });
map.setRoute(routeOf(ROUTES[start.index]));
map.setView(start.view);
map.setProgress(start.progress);

const press = (buttons, match) => {
  for (const button of buttons) button.setAttribute("aria-pressed", String(match(button)));
};

const routeButtons = app.querySelectorAll("[data-route]");
for (const button of routeButtons) {
  button.addEventListener("click", () => {
    map.setRoute(routeOf(ROUTES[Number(button.dataset.route)]));
    press(routeButtons, (b) => b === button);
  });
}

const viewButtons = app.querySelectorAll("[data-view]");
for (const button of viewButtons) {
  button.addEventListener("click", () => {
    map.setView(button.dataset.view);
    press(viewButtons, (b) => b === button);
  });
}

const slider = app.querySelector("#dev-progress");
const output = app.querySelector("#dev-progress-out");
slider.value = String(Math.round(start.progress * 1000));
output.textContent = `${Math.round(start.progress * 100)}%`;
press(routeButtons, (b) => Number(b.dataset.route) === start.index);
press(viewButtons, (b) => b.dataset.view === start.view);
slider.addEventListener("input", () => {
  const progress = Number(slider.value) / 1000;
  map.setProgress(progress);
  output.textContent = `${Math.round(progress * 100)}%`;
});
