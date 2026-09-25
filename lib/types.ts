import type { Decision, Trend } from "./decide";
import type { FuelId } from "./minetur";
import type { Brent, Headline } from "./signals";

export interface StationResult {
  id: string;
  name: string;
  address: string;
  town: string;
  hours: string;
  lat: number;
  lon: number;
  price: number;
  distanceKm: number;
  change7d: number | null;
  totalCost: number;
}

export interface Analysis {
  updated: string;
  fuel: FuelId;
  liters: number;
  radiusKm: number;
  province: string;
  stations: StationResult[];
  stats: {
    localMedian: number;
    provinceMedian?: number;
    cheapest: number;
    bestSaving: number;
    trend: Trend;
    series: { daysAgo: number; local?: number; province?: number }[];
  };
  brent: Brent | null;
  headlines: Headline[];
  decision: Decision;
}
