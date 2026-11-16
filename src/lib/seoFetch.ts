/*
 * Build-time Supabase SEO veri katmanı (Faz 4E-1)
 *
 * Sitemap ve head-only prerender bu katmandan beslenir; seed verisi
 * build akışından çıkarıldı (bkz. Faz 4D: seed ≠ canlı Supabase).
 *
 * Kurallar:
 *  - Yalnız anon anahtarla GET/SELECT. `companies` sorgusu
 *    `published=eq.true` ile sınırlıdır (RLS ayrıca published-only korur;
 *    çift filtre bilinçlidir). service_role KULLANILMAZ.
 *  - Seed'e fallback YOK: erişim hatası, eksik ya da kırpılmış yanıt
 *    (content-range toplamı ile uyuşmayan kayıt sayısı) fırlatır ve build
 *    durur — yanlış/eksik içerik sessizce yayınlanmaz.
 *  - Her isteğin ~15 sn timeout'u vardır; hata mesajlarına anahtar veya
 *    tam URL yazılmaz.
 */

import type { Category, City, Company, CompanyHours } from "./types";
import { slugify } from "./slug";
import { seoPath } from "./seo";
import {
  buildFirmDetailSeo,
  buildHomeSeo,
  buildListPageSeo,
  buildStaticPageSeo,
} from "./seoBuild";
import type { PageSeo } from "./seoBuild";

/** Build sırasında okunan gerçek veri — sitemap ve prerender tek kaynaktan. */
export type SeoSupabaseData = {
  companies: Company[];
  categories: Category[];
  cities: City[];
  districts: Array<{ city_id: string; district: string }>;
};

export type FetchSeoDataOptions = {
  /** Supabase proje URL'si (VITE_SUPABASE_URL). */
  baseUrl: string;
  /** Supabase anon anahtarı (VITE_SUPABASE_ANON_KEY); yalnız SELECT kullanılır. */
  anonKey: string;
  /** İstek başına timeout; varsayılan 15 sn. */
  timeoutMs?: number;
  /** Test enjeksiyonu; varsayılan global fetch. */
  fetchImpl?: typeof fetch;
};

const REQUEST_TIMEOUT_MS = 15_000;
const REST_PREFIX = "/rest/v1/";

type Row = Record<string, unknown>;

/** Bir tabloyu SELECT eder; satırları ve content-range toplamını döndürür. */
async function selectRows(
  opts: FetchSeoDataOptions,
  path: string,
  label: string,
): Promise<{ rows: Row[]; total: number }> {
  const { baseUrl, anonKey, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = fetch } = opts;

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}${REST_PREFIX}${path}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
        Prefer: "count=exact",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Yalnız hata adı: mesaj/URL sızıntısı olmasın (timeout, dns, ...).
    const name = err instanceof Error && err.name ? err.name : "bilinmeyen";
    throw new Error(`[seo-fetch] ${label} isteği başarısız (${name})`);
  }

  if (!res.ok) {
    // Gövde okunmaz: hata metni URL/anahtar içerebilir.
    throw new Error(`[seo-fetch] ${label}: HTTP ${res.status}`);
  }

  const rows = (await res.json()) as Row[];
  if (!Array.isArray(rows)) {
    throw new Error(`[seo-fetch] ${label}: beklenmeyen yanıt (dizi değil)`);
  }

  // count=exact ile Prefer gönderildi: toplam content-range'de gelir.
  // Gelmiyorsa ya da kayıt sayısı toplamla uyuşmuyorsa yanıt eksik/ kırpılmış
  // olabilir → build durur (sessiz veri kaybı yok).
  const range = res.headers.get("content-range");
  const total = range ? Number(range.slice(range.indexOf("/") + 1)) : NaN;
  if (!Number.isFinite(total)) {
    throw new Error(`[seo-fetch] ${label}: content-range toplamı okunamadı`);
  }
  if (rows.length !== total) {
    throw new Error(`[seo-fetch] ${label}: yanıt eksik/ kırpılmış (${rows.length}/${total})`);
  }

  return { rows, total };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapCompany(row: Row): Company {
  const socials = (row.socials ?? {}) as Company["socials"];
  const rawHours = (row.hours ?? {}) as Partial<CompanyHours>;
  const hours: CompanyHours = {
    weekday: rawHours.weekday ?? "",
    saturday: rawHours.saturday ?? "",
    sunday: rawHours.sunday ?? "",
  };
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    categoryId: str(row.category_id),
    cityId: str(row.city_id),
    district: str(row.district),
    address: str(row.address),
    phone: str(row.phone),
    email: typeof row.email === "string" ? row.email : undefined,
    website: typeof row.website === "string" ? row.website : undefined,
    socials,
    description: str(row.description),
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    hours,
    featured: row.featured === true,
    published: row.published === true,
    latitude: typeof row.latitude === "number" ? row.latitude : undefined,
    longitude: typeof row.longitude === "number" ? row.longitude : undefined,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/**
 * Sitemap/prerender için gereken dört tabloyu paralel SELECT eder.
 * Yalnız yayınlanan firmalar döner (sorgu + çift filtre).
 */
export async function fetchSeoData(opts: FetchSeoDataOptions): Promise<SeoSupabaseData> {
  const [companies, categories, cities, districts] = await Promise.all([
    selectRows(
      opts,
      "companies?select=id,name,slug,category_id,city_id,district,address,phone,email,website,socials,description,images,hours,featured,published,latitude,longitude,created_at,updated_at&published=eq.true",
      "companies",
    ),
    selectRows(opts, "categories?select=id,name,slug,icon", "categories"),
    selectRows(opts, "cities?select=id,name,slug", "cities"),
    selectRows(opts, "city_districts?select=city_id,district", "city_districts"),
  ]);

  return {
    companies: companies.rows.filter((r) => r.published === true).map(mapCompany),
    categories: categories.rows.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      icon: str(r.icon) || "🏢",
    })),
    cities: cities.rows.map((r) => ({
      id: str(r.id),
      name: str(r.name),
      slug: str(r.slug),
      // cities tablosunda ilçe kolonu yok; ilçeler city_districts'tedir.
      districts: [],
    })),
    districts: districts.rows.map((r) => ({
      city_id: str(r.city_id),
      district: str(r.district),
    })),
  };
}

