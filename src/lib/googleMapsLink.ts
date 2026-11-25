/**
 * GOOGLE MAPS BAĞLANTISINDAN KONUM AKTARMA — saf ayrıştırıcı + kısa bağlantı çözümleyici.
 *
 * İlkeler:
 *  - Yalnızca bağlantının KENDİSİNDE yazılı bilgi kullanılır (yer adı, adres,
 *    koordinat). Google Maps sayfası scrape edilmez; API anahtarı gerekmez.
 *  - Bulunamayan alan boş kalır; tahmin/uydurma yapılmaz.
 *  - Kısa bağlantılar (`maps.app.goo.gl`, `goo.gl`) CORS nedeniyle tarayıcıda
 *    çözülemez; yalnızca yönlendirmeyi çözen Netlify Function çağrılır
 *    (`/api/resolve-maps-link`), dönen uzun URL aynı ayrıştırıcıyla okunur.
 *  - Bağlantı yalnızca Google alan adlarından kabul edilir (SSRF kapalı).
 */

import { normalizeCoordinates } from "./coordinates";
import { normalizeLocality } from "./location";

export interface GoogleMapsPlace {
  /** İşletme/yer adı (bağlantıda yazıyorsa). */
  placeName?: string;
  /** Bağlantıdaki açık adres metni (varsa). */
  address?: string;
  /** Adres metninden çıkarılan resmî il adı (yoksa boş). */
  province?: string;
  /** Adres metninden çıkarılan resmî ilçe adı (yoksa boş). */
  district?: string;
  latitude?: number;
  longitude?: number;
  /** Kısa bağlantı sunucuda çözümlenerek mi elde edildi? */
  fromShortLink: boolean;
}

export type GoogleMapsFailure = "invalid" | "not-maps" | "short-link" | "empty" | "unresolved";

export type GoogleMapsParseResult =
  | { ok: true; info: GoogleMapsPlace }
  | { ok: false; reason: GoogleMapsFailure };

export type GoogleMapsImportResult =
  | { ok: true; info: GoogleMapsPlace }
  | { ok: false; reason: GoogleMapsFailure; message: string };

const MAX_LINK_LENGTH = 2048;
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);
/** google.com, google.com.tr, google.co.uk … */
const GOOGLE_HOST_RE = /(^|\.)google(\.[a-z]{2,})+$/i;
/** Koordinat taşıyabilen sorgu parametreleri (öncelik sırasıyla). */
const COORD_PARAMS = [
  "query",
  "q",
  "ll",
  "sll",
  "center",
  "destination",
  "daddr",
  "viewpoint",
  "near",
] as const;
/** Ad/etiket taşıyabilen parametreler. */
const LABEL_PARAMS = ["query", "q", "destination", "daddr"] as const;

const FAILURE_MESSAGES: Record<GoogleMapsFailure, string> = {
  invalid: "Bağlantı okunamadı. Google Haritalar → Paylaş → Bağlantıyı kopyala ile aldığınız adresi yapıştırın.",
  "not-maps":
    "Bu bir Google Maps bağlantısı gibi görünmüyor. maps.google.com veya maps.app.goo.gl bağlantısı kullanın.",
  "short-link":
    "Kısa Google Maps bağlantısı çözümlenemedi. Bağlantıyı tarayıcıda açıp adres çubuğundaki uzun bağlantıyı yapıştırın veya konumu elle girin.",
  empty:
    "Bağlantıdan konum bilgisi çıkarılamadı. İşletme sayfasını Google Haritalar'da açıp Paylaş → Bağlantıyı kopyala ile tekrar deneyin.",
  unresolved:
    "Kısa bağlantı çözümlenemedi. Bilgileri elle girebilir veya bağlantıyı tarayıcıda açıp uzun adresini yapıştırabilirsiniz.",
};

function decodeSegment(value: string): string {
  const spaced = value.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced).trim();
  } catch {
    return spaced.trim();
  }
}

/** "38.75,30.52", "loc:38.75,30.52", "38.75,30.52 (Ad)" biçimlerini okur. */
function parseCoordinatePair(value: string): { latitude: number; longitude: number } | null {
  const cleaned = value.trim().replace(/^loc:/i, "");
  const match = cleaned.match(
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*\([^)]*\))?$/,
  );
  if (!match) return null;
  return normalizeCoordinates(Number(match[1]), Number(match[2]));
}

