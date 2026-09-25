// Metropolitan areas: the IATA city codes that group a city's airports.
// Pure data — no DOM. OurAirports' `city` is the municipality (NRT is
// "Narita", STN is "London Stansted"), so this table is what lets the app say
// "Tokyo" for NRT and find every London airport from "LON".
//
// Codes are IATA metropolitan-area codes. Members not in the airport dataset
// are simply ignored at lookup time.

export const METROS = [
  { code: 'TYO', name: 'Tokyo', airports: ['HND', 'NRT'] },
  { code: 'OSA', name: 'Osaka', airports: ['KIX', 'ITM', 'UKB'] },
  { code: 'SPK', name: 'Sapporo', airports: ['CTS', 'OKD'] },
  { code: 'SEL', name: 'Seoul', airports: ['ICN', 'GMP'] },
  { code: 'BJS', name: 'Beijing', airports: ['PEK', 'PKX'] },
  { code: 'SHA', name: 'Shanghai', airports: ['PVG', 'SHA'] },
  { code: 'TPE', name: 'Taipei', airports: ['TPE', 'TSA'] },
  { code: 'BKK', name: 'Bangkok', airports: ['BKK', 'DMK'] },
  { code: 'JKT', name: 'Jakarta', airports: ['CGK', 'HLP'] },
  { code: 'KUL', name: 'Kuala Lumpur', airports: ['KUL', 'SZB'] },
  { code: 'MNL', name: 'Manila', airports: ['MNL', 'CRK'] },
  { code: 'BOM', name: 'Mumbai', airports: ['BOM', 'NMI'] },
  { code: 'DXB', name: 'Dubai', airports: ['DXB', 'DWC'] },
  { code: 'IST', name: 'Istanbul', airports: ['IST', 'SAW'] },
  { code: 'MOW', name: 'Moscow', airports: ['SVO', 'DME', 'VKO', 'ZIA'] },
  { code: 'LON', name: 'London', airports: ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'] },
  { code: 'PAR', name: 'Paris', airports: ['CDG', 'ORY', 'BVA'] },
  { code: 'MIL', name: 'Milan', airports: ['MXP', 'LIN', 'BGY'] },
  { code: 'ROM', name: 'Rome', airports: ['FCO', 'CIA'] },
  { code: 'STO', name: 'Stockholm', airports: ['ARN', 'BMA', 'NYO'] },
  { code: 'OSL', name: 'Oslo', airports: ['OSL', 'TRF'] },
  { code: 'BRU', name: 'Brussels', airports: ['BRU', 'CRL'] },
  { code: 'NYC', name: 'New York', airports: ['JFK', 'EWR', 'LGA'] },
  { code: 'WAS', name: 'Washington', airports: ['IAD', 'DCA', 'BWI'] },
  { code: 'CHI', name: 'Chicago', airports: ['ORD', 'MDW'] },
  { code: 'DTT', name: 'Detroit', airports: ['DTW'] },
  { code: 'QDF', name: 'Dallas', airports: ['DFW', 'DAL'] },
  { code: 'HOU', name: 'Houston', airports: ['IAH', 'HOU'] },
  { code: 'QLA', name: 'Los Angeles', airports: ['LAX', 'BUR', 'LGB', 'SNA', 'ONT'] },
  { code: 'QSF', name: 'San Francisco Bay Area', airports: ['SFO', 'OAK', 'SJC'] },
  { code: 'QMI', name: 'Miami', airports: ['MIA', 'FLL', 'PBI'] },
  { code: 'YTO', name: 'Toronto', airports: ['YYZ', 'YTZ'] },
  { code: 'YMQ', name: 'Montreal', airports: ['YUL', 'YMX'] },
  { code: 'MEX', name: 'Mexico City', airports: ['MEX', 'NLU'] },
  { code: 'SAO', name: 'São Paulo', airports: ['GRU', 'CGH', 'VCP'] },
  { code: 'RIO', name: 'Rio de Janeiro', airports: ['GIG', 'SDU'] },
  { code: 'BUE', name: 'Buenos Aires', airports: ['EZE', 'AEP'] },
  { code: 'MEL', name: 'Melbourne', airports: ['MEL', 'AVV'] },
];

let byAirport = null;

/** The metro area an airport belongs to, `{code, name, airports}`, or null. */
export function metroFor(iata) {
  if (!byAirport) {
    byAirport = new Map();
    for (const metro of METROS) {
      for (const code of metro.airports) byAirport.set(code, metro);
    }
  }
  return byAirport.get(String(iata ?? '').toUpperCase()) ?? null;
}

/** What a place is called: the metro name when there is one, else the city. */
export function placeName(airport) {
  if (!airport) return '';
  return metroFor(airport.iata)?.name || airport.city || airport.name || '';
}
