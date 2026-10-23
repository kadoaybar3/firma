/**
 * GOOGLE PLACES İSTEMCİSİ — yalnızca sunucu uç noktasını çağırır.
 *
 * KURAL: API anahtarı asla istemciye konmaz. Uç nokta `/api/places-search`
 * Netlify Functions (v2) tarafından sağlanır; anahtar `GOOGLE_PLACES_API_KEY`
 * Netlify ortam değişkenidir. Uç nokta yoksa/anahtar yoksa PlacesConfigError
 * ile eksik yapılandırma kullanıcıya açıkça bildirilir — sessiz yutma yok,
 * sahte sonuç gösterme yok, anahtar tanımlı değilse ücretli çağrı başlatma yok.
 */

export interface PlaceCandidate {
  placeId: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  /** Places API (New) — places.location (Essentials SKU); ana sonuçta gelir. */
  latitude?: number;
  longitude?: number;
}

export interface PlacesParams {
  il: string;
  ilce?: string;
  sektor: string;
  /** İstenen aday sayısı (1–20; sayı kuralı: istenenden fazla döndürülmez). */
  limit?: number;
}

/** Uç nokta veya anahtar yapılandırılmamış — kod düzeltilemez, kurulum ister. */
export class PlacesConfigError extends Error {}

export async function searchPlaceCandidates(params: PlacesParams): Promise<PlaceCandidate[]> {
  let res: Response;
  try {
    res = await fetch("/api/places-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new PlacesConfigError(
      "Aday arama sunucusuna ulaşılamadı. Netlify Functions yayında değilse veya site Netlify dışında çalışıyorsa bu özellik kullanılamaz.",
    );
  }

  if (res.status === 503) {
    throw new PlacesConfigError(
      "GOOGLE_PLACES_API_KEY yapılandırılmamış. Netlify ortam değişkenlerinde anahtar tanımlamadan bu arama yapılamaz (ücretli API — çağrı açılmaz).",
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body && typeof body.message === "string" ? body.message : `Arama başarısız (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  const data = (await res.json()) as { candidates: PlaceCandidate[] };
  return (data.candidates ?? []).filter((c) => c.name);
}
