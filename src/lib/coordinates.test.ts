import { describe, expect, it } from "vitest";
import {
  formatCoordinates,
  googleDirectionsUrl,
  isValidLatitude,
  isValidLongitude,
  normalizeCoordinates,
  toFiniteNumber,
} from "./coordinates";

describe("coordinates", () => {
  it("aralık sınırlarını kabul eder, dışını reddeder", () => {
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(90.0001)).toBe(false);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180.1)).toBe(false);
    expect(isValidLatitude(Number.NaN)).toBe(false);
    expect(isValidLongitude("30")).toBe(false);
  });

  it("iki değer birlikte geçerli değilse null döner", () => {
    expect(normalizeCoordinates(38.1, 30.2)).toEqual({ latitude: 38.1, longitude: 30.2 });
    expect(normalizeCoordinates(38.1, undefined)).toBeNull();
    expect(normalizeCoordinates(undefined, 30.2)).toBeNull();
    expect(normalizeCoordinates(91, 30.2)).toBeNull();
  });

  it("Google yol tarifi koordinatı metin tahminine çevirmez", () => {
    expect(googleDirectionsUrl({ latitude: 38.754321, longitude: 30.52 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=38.754321,30.52",
    );
  });

  it("koordinat gösterimi sabit duyarlıktadır", () => {
    expect(formatCoordinates({ latitude: 38.1, longitude: 30.2 })).toBe("38.100000, 30.200000");
  });

  it("PostgREST sayısal metnini sayıya çevirir", () => {
    expect(toFiniteNumber("38.75")).toBe(38.75);
    expect(toFiniteNumber("")).toBeUndefined();
    expect(toFiniteNumber(null)).toBeUndefined();
    expect(toFiniteNumber("abc")).toBeUndefined();
  });
});
