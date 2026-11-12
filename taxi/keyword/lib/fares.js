// lib/fares.js — Fixed fare table for Airport Transfer Taxi
// (gatwicktransfertaxi.co.uk — Gatwick Airport only).
//
// SOURCE: https://gatwicktransfertaxi.co.uk/gatwick-taxi-prices/
// Prices checked October 2026, copied exactly from the site.
// 85 destinations. One-way fare FROM Gatwick; the return journey costs
// THE SAME fare each way (return = same fare, not double, not a discount).
// Columns: Saloon / Estate / MPV (6-seater) / 8-seater minibus / Executive saloon.
// Fare includes meet & greet, flight tracking, free child seats, and the
// £10 Gatwick terminal charge on airport journeys. No payment when booking
// — the customer pays the agreed fare. NEVER invent a fare: a destination
// not in this table is exactly "quote on request, owner will confirm".
//
// Keys are the destination names exactly as on the site. Look them up
// with findDestination() (case-insensitive, longest-match first so
// "Southampton Cruise Port" beats "Southampton", "Dover Port" beats
// "Dover", "Portsmouth Port" beats "Portsmouth", "Newhaven Port" beats
// "Newhaven").

const FARES = {
  "Brighton": { saloon: 80, estate: 96, mpv: 106, eightSeater: 128, executive: 112 },
  "Heathrow Airport": { saloon: 109, estate: 131, mpv: 145, eightSeater: 174, executive: 153 },
  "Central London": { saloon: 96, estate: 115, mpv: 128, eightSeater: 154, executive: 134 },
  "Southampton": { saloon: 180, estate: 216, mpv: 239, eightSeater: 288, executive: 252 },
  "Stansted Airport": { saloon: 169, estate: 203, mpv: 225, eightSeater: 270, executive: 237 },
  "Reading": { saloon: 148, estate: 178, mpv: 197, eightSeater: 237, executive: 207 },
  "Oxford": { saloon: 125, estate: 150, mpv: 166, eightSeater: 200, executive: 175 },
  "Guildford": { saloon: 80, estate: 96, mpv: 106, eightSeater: 128, executive: 112 },
  "Portsmouth": { saloon: 128, estate: 154, mpv: 170, eightSeater: 205, executive: 179 },
  "Luton Airport": { saloon: 180, estate: 216, mpv: 239, eightSeater: 288, executive: 252 },
  "London City Airport": { saloon: 132, estate: 158, mpv: 176, eightSeater: 211, executive: 185 },
  "Horsham": { saloon: 60, estate: 72, mpv: 80, eightSeater: 96, executive: 84 },
  "Eastbourne": { saloon: 133, estate: 160, mpv: 177, eightSeater: 213, executive: 186 },
  "Lewes": { saloon: 77, estate: 92, mpv: 102, eightSeater: 123, executive: 108 },
  "Chichester": { saloon: 122, estate: 146, mpv: 162, eightSeater: 195, executive: 171 },
  "Bognor Regis": { saloon: 112, estate: 134, mpv: 149, eightSeater: 179, executive: 157 },
  "Maidstone": { saloon: 100, estate: 120, mpv: 133, eightSeater: 160, executive: 140 },
  "Ashford": { saloon: 129, estate: 155, mpv: 172, eightSeater: 206, executive: 181 },
  "Canterbury": { saloon: 145, estate: 174, mpv: 193, eightSeater: 232, executive: 203 },
  "Hove": { saloon: 99, estate: 119, mpv: 132, eightSeater: 158, executive: 139 },
  "Haywards Heath": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Burgess Hill": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Dover": { saloon: 163, estate: 196, mpv: 217, eightSeater: 261, executive: 228 },
  "Folkestone": { saloon: 150, estate: 180, mpv: 200, eightSeater: 240, executive: 210 },
  "Hastings": { saloon: 118, estate: 142, mpv: 157, eightSeater: 189, executive: 165 },
  "Bexhill": { saloon: 108, estate: 130, mpv: 144, eightSeater: 173, executive: 151 },
  "Littlehampton": { saloon: 92, estate: 110, mpv: 122, eightSeater: 147, executive: 129 },
  "Shoreham-by-Sea": { saloon: 79, estate: 95, mpv: 105, eightSeater: 126, executive: 111 },
  "Epsom": { saloon: 72, estate: 86, mpv: 96, eightSeater: 115, executive: 101 },
  "Croydon": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Bromley": { saloon: 89, estate: 107, mpv: 118, eightSeater: 142, executive: 125 },
  "Woking": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Weybridge": { saloon: 87, estate: 104, mpv: 116, eightSeater: 139, executive: 122 },
  "Cobham": { saloon: 91, estate: 109, mpv: 121, eightSeater: 146, executive: 127 },
  "Caterham": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Chessington": { saloon: 87, estate: 104, mpv: 116, eightSeater: 139, executive: 122 },
  "Warner Bros Studios": { saloon: 123, estate: 148, mpv: 164, eightSeater: 197, executive: 172 },
  "Cambridge": { saloon: 200, estate: 240, mpv: 266, eightSeater: 320, executive: 280 },
  "Portsmouth Port": { saloon: 103, estate: 124, mpv: 137, eightSeater: 165, executive: 144 },
  "Newhaven Port": { saloon: 97, estate: 116, mpv: 129, eightSeater: 155, executive: 136 },
  "Leatherhead": { saloon: 81, estate: 97, mpv: 108, eightSeater: 130, executive: 113 },
  "Petworth": { saloon: 81, estate: 97, mpv: 108, eightSeater: 130, executive: 113 },
  "York": { saloon: 486, estate: 583, mpv: 646, eightSeater: 778, executive: 680 },
  "Horley": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "East Grinstead": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Uckfield": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Dorking": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Sheffield": { saloon: 373, estate: 448, mpv: 496, eightSeater: 597, executive: 522 },
  "Crawley": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Redhill": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Sutton": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Copthorne": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Forest Row": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Haslemere": { saloon: 88, estate: 106, mpv: 117, eightSeater: 141, executive: 123 },
  "Henfield": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Hurstpierpoint": { saloon: 73, estate: 88, mpv: 97, eightSeater: 117, executive: 102 },
  "Lingfield": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Newhaven": { saloon: 76, estate: 91, mpv: 101, eightSeater: 122, executive: 106 },
  "Oxted": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Reigate": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Edenbridge": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Godalming": { saloon: 79, estate: 95, mpv: 105, eightSeater: 126, executive: 111 },
  "Steyning": { saloon: 72, estate: 86, mpv: 96, eightSeater: 115, executive: 101 },
  "Worthing": { saloon: 76, estate: 91, mpv: 101, eightSeater: 122, executive: 106 },
  "Manchester": { saloon: 512, estate: 614, mpv: 681, eightSeater: 819, executive: 717 },
  "Liverpool": { saloon: 451, estate: 541, mpv: 600, eightSeater: 722, executive: 631 },
  "Leeds": { saloon: 443, estate: 532, mpv: 589, eightSeater: 709, executive: 620 },
  "Seaford": { saloon: 89, estate: 107, mpv: 118, eightSeater: 142, executive: 125 },
  "Sevenoaks": { saloon: 83, estate: 100, mpv: 110, eightSeater: 133, executive: 116 },
  "Nottingham": { saloon: 333, estate: 400, mpv: 443, eightSeater: 533, executive: 466 },
  "Bournemouth": { saloon: 228, estate: 274, mpv: 303, eightSeater: 365, executive: 319 },
  "Southampton Cruise Port": { saloon: 199, estate: 239, mpv: 265, eightSeater: 318, executive: 279 },
  "Dover Port": { saloon: 156, estate: 187, mpv: 207, eightSeater: 250, executive: 218 },
  "Stonehenge": { saloon: 134, estate: 161, mpv: 178, eightSeater: 214, executive: 188 },
  "Tunbridge Wells": { saloon: 78, estate: 94, mpv: 104, eightSeater: 125, executive: 109 },
  "Tonbridge": { saloon: 76, estate: 91, mpv: 101, eightSeater: 122, executive: 106 },
  "Wadhurst": { saloon: 108, estate: 130, mpv: 144, eightSeater: 173, executive: 151 },
  "Pembury": { saloon: 87, estate: 104, mpv: 116, eightSeater: 139, executive: 122 },
  "Crowborough": { saloon: 70, estate: 84, mpv: 93, eightSeater: 112, executive: 98 },
  "Paddock Wood": { saloon: 85, estate: 102, mpv: 113, eightSeater: 136, executive: 119 },
  "Bristol": { saloon: 263, estate: 316, mpv: 350, eightSeater: 421, executive: 368 },
  "Esher": { saloon: 88, estate: 106, mpv: 117, eightSeater: 141, executive: 123 },
  "Midhurst": { saloon: 83, estate: 100, mpv: 110, eightSeater: 133, executive: 116 },
  "Birmingham": { saloon: 321, estate: 385, mpv: 427, eightSeater: 514, executive: 449 },
  "Arundel": { saloon: 93, estate: 112, mpv: 124, eightSeater: 149, executive: 130 },
};

