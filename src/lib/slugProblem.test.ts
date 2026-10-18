import { describe, expect, it } from "vitest";
import { slugProblem, slugProblemMessage } from "./slugProblem";

describe("slugProblem", () => {
  it("geçersiz kategori slug'ı sorunu döndürür (yol ve queryparam)", () => {
    expect(slugProblem({ catSlug: "bilbo", hasCategory: false, hasCity: false, hasDistrict: false })).toEqual({
      kind: "kategori",
      value: "bilbo",
    });
  });

  it("geçersiz şehir slug'ı sorunu döndürür", () => {
    expect(slugProblem({ citySlug: "oydu", hasCategory: false, hasCity: false, hasDistrict: false })).toEqual({
      kind: "sehir",
      value: "oydu",
    });
  });

  it("geçerli şehirde geçersiz ilçe sorunu döndürür", () => {
    expect(
      slugProblem({ citySlug: "afyon", district: "mahalle-uyduruk", hasCategory: false, hasCity: true, hasDistrict: false }),
    ).toEqual({ kind: "ilce", value: "mahalle-uyduruk" });
  });

  it("öncelik: kategori > şehir > ilçe (ilk başarısız raporlanır)", () => {
    const r = slugProblem({
      catSlug: "bilbo",
      citySlug: "oydu",
      district: "x",
      hasCategory: false,
      hasCity: false,
      hasDistrict: false,
    });
    expect(r?.kind).toBe("kategori");
  });

  it("geçerli kategori + geçersiz şehir → ikinci öncelik 'sehir'", () => {
    expect(
      slugProblem({ catSlug: "yemek", citySlug: "oydu", hasCategory: true, hasCity: false, hasDistrict: false }),
    ).toEqual({ kind: "sehir", value: "oydu" });
  });

  it("geçerli yolda null — davranış değişmez", () => {
    expect(
      slugProblem({ citySlug: "afyon", district: "merkez", hasCategory: false, hasCity: true, hasDistrict: true }),
    ).toBeNull();
    expect(slugProblem({ hasCategory: true, hasCity: false, hasDistrict: false })).toBeNull();
  });

  it("şehirsiz ?ilce= serbest arama filtresidir — sorun değildir", () => {
    expect(slugProblem({ district: "merkez", hasCategory: false, hasCity: false, hasDistrict: false })).toBeNull();
  });

  it("mesaj insan okur: ham değeri ve türü içerir", () => {
    expect(slugProblemMessage({ kind: "kategori", value: "bilbo" })).toContain("bilbo");
    expect(slugProblemMessage({ kind: "ilce", value: "X" })).toContain("ilçe");
  });
});
