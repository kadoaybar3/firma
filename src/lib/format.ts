const TRY = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

/** Para birimini Türk Lirası biçiminde gösterir: ₺1.000 */
export function formatTRY(amount: number): string {
  return TRY.format(amount);
}

/** Tarihi Türkiye kullanıcıları için biçimler: 18 Ekim 2026 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** Tarih + saat: 18 Ekim 2026 14:58 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Kısa tarih: 18.10.2026 */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * Telefon numarasını tıklanabilir `tel:` bağlantısına çevirir.
 * Yalnızca rakamlar ve en baştaki '+' korunur; boşluk, tire, parantez
 * gibi biçim karakterleri temizlenir. Çevrilebilir karakter yoksa
 * boş string döner (çağıran taraf metne düşebilir).
 */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return phone.startsWith("+") ? `tel:+${digits}` : `tel:${digits}`;
}
