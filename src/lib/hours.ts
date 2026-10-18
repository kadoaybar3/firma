import type { CompanyHours } from "./types";

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

export function mapLink(company: { address: string; district?: string; name: string }): string {
  const q = encodeURIComponent(`${company.name}, ${company.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
