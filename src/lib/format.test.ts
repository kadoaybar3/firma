import { describe, expect, it } from "vitest";
import { telHref } from "./format";

describe("telHref", () => {
  it("biçim karakterlerini temizler (boşluk, tire, parantez)", () => {
    expect(telHref("0 (505) 123-45-67")).toBe("tel:05051234567");
    expect(telHref("0505 123 45 67")).toBe("tel:05051234567");
  });

  it("baştaki + işaretini uluslararası biçimde korur, gövdedekileri siler", () => {
    expect(telHref("+90 505 123 45 67")).toBe("tel:+905051234567");
    // gövde içindeki '+' geçerli tel karakteri değildir
    expect(telHref("0505+123")).toBe("tel:0505123");
  });

  it("çevrilebilir karakter yoksa boş döner (çağıran metne düşer)", () => {
    expect(telHref("")).toBe("");
    expect(telHref("başvurular e-posta yoluyla")).toBe("");
  });
});
