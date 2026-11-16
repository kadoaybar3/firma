import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFirmDetailSeo, buildHomeSeo, buildListPageSeo, buildStaticPageSeo } from "./seoBuild";
import type { PageSeo } from "./seoBuild";
import type { Company } from "./types";

const SITE = "https://firma5.netlify.app";

type Crumb = { "@type": string; position: number; name: string; item?: string };

function crumbs(seo: PageSeo, index = 0): Crumb[] {
  return seo.jsonLd[index]?.itemListElement as Crumb[];
}

describe("buildListPageSeo", () => {
  const prevLocation = globalThis.location;

  beforeAll(() => {
    // Node test ortamında location yok; siteUrl parametresinin tek mutlak URL
    // kaynağı olduğunu kanıtlamak için SAHTE bir origin tanımla — çıktılar
    // buna göre değil, siteUrl parametresine göre üretilmeli.
    globalThis.location = { origin: "https://yanlis-ornek.invalid" } as Location;
  });

  afterAll(() => {
    if (prevLocation) globalThis.location = prevLocation;
    else delete (globalThis as { location?: Location }).location;
  });

  it("/firmalar: Tüm Firmalar başlığı + Ana Sayfa → Firmalar", () => {
    const seo = buildListPageSeo(SITE, { kind: "firmalar" });
    expect(seo.title).toBe("Tüm Firmalar | Firma Rehberi");
    expect(seo.description).toBe(
      "Tüm Firmalar — telefon, adres, çalışma saatleri ve yol tarifi bilgileriyle.",
    );
    expect(seo.canonicalPath).toBe("/firmalar");
    expect(seo.noindex).toBeUndefined();
    expect(crumbs(seo)).toEqual([
      { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Firmalar", item: `${SITE}/firmalar` },
    ]);
  });

  it("/kategori/:catSlug: kategori adı + Kategoriler ara öğesi URL'siz", () => {
    const seo = buildListPageSeo(SITE, { kind: "kategori", name: "Kuyumculuk", slug: "kuyumculuk" });
    expect(seo.title).toBe("Kuyumculuk — Firmalar | Firma Rehberi");
    expect(seo.description).toBe(
      "Kuyumculuk — Firmalar — telefon, adres, çalışma saatleri ve yol tarifi bilgileriyle.",
    );
    expect(seo.canonicalPath).toBe("/kategori/kuyumculuk");
    const c = crumbs(seo);
    expect(c.map((x) => x.name)).toEqual(["Ana Sayfa", "Kategoriler", "Kuyumculuk"]);
    expect(c[1].item).toBeUndefined(); // /kategori indeks rotası yok — 404'e bağlanmaz
    expect(c[2].item).toBe(`${SITE}/kategori/kuyumculuk`);
  });

  it("/sehir/:citySlug: şehir adı", () => {
    const seo = buildListPageSeo(SITE, { kind: "sehir", name: "Afyonkarahisar", slug: "afyonkarahisar" });
    expect(seo.title).toBe("Afyonkarahisar Firmaları | Firma Rehberi");
    expect(seo.canonicalPath).toBe("/sehir/afyonkarahisar");
    const c = crumbs(seo);
    expect(c.map((x) => x.name)).toEqual(["Ana Sayfa", "Afyonkarahisar"]);
    expect(c[1].item).toBe(`${SITE}/sehir/afyonkarahisar`);
  });

  it("/sehir/:citySlug/:district: slug slugify ile (İhsaniye → ihsaniye)", () => {
    const seo = buildListPageSeo(SITE, {
      kind: "ilce",
      cityName: "Afyonkarahisar",
      citySlug: "afyonkarahisar",
      districtName: "İhsaniye",
    });
    expect(seo.title).toBe("Afyonkarahisar / İhsaniye Firmaları | Firma Rehberi");
    expect(seo.canonicalPath).toBe("/sehir/afyonkarahisar/ihsaniye");
    const c = crumbs(seo);
    expect(c.map((x) => x.name)).toEqual(["Ana Sayfa", "Afyonkarahisar", "İhsaniye"]);
    expect(c[2].item).toBe(`${SITE}/sehir/afyonkarahisar/ihsaniye`);
    // sahte origin asla sızmamalı — mutlak URL'ler yalnız siteUrl'den
    expect(JSON.stringify(seo)).not.toContain("yanlis-ornek.invalid");
  });

  it("siteUrl sondaki eğik çizgi normalize edilir (çift slash olmaz)", () => {
    const seo = buildListPageSeo(`${SITE}/`, { kind: "firmalar" });
    expect(crumbs(seo)[1].item).toBe(`${SITE}/firmalar`);
  });
});

describe("buildFirmDetailSeo", () => {
  const base: Company = {
    id: "co-1",
    slug: "ornek-firma",
    name: "Örnek Firma",
    categoryId: "cat-1",
    cityId: "city-afyon",
    district: "Merkez",
    address: "Cumhuriyet Cad.",
    phone: "0272 000 00 00",
    email: "",
    website: "",
    socials: {},
    description: "Test açıklaması",
    images: [],
    hours: { weekday: "08:00 - 19:00", saturday: "Kapalı", sunday: "Kapalı" },
    published: true,
    featured: false,
    createdAt: "",
    updatedAt: "",
  };
  const category = { name: "Kuyumculuk", slug: "kuyumculuk" };
  const city = { name: "Afyonkarahisar", slug: "afyonkarahisar" };

  it("başlık/açıklama/canonical FirmDetailPage kalıbıyla aynı", () => {
    const seo = buildFirmDetailSeo(SITE, { company: base, category, city });
    expect(seo.title).toBe("Örnek Firma | Firma Rehberi");
    expect(seo.description).toBe("Örnek Firma — Kuyumculuk, Afyonkarahisar / Merkez. Telefon: 0272 000 00 00");
    expect(seo.canonicalPath).toBe("/firma/ornek-firma");
    expect(seo.noindex).toBeUndefined();
  });

  it("description zamana bağlı açık/kapalı bilgisi İÇERMEZ (saat verisi olsa bile)", () => {
    // weekday "08:00 - 19:00" — canlı sayfa 'Şu an açık' gösterebilir;
    // build-time açıklama asla zaman iddiası taşımamalı.
    const seo = buildFirmDetailSeo(SITE, { company: base, category, city });
    expect(seo.description).not.toContain("Şu an açık");
    expect(seo.description).not.toContain("Şu an kapalı");
    expect(seo.description).not.toMatch(/açık|kapalı/);
  });

  it("telefon yoksa telefon cümlesi de yok", () => {
    const seo = buildFirmDetailSeo(SITE, {
      company: { ...base, phone: "" },
      category,
      city,
    });
    expect(seo.description).toBe("Örnek Firma — Kuyumculuk, Afyonkarahisar / Merkez.");
  });

  it("şehir yoksa konum yalnız ilçe (FirmDetailPage locationText kalıbı)", () => {
    const seo = buildFirmDetailSeo(SITE, { company: { ...base, district: "İhsaniye" }, category });
    expect(seo.description).toContain("Kuyumculuk, İhsaniye.");
  });

  it("JSON-LD: LocalBusiness + BreadcrumbList, ikisi de mutlak URL'li", () => {
    const seo = buildFirmDetailSeo(SITE, { company: base, category, city });
    expect(seo.jsonLd).toHaveLength(2);

    const local = seo.jsonLd[0] as Record<string, unknown>;
    expect(local["@type"]).toBeTruthy();
    expect(local.url).toBe(`${SITE}/firma/ornek-firma`);

    const c = crumbs(seo, 1);
    expect(c.map((x) => x.name)).toEqual(["Ana sayfa", "Afyonkarahisar", "Kuyumculuk", "Örnek Firma"]);
    expect(c.map((x) => x.item)).toEqual([
      `${SITE}/`,
      `${SITE}/sehir/afyonkarahisar`,
      `${SITE}/kategori/kuyumculuk`,
      `${SITE}/firma/ornek-firma`,
    ]);
  });

  it("yayımlanmamış firma → noindex, canonical ve JSON-LD yok", () => {
    const seo = buildFirmDetailSeo(SITE, { company: { ...base, published: false }, category, city });
    expect(seo.noindex).toBe(true);
    expect(seo.title).toBe("Firma bulunamadı | Firma Rehberi");
    expect(seo.canonicalPath).toBeUndefined();
    expect(seo.jsonLd).toEqual([]);
  });
});

describe("buildStaticPageSeo", () => {
  it("statik sayfa metinleri StaticPages ile birebir aynı", () => {
    expect(buildStaticPageSeo("/iletisim")).toEqual({
      title: "İletişim | Firma Rehberi",
      description: "Firmanızı rehbere ekletmek veya destek için bize ulaşın.",
      canonicalPath: "/iletisim",
      jsonLd: [],
    });
    expect(buildStaticPageSeo("/hakkimizda")).toEqual({
      title: "Hakkımızda | Firma Rehberi",
      canonicalPath: "/hakkimizda",
      jsonLd: [],
    });
    expect(buildStaticPageSeo("/kvkk")).toEqual({
      title: "KVKK Aydınlatma Metni | Firma Rehberi",
      canonicalPath: "/kvkk",
      jsonLd: [],
    });
    expect(buildStaticPageSeo("/kullanim-kosullari")).toEqual({
      title: "Kullanım Koşulları | Firma Rehberi",
      canonicalPath: "/kullanim-kosullari",
      jsonLd: [],
    });
  });

  it("bilinmeyen yol (noindex utility sayfaları dahil) null döner", () => {
    expect(buildStaticPageSeo("/giris")).toBeNull();
    expect(buildStaticPageSeo("/")).toBeNull(); // ana sayfa buildHomeSeo ile üretilir
    expect(buildStaticPageSeo("/bilinmeyen")).toBeNull();
  });
});

describe("buildHomeSeo", () => {
  it("ana sayfa başlığı/açıklaması HomePage ile aynı; canonical /", () => {
    const seo = buildHomeSeo(SITE);
    expect(seo.title).toBe("Firma Rehberi — Afyonkarahisar'daki Firmaları Kolayca Bulun");
    expect(seo.description).toBe(
      "Afyonkarahisar ve ilçelerindeki güvenilir firmaları kategori, ilçe ve arama ile keşfedin.",
    );
    expect(seo.canonicalPath).toBe("/");
    expect(seo.noindex).toBeUndefined();
  });

  it("WebSite JSON-LD url ve SearchAction siteUrl parametresinden üretilir", () => {
    const seo = buildHomeSeo(SITE);
    const web = seo.jsonLd[0] as {
      url: string;
      potentialAction: { target: { urlTemplate: string } };
    };
    expect(web.url).toBe(SITE);
    expect(web.potentialAction.target.urlTemplate).toBe(`${SITE}/firmalar?q={search_term_string}`);
  });
});

describe("DOM'suz ortam", () => {
  it("hiçbir üretici location/window/document'e bakmaz (Node'da mutlak URL üretir)", () => {
    // Bu describe boyunca location TANIMLI DEĞİL — çıktılar yine de siteUrl
    // parametresiyle mutlak üretiliyorsa katman bağımsızdır.
    const seo = buildListPageSeo(SITE, { kind: "firmalar" });
    expect(crumbs(seo)[1].item).toBe(`${SITE}/firmalar`);
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });
});