// Vehicle keys in table order, with display labels.
const VEHICLES = [
  { key: "saloon", label: "Saloon" },
  { key: "estate", label: "Estate" },
  { key: "mpv", label: "MPV (6-seater)" },
  { key: "eightSeater", label: "8-seater minibus" },
  { key: "executive", label: "Executive saloon" },
];

const VEHICLE_LABELS = {
  saloon: "Saloon",
  estate: "Estate",
  mpv: "MPV (6-seater)",
  eightSeater: "8-seater minibus",
  executive: "Executive saloon",
};

// Normalise text for matching: lowercase, collapse spaces/hyphens.
function norm(s) {
  return String(s || "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

// Destination names sorted longest-first so "Southampton Cruise Port"
// matches before "Southampton", "Dover Port" before "Dover", etc.
const SORTED_NAMES = Object.keys(FARES).sort((a, b) => b.length - a.length);

// Aliases that are not the site's own spelling.
const ALIASES = {
  "lcy": "London City Airport",
  "london city": "London City Airport",
  "city airport": "London City Airport",
  "heathrow": "Heathrow Airport",
  "stansted": "Stansted Airport",
  "luton": "Luton Airport",
  "warner bros": "Warner Bros Studios",
  "harry potter studios": "Warner Bros Studios",
  "central london": "Central London",
  "london": "Central London",
};

// Find a destination name in free text. Returns the exact FARES key or null.
// "gatwick" on its own is NOT a destination (it is the origin) — returns null.
function findDestination(text) {
  const t = ` ${norm(text)} `;
  if (!t.trim()) return null;
  // Alias check first (word-boundary).
  for (const [alias, dest] of Object.entries(ALIASES)) {
    if (t.includes(` ${alias} `) || t.includes(` ${alias},`) || t.endsWith(` ${alias} `)) return dest;
  }
  for (const name of SORTED_NAMES) {
    const n = norm(name);
    if (t.includes(` ${n} `) || t.includes(` ${n},`) || t.includes(` ${n}.`)) return name;
  }
  // Exact whole-text match (e.g. user replies just "Brighton").
  const exact = norm(text);
  for (const name of SORTED_NAMES) {
    if (norm(name) === exact) return name;
  }
  return null;
}

// Match a vehicle from free text. Returns a vehicle key or null.
function matchVehicle(text) {
  const t = norm(text);
  if (/\b8\b/.test(t) || t.includes("8-seater") || t.includes("8 seater") || t.includes("minibus") || t.includes("mini bus")) return "eightSeater";
  if (t.includes("executive")) return "executive";
  if (t.includes("mpv") || t.includes("6-seater") || t.includes("6 seater") || /\b6\b/.test(t)) return "mpv";
  if (t.includes("estate")) return "estate";
  if (t.includes("saloon")) return "saloon";
  return null;
}

// Fare for a destination + vehicle key. Null if either is unknown.
function fareFor(destination, vehicleKey) {
  const row = FARES[destination];
  if (!row || row[vehicleKey] === undefined) return null;
  return row[vehicleKey];
}

module.exports = { FARES, VEHICLES, VEHICLE_LABELS, findDestination, matchVehicle, fareFor };
