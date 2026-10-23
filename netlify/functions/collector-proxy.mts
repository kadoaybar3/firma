/**
 * KOLEKSİYON PROXYSİ — Netlify Functions (v2)  /api/collector/*
 *
 * Amaç: Python koleksiyon servisini (services/collector) tarayıcı arkasına
 * almak. Toplama mantığı BURADA YOK — proxy yalnızca vekildir; Netlify
 * Functions ile Python servisi ayrı katmanlardır (karıştırma yok):
 *     tarayıcı → (1) bu vekil → (2) Python koleksiyon servisi
 *
 * YETKİLENDİRME: servis anahtarları İSTEMCİ KODUNA GİRMEZ. Vekil her isteğe
 * sunucuda `x-collector-key: ${COLLECTOR_API_KEY}` başlığını ekler.
 *
 * GEREKLİ YAPILANDIRMA (eksikse HTTP 503 → istemci kullanıcıyı bilgilendirir):
 *   Netlify → Site configuration → Environment variables
 *     COLLECTOR_BASE_URL  → Python servisinin adresi (örn. http://127.0.0.1:8787
 *     yerel; üretimde ayrı sunucu: https://kolektor.ornek.com)
 *     COLLECTOR_API_KEY   → Python servisinin beklediği anahtar
 *
 * YEREL GELİŞTİRME: bu proxy atlanır — Vite dev sunucusu /api/collector'u
 * doğrudan Python'a yollar (vite.config.ts server.proxy). Geliştirme anahtarı
 * yoksa Python yalnız 127.0.0.1 isteklerini kabul eder.
 */

const TIMEOUT_MS = 20_000;

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export default async (req: Request): Promise<Response> => {
  const base = (process.env.COLLECTOR_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) {
    return json(
      {
        message:
          "Koleksiyon servisi yapılandırılmamış. Netlify ortam değişkeni COLLECTOR_BASE_URL ve COLLECTOR_API_KEY tanımlamadan otomatik bulma kullanılamaz (yerel geliştirme: python3 services/collector/main.py).",
      },
      503,
    );
  }

  if (req.method !== "GET" && req.method !== "POST") return json({ message: "Yalnızca GET/POST." }, 405);

  const incoming = new URL(req.url);
  // /api/collector/jobs/{id} → {BASE}/jobs/{id} (önefiksiz birebir)
  const rest = incoming.pathname.replace(/^\/api\/collector/, "") || "/";
  const target = `${base}${rest}${incoming.search}`;

  const headers: Record<string, string> = {};
  const apiKey = process.env.COLLECTOR_API_KEY;
  if (apiKey) headers["x-collector-key"] = apiKey;
  if (req.method === "POST") {
    headers["Content-Type"] = "application/json";
    try {
      // Aynı işi ik kez başlatma (409) gibi gövde hatalarını birebir taşır
      return await forward(target, req.method, headers, await req.text());
    } catch {
      return json({ message: "İstek gövdesi okunamadı." }, 400);
    }
  }
  return forward(target, req.method, headers);
};

async function forward(target: string, method: string, headers: Record<string, string>, body?: string): Promise<Response> {
  try {
    const res = await fetch(target, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return json(
      {
        message: `Koleksiyon servisine ulaşılamadı (${err instanceof Error ? err.message : "bilinmeyen hata"}). Servis çalışıyor mu?`,
      },
      503,
    );
  }
}

export const config = { path: "/api/collector/*" };
