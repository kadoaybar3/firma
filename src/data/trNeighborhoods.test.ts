import { describe, expect, it } from "vitest";
import { TR_ILCELERI } from "./trDistricts";
import { TR_MAHALLELERI } from "./trNeighborhoods";

describe("TR_MAHALLELERI", () => {
  it("Afyonkarahisar'ın 18 ilçesini kapsar", () => {
    const districts = Object.keys(TR_MAHALLELERI.Afyonkarahisar);
    expect(districts).toHaveLength(18);
    expect(new Set(districts)).toEqual(new Set(TR_ILCELERI.Afyonkarahisar));
  });

  it("18 ilçede toplam 362 mahalle kaydı vardır", () => {
    const total = Object.values(TR_MAHALLELERI.Afyonkarahisar).reduce(
      (sum, neighborhoods) => sum + neighborhoods.length,
      0,
    );
    expect(total).toBe(362);
  });

  it("her ilçede mahalle vardır, adlar boş veya tekrarlı değildir", () => {
    for (const [district, neighborhoods] of Object.entries(TR_MAHALLELERI.Afyonkarahisar)) {
      expect(neighborhoods.length, district).toBeGreaterThan(0);
      expect(new Set(neighborhoods).size, district).toBe(neighborhoods.length);
      for (const name of neighborhoods) expect(name.trim()).toBe(name);
    }
  });

  it("bilinen mahalle eşleşmeleri doğrudur", () => {
    expect(TR_MAHALLELERI.Afyonkarahisar.Merkez).toEqual(
      expect.arrayContaining([
        "Güvenevler",
        "Burmalı",
        "Veysel Karani",
        "Derviş Paşa",
        "Mareşal Fevzi Çakmak",
      ]),
    );
    expect(TR_MAHALLELERI.Afyonkarahisar.İhsaniye).toContain("Kervansaray");
  });
});
