/// <reference types="vitest/config" />
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { seoPath, serializeJsonLd } from "./src/lib/seo";
import { fetchSeoData, buildSitemapPages, renderSitemapXml } from "./src/lib/seoFetch";
import type { PageSeo } from "./src/lib/seoBuild";

/** HTML metin/özellik kaçışı — JSON-LD serializeJsonLd ile ayrıdır (çift kaçış olmasın). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Şablonun <head> bölümüne sayfa SEO etiketlerini enjekte eder; body'ye dokunmaz
 * (head-only prerender — #root boş kalır, React mount'u aynen sürer).
 *
 * useSEO ile birebir aynı etiket seti üretilir ki React mount sırasında imzalı
 * düğümleri silip aynı değerleri yeniden yazsın (çift etiket oluşmasın):
 *  - `<title>` ve `meta name="description"` YERİNDE güncellenir ve `data-seo`
 *    TAŞIMAZ: useSEO bunları silmez (document.title / setAttribute ile günceller).
 *    data-seo taşısalar mount'ta silinir, description bir daha geri gelmezdi.
 *  - Canonical, OG, Twitter, JSON-LD `data-seo="1"` taşır (useSEO de böyle üretir).
 *  - noindex sayfada canonical/og:url basılmaz (useSEO kuralı ile aynı).
 *  - Zamana bağlı açık/kapalı cümlesi seoBuild tarafından zaten üretilmez.
 */
function injectSeoHead(template: string, seo: PageSeo, siteUrl: string): string {
  let html = template;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);

  const description = seo.description;
  if (description) {
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    );
  }

  // seoPath idempotent: seoBuild zaten normalize etti; buradaki tek nokta,
  // gelecekteki yeni üreticilerin de standarda uymasını garantiler (Faz 4E-2).
  const canonical =
    seo.canonicalPath && !seo.noindex ? `${siteUrl}${seoPath(seo.canonicalPath)}` : null;
  const tags: string[] = [];
  if (canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" data-seo="1" />`);
  }
  tags.push(`<meta property="og:title" content="${escapeHtml(seo.title)}" data-seo="1" />`);
  if (description) {
    tags.push(`<meta property="og:description" content="${escapeHtml(description)}" data-seo="1" />`);
  }
  tags.push(`<meta property="og:type" content="website" data-seo="1" />`);
  if (canonical) {
    tags.push(`<meta property="og:url" content="${escapeHtml(canonical)}" data-seo="1" />`);
  }
  tags.push(`<meta property="og:site_name" content="Firma Rehberi" data-seo="1" />`);
  tags.push(`<meta property="og:locale" content="tr_TR" data-seo="1" />`);
  tags.push(`<meta name="twitter:card" content="summary" data-seo="1" />`);
  tags.push(`<meta name="twitter:title" content="${escapeHtml(seo.title)}" data-seo="1" />`);
  if (description) {
    tags.push(`<meta name="twitter:description" content="${escapeHtml(description)}" data-seo="1" />`);
  }
  if (seo.noindex) {
    tags.push(`<meta name="robots" content="noindex" data-seo="1" />`);
  }
  for (const node of seo.jsonLd) {
    tags.push(`<script type="application/ld+json" data-seo="1">${serializeJsonLd(node)}</script>`);
  }

  return html.replace("</head>", `${tags.join("\n    ")}\n  </head>`);
}

/**
 * Üretilen her HTML'i yazar ÖNCESİNDE doğrular — yanlış içerik üretirse build
 * durur (çift title/description/canonical/JSON-LD, bozulmuş #root, imzasız etiket).
 */
