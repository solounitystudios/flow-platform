// Map V2 Batch 3 — true user-relative distance. The product rule: when the
// browser's one-shot geolocation is available, distance is computed from
// the user's real position; when it isn't, distance falls back to the
// existing fixed-city-center basis — and the two must be distinguishable in
// code (a tagged `source`), never a magic sentinel that silently looks like
// a real measurement either way. See lib/geo.ts.
import { describe, expect, it } from "vitest";
import { distanceInfo, milesBetween, milesFromCityCenter } from "@/lib/geo";
import { CITY_CENTER } from "@/lib/mock/data";

describe("milesBetween: generic two-point distance", () => {
  it("is zero for identical points", () => {
    expect(milesBetween(42.8864, -78.8784, 42.8864, -78.8784)).toBe(0);
  });

  it("is symmetric", () => {
    const a = milesBetween(42.8864, -78.8784, 42.9021, -78.8935);
    const b = milesBetween(42.9021, -78.8935, 42.8864, -78.8784);
    expect(a).toBe(b);
  });

  it("matches milesFromCityCenter when one point is the city center", () => {
    const lat = 42.9021;
    const lng = -78.8935;
    expect(milesBetween(lat, lng, CITY_CENTER.lat, CITY_CENTER.lng)).toBe(milesFromCityCenter(lat, lng));
  });
});

describe("milesFromCityCenter: unchanged existing behavior", () => {
  it("returns 0 for a null coordinate (never fabricates a distance)", () => {
    expect(milesFromCityCenter(null, -78.8784)).toBe(0);
    expect(milesFromCityCenter(42.8864, null)).toBe(0);
    expect(milesFromCityCenter(null, null)).toBe(0);
  });

  it("returns 0 for the city center itself", () => {
    expect(milesFromCityCenter(CITY_CENTER.lat, CITY_CENTER.lng)).toBe(0);
  });
});

describe("distanceInfo: real user-relative distance with a clearly-tagged fallback", () => {
  it("uses the user's real location and tags the source 'user' when available", () => {
    const userLocation = { lat: CITY_CENTER.lat, lng: CITY_CENTER.lng };
    const result = distanceInfo(42.9021, -78.8935, userLocation);
    expect(result.source).toBe("user");
    expect(result.miles).toBe(milesBetween(42.9021, -78.8935, userLocation.lat, userLocation.lng));
  });

  it("falls back to city-center distance and tags the source 'city-center' when location is unavailable", () => {
    const result = distanceInfo(42.9021, -78.8935, null);
    expect(result.source).toBe("city-center");
    expect(result.miles).toBe(milesFromCityCenter(42.9021, -78.8935));
  });

  it("a real (non-city-center) user location produces a different number than the city-center fallback for the same point", () => {
    const farFromCity = { lat: 43.5, lng: -79.5 };
    const withUser = distanceInfo(42.9021, -78.8935, farFromCity);
    const withoutUser = distanceInfo(42.9021, -78.8935, null);
    expect(withUser.miles).not.toBe(withoutUser.miles);
    expect(withUser.source).toBe("user");
    expect(withoutUser.source).toBe("city-center");
  });
});
