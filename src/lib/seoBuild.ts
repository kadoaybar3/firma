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

/**
 * Faz 2B: Liste sayfası title/description metinleri — build-time (prerender)
 * ve runtime (FirmsPage) AYNI fonksiyonu çağırır; çıktı birebir aynı olmak
 * zorunda. firmCount yalnız YAYINLI firmalardan sayılır (çağıran taraf sağlar).
 */
export function listSeoText(
  page: ListBreadcrumbPage,
  firmCount: number,
): { title: string; description: string } {
  return { title: listTitle(page), description: listDescription(page, firmCount) };
}

/** Liste sayfası SEO başlığı (Faz 2B) — H1/breadcrumb başlığı `title`'dan FARKLIDIR. */
function listTitle(page: ListBreadcrumbPage): string {
  const brand = " | RehberiX";
  switch (page.kind) {
    case "firmalar":
      return `Afyonkarahisar'daki Tüm Firmalar${brand}`;
    case "kategori": {
      const full = `${page.name} — Afyonkarahisar${brand}`;
      // 60 karakter sınırı: uzun kategori adlarında konum başa alınır (Faz 2A tur örneği)
      return full.length > 60 ? `Afyonkarahisar ${page.name}${brand}` : full;
    }
    case "sehir":
      return `${page.name} Firmaları${brand}`;
    case "ilce":
      return `${page.cityName} ${page.districtName} Firmaları${brand}`;
  }
}

/**
 * Faz 2B: Kategori başına özgün açıklama — sayı parametre olarak gelir;
 * oto-tamir (20 firmada 1'siz adres) bilinçli olarak adres iddiası içermez.
 */
const CATEGORY_DESCRIPTIONS: Record<string, (n: number) => string> = {
  "eczaneler": (n) =>
    `Afyonkarahisar'da ${n} eczane listesi: adres, telefon ve çalışma saatleri bilgileriyle size en yakın eczaneyi hemen bulun.`,
  "oto-tamir-ve-servis": (n) =>
    `Afyonkarahisar'da ${n} oto tamir ve servis firması: telefon, çalışma saatleri ve yol tarifi bilgileriyle en yakın servisi seçin.`,
  "fast-food": (n) =>
    `Afyonkarahisar'da ${n} fast food noktası: adres, telefon ve çalışma saatleri bilgileriyle size en yakın şubeyi listeleyin.`,
  "kasaplar": (n) =>
    `Afyonkarahisar'da ${n} kasap: adres, telefon ve çalışma saatleri bilgileriyle size en yakın kasabı listeleyin ve yol tarifi alın.`,
  "emlak-ofisleri": (n) =>
    `Afyonkarahisar'da ${n} emlak ofisi: adres, telefon ve çalışma saatleri bilgileriyle gayrimenkul danışmanlarına hemen ulaşın.`,
  "nakliye-ve-lojistik": (n) =>
    `Afyonkarahisar'da ${n} nakliye ve kurye firması: adres, telefon ve çalışma saatleri bilgileriyle taşıma hizmeti veren firmaları bulun.`,
  "oto-kaporta-ve-boya": () =>
    "Afyonkarahisar Merkez'deki oto kaporta ve boya firması: adres, telefon ve çalışma saatleri bilgileriyle hemen iletişime geçin.",
  "manavlar": () =>
    "Afyonkarahisar Sandıklı'daki manav: taze meyve ve sebze alışverişi için telefon, adres ve çalışma saatleri bilgileri.",
  "tur-ve-gezi-organizasyonlari": () =>
    "Afyonkarahisar'daki tur ve gezi organizasyonu firması: hac, umre ve gezi turları için telefon, adres ve çalışma saatleri.",
  "restoranlar": () =>
    "Afyonkarahisar Merkez'deki restoran: telefon, adres ve çalışma saatleri bilgileriyle konum ve iletişim bilgilerine ulaşın.",
  "guzellik-merkezleri": () =>
    "Afyonkarahisar'daki güzellik merkezi: saç ekimi ve PRP hizmetleri için telefon, adres ve çalışma saatleri bilgileri.",
};

function listDescription(page: ListBreadcrumbPage, firmCount: number): string {
  switch (page.kind) {
    case "firmalar":
      return `Afyonkarahisar ve ilçelerindeki ${firmCount} firmayı kategori ve ilçe filtreleriyle arayın; telefon, çalışma saatleri ve yol tarifi bilgilerine ulaşın.`;
    case "kategori":
      return (
        CATEGORY_DESCRIPTIONS[page.slug] ??
        ((n: number) =>
          `${page.name} — Afyonkarahisar'da ${n} firma: telefon, adres, çalışma saatleri ve yol tarifi bilgileriyle.`)
      )(firmCount);
    case "sehir":
      return `${page.name}'da ${firmCount} firma: kategori ve ilçelere göre filtreleyin; telefon ve yol tarifi bilgilerine kolayca ulaşın.`;
    case "ilce": {
      const where = `${page.cityName} ${page.districtName}`;
      if (page.districtName === "Merkez")
        return `${where}'de ${firmCount} firma: eczane, oto tamir, kasap ve fast food başta olmak üzere kategorilerde telefon ve yol tarifi.`;
      if (page.districtName === "Sandıklı")
        return `${where} ilçesinde ${firmCount} kayıtlı firma: telefon, adres ve çalışma saatleri bilgileriyle ilçe esnafına ulaşın.`;
      return `${where} ilçesinde ${firmCount} firma: telefon, adres ve çalışma saatleri bilgileriyle firmalara ulaşın.`;
    }
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
 * Başlık/açıklama listSeoText ile (FirmsPage aynı fonksiyonu çağırır —
 * build/runtime birebir aynı); breadcrumb JSON-LD buildListBreadcrumbJsonLd
 * ile üretilir (mutlak item URL'leri siteUrl'den).
 */
export function buildListPageSeo(
  siteUrl: string,
  page: ListBreadcrumbPage,
  firmCount: number,
): PageSeo {
  const { title, description } = listSeoText(page, firmCount);
  return {
    title,
    description,
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
    return { title: "Firma bulunamadı | RehberiX", noindex: true, jsonLd: [] };
  }

  const root = origin(siteUrl);
  // Faz 4E-2: canonical + ondan üretilen pageUrl/breadcrumb hep seoPath'te.
  const canonicalPath = seoPath(`/firma/${company.slug}`);
  const locationText = city ? `${city.name} / ${company.district}` : company.district;

  return {
    title: `${company.name} | RehberiX`,
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
    title: "RehberiX — Afyonkarahisar'daki Firmaları Kolayca Bulun",
    description:
      "Afyonkarahisar ve ilçelerindeki güvenilir firmaları kategori, ilçe ve arama ile keşfedin.",
    canonicalPath: "/",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "RehberiX",
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
    title: "İletişim | RehberiX",
    description: "Firmanızı rehbere ekletmek veya destek için bize ulaşın.",
  },
  "/hakkimizda": { title: "Hakkımızda | RehberiX" },
  "/kvkk": { title: "KVKK Aydınlatma Metni | RehberiX" },
  "/kullanim-kosullari": { title: "Kullanım Koşulları | RehberiX" },
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
