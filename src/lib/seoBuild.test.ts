import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildFirmDetailSeo,
  buildHomeSeo,
  buildListPageSeo,
  buildStaticPageSeo,
  categoryHasPublishedFirms,
  listSeoText,
} from "./seoBuild";
import type { PageSeo } from "./seoBuild";
import type { ListBreadcrumbPage } from "./seo";
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

  it("/firmalar: lokasyonlu başlık + Ana Sayfa → Firmalar (Faz 2B)", () => {
    const seo = buildListPageSeo(SITE, { kind: "firmalar" }, 84);
    expect(seo.title).toBe("Afyonkarahisar'daki Tüm Firmalar | RehberiX");
    expect(seo.description).toBe(
      "Afyonkarahisar ve ilçelerindeki 84 firmayı kategori ve ilçe filtreleriyle arayın; telefon, çalışma saatleri ve yol tarifi bilgilerine ulaşın.",
    );
    expect(seo.canonicalPath).toBe("/firmalar/");
    expect(seo.noindex).toBeUndefined();
    expect(crumbs(seo)).toEqual([
      { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Firmalar", item: `${SITE}/firmalar/` },
    ]);
  });

  it("/kategori/:catSlug: kategori adı + lokasyon + Kategoriler ara öğesi URL'siz (Faz 2B)", () => {
    const seo = buildListPageSeo(SITE, { kind: "kategori", name: "Kuyumculuk", slug: "kuyumculuk" }, 5);
    expect(seo.title).toBe("Kuyumculuk — Afyonkarahisar | RehberiX");
    // Kuyumculuk harita dışı → düşen açıklama: sayı parametre olarak görünür
    expect(seo.description).toBe(
      "Kuyumculuk — Afyonkarahisar'da 5 firma: telefon, adres, çalışma saatleri ve yol tarifi bilgileriyle.",
    );
    expect(seo.canonicalPath).toBe("/kategori/kuyumculuk/");
    const c = crumbs(seo);
    expect(c.map((x) => x.name)).toEqual(["Ana Sayfa", "Kategoriler", "Kuyumculuk"]);
    expect(c[1].item).toBeUndefined(); // /kategori indeks rotası yok — 404'e bağlanmaz
    expect(c[2].item).toBe(`${SITE}/kategori/kuyumculuk/`);
  });

  it("/sehir/:citySlug: şehir adı (Faz 2B)", () => {
    const seo = buildListPageSeo(SITE, { kind: "sehir", name: "Afyonkarahisar", slug: "afyonkarahisar" }, 84);
    expect(seo.title).toBe("Afyonkarahisar Firmaları | RehberiX");
    expect(seo.description).toBe(
      "Afyonkarahisar'da 84 firma: kategori ve ilçelere göre filtreleyin; telefon ve yol tarifi bilgilerine kolayca ulaşın.",
    );
    expect(seo.canonicalPath).toBe("/sehir/afyonkarahisar/");
    const c = crumbs(seo);
    expect(c.map((x) => x.name)).toEqual(["Ana Sayfa", "Afyonkarahisar"]);
    expect(c[1].item).toBe(`${SITE}/sehir/afyonkarahisar/`);
  });

  it("/sehir/:citySlug/:district: slug slugify ile (İhsaniye → ihsaniye) (Faz 2B)", () => {
    const seo = buildListPageSeo(
      SITE,
      {
        kind: "ilce",
        cityName: "Afyonkarahisar",
        citySlug: "afyonkarahisar",
        districtName: "İhsaniye",
      },
      7,
    );
    expect(seo.title).toBe("Afyonkarahisar İhsaniye Firmaları | RehberiX");
    expect(seo.description).toBe(
      "Afyonkarahisar İhsaniye ilçesinde 7 firma: telefon, adres ve çalışma saatleri bilgileriyle firmalara ulaşın.",
    );
    expect(seo.canonicalPath).toBe("/sehir/afyonkarahisar/ihsaniye/");
    const c = crumbs(seo);
    expect(c.map((x) => x.name)).toEqual(["Ana Sayfa", "Afyonkarahisar", "İhsaniye"]);
    expect(c[2].item).toBe(`${SITE}/sehir/afyonkarahisar/ihsaniye/`);
    // sahte origin asla sızmamalı — mutlak URL'ler yalnız siteUrl'den
    expect(JSON.stringify(seo)).not.toContain("yanlis-ornek.invalid");
  });

  it("siteUrl sondaki eğik çizgi normalize edilir (çift slash olmaz)", () => {
    const seo = buildListPageSeo(`${SITE}/`, { kind: "firmalar" }, 84);
    expect(crumbs(seo)[1].item).toBe(`${SITE}/firmalar/`);
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
    expect(seo.title).toBe("Örnek Firma | RehberiX");
    expect(seo.description).toBe("Örnek Firma — Kuyumculuk, Afyonkarahisar / Merkez. Telefon: 0272 000 00 00");
    expect(seo.canonicalPath).toBe("/firma/ornek-firma/");
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
    expect(local.url).toBe(`${SITE}/firma/ornek-firma/`);

    const c = crumbs(seo, 1);
    expect(c.map((x) => x.name)).toEqual(["Ana sayfa", "Afyonkarahisar", "Kuyumculuk", "Örnek Firma"]);
    expect(c.map((x) => x.item)).toEqual([
      `${SITE}/`,
      `${SITE}/sehir/afyonkarahisar/`,
      `${SITE}/kategori/kuyumculuk/`,
      `${SITE}/firma/ornek-firma/`,
    ]);
  });

  it("yayımlanmamış firma → noindex, canonical ve JSON-LD yok", () => {
    const seo = buildFirmDetailSeo(SITE, { company: { ...base, published: false }, category, city });
    expect(seo.noindex).toBe(true);
    expect(seo.title).toBe("Firma bulunamadı | RehberiX");
    expect(seo.canonicalPath).toBeUndefined();
    expect(seo.jsonLd).toEqual([]);
  });
});

