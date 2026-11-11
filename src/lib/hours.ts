import type { CompanyHours } from "./types";
import { googleDirectionsUrl, normalizeCoordinates } from "./coordinates";
import { normalizeSearch } from "./slug";

/** Gün ve saate göre işletmenin şu an açık olup olmadığını hesaplar. */
export function isOpenNow(hours: CompanyHours): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Pazar, 6=Cumartesi
  const segment = day === 0 ? hours.sunday : day === 6 ? hours.saturday : hours.weekday;
  return parseSegmentToOpen(segment, now);
}

function parseSegmentToOpen(segment: string, now: Date): boolean {
  const s = segment.trim();
  if (/kapalı|closed/i.test(s)) return false;
  const m = s.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return true; // Saat verisi bozuksa kapalı göstermeyelim
  const [, sh, sm, eh, em] = m;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = Number(sh) * 60 + Number(sm);
  const end = Number(eh) * 60 + Number(em);
  if (start === 0 && end === 0) return false;
  return minutes >= start && minutes < end;
}

export interface MapLinkCompany {
  name: string;
  address?: string;
  district?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Google Maps yol tarifi bağlantısı.
 *
 * Öncelik sırası:
 *  1. Kayıtlı koordinat → metin tahmini YAPILMADAN doğrudan hedef.
 *  2. Açık adres (ilçe/il eksikse eklenir).
 *  3. Firma adı + ilçe + il → arama bağlantısı.
 *
 * Hiçbiri yoksa null döner; çağıran taraf bağlantıyı göstermez.
 */
export function mapLink(company: MapLinkCompany): string | null {
  const coords = normalizeCoordinates(company.latitude, company.longitude);
  if (coords) return googleDirectionsUrl(coords);

  const address = (company.address ?? "").trim();
  if (address) {
    const pieces = [address];
    const normalizedAddress = normalizeSearch(address);
    if (company.district && !normalizedAddress.includes(normalizeSearch(company.district))) {
      pieces.push(company.district.trim());
    }
    if (company.province && !normalizedAddress.includes(normalizeSearch(company.province))) {
      pieces.push(company.province.trim());
    }
    const destination = pieces.filter(Boolean).join(", ");
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  }

  const fallback = [company.name, company.district, company.province]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  if (fallback.length < 2) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    fallback.join(", "),
  )}`;
}