function assertSeoHtml(html: string, route: string, seo: PageSeo): void {
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  const fail = (msg: string): never => {
    throw new Error(`[prerender] ${route}: ${msg}`);
  };

  if (count(/<title/g) !== 1) fail("tek <title> bekleniyordu");
  if (count(/name="description"/g) !== 1) fail("tek meta description bekleniyordu");
  const wantCanonical = seo.canonicalPath && !seo.noindex ? 1 : 0;
  if (count(/rel="canonical"/g) !== wantCanonical) fail("canonical sayısı tutmuyor");
  // Faz 4E-2 invariant: kök hariç canonical URL '/' ile biter — bir üretici
  // seoPath'i atlarsa build burada durur, standartsız URL yayına girmez.
  if (wantCanonical === 1) {
    const href = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
    if (!href || !href.endsWith("/")) fail("canonical kök hariç '/' ile bitmeli (Faz 4E-2)");
  }
  if (count(/application\/ld\+json/g) !== seo.jsonLd.length) fail("JSON-LD sayısı tutmuyor");
  if (!html.includes('<div id="root"></div>')) fail("#root boş kalmalı");

  // Yönetilen tüm etiketler (canonical/OG/Twitter/JSON-LD) data-seo imzalı olmalı.
  const managed =
    html
      .match(/<(?:meta|link|script)[^>]+>/g)
      ?.filter((t) => /rel="canonical"|property="og:|name="twitter:|application\/ld\+json/.test(t)) ?? [];
  if (managed.length === 0 || managed.some((t) => !t.includes('data-seo="1"'))) {
    fail("yönetilen etikette data-seo imzası yok");
  }
}

/**
 * Build-time sitemap + head-only prerender üreticisi.
 * Kurallar:
 *  - Üretim domaini tahmin edilmez: `SITE_URL` önce shell/Netlify `process.env`'ten,
 *    yoksa `.env` dosyasından okunur (Vite `loadEnv`); ikisi de yoksa sitemap
 *    üretilmez, yalnızca uyarı verilir. robots.txt'e "Sitemap:" satırı da
 *    domain belirlenene kadar eklenmez.
 *  - Veri kaynağı build sırasında Supabase anon SELECT (Faz 4E-1); yalnız
 *    `published=true` firmalar okunur. Seed'e fallback YOK — erişim hatası
 *    build'i durdurur (bkz. src/lib/seoFetch.ts).
 *  - Prerender yalnızca sitemap'teki URL'lere dosya üretir (sitemap dışı URL'e
 *    hayır); mutlak URL'ler siteUrl açık parametresinden gelir (location shim'i
 *    kullanılmaz — seoBuild siteUrl'i zaten açık alır).
 *  - Yalnızca build'de çalışır (`apply: "build"`).
 */