/**
 * Gerçek veriden sitemap/prerender rotalarını üretir — TEK KAYNAK:
 * sitemap XML'i ve dist/<route>/index.html bu listeden üretilir (4B-3).
 * İlçe slug'ları Faz 3A kuralı ile tek slugify kaynağından gelir.
 */
export function buildSitemapPages(
  siteUrl: string,
  data: SeoSupabaseData,
): Array<{ route: string; seo: PageSeo }> {
  const pages: Array<{ route: string; seo: PageSeo }> = [
    { route: "/", seo: buildHomeSeo(siteUrl) },
    { route: "/firmalar", seo: buildListPageSeo(siteUrl, { kind: "firmalar" }) },
  ];

  for (const path of ["/iletisim", "/hakkimizda", "/kvkk", "/kullanim-kosullari"]) {
    const seo = buildStaticPageSeo(path);
    if (!seo) throw new Error(`[seo] statik sayfa SEO üreticisi yok: ${path}`);
    pages.push({ route: path, seo });
  }

  for (const category of data.categories) {
    pages.push({
      route: `/kategori/${category.slug}`,
      seo: buildListPageSeo(siteUrl, {
        kind: "kategori",
        name: category.name,
        slug: category.slug,
      }),
    });
  }

  for (const city of data.cities) {
    pages.push({
      route: `/sehir/${city.slug}`,
      seo: buildListPageSeo(siteUrl, { kind: "sehir", name: city.name, slug: city.slug }),
    });
    for (const district of data.districts.filter((d) => d.city_id === city.id)) {
      pages.push({
        route: `/sehir/${city.slug}/${slugify(district.district)}`,
        seo: buildListPageSeo(siteUrl, {
          kind: "ilce",
          cityName: city.name,
          citySlug: city.slug,
          districtName: district.district,
        }),
      });
    }
  }

  for (const company of data.companies) {
    // Çift published filtresi: fetch zaten `published=eq.true` istedi.
    if (!company.published) continue;
    const category = data.categories.find((c) => c.id === company.categoryId);
    const city = data.cities.find((c) => c.id === company.cityId);
    pages.push({
      route: `/firma/${company.slug}`,
      seo: buildFirmDetailSeo(siteUrl, {
        company,
        category: category ? { name: category.name, slug: category.slug } : undefined,
        city: city ? { name: city.name, slug: city.slug } : undefined,
      }),
    });
  }

  return pages;
}

/** Aynı { route, seo } listesinden sitemap XML üretir (biçim 4B-3 ile aynı). */
export function renderSitemapXml(siteUrl: string, pages: Array<{ route: string }>): string {
  return (
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...pages.map(({ route }) =>
        // route dosya yolu olarak slashless kalır; yalnız URL metni seoPath'e girer.
        ["  <url>", `    <loc>${siteUrl}${seoPath(route)}</loc>`, "  </url>"].join("\n"),
      ),
      "</urlset>",
    ].join("\n") + "\n"
  );
}
