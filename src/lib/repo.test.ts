import { describe, expect, it } from "vitest";
import { districtCompanyCount, districtCountsByCity, listCities, resetDB } from "./repo";

/**
 * districtCountsByCity ile referans districtCompanyCount arasındaki invariant
 * eşdeğerlik — tek-geçiş uygulaması mantık farkı taşımamalı
 * (published filtresi, exact-case ilçe eşleşmesi, şehir kısıtı).
 */
describe("districtCountsByCity", () => {
  it("her ilçe için districtCompanyCount ile birebir aynı sayıyı üretir", () => {
    resetDB();
    for (const city of listCities()) {
      const map = districtCountsByCity(city.id);
      for (const d of city.districts) {
        expect(map.get(d) ?? 0).toBe(districtCompanyCount(city.id, d));
      }
    }
  });

  it("bilinmeyen şehir kimliği için boş Map döner", () => {
    resetDB();
    expect(districtCountsByCity("yok-boyle-sehir").size).toBe(0);
  });
});
