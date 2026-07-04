// Shared types for GlobeVisualizationService. Extracted from the Site Maps
// page's globe (originally private to SiteMapsPageComponent) so the Stats
// page can reuse the identical rendering rather than re-implementing it --
// the two globes are required to stay visually in sync.

/** One activity cluster to scatter pulsing nodes around, in degrees. */
export interface GlobeRegion {
  readonly lon: number;
  readonly lat: number;
  readonly spread: number;
  readonly count: number;
}

export interface LandPoint {
  readonly lon: number;
  readonly phi: number;
}

export interface ProbeNode {
  readonly theta: number;
  readonly phi: number;
  readonly len: number;
  readonly phase: number;
  readonly speed: number;
}

export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PolygonGeometry {
  readonly type: 'Polygon';
  readonly coordinates: number[][][];
}

export interface MultiPolygonGeometry {
  readonly type: 'MultiPolygon';
  readonly coordinates: number[][][][];
}

export interface GeoJsonFeature {
  readonly geometry?: PolygonGeometry | MultiPolygonGeometry | null;
}

export interface LandGeoJson {
  readonly features?: GeoJsonFeature[];
}