function looksLikeCoordinates(value: string): boolean {
  return parseCoordinatePair(value) !== null;
}

/**
 * "Ada Cafe, Marulcu Mah. No:45, Merkez, Afyonkarahisar" → ad + adres.
 * Virgülden sonraki kısım varsa adres olarak korunur (olduğu gibi, uydurulmaz).
 */
function splitPlaceLabel(label: string): { placeName?: string; address?: string } {
  const text = label
    .replace(/\s*[-–]\s*Google\s*(Maps|Haritalar)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || looksLikeCoordinates(text)) return {};

  const [first, ...rest] = text.split(",");
  const name = first.trim();
  const address = rest
    .map((piece) => piece.trim())
    .filter(Boolean)
    .join(", ");
  return {
    placeName: name || undefined,
    address: address || undefined,
  };
}

/**
 * Adres metnindeki il/ilçeyi resmî listelerle eşler (bkz. normalizeLocality).
 *
 * Google Haritalar Türkiye adresleri il/ilçeyi "03000 Merkez/Afyonkarahisar"
 * (posta kodu İlçe/İl) biçiminde tek parçada, "Merkez, Afyonkarahisar" gibi
 * ayrı parçalarda ya da "Afyonkarahisar Merkez" (il + ilçe) biçiminde
 * verebilir; üç biçim de okunur. Eşleşmeyen alan tahmin edilmez, boş kalır;
 * yalnız il/ilçe alanları normalize edilir, adres metni değişmez.
 */
export function parseTurkishLocality(address: string): {
  province?: string;
  district?: string;
} {
  const parts: Array<{ text: string; piece: number }> = [];
  (address ?? "").split(",").forEach((piece, pieceIndex) => {
    for (const segment of piece.split("/")) {
      const text = segment
        .replace(/\b\d{5}\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) parts.push({ text, piece: pieceIndex });
    }
  });

  let province = "";
  let provinceIndex = -1;
  let districtFromProvince = "";
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const match = normalizeLocality(parts[index].text, "");
    if (match.province) {
      province = match.province;
      provinceIndex = index;
      districtFromProvince = match.district;
      break;
    }
  }
  if (!province) return {};

  // İlçe: il parçasından gelen önek artığı ("Afyonkarahisar Merkez"), ilden
  // hemen önceki parça ("Merkez/Afyonkarahisar") veya aynı parçada ilden
  // sonra yazılmış kısım ("Afyonkarahisar/Merkez").
  const candidates: string[] = [];
  if (districtFromProvince) candidates.push(districtFromProvince);
  if (provinceIndex > 0) candidates.push(parts[provinceIndex - 1].text);
  for (let index = provinceIndex + 1; index < parts.length; index += 1) {
    if (parts[index].piece !== parts[provinceIndex].piece) break;
    candidates.push(parts[index].text);
  }

  const district =
    candidates.map((text) => normalizeLocality(province, text).district).find(Boolean) ?? "";
  return district ? { province, district } : { province };
}

/**
 * Google Maps bağlantısını (kısa bağlantı hariç) ayrıştırır.
 * Saf fonksiyondur; ağ isteği yapmaz.
 */
