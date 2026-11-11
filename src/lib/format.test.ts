import { describe, expect, it } from "vitest";
import { socialProfileUrl, telHref, websiteHref, whatsappHref } from "./format";

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

describe("websiteHref", () => {
  it("protokolsüz alan adını https ile tamamlar", () => {
    expect(websiteHref("ornek.com")).toBe("https://ornek.com/");
    expect(websiteHref("www.ornek.com")).toBe("https://www.ornek.com/");
  });

  it("yalnız http(s) şemalarını kabul eder", () => {
    expect(websiteHref("https://ornek.com")).toBe("https://ornek.com/");
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref("mailto:ornek@ornek.com")).toBeNull();
    expect(websiteHref("")).toBeNull();
  });
});

describe("socialProfileUrl", () => {
  it("handle ve @handle değerlerini profile çevirir", () => {
    expect(socialProfileUrl("afyonsucuksarayi", "instagram")).toBe(
      "https://instagram.com/afyonsucuksarayi",
    );
    expect(socialProfileUrl("@afyon.sucuk", "instagram")).toBe("https://instagram.com/afyon.sucuk");
  });

  it("tam URL ve protokolsüz alan adı girişlerini kabul eder", () => {
    expect(socialProfileUrl("https://www.instagram.com/afyon/?hl=tr", "instagram")).toBe(
      "https://instagram.com/afyon?hl=tr",
    );
    expect(socialProfileUrl("instagram.com/afyon", "instagram")).toBe(
      "https://instagram.com/afyon",
    );
    expect(socialProfileUrl("facebook.com/afyon", "facebook")).toBe("https://facebook.com/afyon");
  });

  it("başka alan adlarına bağlantı üretmez", () => {
    expect(socialProfileUrl("https://example.com/afyon", "instagram")).toBeNull();
    expect(socialProfileUrl("https://facebook.com/afyon", "instagram")).toBeNull();
    expect(socialProfileUrl("", "facebook")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("telefon, wa.me bağlantısı ve yerel numarayı normalize eder", () => {
    expect(whatsappHref("905551230022")).toBe("https://wa.me/905551230022");
    expect(whatsappHref("0555 123 00 22")).toBe("https://wa.me/905551230022");
    expect(whatsappHref("https://wa.me/905551230022")).toBe("https://wa.me/905551230022");
  });

  it("sohbet açılamayacak değerlerde null döner", () => {
    expect(whatsappHref("123")).toBeNull();
    expect(whatsappHref("")).toBeNull();
  });
});
