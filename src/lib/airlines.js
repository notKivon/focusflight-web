// Airline names as a departures board prints them: short brand names
// ("Swiss", not "Swiss International Air Lines"). Pure; used at build time by
// scripts/build-departures.mjs, so none of this ships in the app bundle.
//
// OpenFlights airlines.dat reuses IATA codes (VY is both Vueling and the
// long-gone Formosa Airlines) and routes.dat often points at the wrong one, so
// the carriers with the most routes are named here by code. The table covers
// every carrier with 24+ nonstop routes in the 2014 snapshot (230 codes),
// ranked from the data; the rest fall back to `shortAirlineName`.

/** IATA code → board name. 2014 brands, because the routes are from 2014. */
export const AIRLINE_NAMES = {
  FR: 'Ryanair', US: 'US Airways', AA: 'American', DL: 'Delta', CZ: 'China Southern',
  U2: 'easyJet', WN: 'Southwest', UA: 'United', MU: 'China Eastern', CA: 'Air China',
  DY: 'Norwegian', LH: 'Lufthansa', AB: 'Air Berlin', TK: 'Turkish Airlines', TO: 'Transavia',
  AF: 'Air France', HU: 'Hainan Airlines', W6: 'Wizz Air', '4U': 'Germanwings', SU: 'Aeroflot',
  MF: 'Xiamen Airlines', SK: 'SAS', BA: 'British Airways', B6: 'JetBlue', VY: 'Vueling',
  ZH: 'Shenzhen Airlines', SV: 'Saudia', AZ: 'Alitalia', '3U': 'Sichuan Airlines', AC: 'Air Canada',
  SC: 'Shandong Airlines', EK: 'Emirates', LS: 'Jet2', DE: 'Condor', QR: 'Qatar Airways',
  G3: 'Gol', UN: 'Transaero', AI: 'Air India', KE: 'Korean Air', JJ: 'TAM',
  NH: 'ANA', WS: 'WestJet', GS: 'Tianjin Airlines', AT: 'Royal Air Maroc', U6: 'Ural Airlines',
  KL: 'KLM', NK: 'Spirit', S7: 'S7 Airlines', ZB: 'Monarch', CX: 'Cathay Pacific',
  X3: 'TUIfly', OZ: 'Asiana', HV: 'Transavia', AV: 'Avianca', PK: 'PIA',
  '6E': 'IndiGo', JD: 'Capital Airlines', MS: 'EgyptAir', ET: 'Ethiopian', AS: 'Alaska',
  LX: 'Swiss', EY: 'Etihad', PC: 'Pegasus', AY: 'Finnair', JL: 'JAL',
  IB: 'Iberia', EI: 'Aer Lingus', SG: 'SpiceJet', TG: 'Thai Airways', AH: 'Air Algérie',
  Y4: 'Volaris', MH: 'Malaysia Airlines', CI: 'China Airlines', FL: 'AirTran', FM: 'Shanghai Airlines',
  '9W': 'Jet Airways', TP: 'TAP Portugal', AD: 'Azul', VN: 'Vietnam Airlines', A3: 'Aegean',
  CM: 'Copa Airlines', IR: 'Iran Air', '9C': 'Spring Airlines', FZ: 'flydubai', SN: 'Brussels Airlines',
  JQ: 'Jetstar', QF: 'Qantas', GA: 'Garuda Indonesia', SQ: 'Singapore Airlines', AM: 'Aeroméxico',
  UX: 'Air Europa', '5J': 'Cebu Pacific', G9: 'Air Arabia', HO: 'Juneyao Airlines', F9: 'Frontier',
  TU: 'Tunisair', HY: 'Uzbekistan Airways', KQ: 'Kenya Airways', AK: 'AirAsia', RJ: 'Royal Jordanian',
  BT: 'airBaltic', TS: 'Air Transat', V7: 'Volotea', LA: 'LAN', BR: 'EVA Air',
  PR: 'Philippine Airlines', '8L': 'Lucky Air', HG: 'Niki', LO: 'LOT', PS: 'Ukraine International',
  OK: 'Czech Airlines', IG: 'Meridiana', SA: 'South African', WY: 'Oman Air', '4O': 'Interjet',
  KA: 'Dragonair', XY: 'flynas', EP: 'Iran Aseman', OU: 'Croatia Airlines', PN: 'West Air',
  XQ: 'SunExpress', LG: 'Luxair', A5: 'HOP!', BK: 'Okay Airways', MI: 'SilkAir',
  JT: 'Lion Air', KU: 'Kuwait Airways', RO: 'Tarom', B2: 'Belavia', AR: 'Aerolíneas Argentinas',
  FD: 'Thai AirAsia', O6: 'Avianca Brasil', IX: 'Air India Express', IY: 'Yemenia', KM: 'Air Malta',
  TR: 'Tigerair', GF: 'Gulf Air', LY: 'El Al', VS: 'Virgin Atlantic', AP: 'Air One',
  VB: 'VivaAerobus', NZ: 'Air New Zealand', GE: 'TransAsia', JU: 'Air Serbia', UL: 'SriLankan',
  VX: 'Virgin America', HQ: 'Thomas Cook', KC: 'Air Astana', ST: 'Germania', Y7: 'NordStar',
  QS: 'Travel Service', ME: 'MEA', NL: 'Shaheen Air', BE: 'Flybe', G8: 'GoAir',
  HA: 'Hawaiian', BW: 'Caribbean Airlines', DV: 'SCAT', ZI: 'Aigle Azur', PG: 'Bangkok Airways',
  EU: 'Chengdu Airlines', NS: 'Hebei Airlines', FI: 'Icelandair', FB: 'Bulgaria Air', NX: 'Air Macau',
  HX: 'Hong Kong Airlines', BG: 'Biman', J2: 'AZAL', CU: 'Cubana', BC: 'Skymark',
  G4: 'Allegiant', QZ: 'Indonesia AirAsia', W3: 'Arik Air', WF: 'Widerøe', BV: 'Blue Panorama',
  '3O': 'Air Arabia Maroc', KY: 'Kunming Airlines', SZ: 'Somon Air', R3: 'Yakutia', JP: 'Adria Airways',
  '7I': 'Insel Air', SJ: 'Sriwijaya Air', V0: 'Conviasa', MK: 'Air Mauritius', WB: 'RwandAir',
  D7: 'AirAsia X', FJ: 'Fiji Airways', K2: 'EuroLOT', QG: 'Citilink', VA: 'Virgin Australia',
  '3K': 'Jetstar Asia', B7: 'Uni Air', B9: 'Iran Airtour', OD: 'Malindo Air', SY: 'Sun Country',
  '7C': 'Jeju Air', '7J': 'Tajik Air', '7R': 'RusLine', TT: 'Tigerair Australia', J9: 'Jazeera Airways',
  TV: 'Tibet Airlines', CY: 'Cyprus Airways', DT: 'TAAG Angola', SE: 'XL Airways', DN: 'Senegal Airlines',
  MM: 'Peach', QV: 'Lao Airlines', UJ: 'AlMasria', UP: 'Bahamasair', UR: 'UTair Express',
  Z2: 'Zest Air', MD: 'Air Madagascar', S4: 'SATA', SD: 'Sudan Airways', AE: 'Mandarin Airlines',
  BI: 'Royal Brunei', BM: 'bmi regional', BX: 'Air Busan', F7: 'Flybaboo', FW: 'Ibex Airlines',
  GK: 'Jetstar Japan', LJ: 'Jin Air', PX: 'Air Niugini', VR: 'TACV', BP: 'Air Botswana',
  G5: 'China Express',
  // Smaller carriers the fallback would get wrong: airlines.dat has no entry,
  // only a stale one, or a registered name no board would print.
  UO: 'HK Express', JS: 'Air Koryo', GL: 'Air Greenland', SB: 'Aircalin', WM: 'Winair',
  TA: 'TACA', VJ: 'VietJet Air', MJ: 'Mihin Lanka', '9M': 'Central Mountain Air', OB: 'BoA',
  PB: 'PAL Airlines', '9V': 'Avior', QL: 'Laser', '7M': 'Mayair', BB: 'Seaborne',
  '2Z': 'Passaredo', '8R': 'Sol', YC: 'Yamal', '2G': 'Angara', YK: 'Avia Traffic',
  DZ: 'Donghai Airlines', U7: 'Air Uganda', LC: 'ECAir', PM: 'Canaryfly', MR: 'Hunnu Air',
  HZ: 'Aurora', RX: 'Regent Airways', GQ: 'Sky Express', RZ: 'Sansa', '5U': 'TAG Airlines',
  HF: 'Air Côte d’Ivoire', '3H': 'Air Inuit', JW: 'Vanilla Air', RG: 'Rotana Jet', VQ: 'Novoair',
  EB: 'Wamos Air', FO: 'Felix Airways', ID: 'Batik Air', MW: 'Mokulele', ON: 'Nauru Airlines',
  QB: 'Qeshm Air', Y5: 'Golden Myanmar', AW: 'Africa World Airlines', LN: 'Libyan Airlines',
  HD: 'Air Do', IZ: 'Arkia', FV: 'Rossiya', S2: 'JetLite', XL: 'LAN Ecuador',
  SS: 'Corsair', '2P': 'PAL Express', '4N': 'Air North', '6R': 'Alrosa', P0: 'Proflight Zambia',
  XK: 'Air Corsica', PZ: 'TAM Paraguay', OA: 'Olympic Air', QH: 'Air Kyrgyzstan', '5P': 'PAL Airlines',
  FG: 'Ariana', OM: 'MIAT', LI: 'LIAT', KN: 'China United',
};

