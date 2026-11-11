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

/**
 * Web sitesi alanı protokolsüz de girilebilir (`ornek.com`, `www.ornek.com`).
 * Yalnız http(s) adresleri kabul edilir; geçersiz/tehlikeli şemalar gizlenir.
 */
export function websiteHref(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

const SOCIAL_HOSTS: Record<"instagram" | "facebook", readonly string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
};

/**
 * Sosyal medya alanına handle (`afyon`, `@afyon`), alan adı (`instagram.com/afyon`)
 * veya tam URL girilmiş olabilir. Yalnız ilgili platformun adresine bağlantı üretir.
 */
export function socialProfileUrl(
  raw: string | null | undefined,
  platform: "instagram" | "facebook",
): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const asProfile = (candidate: string): string | null => {
    try {
      const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
      if (!/^https?:$/.test(url.protocol)) return null;
      const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
      if (!SOCIAL_HOSTS[platform].includes(host)) return null;
      const path = url.pathname.replace(/\/+$/, "");
      return path ? `https://${platform}.com${path}${url.search}` : null;
    } catch {
      return null;
    }
  };

  // "/" veya ":" içeren ya da alan adı gibi görünen değer URL olarak denenir.
  if (/[/:]|\.(com|net|org)(\/|$)/i.test(value)) return asProfile(value);
  const handle = value.replace(/^@+/, "");
  return /^[A-Za-z0-9._-]+$/.test(handle) ? `https://${platform}.com/${handle}` : null;
}

/**
 * WhatsApp alanına telefon, `wa.me/...` bağlantısı veya `?phone=` parametresi
 * girilmiş olabilir. Yerel numaralar (0…) ülke koduyla tamamlanır.
 */
export function whatsappHref(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const fromUrl = value.match(/(?:wa\.me\/|phone=)(\d+)/i)?.[1];
  let digits = (fromUrl ?? value).replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) digits = `90${digits}`;
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

/**
 * `PENDING-…` gerçek bir sağlayıcı referansı değildir; ödeme sağlayıcısından
 * yanıt gelmeden açılan bekleyen kaydın dahili anahtarıdır.
 */
export function isPlaceholderPaymentRef(providerRef: string): boolean {
  return providerRef.startsWith("PENDING-");
}
