/**
 * KONUM KOORDİNATLARI — saf yardımcılar.
 *
 * Tek kural: geçerli bir konum için İKİ değer birlikte bulunmalıdır.
 * Eksik/aralık dışı değerler `null` döner; mevcut kayıtların koordinatsız
 * olması hiçbir akışta hata üretmez.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

/** İki değer de geçerliyse normalize edilmiş konum, aksi halde null. */
export function normalizeCoordinates(
  latitude: unknown,
  longitude: unknown,
): Coordinates | null {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return { latitude, longitude };
}

/** Google Maps yol tarifi hedefi: koordinat varsa metin tahmini kullanılmaz. */
export function googleDirectionsUrl(coords: Coordinates): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coords.latitude},${coords.longitude}`;
}

export function formatCoordinates(coords: Coordinates, digits = 6): string {
  return `${coords.latitude.toFixed(digits)}, ${coords.longitude.toFixed(digits)}`;
}

export function coordinatesEqual(
  a: Coordinates | null | undefined,
  b: Coordinates | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

/** PostgREST double precision değeri sayı ya da sayısal metin olabilir. */
export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
