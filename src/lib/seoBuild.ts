/*
 * ORTAK SAF SEO VERİ ÜRETİCİ (Faz 4B-2)
 *
 * Build-time prerender ile React sayfalarının aynı SEO verisini üretmesi için
 * ortak katman. Kurallar:
 *  - location / window / document / React bağımlılığı YOKtur; mutlak URL için
 *    site adresi her zaman açık parametre olarak alınır.
 *  - Zamana bağlı bilgi (firma "şu an açık/kapalı") description'a yazılmaz:
 *    build anında bayatlar; canlı sayfa mount'ta doğru değeri yazar.
 *  - Çağırıcı veriyi sağlar (prerender'da seedDB); seed verisi gerçek
 *    Supabase verisiyle aynı olmak ZORUNDA DEĞİLDİR.
 *
 * Bağlantılar: React sayfaları (Faz 4B-2) ve vite.config.ts closeBundle
 * head-only prerender'i (Faz 4B-3).
 */

import type { Company } from "./types";
import { slugify } from "./slug";
import {
  buildBreadcrumbJsonLd,
  buildListBreadcrumbJsonLd,
  buildLocalBusinessJsonLd,
  seoPath,
} from "./seo";
import type { ListBreadcrumbPage } from "./seo";

/** Bir sayfanın üretilecek SEO verisi — useSEO/SeoOptions ile aynı alanlar. */
export type PageSeo = {
  title: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  jsonLd: Array<Record<string, unknown>>;
};

/** siteUrl kökünü normalize eder (sondaki eğik çizgiler çift slash'ı önler). */
function origin(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/**
 * Kategori indeks kuralı (Faz 1): yalnız YAYINDA olan firmalar sayılır.
 * Sitemap üyeliği (seoFetch → seo.noindex) ve sayfa robots meta'sı
 * (FirmsPage → <SEO noindex>) bu TEK kuraldan türetilir; iki katman
 * asla ayrı karar veremez.
 */
export function categoryHasPublishedFirms(
  companies: ReadonlyArray<Pick<Company, "published" | "categoryId">>,
  categoryId: string,
): boolean {
  return companies.some((c) => c.published && c.categoryId === categoryId);
}

/** Liste sayfası başlık kalıbı — FirmsPage ile birebir aynı. */
function listTitleBase(page: ListBreadcrumbPage): string {
  switch (page.kind) {
    case "firmalar":
      return "Tüm Firmalar";
    case "kategori":
      return `${page.name} — Firmalar`;
    case "sehir":
      return `${page.name} Firmaları`;
    case "ilce":
      return `${page.cityName} / ${page.districtName} Firmaları`;
  }
}

/** Liste sayfası kanonik yolu — router ile birebir aynı (slugify tek kaynak). */
function listPath(page: ListBreadcrumbPage): string {
  switch (page.kind) {
    case "firmalar":
      return "/firmalar";
    case "kategori":
      return `/kategori/${page.slug}`;
    case "sehir":
      return `/sehir/${page.slug}`;
    case "ilce":
      return `/sehir/${page.citySlug}/${slugify(page.districtName)}`;
  }
}

/**
 * Liste sayfası (firmalar / kategori / şehir / ilçe) SEO verisi.
 * Başlık ve açıklama kalıpları FirmsPage ile; breadcrumb JSON-LD
 * buildListBreadcrumbJsonLd ile üretilir (mutlak item URL'leri siteUrl'den).
 */
export function buildListPageSeo(siteUrl: string, page: ListBreadcrumbPage): PageSeo {
  const base = listTitleBase(page);
  return {
    title: `${base} | Firma Rehberi`,
    description: `${base} — telefon, adres, çalışma saatleri ve yol tarifi bilgileriyle.`,
    canonicalPath: seoPath(listPath(page)),
    jsonLd: [buildListBreadcrumbJsonLd(page, origin(siteUrl))],
  };
}

/**
 * Firma detay sayfası SEO verisi. Başlık/açıklama/JSON-LD FirmDetailPage ile
 * birebir aynıdır — TEK FARK: description'a zamana bağlı "Şu an açık/kapalı"
 * cümlesi yazılmaz (build'de bayat değer olurdu).
 *
 * Yayımlanmamış firma → noindex, canonical ve JSON-LD yok (sayfa ile aynı).
 */
export function buildFirmDetailSeo(
  siteUrl: string,
  opts: {
    company: Company;
    category?: { name: string; slug: string };
    city?: { name: string; slug: string };
  },
): PageSeo {
  const { company, category, city } = opts;

  if (!company.published) {
    return { title: "Firma bulunamadı | Firma Rehberi", noindex: true, jsonLd: [] };
  }

  const root = origin(siteUrl);
  // Faz 4E-2: canonical + ondan üretilen pageUrl/breadcrumb hep seoPath'te.
  const canonicalPath = seoPath(`/firma/${company.slug}`);
  const locationText = city ? `${city.name} / ${company.district}` : company.district;

  return {
    title: `${company.name} | Firma Rehberi`,
    description: `${company.name} — ${category?.name ?? ""}, ${locationText}.${
      company.phone ? ` Telefon: ${company.phone}` : ""
    }`,
    canonicalPath,
    jsonLd: [
      buildLocalBusinessJsonLd({
        company,
        categoryName: category?.name,
        cityName: city?.name,
        pageUrl: `${root}${canonicalPath}`,
      }),
      buildBreadcrumbJsonLd(
        [
          { name: "Ana sayfa", path: "/" },
          ...(city ? [{ name: city.name, path: `/sehir/${city.slug}` }] : []),
          ...(category ? [{ name: category.name, path: `/kategori/${category.slug}` }] : []),
          { name: company.name, path: canonicalPath },
        ],
        root,
      ),
    ],
  };
}

/** Ana sayfa SEO verisi — WebSite JSON-LD siteUrl kökünden üretilir (location'dan değil). */
export function buildHomeSeo(siteUrl: string): PageSeo {
  const root = origin(siteUrl);
  return {
    title: "Firma Rehberi — Afyonkarahisar'daki Firmaları Kolayca Bulun",
    description:
      "Afyonkarahisar ve ilçelerindeki güvenilir firmaları kategori, ilçe ve arama ile keşfedin.",
    canonicalPath: "/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Firma Rehberi",
        url: root,
        inLanguage: "tr",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${root}/firmalar?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** Statik sayfa metinleri — StaticPages.tsx ile birebir aynı literal'lar. */
const STATIC_PAGES: Record<string, { title: string; description?: string }> = {
  "/iletisim": {
    title: "İletişim | Firma Rehberi",
    description: "Firmanızı rehbere ekletmek veya destek için bize ulaşın.",
  },
  "/hakkimizda": { title: "Hakkımızda | Firma Rehberi" },
  "/kvkk": { title: "KVKK Aydınlatma Metni | Firma Rehberi" },
  "/kullanim-kosullari": { title: "Kullanım Koşulları | Firma Rehberi" },
};

/**
 * Statik sayfa SEO verisi; bilinmeyen yol için null (ör. /giris, 404 —
 * bunlar noindex utility sayfalarıdır ve prerender'a girmez).
 */
export function buildStaticPageSeo(path: string): PageSeo | null {
  const text = STATIC_PAGES[path];
  if (!text) return null;
  return { ...text, canonicalPath: seoPath(path), jsonLd: [] };
}
