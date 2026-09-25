#!/usr/bin/env node
// Builds src/data/airports.json from the OurAirports public-domain dataset.
// Keeps large airports that have an IATA code. Run with: node scripts/build-airports.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const COUNTRIES_URL = 'https://davidmegginson.github.io/ourairports-data/countries.csv';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/airports.json');

/** Parses RFC 4180-ish CSV (quoted fields, doubled quotes, newlines in fields). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(text) {
  const rows = parseCsv(text);
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return toObjects(await res.text());
}

const [airports, countries] = await Promise.all([fetchCsv(AIRPORTS_URL), fetchCsv(COUNTRIES_URL)]);
const countryName = new Map(countries.map((c) => [c.code, c.name]));

const out = airports
  .filter((a) => a.type === 'large_airport' && a.iata_code && a.iata_code.trim())
  .map((a) => ({
    iata: a.iata_code.trim().toUpperCase(),
    name: a.name.trim(),
    city: (a.municipality || '').trim(),
    country: countryName.get(a.iso_country) || a.iso_country,
    lat: Number(Number(a.latitude_deg).toFixed(5)),
    lon: Number(Number(a.longitude_deg).toFixed(5)),
  }))
  .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
  .sort((a, b) => a.iata.localeCompare(b.iata));

const seen = new Set();
const duplicates = out.filter((a) => (seen.has(a.iata) ? true : (seen.add(a.iata), false)));
if (duplicates.length) throw new Error(`Duplicate IATA codes: ${duplicates.map((d) => d.iata).join(', ')}`);
// Sanity guard only. OurAirports reclassified many airports as `large_airport` over time
// (~450 in 2020, 1,171 today), so this range is deliberately wide.
if (out.length < 800 || out.length > 1600) throw new Error(`Unexpected airport count: ${out.length}`);

await writeFile(OUT, `${JSON.stringify(out, null, 0)}\n`);
console.log(`Wrote ${out.length} airports to ${OUT}`);
