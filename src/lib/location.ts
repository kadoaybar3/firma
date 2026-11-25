import { TR_ILLER } from "../data/trCities";
import { TR_ILCELERI } from "../data/trDistricts";
import type { City } from "./types";
import { normalizeSearch } from "./slug";

/** Resmî il ve ilçe listeleri — normalizasyon anahtarlarıyla. */
const PROVINCE_BY_KEY = new Map(TR_ILLER.map((name) => [normalizeSearch(name), name]));
const DISTRICTS_BY_PROVINCE = new Map(
  Object.entries(TR_ILCELERI).map(([province, districts]) => [
    normalizeSearch(province),
    new Map(districts.map((name) => [normalizeSearch(name), name])),
  ]),
);

/** Türkçe karakter, büyük/küçük harf ve fazla boşluk farklarını siler. */
function localityKey(text: string): string {
  return normalizeSearch(text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Türkiye geneli ortak il/ilçe normalizasyonu (tüm veri kaynakları için).
 *
 * - İl, resmî 81 il listesiyle eşleşir; "Afyonkarahisar Merkez" gibi il + ilçe
 *   tek metinde geldiğinde il öneki, kalan ifade o ilin ilçe listesinde birebir
 *   karşılık buluyorsa ayrılır.
 * - İlçe yalnız seçili ilin ilçe listesinden birebir eşleşir; "Ankara Çankaya"
 *   gibi il öneki yalnız kalan ifade birebir ilçe adıysa silinir.
 * - Eşleşmeyen alan tahmin edilmez: il biliniyorsa ilçe boş döner (kullanıcı
 *   mevcut seçim menüsünden seçer), il de bulunamazsa ikisi de boş kalır.
 * - Açık adres metni değiştirilmez; yalnız bu iki alan normalize edilir.
 */
export function normalizeLocality(
  province: string,
  district: string,
): { province: string; district: string } {
  const provinceKey = localityKey(province);
  let districtKey = localityKey(district);
  if (!provinceKey) return { province: "", district: "" };

  let official = PROVINCE_BY_KEY.get(provinceKey);
  if (!official) {
    // "Afyonkarahisar Merkez" biçiminde il + ilçe tek metinde: il öneki yalnız
    // kalan ifade o ilin ilçelerinden biriyse kabul edilir (sokak adı değil).
    for (const [key, name] of PROVINCE_BY_KEY) {
      if (!provinceKey.startsWith(`${key} `)) continue;
      const rest = provinceKey.slice(key.length + 1);
      const hit = DISTRICTS_BY_PROVINCE.get(key)?.get(rest);
      if (hit) {
        official = name;
        // Kalan ifade zaten resmî ilçe adı; anahtara çevirip devam et.
        if (!districtKey) districtKey = localityKey(hit);
      }
      break;
    }
  }
  if (!official) return { province: "", district: "" };
  if (!districtKey) return { province: official, district: "" };

  const list = DISTRICTS_BY_PROVINCE.get(localityKey(official));
  if (!list) return { province: official, district: "" };

  const exact = list.get(districtKey);
  if (exact) return { province: official, district: exact };

  // İl öneki yalnız kalan ifade birebir ilçe listesinde varsa silinir.
  const officialKey = localityKey(official);
  if (districtKey.startsWith(`${officialKey} `)) {
    const stripped = list.get(districtKey.slice(officialKey.length + 1));
    if (stripped) return { province: official, district: stripped };
  }
  return { province: official, district: "" };
}

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
