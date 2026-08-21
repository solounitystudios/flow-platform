import { CITY_CENTER } from "@/lib/mock/data";

// Haversine distance in miles — good enough for "X mi away" display, not for routing.
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/** Distance in miles between two arbitrary points. General-purpose version
 * of the city-center-only haversine below — added for Map V2 Batch 3's
 * true user-relative distance (lib/data/opportunities.ts's server-side
 * distance_mi stays city-center-based; this is for the client-side,
 * geolocation-aware override — see components/opportunities/LiveBrowser.tsx). */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  return haversineMiles(lat1, lng1, lat2, lng2);
}

// Haversine distance in miles — good enough for "X mi away" display, not for routing.
export function milesFromCityCenter(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return 0;
  return haversineMiles(lat, lng, CITY_CENTER.lat, CITY_CENTER.lng);
}

export interface UserLocation {
  lat: number;
  lng: number;
}

/** Where a displayed distance actually came from — a tagged union rather
 * than a magic sentinel (e.g. 0 or null both already mean real things
 * elsewhere: 0 miles is a real distance, null is "no coordinates at all").
 * "user": the browser's one-shot, non-blocking, never-persisted geolocation
 * (see LiveBrowser's userLocation state) was available and used. "city-center":
 * geolocation was denied/unavailable/not yet resolved, so this falls back to
 * the existing fixed-city-center distance — never fabricated, always
 * clearly labeled which basis produced the number. */
export type DistanceSource = "user" | "city-center";

export interface DistanceInfo {
  miles: number;
  source: DistanceSource;
}

/** True user-relative distance when we have it, city-center fallback when we
 * don't. Callers with a possibly-missing coordinate (e.g. MockOpportunity's
 * nullable lat/lng) should guard before calling this — it always requires a
 * real point, exactly like milesBetween/milesFromCityCenter's non-null
 * counterparts, so a missing coordinate is the caller's decision to omit
 * distance entirely, never this function's problem to paper over. */
export function distanceInfo(lat: number, lng: number, userLocation: UserLocation | null): DistanceInfo {
  if (userLocation) {
    return { miles: milesBetween(lat, lng, userLocation.lat, userLocation.lng), source: "user" };
  }
  return { miles: milesFromCityCenter(lat, lng), source: "city-center" };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
