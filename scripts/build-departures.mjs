#!/usr/bin/env node
// Builds public/departures/<IATA>.json — one small file per airport in
// src/data/airports.json, listing the nonstop routes flown from it and the
// airlines operating them. The app fetches the file for the chosen departure
// airport to show a departures board.
//
// Source: OpenFlights routes.dat and airlines.dat (Open Database License).
// That snapshot dates from 2014 and has no times — the board shows routes,
// not a live schedule. Run with: node scripts/build-departures.mjs

import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { haversineKm, MIN_ROUTE_KM } from '../src/lib/geo.js';

const BASE = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/departures');
const SOURCE = 'OpenFlights route database (2014 snapshot, ODbL)';

/** OpenFlights .dat files: CSV with quoted strings and `\N` for null. */
function parseLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out.map((f) => (f === '\\N' ? '' : f.trim()));
}

async function fetchDat(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} -> HTTP ${res.status}`);
  return (await res.text()).split('\n').filter(Boolean).map(parseLine);
}

const airports = JSON.parse(await readFile(resolve(ROOT, 'src/data/airports.json'), 'utf8'));
const byIata = new Map(airports.map((a) => [a.iata, a]));
const [routes, airlines] = await Promise.all([fetchDat('routes.dat'), fetchDat('airlines.dat')]);

// airlines.dat: id, name, alias, IATA, ICAO, callsign, country, active
const airlineById = new Map(airlines.map((a) => [a[0], { code: a[3] || a[4], name: a[1] }]));

// routes.dat: airline, airline id, source, source id, dest, dest id, codeshare, stops, equipment
const bySource = new Map();
for (const [airlineCode, airlineId, src, , dst, , codeshare, stops] of routes) {
  if (codeshare === 'Y' || (stops && stops !== '0')) continue; // operating, nonstop only
  const from = byIata.get(src);
  const to = byIata.get(dst);
  if (!from || !to || src === dst) continue;
  if (haversineKm(from, to) < MIN_ROUTE_KM) continue; // too short to fly anyway
  const airline = airlineById.get(airlineId) ?? { code: airlineCode, name: airlineCode };
  if (!airline.code) continue;
  if (!bySource.has(src)) bySource.set(src, new Map());
  const dests = bySource.get(src);
  if (!dests.has(dst)) dests.set(dst, new Map());
  dests.get(dst).set(airline.code, airline.name);
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

let files = 0;
let total = 0;
for (const airport of airports) {
  const dests = bySource.get(airport.iata) ?? new Map();
  const departures = [...dests]
    .map(([to, carriers]) => ({
      to,
      airlines: [...carriers].sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => ({ code, name })),
    }))
    .sort((a, b) => a.to.localeCompare(b.to));
  total += departures.length;
  await writeFile(
    resolve(OUT_DIR, `${airport.iata}.json`),
    `${JSON.stringify({ schemaVersion: 1, from: airport.iata, source: SOURCE, departures })}\n`,
  );
  files += 1;
}
console.log(`Wrote ${files} departure files (${total} routes) to ${OUT_DIR}`);