/**
 * routes.dat files a few big charter carriers under their ICAO code. Boards
 * print the IATA code, so those are mapped: [code, name].
 */
export const ICAO_CARRIERS = {
  TOM: ['BY', 'Thomson'],
  TCX: ['MT', 'Thomas Cook'],
};

const LEGAL_NOISE = /\s+(limited|ltd\.?|inc\.?|s\.a\.?|company|co\.)$/i;
const GENERIC_TAIL = /\s+(airlines|air lines|international)$/i;
const AIRLINE_WORD = /\b(air|jet|wings|fly|sky|express|aero)\b/i;

/**
 * A long registered name cut down to what a board would print, for carriers
 * the table does not know. Parentheticals, legal suffixes and a trailing
 * " - Country" go. A trailing "Airlines" or "International" goes only when
 * what remains still reads as an airline ("Shaheen Air International" →
 * "Shaheen Air"), so "Libyan Arab Airlines" and "Kunming Airlines" stay whole.
 * "Airways" is never touched: "British Airways" must not become "British".
 */
export function shortAirlineName(name) {
  let out = String(name ?? '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  out = out.replace(/\s+-\s+[^-]+$/, '').replace(LEGAL_NOISE, '');
  for (;;) {
    const cut = out.replace(GENERIC_TAIL, '');
    if (cut === out || cut.split(' ').length < 2 || !AIRLINE_WORD.test(cut)) break;
    out = cut;
  }
  return out;
}

/**
 * The board's carrier for a routes.dat airline code: `{code, name}`.
 * `candidates` are the airlines.dat names filed under that code, best first;
 * they are only consulted when the table does not know the code.
 */
export function resolveAirline(code, candidates = []) {
  const key = String(code ?? '').toUpperCase();
  if (ICAO_CARRIERS[key]) return { code: ICAO_CARRIERS[key][0], name: ICAO_CARRIERS[key][1] };
  if (AIRLINE_NAMES[key]) return { code: key, name: AIRLINE_NAMES[key] };
  const name = shortAirlineName(candidates.find(Boolean) ?? '');
  return { code: key, name: name || key };
}
