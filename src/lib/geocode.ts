/**
 * ADRES → KOORDİNAT İSTEMCİSİ
 *
 * Akış: tarayıcı → `/api/geocode` (Netlify Function) → Nominatim.
 * Nominatim'e doğrudan tarayıcıdan istek ATILMAZ; böylece User-Agent,
 * cache ve saniyede en fazla 1 istek kuralı sunucuda uygulanır.
 *
 * Kurallar:
 *  - Autocomplete yok: yalnızca adres tamamlandığında veya kullanıcı
 *    "Adresi bul" dediğinde çağrılır.
 *  - Aynı adres için ikinci istek gönderilmez (bellek içi cache + in-flight
 *    tekilleştirme).
 *  - İstemci tarafında da istekler 1,1 sn aralıkla sıraya alınır; sunucu
 *    ayrıca kendi kuyruğunu uygular.
 */

import { normalizeSearch } from "./slug";
import { parseAddress } from "./address";

export type GeocodeOutcome =
  | { status: "found"; latitude: number; longitude: number; displayName?: string }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

export interface GeocodeAddressParts {
  address?: string;
  district?: string;
  province?: string;
}

const CACHE_LIMIT = 200;
const MIN_INTERVAL_MS = 1100;

const cache = new Map<string, GeocodeOutcome>();
const pending = new Map<string, Promise<GeocodeOutcome>>();

let queueTail: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

export function normalizeGeocodeQuery(query: string): string {
  return normalizeSearch(query).replace(/\s+/g, " ").trim();
}

/**
 * Nominatim "Mah." ve "Bul." gibi kısaltmaları güvenilir çözmez. Mahalle
 * sonekini atar (ad yeterli), cadde/sokak/bulvar soneklerini açık yazar.
 * Kayıtlı adres metni değişmez; yalnız arama metni sadeleşir.
 */
function expandAddressAbbreviations(text: string): string {
  return text
    .replace(/\s*\b(?:Mah\.?|Mahallesi)(?=\s|,|$)/gi, "")
    .replace(/\bCad\.?(?=\s|,|$)/gi, "Caddesi")
    .replace(/\bCd\.?(?=\s|,|$)/gi, "Caddesi")
    .replace(/\bSok\.?(?=\s|,|$)/gi, "Sokak")
    .replace(/\bSk\.?(?=\s|,|$)/gi, "Sokak")
    .replace(/\bBul\.?(?=\s|,|$)/gi, "Bulvarı")
    .replace(/\bBlv\.?(?=\s|,|$)/gi, "Bulvarı");
}

/**
 * Adres, ilçe ve il tekrarlanmadan tek arama metnine dönüştürülür.
 * Adres zaten ilçe/ili içeriyorsa (AddressFields böyle üretir) tekrar eklenmez.
 */
export function buildGeocodeQuery(parts: GeocodeAddressParts): string {
  const pieces = [parts.address, parts.district, parts.province]
    .map((value) => expandAddressAbbreviations((value ?? "").trim()))
    .filter(Boolean);
  const out: string[] = [];
  for (const piece of pieces) {
    const key = normalizeGeocodeQuery(piece);
    if (!key) continue;
    if (out.some((prev) => normalizeGeocodeQuery(prev).includes(key))) continue;
    out.push(piece);
  }
  return out.join(", ");
}

/**
 * Kademeli arama: Nominatim tam adresi (özellikle mahalle + cadde + kapı no)
 * çözemeyebilir. Sırayla tam adres, cadde, mahalle denenir; ilk bulunan durur.
 */
export function buildGeocodeQueries(parts: GeocodeAddressParts): string[] {
  const parsed = parseAddress(parts.address ?? "", parts.district ?? "", parts.province ?? "");
  const candidates = [
    buildGeocodeQuery(parts),
    parsed.street
      ? buildGeocodeQuery({ address: parsed.street, district: parts.district, province: parts.province })
      : "",
    parsed.neighborhood
      ? buildGeocodeQuery({ address: parsed.neighborhood, district: parts.district, province: parts.province })
      : "",
  ];
  const seen = new Set<string>();
  return candidates.filter((query) => {
    const key = normalizeGeocodeQuery(query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Yalnızca sokak/mahalle düzeyinde anlamlı bir adres varsa otomatik arama
 * yapılır. Yalnızca "ilçe, il" girilmişse Nominatim ilçe merkezini döndürür;
 * bu yanıltıcı olduğu için otomatik arama başlatılmaz.
 */
export function isGeocodeReady(parts: GeocodeAddressParts): boolean {
  const address = (parts.address ?? "").trim();
  const province = (parts.province ?? "").trim();
  if (!address || !province || address.length < 10) return false;
  const pieces = address.split(",").map((piece) => piece.trim()).filter(Boolean);
  return pieces.length >= 3 || /\b(mah|cad|sok|sk|no|bul|blv)\b/i.test(address);
}

function remember(key: string, outcome: GeocodeOutcome): void {
  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, outcome);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** İstemci tarafı küresel kuyruk: art arda iki istek arasında en az 1,1 sn. */
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

function isOutcome(value: unknown): value is GeocodeOutcome {
  return Boolean(value) && typeof value === "object" && "status" in (value as object);
}

export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
  const trimmed = query.trim();
  const key = normalizeGeocodeQuery(trimmed);
  if (!key) return { status: "error", message: "Adres boş olamaz." };

  const cached = cache.get(key);
  if (cached) return cached;

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const request = enqueue(async (): Promise<GeocodeOutcome> => {
    let response: Response;
    try {
      response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
    } catch {
      return {
        status: "error",
        message: "Adres servisine ulaşılamadı. İnternet bağlantınızı kontrol edin.",
      };
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message =
        body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
          ? (body as { message: string }).message
          : "Adres arama servisi şu an yanıt vermiyor.";
      return { status: "error", message };
    }

    if (isOutcome(body)) {
      const outcome = body;
      if (outcome.status === "found") return outcome;
      if (outcome.status === "not_found") return outcome;
      return outcome;
    }

    if (
      body &&
      typeof body === "object" &&
      (body as { found?: unknown }).found === true &&
      typeof (body as { latitude?: unknown }).latitude === "number" &&
      typeof (body as { longitude?: unknown }).longitude === "number"
    ) {
      return {
        status: "found",
        latitude: (body as { latitude: number }).latitude,
        longitude: (body as { longitude: number }).longitude,
        displayName:
          typeof (body as { displayName?: unknown }).displayName === "string"
            ? (body as { displayName: string }).displayName
            : undefined,
      };
    }

    if (body && typeof body === "object" && (body as { found?: unknown }).found === false) {
      return { status: "not_found", message: "Bu adres için konum bulunamadı." };
    }

    return { status: "error", message: "Adres arama servisi beklenmeyen bir yanıt verdi." };
  });

  pending.set(key, request);
  try {
    const outcome = await request;
    // Geçici hatalar cache'lenmez; bulundu/bulunamadı sonuçları cache'lenir.
    if (outcome.status !== "error") remember(key, outcome);
    return outcome;
  } finally {
    pending.delete(key);
  }
}

/** Testler ve oturum sıfırlama için. */
export function clearGeocodeCache(): void {
  cache.clear();
  pending.clear();
}
