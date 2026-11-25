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

/** ---------- Form durumu ↔ mevcut saat biçimi ---------- */

/** Formdaki tek günün durumu (açık/kapalı + saat aralığı). */
export interface HoursDay {
  open: boolean;
  opens: string;
  closes: string;
}

/** Firma saatlerinin üç alanına karşılık gelen form durumu. */
export interface HoursDraft {
  weekday: HoursDay;
  saturday: HoursDay;
  sunday: HoursDay;
}

const HOURS_KEYS = ["weekday", "saturday", "sunday"] as const;

/** Gün açıldığında kullanılan varsayılan aralık. */
export const DEFAULT_OPENS = "09:00";
export const DEFAULT_CLOSES = "18:00";

function normalizeTime(value: string): string {
  const m = value.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return "";
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${m[2]}`;
}

function minutesOf(value: string): number {
  const [hh, mm] = value.split(":");
  return Number(hh) * 60 + Number(mm);
}

/** Boş form durumu: tüm günler kapalı (kayıt sırasında saat gönderilmez). */
export function emptyHoursDraft(): HoursDraft {
  const day = (): HoursDay => ({ open: false, opens: DEFAULT_OPENS, closes: DEFAULT_CLOSES });
  return { weekday: day(), saturday: day(), sunday: day() };
}

/** Gün durumunu mevcut metin biçimine yazar; kapalı gün "Kapalı" olur. */
export function formatHoursDay(day: HoursDay): string {
  const opens = day.open ? normalizeTime(day.opens) : "";
  const closes = day.open ? normalizeTime(day.closes) : "";
  return opens && closes ? `${opens} - ${closes}` : "Kapalı";
}

/**
 * Kayda yazılacak saatler. Hiç açık gün yoksa `undefined` döner: alan hiç
 * gönderilmez, firma kaydı kendi varsayılanını kullanır.
 */
export function hoursDraftToCompanyHours(draft: HoursDraft): CompanyHours | undefined {
  if (!HOURS_KEYS.some((key) => draft[key].open)) return undefined;
  return {
    weekday: formatHoursDay(draft.weekday),
    saturday: formatHoursDay(draft.saturday),
    sunday: formatHoursDay(draft.sunday),
  };
}

/** Gönderim öncesi doğrulama; hata metni yoksa null. */
export function hoursDraftError(draft: HoursDraft): string | null {
  for (const key of HOURS_KEYS) {
    const day = draft[key];
    if (!day.open) continue;
    const opens = normalizeTime(day.opens);
    const closes = normalizeTime(day.closes);
    if (!opens || !closes) return "Açık günler için açılış ve kapanış saati girilmelidir.";
    if (minutesOf(closes) <= minutesOf(opens)) return "Kapanış saati açılıştan sonra olmalıdır.";
  }
  return null;
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