function sitemapPlugin(): Plugin {
  let outDir = "dist";
  let envDir = ".";
  let mode = "production";
  return {
    name: "firma-rehberi:sitemap",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
      envDir = config.envDir;
      mode = config.mode;
    },
    async closeBundle() {
      // Öncelik: shell/Netlify process.env; yoksa .env dosyasındaki değer.
      const fileEnv = loadEnv(mode, envDir, "SITE_");
      const siteUrl = (process.env.SITE_URL ?? fileEnv.SITE_URL ?? "").trim().replace(/\/$/, "");
      if (!siteUrl) {
        console.warn('[sitemap] SITE_URL tanımlı değil — sitemap üretilmedi. Örnek: SITE_URL="https://example.com" npm run build');
        return;
      }

      // Supabase erişimi (Faz 4E-1): anon anahtar yalnız SELECT için kullanılır.
      // Aynı öncelik kuralı (shell > .env). Anahtar yoksa seed'e DÜŞÜLMEZ —
      // build bilerek durur (yanlış/eksik içerik sessizce yayınlanmasın).
      const supaEnv = loadEnv(mode, envDir, "VITE_SUPABASE_");
      const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? supaEnv.VITE_SUPABASE_URL ?? "")
        .trim()
        .replace(/\/$/, "");
      const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? supaEnv.VITE_SUPABASE_ANON_KEY ?? "").trim();
      if (!supabaseUrl || !anonKey) {
        throw new Error(
          "[seo] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY tanımlı değil — seed fallback yok (Faz 4E-1), build durduruldu.",
        );
      }

      // Tek SELECT katmanı: published firmalar + kategoriler + şehirler + ilçeler.
      const data = await fetchSeoData({ baseUrl: supabaseUrl, anonKey });

      // TEK KAYNAK: her sitemap URL'i bir { route, seo } kaydıdır. Sitemap XML'i
      // ve prerender dosyaları aynı listeden üretilir — böylece sitemap dışı bir
      // dosya üretilemez, sitemap'teki URL'e dosya eksik kalamaz.
      // lastmod bilinçli olarak yazılmıyor: updatedAt içerik değişikliğini
      // yansıtmayabilir (yanıltıcı olurdu).
      const pages = buildSitemapPages(siteUrl, data);
      const xml = renderSitemapXml(siteUrl, pages);

      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "sitemap.xml"), xml, "utf8");
      console.log(`[sitemap] ${pages.length} URL ile dist/sitemap.xml üretildi (${siteUrl})`);

      // Head-only prerender: şablonun <head>'ine SEO etiketleri enjekte edilir;
      // body/#root'a dokunulmaz. Kök "/" için hedef ana dist/index.html'in
      // kendisidir (başka bir dosya sitemap dışı URL olurdu) — şablon bir kez,
      // döngü baştan okunur.
      const template = readFileSync(join(outDir, "index.html"), "utf8");
      let rendered = 0;
      for (const { route, seo } of pages) {
        const html = injectSeoHead(template, seo, siteUrl);
        assertSeoHtml(html, route, seo); // yanlış içerik → build durur
        const file =
          route === "/"
            ? join(outDir, "index.html")
            : join(outDir, route.slice(1), "index.html");
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, html, "utf8");
        rendered++;
      }
      console.log(`[prerender] ${rendered} sayfa head-only HTML yazıldı (#root boş korundu)`);
    },
  };
}

export default defineConfig({
  plugins: [react(), sitemapPlugin()],
  server: {
    proxy: {
      // Yerel geliştirme: Python koleksiyon servisi (services/collector/main.py)
      // doğrudan hedeflenir — proxy anahtar eklemez; anahtarsız serviste yalnız
      // 127.0.0.1 istekleri kabul edilir (servisin varsayılan geliştirme kuralı).
      "/api/collector": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api\/collector/, ""),
        // Koleksiyon servisi KAPALIYKEN karanlık "HTTP 502" yerine anlaşılır
        // yanıt: 503 + Türkçe mesaj — tarayıcıyı bilgilendirir (CollectorConfigError
        // bu JSON.message'ı kullanıcıya gösterir; bkz. src/lib/collector.ts).
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            const r = res as import("node:http").ServerResponse | undefined;
            if (r && typeof r.writeHead === "function" && !r.headersSent) {
              r.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
              r.end(
                JSON.stringify({
                  message:
                    "Koleksiyon servisine ulaşılamadı (127.0.0.1:8787 kapalı). Yerel geliştirme: 'python3 services/collector/main.py' komutunu çalıştırın.",
                }),
              );
            }
          });
        },
      },
      // Yerel geliştirme: Google Maps scraper servisi (services/google-scraper/server.py).
      "/api/google-scraper": {
        target: "http://127.0.0.1:8788",
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/api\/google-scraper/, ""),
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            const r = res as import("node:http").ServerResponse | undefined;
            if (r && typeof r.writeHead === "function" && !r.headersSent) {
              r.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
              r.end(
                JSON.stringify({
                  message:
                    "Scraper servisine ulaşılamadı (127.0.0.1:8788 kapalı). Yerel geliştirme: 'services/google-scraper/.venv/bin/python services/google-scraper/server.py' komutunu çalıştırın.",
                }),
              );
            }
          });
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
