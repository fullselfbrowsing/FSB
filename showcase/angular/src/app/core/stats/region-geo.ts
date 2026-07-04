// Quick task 260630-hct follow-up -- label -> approximate centroid lookup for the
// Stats page "Active now" globe. Mirrors the server's region label format from
// showcase/server/src/routes/telemetry.js (regionLabel()):
//   'US-CA'          -- US state, 2-letter USPS code (US_STATE_CODES there)
//   'DE'             -- bare ISO 3166-1 alpha-2 country code (no subdivision)
//   'AU-Victoria'    -- non-US country + slugged subdivision name
//   'unknown'/'Other' -- never geolocatable; callers must not plot these
//
// This is a coarse, best-effort lookup for visualization only (which continent /
// part of a country to glow a node in) -- NOT a precise geocoder. Countries or
// subdivisions absent from these tables simply return null so callers can skip
// them; the globe degrades gracefully rather than guessing a location.

/** Approximate geographic centroid, in degrees. */
export interface RegionCentroid {
  readonly lon: number;
  readonly lat: number;
}

// ISO 3166-1 alpha-2 country code -> approximate centroid. Covers commonly-seen
// countries across every populated continent; extend opportunistically.
const COUNTRY_CENTROIDS: Readonly<Record<string, RegionCentroid>> = {
  US: { lon: -98, lat: 39 }, CA: { lon: -106, lat: 56 }, MX: { lon: -102, lat: 23 },
  BR: { lon: -52, lat: -10 }, AR: { lon: -64, lat: -34 }, CL: { lon: -71, lat: -30 },
  CO: { lon: -73, lat: 4 }, PE: { lon: -76, lat: -10 }, VE: { lon: -66, lat: 8 },
  EC: { lon: -78, lat: -1.5 }, UY: { lon: -56, lat: -33 }, PY: { lon: -58, lat: -23 },
  BO: { lon: -64, lat: -17 }, CR: { lon: -84, lat: 10 }, PA: { lon: -80, lat: 9 },
  GT: { lon: -90, lat: 15.5 }, DO: { lon: -70, lat: 19 }, CU: { lon: -79, lat: 21.5 },
  JM: { lon: -77, lat: 18.1 },

  GB: { lon: -2, lat: 54 }, IE: { lon: -8, lat: 53 }, FR: { lon: 2.5, lat: 47 },
  DE: { lon: 10, lat: 51 }, ES: { lon: -3.7, lat: 40 }, PT: { lon: -8, lat: 39.5 },
  IT: { lon: 12.5, lat: 42.5 }, NL: { lon: 5.3, lat: 52.2 }, BE: { lon: 4.5, lat: 50.5 },
  CH: { lon: 8.2, lat: 46.8 }, AT: { lon: 14.5, lat: 47.5 }, SE: { lon: 15, lat: 62 },
  NO: { lon: 9, lat: 61 }, DK: { lon: 10, lat: 56 }, FI: { lon: 26, lat: 64 },
  IS: { lon: -19, lat: 65 }, PL: { lon: 19.5, lat: 52 }, CZ: { lon: 15.5, lat: 49.8 },
  SK: { lon: 19.5, lat: 48.7 }, HU: { lon: 19.5, lat: 47.2 }, RO: { lon: 25, lat: 46 },
  BG: { lon: 25.5, lat: 42.7 }, GR: { lon: 22, lat: 39 }, TR: { lon: 35, lat: 39 },
  UA: { lon: 31.5, lat: 49 }, RU: { lon: 90, lat: 61 }, BY: { lon: 28, lat: 53.5 },
  LT: { lon: 24, lat: 55.3 }, LV: { lon: 25, lat: 57 }, EE: { lon: 26, lat: 58.7 },
  HR: { lon: 15.5, lat: 45.3 }, RS: { lon: 21, lat: 44 }, SI: { lon: 14.8, lat: 46.1 },
  LU: { lon: 6.1, lat: 49.6 }, MT: { lon: 14.4, lat: 35.9 }, CY: { lon: 33.3, lat: 35 },

  CN: { lon: 104, lat: 35 }, JP: { lon: 138, lat: 37 }, KR: { lon: 127.8, lat: 36 },
  TW: { lon: 121, lat: 23.7 }, HK: { lon: 114.2, lat: 22.3 }, IN: { lon: 79, lat: 22 },
  PK: { lon: 69.3, lat: 30 }, BD: { lon: 90.4, lat: 23.7 }, LK: { lon: 80.8, lat: 7.9 },
  ID: { lon: 113.9, lat: -0.8 }, MY: { lon: 109.5, lat: 3.8 }, SG: { lon: 103.8, lat: 1.35 },
  TH: { lon: 101, lat: 15 }, VN: { lon: 106, lat: 16 }, PH: { lon: 122, lat: 12.9 },
  KH: { lon: 105, lat: 12.6 }, MM: { lon: 96.5, lat: 21.9 }, NP: { lon: 84, lat: 28.2 },
  KZ: { lon: 67, lat: 48 }, UZ: { lon: 64, lat: 41.4 }, MN: { lon: 103.8, lat: 46.9 },

  AU: { lon: 134, lat: -25.3 }, NZ: { lon: 172, lat: -41 }, FJ: { lon: 178, lat: -18 },

  SA: { lon: 45, lat: 24 }, AE: { lon: 54.3, lat: 24 }, IL: { lon: 35, lat: 31.5 },
  QA: { lon: 51.2, lat: 25.3 }, KW: { lon: 47.5, lat: 29.3 }, BH: { lon: 50.6, lat: 26 },
  OM: { lon: 56.5, lat: 21 }, JO: { lon: 36.2, lat: 31 }, LB: { lon: 35.9, lat: 33.9 },
  IQ: { lon: 44, lat: 33 }, IR: { lon: 53.7, lat: 32.4 }, EG: { lon: 30.8, lat: 26.8 },

  ZA: { lon: 24.7, lat: -29 }, NG: { lon: 8.7, lat: 9.1 }, KE: { lon: 37.9, lat: -0.02 },
  GH: { lon: -1, lat: 7.9 }, MA: { lon: -7.1, lat: 31.8 }, DZ: { lon: 2.6, lat: 28.2 },
  TN: { lon: 9.5, lat: 33.9 }, ET: { lon: 39.6, lat: 8.6 }, TZ: { lon: 34.9, lat: -6.4 },
  UG: { lon: 32.3, lat: 1.4 },
};

