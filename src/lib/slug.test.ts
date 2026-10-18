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
