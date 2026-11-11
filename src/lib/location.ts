import type { City } from "./types";
import { normalizeSearch } from "./slug";

/**
 * Seçilen il adını veritabanındaki `cities` kaydına eşler.
 * Türkçe karakter ve büyük/küçük harf farkı eşleşmeyi bozmaz.
 */
export function findCityByName(cities: City[], name: string): City | undefined {
  const key = normalizeSearch(name.trim());
  if (!key) return undefined;
  return cities.find((city) => normalizeSearch(city.name) === key);
}

/**
 * Şema sınırı: `leads` yalnızca `city_id` (FK) + `district` tutar; serbest metin
 * il kolonu yoktur. Veritabanında karşılığı olmayan il seçildiğinde konum
 * kaydedilemez — çağıran taraf kullanıcıya görünür uyarı göstermelidir.
 */
export function hasStoredCity(cities: City[], province: string): boolean {
  return Boolean(findCityByName(cities, province));
}