export function parseGoogleMapsLink(raw: string): GoogleMapsParseResult {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, reason: "empty" };
  if (input.length > MAX_LINK_LENGTH) return { ok: false, reason: "invalid" };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid" };
  }

  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host)) return { ok: false, reason: "short-link" };
  if (!GOOGLE_HOST_RE.test(host)) return { ok: false, reason: "not-maps" };

  const path = url.pathname;
  const hasMapsPath = /\/maps(\/|$)/i.test(path);
  const hasCoordParam = COORD_PARAMS.some((key) => url.searchParams.has(key));
  const hasLabelParam = LABEL_PARAMS.some((key) => url.searchParams.has(key));
  if (!hasMapsPath && !hasCoordParam && !hasLabelParam) {
    return { ok: false, reason: "not-maps" };
  }

  // 1) En güvenilir koordinat: /data=… içindeki !3dLAT!4dLNG (yerin kendisi),
  //    2) görünüm merkezi: /@LAT,LNG,17z,
  //    3) sorgu parametreleri (q, query, ll, destination …).
  let coords: { latitude: number; longitude: number } | null = null;
  const href = url.href;
  const dataMatch = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dataMatch) coords = normalizeCoordinates(Number(dataMatch[1]), Number(dataMatch[2]));
  if (!coords) {
    const atMatch = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atMatch) coords = normalizeCoordinates(Number(atMatch[1]), Number(atMatch[2]));
  }

  let paramLabel = "";
  for (const key of COORD_PARAMS) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const pair = parseCoordinatePair(value);
    if (pair) {
      if (!coords) coords = pair;
      continue;
    }
    if (!paramLabel && (LABEL_PARAMS as readonly string[]).includes(key)) paramLabel = value;
  }

  // Yer etiketi: /maps/place/… → /maps/search/… → /maps/dir/… → sorgu parametresi.
  // Adresin il/ilçe kısmı yol içinde "/" ile bölünebildiği için parçalar
  // virgülle birleştirilir; ayrıştırıcı ikisini de okur.
  const pathLabel =
    ["place", "search", "dir"]
      .map((kind) => {
        const marker = `/maps/${kind}/`;
        const start = path.indexOf(marker);
        if (start === -1) return "";
        const rest = path.slice(start + marker.length);
        const cut = rest.search(/\/@|\/data=/);
        const raw = cut === -1 ? rest : rest.slice(0, cut);
        return raw
          .split("/")
          .map((segment) => decodeSegment(segment))
          .filter(Boolean)
          .join(", ");
      })
      .find((segment) => segment && !segment.startsWith("data=")) ?? "";

  const labelParts = splitPlaceLabel(pathLabel || paramLabel);
  const info: GoogleMapsPlace = { fromShortLink: false };
  if (labelParts.placeName) info.placeName = labelParts.placeName;
  if (labelParts.address) {
    info.address = labelParts.address;
    const locality = parseTurkishLocality(labelParts.address);
    if (locality.province) info.province = locality.province;
    if (locality.district) info.district = locality.district;
  }
  if (coords) {
    info.latitude = coords.latitude;
    info.longitude = coords.longitude;
  }

  if (!info.placeName && !info.address && !coords) {
    return { ok: false, reason: "empty" };
  }
  return { ok: true, info };
}

async function resolveShortLink(input: string): Promise<GoogleMapsImportResult> {
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(
      `/api/resolve-maps-link?url=${encodeURIComponent(url)}`,
      { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal },
    );
    const body = (await response.json().catch(() => null)) as
      | { url?: unknown; message?: unknown }
      | null;
    const resolvedUrl = typeof body?.url === "string" ? body.url : "";
    if (!response.ok || !resolvedUrl) {
      return { ok: false, reason: "unresolved", message: FAILURE_MESSAGES.unresolved };
    }
    const parsed = parseGoogleMapsLink(resolvedUrl);
    if (parsed.ok) {
      return { ok: true, info: { ...parsed.info, fromShortLink: true } };
    }
    return {
      ok: false,
      reason: parsed.reason === "empty" ? "empty" : "unresolved",
      message:
        parsed.reason === "empty"
          ? FAILURE_MESSAGES.empty
          : FAILURE_MESSAGES.unresolved,
    };
  } catch {
    return { ok: false, reason: "unresolved", message: FAILURE_MESSAGES.unresolved };
  } finally {
    clearTimeout(timer);
  }
}

/** Yapıştırılan bağlantıyı ayrıştırır; kısa bağlantıysa sunucuda çözer. */
export async function importGoogleMapsLink(raw: string): Promise<GoogleMapsImportResult> {
  const parsed = parseGoogleMapsLink(raw);
  if (parsed.ok) return { ok: true, info: parsed.info };
  if (parsed.reason !== "short-link") {
    return { ok: false, reason: parsed.reason, message: FAILURE_MESSAGES[parsed.reason] };
  }
  return resolveShortLink((raw ?? "").trim());
}