describe("buildStaticPageSeo", () => {
  it("statik sayfa metinleri StaticPages ile birebir aynı", () => {
    expect(buildStaticPageSeo("/iletisim")).toEqual({
      title: "İletişim | RehberiX",
      description: "Firmanızı rehbere ekletmek veya destek için bize ulaşın.",
      canonicalPath: "/iletisim/",
      jsonLd: [],
    });
    expect(buildStaticPageSeo("/hakkimizda")).toEqual({
      title: "Hakkımızda | RehberiX",
      canonicalPath: "/hakkimizda/",
      jsonLd: [],
    });
    expect(buildStaticPageSeo("/kvkk")).toEqual({
      title: "KVKK Aydınlatma Metni | RehberiX",
      canonicalPath: "/kvkk/",
      jsonLd: [],
    });
    expect(buildStaticPageSeo("/kullanim-kosullari")).toEqual({
      title: "Kullanım Koşulları | RehberiX",
      canonicalPath: "/kullanim-kosullari/",
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
    expect(seo.title).toBe("RehberiX — Afyonkarahisar'daki Firmaları Kolayca Bulun");
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
    const seo = buildListPageSeo(SITE, { kind: "firmalar" }, 84);
    expect(crumbs(seo)[1].item).toBe(`${SITE}/firmalar/`);
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });
});

describe("categoryHasPublishedFirms (Faz 1)", () => {
  it("yalnız yayın=true firmayı sayar; başka kategori sayılmaz", () => {
    expect(categoryHasPublishedFirms([], "cat-1")).toBe(false);
    expect(categoryHasPublishedFirms([{ published: false, categoryId: "cat-1" }], "cat-1")).toBe(false);
    expect(categoryHasPublishedFirms([{ published: true, categoryId: "cat-1" }], "cat-1")).toBe(true);
    // Yayınlanmamış firma + başka kategori → yine false
    expect(categoryHasPublishedFirms([{ published: false, categoryId: "cat-2" }], "cat-1")).toBe(false);
    expect(categoryHasPublishedFirms([{ published: true, categoryId: "cat-2" }], "cat-1")).toBe(false);
    // Karışık liste: tek yayın yeterli
    expect(
      categoryHasPublishedFirms(
        [
          { published: false, categoryId: "cat-1" },
          { published: true, categoryId: "cat-1" },
        ],
        "cat-1",
      ),
    ).toBe(true);
  });
});

describe("Faz 2B: 15 indekslenebilir liste sayfası metinleri", () => {
  // Canlı veriyle birebir (Faz 2A sayımı): 84 firma; 11 kategori + 1 şehir + 2 ilçe.
  const SITES: Array<{ page: ListBreadcrumbPage; count: number }> = [
    { page: { kind: "firmalar" }, count: 84 },
    { page: { kind: "kategori", name: "Eczaneler", slug: "eczaneler" }, count: 19 },
    { page: { kind: "kategori", name: "Oto Tamir ve Servis", slug: "oto-tamir-ve-servis" }, count: 20 },
    { page: { kind: "kategori", name: "Fast Food", slug: "fast-food" }, count: 18 },
    { page: { kind: "kategori", name: "Kasaplar", slug: "kasaplar" }, count: 17 },
    { page: { kind: "kategori", name: "Emlak Ofisleri", slug: "emlak-ofisleri" }, count: 3 },
    { page: { kind: "kategori", name: "Nakliye ve Lojistik", slug: "nakliye-ve-lojistik" }, count: 2 },
    { page: { kind: "kategori", name: "Oto Kaporta ve Boya", slug: "oto-kaporta-ve-boya" }, count: 1 },
    { page: { kind: "kategori", name: "Manavlar", slug: "manavlar" }, count: 1 },
    { page: { kind: "kategori", name: "Tur ve Gezi Organizasyonları", slug: "tur-ve-gezi-organizasyonlari" }, count: 1 },
    { page: { kind: "kategori", name: "Restoranlar", slug: "restoranlar" }, count: 1 },
    { page: { kind: "kategori", name: "Güzellik Merkezleri", slug: "guzellik-merkezleri" }, count: 1 },
    { page: { kind: "sehir", name: "Afyonkarahisar", slug: "afyonkarahisar" }, count: 84 },
    { page: { kind: "ilce", cityName: "Afyonkarahisar", citySlug: "afyonkarahisar", districtName: "Merkez" }, count: 83 },
    { page: { kind: "ilce", cityName: "Afyonkarahisar", citySlug: "afyonkarahisar", districtName: "Sandıklı" }, count: 1 },
  ];

  it("15 description'ın tamamı tekil (şablon tekrarı yok)", () => {
    const descs = SITES.map(({ page, count }) => listSeoText(page, count).description);
    expect(descs).toHaveLength(15);
    expect(new Set(descs).size).toBe(15);
  });

  it("15 title'ın tamamı 60 karakter altında", () => {
    for (const { page, count } of SITES) {
      const { title } = listSeoText(page, count);
      expect(title.length, `${title} (${title.length})`).toBeLessThanOrEqual(60);
    }
    // Marka kısaldığı için bu kategori 60 sınırının altında kalır (konum başa alınmaz).
    expect(listSeoText({ kind: "kategori", name: "Tur ve Gezi Organizasyonları", slug: "tur-ve-gezi-organizasyonlari" }, 1).title).toBe(
      "Tur ve Gezi Organizasyonları — Afyonkarahisar | RehberiX",
    );
    // 60 karakteri aşan uzun adda konum başa alınır (dal korunuyor).
    expect(listSeoText({ kind: "kategori", name: "Spor ve Fitness Merkezleri ve Kursları", slug: "spor-ve-fitness" }, 1).title).toBe(
      "Afyonkarahisar Spor ve Fitness Merkezleri ve Kursları | RehberiX",
    );
  });

  it("sayılar description'da görünür ve parametreden gelir", () => {
    expect(
      listSeoText({ kind: "kategori", name: "Eczaneler", slug: "eczaneler" }, 19).description,
    ).toContain("19 eczane");
    expect(
      listSeoText({ kind: "sehir", name: "Afyonkarahisar", slug: "afyonkarahisar" }, 84).description,
    ).toContain("84 firma");
    // Aynı sayfa farklı sayıyla farklı metin üretir (sayı sabit değil)
    expect(listSeoText({ kind: "sehir", name: "Afyonkarahisar", slug: "afyonkarahisar" }, 85).description).toContain("85 firma");
  });

  it("oto-tamir açıklaması adres iddiası İÇERMEZ (20 firmada 1'siz adres)", () => {
    const { description } = listSeoText(
      { kind: "kategori", name: "Oto Tamir ve Servis", slug: "oto-tamir-ve-servis" },
      20,
    );
    expect(description).not.toContain("adres");
    expect(description).toContain("20 oto tamir");
    expect(description).toContain("telefon");
    expect(description).toContain("yol tarifi");
  });

  it("tek firmalı sayfalarda abartılı/yanıltıcı ifade yok", () => {
    const singles = SITES.filter((s) => s.count === 1).map(
      ({ page, count }) => listSeoText(page, count).description,
    );
    expect(singles.length).toBeGreaterThanOrEqual(6);
    for (const d of singles) {
      expect(d).not.toMatch(/en güvenilir|en büyük|nöbetçi|7\/24|ücretsiz|her zaman/);
    }
  });
});
