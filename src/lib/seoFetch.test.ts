/*
 * Faz 4E-1 testleri — build-time Supabase SEO veri katmanı.
 * Tüm Supabase yanıtları MOCK'TUR; gerçek veritabanına istek gitmez.
 */

import { describe, expect, it } from "vitest";
import { buildSitemapPages, fetchSeoData, indexablePages, renderSitemapXml } from "./seoFetch";
import type { SeoSupabaseData } from "./seoFetch";
import { seoPath } from "./seo";
import type { Company } from "./types";

const BASE = "https://project.supabase.test";
const KEY = "test-anon-key-DEĞERİ";
const SITE = "https://firma5.netlify.app";

type MockRoute = { rows: unknown[]; total?: number; status?: number; noRange?: boolean };

/** Her isteğin signal taşıdığını da doğrular (timeout zorunlu). */
function makeFetch(routes: Record<string, MockRoute>, log: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    log.push(url);
    if (init?.signal == null) throw new Error("istekte signal yok — timeout eklenmemiş");
    const path = url.split("/rest/v1/")[1] ?? "";
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) return new Response("{}", { status: 404 });
    const r = routes[key];
    if (r.status && r.status >= 400) return new Response("boom", { status: r.status });
    const total = r.total ?? r.rows.length;
    const range = r.rows.length === 0 ? `*/${total}` : `0-${r.rows.length - 1}/${total}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!r.noRange) headers["content-range"] = range;
    return new Response(JSON.stringify(r.rows), { status: 200, headers });
  }) as typeof fetch;
}

const CITY = { id: "city-1", name: "Afyonkarahisar", slug: "afyonkarahisar", districts: [] };
const CATEGORY = { id: "cat-1", name: "Kuyumculuk", slug: "kuyumculuk", icon: "💍" };

function companyRow(over: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: "c-1",
    name: "Öz Miras Kuyumculuk",
    slug: "oz-miras-kuyumculuk",
    category_id: "cat-1",
    city_id: "city-1",
    district: "Merkez",
    address: "Kale Mah. 1",
    phone: "0272 212 88 03",
    email: null,
    website: null,
    socials: { instagram: "https://instagram.com/x" },
    description: "Açıklama metni",
    images: [],
    hours: { weekday: "09:00-18:00", saturday: "", sunday: "" },
    featured: false,
    published: true,
    latitude: null,
    longitude: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...over,
  };
}

function baseRoutes(over: Record<string, MockRoute> = {}): Record<string, MockRoute> {
  const merge = (base: MockRoute, o?: MockRoute): MockRoute => ({
    ...o,
    rows: o?.rows ?? base.rows,
    ...(o?.total !== undefined ? { total: o.total } : {}),
    ...(o?.status !== undefined ? { status: o.status } : {}),
    ...(o?.noRange !== undefined ? { noRange: o.noRange } : {}),
  });
  return {
    "companies?": merge({ rows: [companyRow({})] }, over.companies),
    "categories?": merge({ rows: [CATEGORY] }, over.categories),
    "cities?": merge({ rows: [CITY] }, over.cities),
    "city_districts?": merge({ rows: [{ city_id: "city-1", district: "Emirdağ" }] }, over.city_districts),
  };
}

function makeData(over: Partial<SeoSupabaseData> = {}): SeoSupabaseData {
  const company: Company = {
    id: "c-1",
    name: "Öz Miras Kuyumculuk",
    slug: "oz-miras-kuyumculuk",
    categoryId: "cat-1",
    cityId: "city-1",
    district: "Merkez",
    address: "Kale Mah. 1",
    phone: "0272 212 88 03",
    socials: {},
    description: "Açıklama metni",
    images: [],
    hours: { weekday: "09:00-18:00", saturday: "", sunday: "" },
    featured: false,
    published: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
  return {
    companies: [company],
    categories: [CATEGORY],
    cities: [CITY],
    districts: [{ city_id: "city-1", district: "Emirdağ" }],
    ...over,
  };
}

describe("fetchSeoData (mock)", () => {
  it("anon SELECT yapar, published=eq.true ister ve unpublished firmayı elemez", async () => {
    const log: string[] = [];
    const fetchImpl = makeFetch(
      baseRoutes({
        companies: { rows: [companyRow({}), companyRow({ id: "c-2", slug: "gizli-firma", published: false })] },
      }),
      log,
    );

    const data = await fetchSeoData({ baseUrl: BASE, anonKey: KEY, fetchImpl });

    const companyUrl = log.find((u) => u.includes("companies?")) ?? "";
    expect(companyUrl).toContain("/rest/v1/companies?");
    expect(companyUrl).toContain("published=eq.true");
    // Çift filtre: sorgu + istemci tarafı
    expect(data.companies.map((c) => c.slug)).toEqual(["oz-miras-kuyumculuk"]);
    // Map'leme snake_case → Company
    expect(data.companies[0].categoryId).toBe("cat-1");
    expect(data.companies[0].hours.weekday).toBe("09:00-18:00");
    expect(data.categories).toHaveLength(1);
    expect(data.cities[0].districts).toEqual([]);
    expect(data.districts).toEqual([{ city_id: "city-1", district: "Emirdağ" }]);
  });

  it("HTTP hatasında fırlatır ve anahtarı hata mesajına yazmaz", async () => {
    const fetchImpl = makeFetch(baseRoutes({ companies: { rows: [], status: 503 } }));
    await expect(fetchSeoData({ baseUrl: BASE, anonKey: KEY, fetchImpl })).rejects.toThrow(
      /\[seo-fetch\] companies: HTTP 503/,
    );
    const err = await fetchSeoData({ baseUrl: BASE, anonKey: KEY, fetchImpl }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(KEY);
    expect((err as Error).message).not.toContain(BASE);
  });

  it("ağ/timeout hatasında fırlatır (yalnız hata adı)", async () => {
    const fetchImpl = (async () => {
      const e = new Error("connect ETIMEDOUT https://project.supabase.test/rest/v1/x");
      e.name = "TimeoutError";
      throw e;
    }) as typeof fetch;
    const err = await fetchSeoData({ baseUrl: BASE, anonKey: KEY, fetchImpl }).catch((e: Error) => e);
    expect((err as Error).message).toBe("[seo-fetch] companies isteği başarısız (TimeoutError)");
    expect((err as Error).message).not.toContain(KEY);
  });

  it("kırpılmış yanıt (content-range toplamı uyuşmuyor) fırlatır", async () => {
    const fetchImpl = makeFetch(baseRoutes({ companies: { rows: [companyRow({})], total: 5 } }));
    await expect(fetchSeoData({ baseUrl: BASE, anonKey: KEY, fetchImpl })).rejects.toThrow(
      /\[seo-fetch\] companies: yanıt eksik\/ kırpılmış \(1\/5\)/,
    );
  });

  it("content-range başlığı yoksa fırlatır", async () => {
    const fetchImpl = makeFetch(baseRoutes({ companies: { rows: [companyRow({})], noRange: true } }));
    await expect(fetchSeoData({ baseUrl: BASE, anonKey: KEY, fetchImpl })).rejects.toThrow(
      /\[seo-fetch\] companies: content-range toplamı okunamadı/,
    );
  });

  it("her istekte timeout signal'i taşır (mock zorunlu kılar)", async () => {
    const log: string[] = [];
    // makeFetch signal yoksa fırlatır — sessizce geçerse signal vardı demektir.
    await expect(
      fetchSeoData({ baseUrl: BASE, anonKey: KEY, fetchImpl: makeFetch(baseRoutes(), log) }),
    ).resolves.toBeTruthy();
    expect(log).toHaveLength(4);
  });
});

describe("buildSitemapPages", () => {
  it("firma/kategori/şehir/ilçe rotalarını gerçek veriden üretir", () => {
    const pages = buildSitemapPages(SITE, makeData());
    const routes = pages.map((p) => p.route);

    // 6 sabit rota
    expect(routes).toContain("/");
    expect(routes).toContain("/firmalar");
    expect(routes).toContain("/iletisim");
    expect(routes).toContain("/hakkimizda");
    expect(routes).toContain("/kvkk");
    expect(routes).toContain("/kullanim-kosullari");
    // Gerçek veri rotaları
    expect(routes).toContain("/kategori/kuyumculuk");
    expect(routes).toContain("/sehir/afyonkarahisar");
    expect(routes).toContain("/sehir/afyonkarahisar/emirdag");
    expect(routes).toContain("/firma/oz-miras-kuyumculuk");
    // 6 + 1 kategori + 1 şehir + 1 ilçe + 1 firma
    expect(routes).toHaveLength(10);
    // Her rota site-içi ve benzersiz
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((r) => r.startsWith("/"))).toBe(true);
  });

  it("ilçe slug'ları tek slugify kaynağından gelir (NFD 'i̇' yok)", () => {
    const pages = buildSitemapPages(
      SITE,
      makeData({ districts: [{ city_id: "city-1", district: "İhsaniye" }] }),
    );
    const routes = pages.map((p) => p.route);
    expect(routes).toContain("/sehir/afyonkarahisar/ihsaniye");
    expect(routes.some((r) => r.includes("i̇"))).toBe(false);
  });

  it("yayımlanmamış firma rotaya girmez (çift filtre)", () => {
    const data = makeData();
    data.companies.push({ ...data.companies[0], id: "c-2", slug: "gizli-firma", published: false });
    const routes = buildSitemapPages(SITE, data).map((p) => p.route);
    expect(routes).not.toContain("/firma/gizli-firma");
    expect(routes).toContain("/firma/oz-miras-kuyumculuk");
  });

  it("Faz 2B: açıklama sayıları yalnız yayın firmalardan sayılır", () => {
    const data = makeData();
    // 1 yayın + 1 yayınlanmamış → sayı 1 olmalı (published-only, Faz 1 kuralı)
    data.companies = [
      ...data.companies,
      { ...data.companies[0], id: "c-2", slug: "gizli-firma", published: false },
    ];
    const pages = buildSitemapPages(SITE, data);
    const firmalar = pages.find((p) => p.route === "/firmalar")?.seo.description ?? "";
    expect(firmalar).toContain("1 firmayı");
    expect(firmalar).not.toContain("2 firmayı");
    const kategori = pages.find((p) => p.route === "/kategori/kuyumculuk")?.seo.description ?? "";
    expect(kategori).toContain("1 firma"); // düşen şablon: "…'da 1 firma: …"
    expect(kategori).not.toContain("2 firma");
    const sehir = pages.find((p) => p.route === "/sehir/afyonkarahisar")?.seo.description ?? "";
    expect(sehir).toContain("1 firma");
  });

  it("sitemap ve prerender aynı { route, seo } listesinden üretilir", () => {
    const pages = buildSitemapPages(SITE, makeData());
    const xml = renderSitemapXml(SITE, pages);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // Sitemap loc sayısı === prerender dosya sayısı (tek kaynak)
    expect(locs).toHaveLength(pages.length);
    // Faz 4E-2: route dosya yolu slashless kalır, <loc> her zaman seoPath'te
    expect(locs).toEqual(pages.map((p) => `${SITE}${seoPath(p.route)}`));
    // kök dahil tüm loc'lar trailing slash standardında
    locs.forEach((loc) => expect(loc.endsWith("/")).toBe(true));
    // XML biçimi korunur
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.endsWith("\n")).toBe(true);
  });

  it("boş Supabase verisiyle yalnız 6 sabit rota üretilir", () => {
    const routes = buildSitemapPages(
      SITE,
      makeData({ companies: [], categories: [], cities: [], districts: [] }),
    ).map((p) => p.route);
    expect(routes).toHaveLength(6);
    expect(routes).toContain("/");
    expect(routes).not.toContain("/firma/oz-miras-kuyumculuk");
  });
});

describe("Faz 1: boş kategori noindex kuralı", () => {
  const EMPTY_CAT = { id: "cat-2", name: "Boş Kategori", slug: "bos-kategori", icon: "🏢" };

  it("yayında firması olmayan kategori noindex olur ama rota listede kalır", () => {
    // makeData(): cat-1'de yayın firması var → indexable; cat-2 boş → noindex.
    const pages = buildSitemapPages(SITE, makeData({ categories: [CATEGORY, EMPTY_CAT] }));
    const empty = pages.find((p) => p.route === "/kategori/bos-kategori");
    expect(empty).toBeDefined();
    expect(empty?.seo.noindex).toBe(true);
    // Dolu kategori etkilenmez
    expect(pages.find((p) => p.route === "/kategori/kuyumculuk")?.seo.noindex).toBeFalsy();
  });

  it("noindex kategori sitemap'ten çıkar; prerender listesi aynı kalır", () => {
    const pages = buildSitemapPages(SITE, makeData({ categories: [CATEGORY, EMPTY_CAT] }));
    const xml = renderSitemapXml(SITE, pages);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    // Sitemap = indexable subset: bos-kategori yok, kuyumculuk var
    expect(locs.some((l) => l.includes("/kategori/bos-kategori"))).toBe(false);
    expect(locs.some((l) => l.includes("/kategori/kuyumculuk"))).toBe(true);
    expect(locs).toHaveLength(indexablePages(pages).length);
    // Prerender listesi (pages) dosya üretmeye devam eder — rota silinmedi
    expect(pages.map((p) => p.route)).toContain("/kategori/bos-kategori");
  });

  it("sadece kategori sayfaları noindex olur; firma/şehir/sabit sayfalar etkilenmez", () => {
    const pages = buildSitemapPages(SITE, makeData({ categories: [CATEGORY, EMPTY_CAT] }));
    const noindexRoutes = pages.filter((p) => p.seo.noindex).map((p) => p.route);
    expect(noindexRoutes).toEqual(["/kategori/bos-kategori"]);
    for (const route of [
      "/",
      "/firmalar",
      "/firma/oz-miras-kuyumculuk",
      "/sehir/afyonkarahisar",
      "/sehir/afyonkarahisar/emirdag",
      "/iletisim",
      "/kategori/kuyumculuk",
    ]) {
      expect(pages.find((p) => p.route === route)?.seo.noindex).toBeFalsy();
    }
  });

  it("kategoride yalnız yayınlanmamış firma varsa da noindex (sadece published sayılır)", () => {
    const data = makeData();
    data.companies = data.companies.map((c) => ({ ...c, published: false }));
    const pages = buildSitemapPages(SITE, data);
    expect(pages.find((p) => p.route === "/kategori/kuyumculuk")?.seo.noindex).toBe(true);
    // Firma rotası zaten üretilmiyor (çift published filtresi korunur)
    expect(pages.map((p) => p.route)).not.toContain("/firma/oz-miras-kuyumculuk");
  });

  it("firma eklenince kategori otomatik indexable olur (firma published=true)", () => {
    // Boş → dolu geçiş: aynı kural, ters sonuç — 4F build hook'u bu durumda
    // yeniden build tetikler; burada kuralın tersine döndüğünü kanıtlar.
    const empty = buildSitemapPages(SITE, makeData({ companies: [], categories: [CATEGORY] }));
    expect(empty.find((p) => p.route === "/kategori/kuyumculuk")?.seo.noindex).toBe(true);
    const filled = buildSitemapPages(SITE, makeData({ categories: [CATEGORY] }));
    expect(filled.find((p) => p.route === "/kategori/kuyumculuk")?.seo.noindex).toBeFalsy();
  });
});
