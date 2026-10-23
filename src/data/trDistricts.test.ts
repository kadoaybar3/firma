import { describe, expect, it } from "vitest";
import { TR_ILCELERI } from "./trDistricts";
import { TR_ILLER } from "./trCities";
import { matchDistrict } from "../lib/importLib";
import type { City } from "../lib/types";

const afyCity: City = {
  id: "city-afy",
  name: "Afyonkarahisar",
  slug: "afyonkarahisar",
  districts: ["Merkez", "Sandıklı", "Şuhut"],
};

describe("TR_ILCELERI", () => {
  it("81 ilin hepsini kapsar ve TR_ILLER sırasıyla birebir örtüşür", () => {
    expect(Object.keys(TR_ILCELERI)).toEqual(TR_ILLER);
    expect(Object.keys(TR_ILCELERI).length).toBe(81);
  });

  it("toplam ilçe sayısı 973 (TurkiyeAPI 2025 dataset)", () => {
    const total = Object.values(TR_ILCELERI).reduce((n, d) => n + d.length, 0);
    expect(total).toBe(973);
  });

  it("her ilin ilçe listesi dolu, gerekli başlık okunduğu yerden boş gelmez", () => {
    for (const il of TR_ILLER) {
      const list = TR_ILCELERI[il];
      expect(list.length, il).toBeGreaterThan(0);
      expect(new Set(list.map((d) => d.trim() === d ? d : d)).size, il).toBe(list.length);
      for (const d of list) expect(d.trim()).toBe(d);
    }
  });

  it("Afyonkarahisar: Merkez, Sandıklı ve Şuhut listelenir (kullanıcı örneği)", () => {
    const list = TR_ILCELERI["Afyonkarahisar"];
    expect(list).toContain("Merkez");
    expect(list).toContain("Sandıklı");
    expect(list).toContain("Şuhut");
  });

  it("Afyon'da Merkez garantili; diğer illerin hepsinde en az bir ilçe (resmî sette her ilde Merkez yoktur)", () => {
    expect(TR_ILCELERI["Afyonkarahisar"]).toContain("Merkez");
    for (const il of TR_ILLER) {
      expect(TR_ILCELERI[il].length, il).toBeGreaterThan(0);
    }
  });

  it("matchDistrict statik kaynaktan gelen ilçe adını DB şehriyle normalizasyonla eşler", () => {
    for (const d of ["Merkez", "SANDIKLI", "şuhut"]) {
      expect(matchDistrict(d, afyCity)).toBeDefined();
    }
    expect(matchDistrict("Bolu", afyCity)).toBeUndefined();
  });

  it("matchDistrict boş ilçe → DB'nin Merkez düşüşü çalışır", () => {
    expect(matchDistrict("", afyCity)).toBe("Merkez");
  });
});
