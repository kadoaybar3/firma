/**
 * GOOGLE PLACES PROXY — Netlify Functions (v2).
 *
 * Amaç: Places API (New) Text Search çağrısını sunucuda yapmak; API anahtarını
 * asla istemciye açmamak. İstemci `/api/places-search`'e gövdeyle POST atar.
 *
 * GEREKLİ YAPILANDIRMA (eksikse HTTP 503 döner, istemci kullanıcıya bildirir):
 *   Netlify → Site configuration → Environment variables
 *     GOOGLE_PLACES_API_KEY → Google Cloud Console'da Places API (New) etkin
 *     proje için oluşturulmuş API anahtarı.
 *
 * MALİYET NOTU: Places API (New) Text Search, alanı seçen SKU'ya göre
 * ücretlendirir. Bu uç nokta iki SKU katmanı kullanır:
 *   - Essentials (ucuz): id, displayName, formattedAddress, location (lat/lng),
 *     viewport → koordinatlar ekstra çağrı OLMADAN arama sonucunda döner.
 *   - Pro (Essentials'ın ~5 katı): internationalPhoneNumber, websiteUri.
 *     Telefon/web istiyorsanız Pro maliyeti geçerlidir; güncel fiyat için
 *     Google Maps Platform fiyat sayfası esastır.
 * Anahtar tanımlanmadan bu uç nokta HİÇ çağrı yapmaz — ücretsizdir.
 */

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.websiteUri";
const MAX_PAGE_SIZE = 20; // Places API (New) Text Search üst sınırı
const DEFAULT_PAGE_SIZE = 12;

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

interface SearchBody {
  il?: unknown;
  ilce?: unknown;
  sektor?: unknown;
  limit?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ message: "Yalnızca POST." }, 405);

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return json(
      {
        error: { code: "PLACES_NOT_CONFIGURED" },
        message: "GOOGLE_PLACES_API_KEY yapılandırılmamış — arama kapatıldı.",
      },
      503,
    );
  }

  const body = (await req.json().catch(() => ({}))) as SearchBody;
  const il = str(body.il);
  const ilce = str(body.ilce);
  const sektor = str(body.sektor);
  const requested = num(body.limit);
  const pageSize = Number.isNaN(requested) ? DEFAULT_PAGE_SIZE : Math.min(Math.max(Math.round(requested), 1), MAX_PAGE_SIZE);
  if (!il || !sektor) return json({ message: "“il” ve “kategori/sectör” zorunludur." }, 400);

  // Arama metni: kategori + ilçe + il (TR odaklı; regionCode Türkiye)
  const textQuery = [sektor, ilce, il].filter(Boolean).join(" ");

  try {
    const res = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        regionCode: "TR",
        languageCode: "tr",
        pageSize,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return json(
        { message: err?.error?.message ?? `Google Places isteği başarısız (HTTP ${res.status}).` },
        res.status === 429 ? 429 : 502,
      );
    }

    const data = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        internationalPhoneNumber?: string;
        websiteUri?: string;
      }>;
    };

    const candidates = (data.places ?? [])
      .filter((p) => p.id && p.displayName?.text)
      .map((p) => {
        const lat = typeof p.location?.latitude === "number" ? p.location.latitude : undefined;
        const lng = typeof p.location?.longitude === "number" ? p.location.longitude : undefined;
        // lat/lng mutlaka birlikte taşınır — karışmaya kapalıdır
        const coords = lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : {};
        return {
          placeId: p.id!,
          name: p.displayName!.text!,
          address: p.formattedAddress || undefined,
          ...coords,
          phone: p.internationalPhoneNumber || undefined,
          website: p.websiteUri || undefined,
        };
      });

    return json({ candidates, query: textQuery }, 200);
  } catch {
    return json({ message: "Google Places servisine ulaşılamadı." }, 502);
  }
};

export const config = { path: "/api/places-search" };
