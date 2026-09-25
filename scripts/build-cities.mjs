#!/usr/bin/env node
// Builds src/data/cities.json — the optional city labels on the map — from
// Natural Earth's 1:50m populated places (public domain). Keeps the most
// important places, most important first: Natural Earth `scalerank` (0 = world
// city) then population. Run with: node scripts/build-cities.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson';

/** Enough to fill a zoomed-in view; the map thins them by zoom anyway. */
const KEEP = 400;

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/cities.json');

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`${SOURCE_URL} -> HTTP ${res.status}`);
const { features } = await res.json();

const round = (value, places) => Number(value.toFixed(places));

const cities = features
  .map(({ properties: p }) => ({
    name: p.name,
    lat: round(p.latitude, 3),
    lon: round(p.longitude, 3),
    rank: p.scalerank,
    pop: p.pop_max,
  }))
  .filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon))
  .sort((a, b) => a.rank - b.rank || b.pop - a.pop)
  .slice(0, KEEP);

if (cities.length < KEEP) throw new Error(`only ${cities.length} places — source changed?`);

// One city per line: small diffs when the source is refreshed.
const body = `[\n${cities.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`;
await writeFile(OUT, body);
console.log(`wrote ${cities.length} cities to ${OUT}`);
