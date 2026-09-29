/**
 * Compact place labels for anonymous region telemetry, and the hierarchy the
 * k>=5 publication floor walks.
 *
 *   { country: 'US', subdivision: 'California', city: 'San Jose' } -> 'US-CA/San Jose'
 *   { country: 'US', subdivision: 'California' }                   -> 'US-CA'
 *   { country: 'AU', subdivision: 'New South Wales' }              -> 'AU-New-South-Wales'
 *   { country: 'SG', subdivision: '', city: 'Singapore' }          -> 'SG/Singapore'
 *   { country: 'DE' }                                              -> 'DE'
 *   'unknown' / missing country                                    -> 'unknown'
 *
 * '/' separates the city and '-' the subdivision, so both are stripped from the
 * parts they would make ambiguous. The ingest route and the dataset refresh
 * script share this module: the refresh script keys each place centroid on the
 * same label the route stores, which is how public stats find a city's globe
 * position without storing coordinates per install.
 */

'use strict';

// US state name -> USPS 2-letter code, so US labels read 'US-CA' rather than a
// free-form state string.
const US_STATE_CODES = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

const MAX_SUBDIVISION_CHARS = 24;
const MAX_CITY_CHARS = 40;

/**
 * @param {{country?:string, subdivision?:string, city?:string}|string} region
 * @returns {string}
 */
function regionLabel(region) {
  if (!region || typeof region !== 'object' || typeof region.country !== 'string') {
    return 'unknown';
  }
  const country = region.country.trim().toUpperCase().replace(/[-/\s]/g, '').slice(0, 8);
  if (country === '') return 'unknown';

  const sub = typeof region.subdivision === 'string' ? region.subdivision.trim() : '';
  let label = country;
  if (sub !== '') {
    label = country === 'US' && US_STATE_CODES[sub]
      ? `US-${US_STATE_CODES[sub]}`
      : `${country}-${sub.replace(/[\s/]+/g, '-').slice(0, MAX_SUBDIVISION_CHARS)}`;
  }

  const city = typeof region.city === 'string'
    ? region.city.replace(/[\u0000-\u001f/]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CITY_CHARS).trim()
    : '';
  return city === '' ? label : `${label}/${city}`;
}

/**
 * The next-coarser label: city -> subdivision (or country when the city had no
 * subdivision), subdivision -> country, country / 'unknown' / 'Other' -> null.
 *
 * @param {string} label
 * @returns {string|null}
 */
function regionParent(label) {
  if (typeof label !== 'string') return null;
  const slash = label.indexOf('/');
  if (slash > 0) return label.slice(0, slash);
  const dash = label.indexOf('-');
  if (dash > 0) return label.slice(0, dash);
  return null;
}

/** Number of coarser levels above `label` (city 2, subdivision 1, country 0). */
function regionDepth(label) {
  let depth = 0;
  for (let p = regionParent(label); p !== null; p = regionParent(p)) depth++;
  return depth;
}

module.exports = {
  regionLabel,
  regionParent,
  regionDepth,
  US_STATE_CODES,
};
