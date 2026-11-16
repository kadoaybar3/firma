import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug, normalizeSearch } from "./slug";

describe("slugify", () => {
  it("Türkçe karakterleri doğru dönüştürür", () => {
    expect(slugify("Kadınana Pastane & Fırını")).toBe("kadinana-pastane-firini");
    expect(slugify("İscehisar Mermer")).toBe("iscehisar-mermer");
    expect(slugify("Şuhut Kiraz")).toBe("suhut-kiraz");
    expect(slugify("GÜL Ağaççılık")).toBe("gul-agaccilik");
  });

  it("boşluk ve sembolleri temizler", () => {
    expect(slugify("  A. B içecek &  toz  ")).toBe("a-b-icecek-toz");
  });

  // İlçe slug normalizasyonu: sitemap üretimi (vite.config.ts) ve FirmsPage
  // eşleştirmesi slugify üzerinden tek kaynağa bağlandı (Faz 3A).
  it("ilçe slug'ları sitemap ve router için ASCII ve tutarlı", () => {
    expect(slugify("İhsaniye")).toBe("ihsaniye");
    expect(slugify("İscehisar")).toBe("iscehisar");
    expect(slugify("Çay")).toBe("cay");
    expect(slugify("Bolvadin")).toBe("bolvadin");
    expect(slugify("Sandıklı")).toBe("sandikli");
    // NFD "i̇" (i + U+0307) üretmez ve çift encode edilmez
    expect(slugify("İhsaniye")).not.toContain("\u0307");
    expect(encodeURIComponent(slugify("İhsaniye"))).toBe("ihsaniye");
  });

  it("ilçe slug'ları router decode'undan sonra da eşleşir", () => {
    // Sitemap üretimi → URL → React Router decodePath (decodeURIComponent) →
    // FirmsPage.slugify(d) === districtParam karşılaştırması.
    const districts = [
      "Merkez", "Bolvadin", "Çay", "Dinar", "Emirdağ", "İhsaniye",
      "İscehisar", "Sandıklı", "Sinanpaşa", "Sultandağı", "Şuhut",
    ];
    for (const d of districts) {
      const urlSlug = slugify(d);
      const routerParam = decodeURIComponent(encodeURIComponent(urlSlug));
      expect(districts.find((x) => slugify(x) === routerParam)).toBe(d);
    }
  });
});

describe("uniqueSlug", () => {
  it("çakışmada sayı ekler", () => {
    expect(uniqueSlug("test", [])).toBe("test");
    expect(uniqueSlug("test", ["test"])).toBe("test-2");
    expect(uniqueSlug("test", ["test", "test-2"])).toBe("test-3");
  });
});

describe("normalizeSearch", () => {
  it("İ/ı eşleşmesini sağlar", () => {
    expect(normalizeSearch("İzmir")).toContain("izmir");
    expect(normalizeSearch("kuyumculuk")).toBe(normalizeSearch("KUYUMCULUK"));
  });
});
