import { CITY_CENTER } from "@/lib/mock/data";

// Haversine distance in miles — good enough for "X mi away" display, not for routing.
export function milesFromCityCenter(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return 0;
  const R = 3958.8;
  const dLat = ((lat - CITY_CENTER.lat) * Math.PI) / 180;
  const dLng = ((lng - CITY_CENTER.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((CITY_CENTER.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
