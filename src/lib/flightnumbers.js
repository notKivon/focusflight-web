// Flight numbers for the departures board. The route data has no schedules,
// so numbers are invented — but deterministically: the same airline on the
// same route always gets the same number, on every visit and every device.
// Pure; the board says "Not a live schedule".

/** 32-bit FNV-1a: small, fast and well mixed for short keys. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * A plausible flight number (1–4 digits) for `code` flying `from`→`to`.
 * Most come out as three or four digits, a few as two, like real boards.
 * `attempt` rehashes, for resolving a clash between two routes.
 */
export function flightNumber(from, to, code, attempt = 0) {
  const key = [from, to, code].map((part) => String(part ?? '').toUpperCase()).join('-');
  const hash = fnv1a(attempt ? `${key}#${attempt}` : key);
  const band = hash % 100;
  const rest = Math.floor(hash / 100);
  if (band < 12) return 10 + (rest % 90); // 10–99
  if (band < 55) return 100 + (rest % 900); // 100–999
  return 1000 + (rest % 9000); // 1000–9999
}

/**
 * Numbers for every (to, code) pair flown from one airport, with no airline
 * using the same number twice there. Pairs are numbered in the order given,
 * so a stable input order gives stable numbers.
 *
 * @param {string} from
 * @param {{to: string, code: string}[]} flights
 * @returns {Map<string, number>} keyed by `${to}-${code}`
 */
export function assignFlightNumbers(from, flights) {
  const numbers = new Map();
  const used = new Map(); // code -> Set of numbers
  for (const { to, code } of flights) {
    const key = `${to}-${code}`;
    if (numbers.has(key)) continue;
    if (!used.has(code)) used.set(code, new Set());
    const taken = used.get(code);
    let attempt = 0;
    let number = flightNumber(from, to, code);
    while (taken.has(number) && attempt < 50) number = flightNumber(from, to, code, ++attempt);
    taken.add(number);
    numbers.set(key, number);
  }
  return numbers;
}

/** "LX 1234", as boards print it. */
export function formatFlight(code, number) {
  return `${code} ${number}`;
}
