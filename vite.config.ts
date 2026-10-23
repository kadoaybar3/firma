/// <reference types="vitest/config" />
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { seedDB } from "./src/data/seed";

/**
 * Build-time sitemap üreticisi.
 * Kurallar:
 *  - Üretim domaini tahmin edilmez: `SITE_URL` ortam değişkeni tanımlı değilse
 *    sitemap üretilmez, yalnızca uyarı verilir. robots.txt'e "Sitemap:" satırı da
 *    domain belirlenene kadar eklenmez.
 *  - Veri kaynağı build sırasında seedDB() (demo tohum). Supabase'e geçildiğinde
 *    veri kaynağı gerçek verilere bağlanmalı — aksi halde sitemap örnek veriyi taşır.
 *  - Yalnızca build'de çalışır (`apply: "build"`).
 */
function sitemapPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "firma-rehberi:sitemap",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const siteUrl = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
      if (!siteUrl) {
        console.warn('[sitemap] SITE_URL tanımlı değil — sitemap üretilmedi. Örnek: SITE_URL="https://example.com" npm run build');
        return;
      }

      const db = seedDB();
      const paths: Array<{ loc: string; lastmod?: string }> = [
        { loc: `${siteUrl}/` },
        { loc: `${siteUrl}/firmalar` },
        { loc: `${siteUrl}/iletisim` },
        { loc: `${siteUrl}/hakkimizda` },
        { loc: `${siteUrl}/kvkk` },
        { loc: `${siteUrl}/kullanim-kosullari` },
      ];
      for (const category of db.categories) paths.push({ loc: `${siteUrl}/kategori/${category.slug}` });
      for (const city of db.cities) {
        paths.push({ loc: `${siteUrl}/sehir/${city.slug}` });
        for (const district of city.districts) {
          paths.push({ loc: `${siteUrl}/sehir/${city.slug}/${encodeURIComponent(district.toLowerCase())}` });
        }
      }
      for (const company of db.companies) {
        if (company.published) {
          const lastmod = company.updatedAt ? company.updatedAt.slice(0, 10) : undefined;
          paths.push({ loc: `${siteUrl}/firma/${company.slug}`, lastmod });
        }
      }

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...paths.map(({ loc, lastmod }) =>
          [
            "  <url>",
            `    <loc>${loc}</loc>`,
            lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
            "  </url>",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        "</urlset>",
      ].join("\n");

      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "sitemap.xml"), xml + "\n", "utf8");
      console.log(`[sitemap] ${paths.length} URL ile dist/sitemap.xml üretildi (${siteUrl})`);
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
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
