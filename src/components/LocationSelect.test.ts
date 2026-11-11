import { describe, expect, it } from "vitest";
import { TR_ILLER } from "../data/trCities";
import { TR_ILCELERI } from "../data/trDistricts";
import { findCityByName, hasStoredCity } from "../lib/location";
import type { City } from "../lib/types";
import {
  districtOptions,
  nextLocationOnProvinceChange,
  provinceOptions,
} from "./LocationSelect";

describe("LocationSelect veri kaynağı", () => {
  it("81 ilin tamamı mevcut", () => {
    expect(TR_ILLER).toHaveLength(81);
    expect(new Set(TR_ILLER).size).toBe(81);
  });

  it("her ilin ilçeleri dolu ve tekrarsız", () => {
    for (const province of TR_ILLER) {
      const districts = TR_ILCELERI[province];
      expect(districts, province).toBeDefined();
      expect(districts.length, province).toBeGreaterThan(0);
      expect(new Set(districts).size, province).toBe(districts.length);
      for (const d of districts) expect(d.trim()).toBe(d);
    }
  });

  it("toplam ilçe sayısı 973", () => {
    const total = Object.values(TR_ILCELERI).reduce((n, d) => n + d.length, 0);
    expect(total).toBe(973);
  });
});

describe("LocationSelect arama ve bağlı seçim davranışı", () => {
  it("il araması Türkçe karakter ve büyük/küçük harf duyarsızdır", () => {
    const lower = provinceOptions([], "", "istanbul");
    expect(lower).toContain("İstanbul");

    const upper = provinceOptions([], "", "İSTANBUL");
    expect(upper).toContain("İstanbul");

    const dotless = provinceOptions([], "", "isparta");
    expect(dotless).toContain("Isparta");

    const cedilla = provinceOptions([], "", "sanliurfa");
    expect(cedilla).toContain("Şanlıurfa");
  });

  it("il araması 81 il içinden süzülür, eşleşmeyen aramada boş döner", () => {
    expect(provinceOptions([], "", "zzzz")).toEqual([]);
    expect(provinceOptions([], "", "a").length).toBeGreaterThan(0);
    expect(provinceOptions([], "", "a").length).toBeLessThan(81);
  });

  it("ilçe listesi yalnızca seçilen ile göre filtrelenir", () => {
    const istanbul = districtOptions("İstanbul");
    expect(istanbul).toContain("Kadıköy");
    expect(istanbul).toContain("Beşiktaş");
    expect(istanbul).not.toContain("Şuhut");

    const afyon = districtOptions("Afyonkarahisar");
    expect(afyon).toContain("Merkez");
    expect(afyon).toContain("Sandıklı");
    expect(afyon).toContain("Şuhut");
    expect(afyon).not.toContain("Kadıköy");
  });

  it("il seçilmeden ilçe listesi boştur (önce il seçilmeli)", () => {
    expect(districtOptions("")).toEqual([]);
  });

  it("ilçe araması Türkçe karakter duyarsızdır", () => {
    expect(districtOptions("Afyonkarahisar", [], "", "suhut")).toContain("Şuhut");
    expect(districtOptions("Afyonkarahisar", [], "", "ŞUHUT")).toContain("Şuhut");
    expect(districtOptions("İstanbul", [], "", "besiktas")).toContain("Beşiktaş");
  });

  it("il değişince önceki ilçe seçimi temizlenir", () => {
    const next = nextLocationOnProvinceChange("Ankara", {
      province: "Afyonkarahisar",
      district: "Şuhut",
    });
    expect(next).toEqual({ province: "Ankara", district: "" });
    expect(districtOptions(next.province)).not.toContain("Şuhut");
  });

  it("aynı il yeniden seçilirse mevcut ilçe korunur (form sıfırlanmaz)", () => {
    const next = nextLocationOnProvinceChange("Afyonkarahisar", {
      province: "Afyonkarahisar",
      district: "Şuhut",
    });
    expect(next.district).toBe("Şuhut");
  });

  it("veritabanındaki eski/özel il ve ilçe değerleri listede korunur", () => {
    const provinces = provinceOptions(["Eskişehir Özel"], "", "");
    expect(provinces).toContain("Eskişehir Özel");
    expect(provinces).toContain("Afyonkarahisar");

    const districts = districtOptions("Afyonkarahisar", ["Eski Mahalle"], "Eski Mahalle", "");
    expect(districts).toContain("Eski Mahalle");
    expect(districts).toContain("Şuhut");
    // Aynı ad iki kez listelenmez.
    expect(districts.filter((name) => name === "Eski Mahalle")).toHaveLength(1);
  });
});

describe("Veritabanı şehir eşlemesi", () => {
  const cities: City[] = [
    { id: "city-afy", name: "Afyonkarahisar", slug: "afyonkarahisar", districts: ["Merkez"] },
  ];

  it("il adını Türkçe duyarsız biçimde cities kaydına eşler", () => {
    expect(findCityByName(cities, "afyonkarahisar")?.id).toBe("city-afy");
    expect(findCityByName(cities, "AFYONKARAHİSAR")?.id).toBe("city-afy");
    expect(findCityByName(cities, "Ankara")).toBeUndefined();
  });

  it("şemada karşılığı olmayan il için kayıt yapılamayacağını bildirir", () => {
    expect(hasStoredCity(cities, "Afyonkarahisar")).toBe(true);
    expect(hasStoredCity(cities, "Ankara")).toBe(false);
  });
});
