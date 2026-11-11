/**
 * ADRES → KOORDİNAT PROXY'Sİ (Nominatim)
 *
 * Neden proxy?
 *  - Nominatim kullanım politikası geçerli bir User-Agent/Referer, cache ve
 *    saniyede en fazla 1 istek ister. Tarayıcıdan doğrudan çağrı bu
 *    gereksinimleri gizleyemez.
 *  - API anahtarı yoktur; ücretli servis kullanılmaz.
 *
 * GEREKLİ ORTAM DEĞİŞKENLERİ (yalnızca sunucu):
 *   SITE_URL         → üretim adresi (User-Agent/Referer kimliği)
 *   GEOCODE_CONTACT  → (opsiyonel) iletişim e-postası; SITE_URL yoksa kimlik
 *                      olarak kullanılır. Uydurma değer varsayılan DEĞİLDİR.
 *
 * KURALLAR:
 *  - Autocomplete yok; yalnızca tam adres sorgusu.
 *  - Aynı sorgu için in-flight tekilleştirme + TTL'li bellek cache'i.
 *  - Sunucu içi kuyruk: art arda iki Nominatim isteği arasında ≥ 1,1 sn.
 *  - Nominatim hatası uygulamayı düşürmez; anlaşılır JSON döner.
 */

export const config = { path: "/api/geocode" };

const UPSTREAM = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const MAX_QUERY_LENGTH = 200;
const REQUEST_TIMEOUT_MS = 8000;

interface GeocodeBody {
  found: boolean;
  latitude?: number;
  longitude?: number;
  displayName?: string;
  message?: string;
}

interface CacheEntry {
  at: number;
  body: GeocodeBody;
  status: number;
}

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<{ body: GeocodeBody; status: number }>>();

let queueTail: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

const json = (body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });

function cacheHeaders(status: number): Record<string, string> {
  if (status !== 200) return { "Cache-Control": "no-store" };
  return {
    "Cache-Control": "public, max-age=3600",
    "Netlify-CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  };
}

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

function remember(key: string, body: GeocodeBody, status: number): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), body, status });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await pause(wait);
    lastRequestAt = Date.now();
    return task();
  });
  queueTail = run.catch(() => undefined);
  return run;
}

function identity(): { userAgent: string; referer?: string; email?: string } | null {
  const contact = (process.env.GEOCODE_CONTACT ?? "").trim();
  const site = (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
  const identifier = contact || site;
  // Kimlik yoksa Nominatim'e istek atılmaz (politika ihlali olur).
  if (!identifier) return null;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  return {
    userAgent: `FirmaRehberi/1.0 (${identifier})`,
    referer: site || undefined,
    email: isEmail ? contact : undefined,
  };
}

function timeoutSignal(): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function callNominatim(query: string, ident: NonNullable<ReturnType<typeof identity>>): Promise<{
  body: GeocodeBody;
  status: number;
}> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
    dedupe: "1",
    countrycodes: "tr",
    "accept-language": "tr",
  });
  if (ident.email) params.set("email", ident.email);

  const headers: Record<string, string> = {
    "User-Agent": ident.userAgent,
    Accept: "application/json",
    "Accept-Language": "tr",
  };
  if (ident.referer) headers.Referer = ident.referer;

  const { signal, cancel } = timeoutSignal();
  try {
    const response = await fetch(`${UPSTREAM}?${params.toString()}`, { headers, signal });

    if (response.status === 429 || response.status === 403) {
      return {
        status: 503,
        body: {
          found: false,
          message: "Adres arama servisi şu an yoğun. Lütfen biraz sonra tekrar deneyin.",
        },
      };
    }
    if (!response.ok) {
      return {
        status: 502,
        body: {
          found: false,
          message: "Adres arama servisi yanıt vermedi. Konumu haritadan seçebilirsiniz.",
        },
      };
    }

    const data = (await response.json()) as unknown;
    const first = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    if (!first) {
      return {
        status: 200,
        body: { found: false, message: "Bu adres için konum bulunamadı." },
      };
    }

    const latitude = Number(first["lat"]);
    const longitude = Number(first["lon"]);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return {
        status: 200,
        body: { found: false, message: "Bu adres için geçerli bir konum bulunamadı." },
      };
    }

    return {
      status: 200,
      body: {
        found: true,
        latitude,
        longitude,
        displayName: typeof first["display_name"] === "string" ? first["display_name"] : undefined,
      },
    };
  } catch {
    return {
      status: 502,
      body: {
        found: false,
        message: "Adres servisine ulaşılamadı. Konumu haritadan seçebilirsiniz.",
      },
    };
  } finally {
    cancel();
  }
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json({ message: "Yalnızca GET." }, 405);

  const ident = identity();
  if (!ident) {
    return json(
      {
        message:
          "Adres arama yapılandırılmadı: SITE_URL veya GEOCODE_CONTACT ortam değişkeni tanımlanmalı.",
      },
      503,
    );
  }

  let query = "";
  try {
    query = (new URL(req.url).searchParams.get("q") ?? "").trim();
  } catch {
    return json({ message: "Geçersiz istek." }, 400);
  }

  if (query.length < 5) {
    return json({ message: "Adres en az 5 karakter olmalıdır." }, 400);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return json({ message: "Adres çok uzun." }, 400);
  }
  if (/[\u0000-\u001f\u007f]/.test(query)) {
    return json({ message: "Adres geçersiz karakter içeriyor." }, 400);
  }

  const key = normalizeKey(query);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.body, cached.status, cacheHeaders(cached.status));
  }

  const inFlight = pending.get(key);
  if (inFlight) {
    const result = await inFlight;
    return json(result.body, result.status, cacheHeaders(result.status));
  }

  const request = enqueue(() => callNominatim(query, ident));
  pending.set(key, request);
  try {
    const result = await request;
    if (result.status === 200) remember(key, result.body, result.status);
    return json(result.body, result.status, cacheHeaders(result.status));
  } finally {
    pending.delete(key);
  }
};