// US state 2-letter USPS code -> approximate centroid. Mirrors US_STATE_CODES in
// showcase/server/src/routes/telemetry.js so every code that server can emit
// resolves here (plus DC).
const US_STATE_CENTROIDS: Readonly<Record<string, RegionCentroid>> = {
  AL: { lon: -86.8, lat: 32.8 }, AK: { lon: -152.4, lat: 64.2 }, AZ: { lon: -111.7, lat: 34.2 },
  AR: { lon: -92.4, lat: 34.8 }, CA: { lon: -119.4, lat: 36.8 }, CO: { lon: -105.5, lat: 39 },
  CT: { lon: -72.7, lat: 41.6 }, DE: { lon: -75.5, lat: 39 }, FL: { lon: -81.6, lat: 27.8 },
  GA: { lon: -83.5, lat: 32.6 }, HI: { lon: -157.5, lat: 20.8 }, ID: { lon: -114.7, lat: 44.5 },
  IL: { lon: -89, lat: 40 }, IN: { lon: -86.3, lat: 40 }, IA: { lon: -93.5, lat: 42 },
  KS: { lon: -98.4, lat: 38.5 }, KY: { lon: -84.9, lat: 37.5 }, LA: { lon: -91.9, lat: 31.2 },
  ME: { lon: -69.4, lat: 45.4 }, MD: { lon: -76.6, lat: 39 }, MA: { lon: -71.5, lat: 42.3 },
  MI: { lon: -84.5, lat: 44.3 }, MN: { lon: -94.3, lat: 46.3 }, MS: { lon: -89.7, lat: 32.7 },
  MO: { lon: -92.5, lat: 38.5 }, MT: { lon: -109.6, lat: 47 }, NE: { lon: -99.9, lat: 41.5 },
  NV: { lon: -117, lat: 39.3 }, NH: { lon: -71.6, lat: 43.7 }, NJ: { lon: -74.5, lat: 40.1 },
  NM: { lon: -106, lat: 34.5 }, NY: { lon: -75.5, lat: 43 }, NC: { lon: -79.4, lat: 35.6 },
  ND: { lon: -100.5, lat: 47.5 }, OH: { lon: -82.8, lat: 40.4 }, OK: { lon: -97, lat: 35.6 },
  OR: { lon: -120.6, lat: 44 }, PA: { lon: -77.6, lat: 40.9 }, RI: { lon: -71.5, lat: 41.7 },
  SC: { lon: -80.9, lat: 33.9 }, SD: { lon: -100.2, lat: 44.5 }, TN: { lon: -86.4, lat: 35.9 },
  TX: { lon: -99.3, lat: 31.5 }, UT: { lon: -111.7, lat: 39.3 }, VT: { lon: -72.6, lat: 44 },
  VA: { lon: -78.7, lat: 37.5 }, WA: { lon: -120.5, lat: 47.4 }, WV: { lon: -80.6, lat: 38.6 },
  WI: { lon: -89.9, lat: 44.6 }, WY: { lon: -107.5, lat: 43 }, DC: { lon: -77, lat: 38.9 },
};

/**
 * Resolve a server-emitted region label (see file header) to an approximate
 * {lon, lat} centroid for globe placement, or null when the label can't (or
 * shouldn't) be geolocated -- including the literal 'unknown' and 'Other'
 * k-anonymity-floor buckets, which never carry a meaningful location.
 */
export function regionCentroid(label: string): RegionCentroid | null {
  if (!label || label === 'unknown' || label === 'Other') return null;

  const dash = label.indexOf('-');
  if (dash === -1) return COUNTRY_CENTROIDS[label] ?? null;

  const country = label.slice(0, dash);
  const sub = label.slice(dash + 1);
  if (country === 'US') return US_STATE_CENTROIDS[sub] ?? COUNTRY_CENTROIDS['US'];
  // Non-US subdivisions aren't individually tabulated -- fall back to the
  // country centroid so the region is still placed on the right landmass.
  return COUNTRY_CENTROIDS[country] ?? null;
}
