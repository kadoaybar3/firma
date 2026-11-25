import { describe, expect, it } from "vitest";
import { parseGoogleMapsLink, parseTurkishLocality } from "./googleMapsLink";

describe("parseGoogleMapsLink — Google Maps bağlantı ayrıştırma", () => {
  it("yer bağlantısından adı, adresi ve !3d/!4d koordinatını okur", () => {
    const result = parseGoogleMapsLink(
      "https://www.google.com/maps/place/Ada+Cafe,+Marulcu+Mah.+No:45,+Merkez,+Afyonkarahisar/@38.754321,30.521234,17z/data=!3m1!4b1!4m6!3m5!1s0x14cf!8m2!3d38.755!4d30.522",
    );
    expect(result).toEqual({
      ok: true,
      info: {
        fromShortLink: false,
        placeName: "Ada Cafe",
        address: "Marulcu Mah. No:45, Merkez, Afyonkarahisar",
        province: "Afyonkarahisar",
        district: "Merkez",
        latitude: 38.755,
        longitude: 30.522,
      },
    });
  });

  it("data parametresi yoksa @ görünüm merkezini kullanır", () => {
    const result = parseGoogleMapsLink(
      "https://www.google.com/maps/place/Aybar+Mimarl%C4%B1k/@38.754321,30.521234,17z",
    );
    expect(result.ok && result.info.placeName).toBe("Aybar Mimarlık");
    expect(result.ok && result.info.latitude).toBeCloseTo(38.754321, 6);
    expect(result.ok && result.info.longitude).toBeCloseTo(30.521234, 6);
  });

  it("yalnız harita görünümü bağlantısından koordinatı okur", () => {
    const result = parseGoogleMapsLink("https://www.google.com/maps/@38.75,30.52,15z");
    expect(result.ok && result.info.latitude).toBe(38.75);
    expect(result.ok && result.info.longitude).toBe(30.52);
    expect(result.ok && result.info.placeName).toBeUndefined();
  });

  it("?q=lat,lng biçimini okur", () => {
    const result = parseGoogleMapsLink("https://maps.google.com/?q=38.754321,30.521234");
    expect(result.ok && result.info.latitude).toBe(38.754321);
    expect(result.ok && result.info.longitude).toBe(30.521234);
  });

  it("?q=loc:lat,lng biçimini okur", () => {
    const result = parseGoogleMapsLink("https://www.google.com/maps?q=loc:38.75,30.52");
    expect(result.ok && result.info.latitude).toBe(38.75);
  });

  it("search/api=1&query=lat,lng biçimini okur", () => {
    const result = parseGoogleMapsLink(
      "https://www.google.com/maps/search/?api=1&query=38.754321%2C30.521234",
    );
    expect(result.ok && result.info.latitude).toBe(38.754321);
  });

  it("yol tarifi bağlantısından hedef adını okur", () => {
    const result = parseGoogleMapsLink(
      "https://www.google.com/maps/dir/?api=1&destination=Ada+Cafe%2C+Afyonkarahisar",
    );
    expect(result).toEqual({
      ok: true,
      info: {
        fromShortLink: false,
        placeName: "Ada Cafe",
        address: "Afyonkarahisar",
        province: "Afyonkarahisar",
      },
    });
  });

  describe("il/ilçe normalizasyonu (ortak normalizeLocality)", () => {
    it("il önekli ilçe metnini temizler: Afyonkarahisar Merkez → Merkez", () => {
      const result = parseGoogleMapsLink(
        "https://www.google.com/maps/place/Ada+Cafe,+Marulcu+Mah.+No:45,+Afyonkarahisar+Merkez,+Afyonkarahisar/@38.75,30.52,17z",
      );
      expect(result.ok && result.info.province).toBe("Afyonkarahisar");
      expect(result.ok && result.info.district).toBe("Merkez");
      // Adres metni değişmez.
      expect(result.ok && result.info.address).toBe(
        "Marulcu Mah. No:45, Afyonkarahisar Merkez, Afyonkarahisar",
      );
    });

    it("posta kodlu İlçe/İl biçiminde okur: 03030 Afyonkarahisar Merkez/Afyonkarahisar", () => {
      const result = parseGoogleMapsLink(
        "https://www.google.com/maps/place/Ada+Cafe,+03030+Afyonkarahisar+Merkez%2FAfyonkarahisar/@38.75,30.52,17z",
      );
      expect(result.ok && result.info.province).toBe("Afyonkarahisar");
      expect(result.ok && result.info.district).toBe("Merkez");
    });

    it("Ankara: Ankara Çankaya → Çankaya", () => {
      const result = parseGoogleMapsLink(
        "https://www.google.com/maps/place/K%C4%B1rm%C4%B1z%C4%B1+Kedi,+Ankara+%C3%87ankaya,+Ankara/@39.9,32.85,15z",
      );
      expect(result.ok && result.info.province).toBe("Ankara");
      expect(result.ok && result.info.district).toBe("Çankaya");
    });

    it("İzmir: İzmir Konak → Konak", () => {
      const result = parseGoogleMapsLink(
        "https://www.google.com/maps/place/Ofis,+%C4%B0zmir+Konak,+%C4%B0zmir/@38.42,27.14,15z",
      );
      expect(result.ok && result.info.province).toBe("İzmir");
      expect(result.ok && result.info.district).toBe("Konak");
    });

    it("eşleşmeyen ilçe tahmin edilmez; il yine eşleşir, ilçe boş kalır", () => {
      const result = parseGoogleMapsLink(
        "https://www.google.com/maps/place/Firma,+Bilinmeyen+Semt,+Afyonkarahisar/@38.75,30.52,15z",
      );
      expect(result.ok && result.info.province).toBe("Afyonkarahisar");
      expect((result.ok && result.info.district) ?? "").toBe("");
    });
  });

  it("kısa bağlantıyı sunucuya bırakır", () => {
    expect(parseGoogleMapsLink("https://maps.app.goo.gl/abc123")).toEqual({
      ok: false,
      reason: "short-link",
    });
  });

  it("Google dışı bağlantıyı reddeder", () => {
    expect(parseGoogleMapsLink("https://example.com/maps/place/X/@38.75,30.52")).toEqual({
      ok: false,
      reason: "not-maps",
    });
  });

  it("google.com.tr alan adını kabul eder", () => {
    const result = parseGoogleMapsLink("https://www.google.com.tr/maps/@38.75,30.52,15z");
    expect(result.ok).toBe(true);
  });

  it("konum bilgisi olmayan bağlantıda boş döner", () => {
    expect(parseGoogleMapsLink("https://www.google.com/maps?cid=123456789")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("boş metinde istek yapmadan hata verir", () => {
    expect(parseGoogleMapsLink("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("posta kodlu 'İlçe/İl' parçasından il ve ilçeyi ayırır", () => {
    const result = parseGoogleMapsLink(
      "https://www.google.com/maps/place/Ada+Cafe,+03000+Merkez/Afyonkarahisar,+T%C3%BCrkiye/@38.75,30.52,17z",
    );
    expect(result.ok && result.info.province).toBe("Afyonkarahisar");
    expect(result.ok && result.info.district).toBe("Merkez");
    expect(result.ok && result.info.placeName).toBe("Ada Cafe");
  });

  it("il adı ve ilçe adı büyük/küçük harf farkıyla eşleşir", () => {
    const result = parseGoogleMapsLink(
      "https://www.google.com/maps/place/X/@38.75,30.52,17z/data=!3d38.75!4d30.52?q=KADIK%C3%96Y%2F%C4%B0STANBUL",
    );
    // q parametresi yalnızca koordinat değil; il/ilçe parametrede yok → boş
    expect(result.ok && result.info.province).toBeUndefined();
  });

  it("yalnız il varsa ilçe boş kalır", () => {
    const result = parseGoogleMapsLink("https://www.google.com/maps/place/Afyonkarahisar/@38.75,30.52,17z");
    expect(result.ok && result.info.province).toBeUndefined();
  });
});

describe("parseTurkishLocality — il/ilçe ayrıştırma", () => {
  it("'İlçe/İl' biçimini okur", () => {
    expect(parseTurkishLocality("03000 Merkez/Afyonkarahisar, Türkiye")).toEqual({
      province: "Afyonkarahisar",
      district: "Merkez",
    });
  });

  it("ayrı parçaları okur", () => {
    expect(parseTurkishLocality("Marulcu Mah. No:45, Merkez, Afyonkarahisar")).toEqual({
      province: "Afyonkarahisar",
      district: "Merkez",
    });
  });

  it("'İl/İlçe' ters biçimini okur", () => {
    expect(parseTurkishLocality("İstanbul/Kadıköy")).toEqual({
      province: "İstanbul",
      district: "Kadıköy",
    });
  });

  it("büyük/küçük harf ve Türkçe karakter farkını tolere eder", () => {
    expect(parseTurkishLocality("KADIKÖY/İSTANBUL")).toEqual({
      province: "İstanbul",
      district: "Kadıköy",
    });
  });

  it("il resmî listede değilse boş bırakır (tahmin etmez)", () => {
    expect(parseTurkishLocality("Merkez, Afyon")).toEqual({});
  });

  it("eşleşmeyen ilçe tahmin edilmez; il biliniyorsa ilçe boş kalır", () => {
    expect(parseTurkishLocality("Bilinmeyenİlçe, Afyonkarahisar")).toEqual({
      province: "Afyonkarahisar",
    });
  });

  it("mahalle/sokak taşıyan parça ilçe olmaz", () => {
    expect(parseTurkishLocality("Marulcu Mah. No:45, Afyonkarahisar")).toEqual({
      province: "Afyonkarahisar",
    });
  });

  it("il adı ilçe alanına yazılmaz", () => {
    expect(parseTurkishLocality("Afyonkarahisar, Afyonkarahisar")).toEqual({
      province: "Afyonkarahisar",
    });
  });

  it("Türkiye parçasını yoksayar", () => {
    expect(parseTurkishLocality("Merkez, Afyonkarahisar, Türkiye")).toEqual({
      province: "Afyonkarahisar",
      district: "Merkez",
    });
  });

  it("boş metinde boş döner", () => {
    expect(parseTurkishLocality("")).toEqual({});
  });
});
