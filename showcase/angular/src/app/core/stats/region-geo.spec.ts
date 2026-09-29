import { regionCentroid, regionDisplayName, regionPosition, regionSpread } from './region-geo';

describe('region-geo', () => {
  it('falls back from a city label to its state, then its country', () => {
    expect(regionCentroid('US-CA/San Jose')).toEqual(regionCentroid('US-CA'));
    expect(regionCentroid('SG/Singapore')).toEqual(regionCentroid('SG'));
    expect(regionCentroid('AU-Victoria/Melbourne')).toEqual(regionCentroid('AU'));
  });

  it('prefers the server centroid and never places the floor buckets', () => {
    expect(regionPosition({ label: 'US-CA/San Jose', lat: 37.3, lon: -121.9 }))
      .toEqual({ lon: -121.9, lat: 37.3 });
    expect(regionPosition({ label: 'US-CA' })).toEqual(regionCentroid('US-CA'));
    expect(regionPosition({ label: 'Other', lat: 1, lon: 2 })).toBeNull();
    expect(regionPosition({ label: 'unknown' })).toBeNull();
    expect(regionPosition({ label: 'XX-Nowhere' })).toBeNull();
  });

  it('spreads a city tighter than a state, and a state tighter than a country', () => {
    expect(regionSpread('US-CA/San Jose')).toBeLessThan(regionSpread('US-CA'));
    expect(regionSpread('US-CA')).toBeLessThan(regionSpread('US'));
  });

  it('names a city before its region', () => {
    expect(regionDisplayName('US-CA/San Jose')).toBe('San Jose, US-CA');
    expect(regionDisplayName('SG/Singapore')).toBe('Singapore, SG');
    expect(regionDisplayName('US-CA')).toBe('US-CA');
  });
});
