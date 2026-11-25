/**
 * GOOGLE MAPS KISA BAĞLANTI ÇÖZÜMLEYİCİ — Netlify Functions (v2).
 *
 * Amaç: `maps.app.goo.gl/...` ve `goo.gl/maps/...` bağlantılarının CORS
 * nedeniyle tarayıcıda okunamayan yönlendirmesini sunucuda çözmek.
 *
 * SINIRLAR:
 *  - Yalnızca Google alan adlarına giden yönlendirmeler izlenir (SSRF kapalı).
 *  - Sayfa içeriği okunmaz/kazınmaz; yalnızca Location başlığı takip edilir.
 *  - API anahtarı gerekmez, ücretsizdir.
 *  - En fazla 5 yönlendirme; her istek 6 sn zaman aşımı.
 *
 * Yanıt: { url: "<çözümlenmiş uzun URL>" } — ayrıştırma istemcide yapılır.
 */

export const config = { path: "/api/resolve-maps-link" };

const MAX_HOPS = 5;
const MAX_URL_LENGTH = 2048;
const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 300;

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);
const GOOGLE_HOST_RE = /(^|\.)google(\.[a-z]{2,})+$/i;

const cache = new Map<string, { at: number; url: string }>();

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

function allowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return SHORT_HOSTS.has(host) || GOOGLE_HOST_RE.test(host);
}

/** Yönlendirmeleri elle takip eder; son URL'i döner. */
async function followRedirects(start: string): Promise<string> {
  let current = start;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          // Kimlik açıkça belirtilir; sayfa içeriği kullanılmaz.
          "User-Agent": "RehberiX/1.0 (+https://firma5.netlify.app) maps-link-resolver",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "tr",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status < 300 || response.status >= 400) return current;

    const location = response.headers.get("location");
    if (!location) return current;

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return current;
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") return current;
    if (!allowedHost(next.hostname)) return current;
    if (next.href.length > MAX_URL_LENGTH) return current;
    current = next.href;
  }

  return current;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json({ message: "Yalnızca GET." }, 405);

  let raw = "";
  try {
    raw = (new URL(req.url).searchParams.get("url") ?? "").trim();
  } catch {
    return json({ message: "Geçersiz istek." }, 400);
  }
  if (!raw || raw.length > MAX_URL_LENGTH) {
    return json({ message: "Bağlantı eksik veya çok uzun." }, 400);
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return json({ message: "Bağlantı okunamadı." }, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return json({ message: "Geçersiz protokol." }, 400);
  }
  if (!allowedHost(url.hostname)) {
    return json({ message: "Yalnızca Google Maps bağlantıları çözümlenir." }, 400);
  }

  const cached = cache.get(url.href);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json({ url: cached.url }, 200);
  }

  try {
    const resolved = await followRedirects(url.href);
    if (resolved === url.href) {
      return json(
        { message: "Bağlantı yönlendirmedi; konum bilgisi okunamadı." },
        502,
      );
    }
    const resolvedUrl = new URL(resolved);
    if (!allowedHost(resolvedUrl.hostname)) {
      return json({ message: "Beklenmeyen yönlendirme hedefi." }, 502);
    }

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(url.href, { at: Date.now(), url: resolved });
    return json({ url: resolved }, 200);
  } catch {
    return json({ message: "Kısa bağlantı çözümlenemedi." }, 502);
  }
};
