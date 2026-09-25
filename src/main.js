import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles/base.css";

document.querySelector("#app").innerHTML = `
  <div class="placeholder">
    <h1>FocusFlight</h1>
    <p>Pick a route, fly it, focus until you land.</p>
    <p class="callsign">Ground crew still loading. Step 1 of 14.</p>
  </div>
`;
