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
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
