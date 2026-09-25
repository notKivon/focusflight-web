import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

describe("scaffold", () => {
  it("defines the warm dark palette from the spec", () => {
    const expected = {
      "--bg": "#14100d",
      "--surface": "#1f1814",
      "--surface-2": "#2a211b",
      "--land": "#2e241d",
      "--ocean": "#120e0b",
      "--accent": "#f0a24a",
      "--accent-2": "#c8733c",
      "--text": "#f3e9df",
      "--muted": "#a8978a",
      "--danger": "#e05a47",
    };
    for (const [token, value] of Object.entries(expected)) {
      expect(tokens).toContain(`${token}: ${value};`);
    }
  });
});
