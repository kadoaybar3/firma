import { describe, expect, it } from "vitest";
import { normalizeLocality } from "./location";

/**
 * Türkiye geneli ortak il/ilçe normalizasyonu:
 * Google Maps vb. kaynaklardan gelen "İl + İl-İlçe" metinleri resmî
 * listelerle eşlenir; eşleşmeyen alan tahmin edilmez.
 */
describe("normalizeLocality — ortak il/ilçe normalizasyonu", () => {
  it("il adıyla başlayan ilçe metnini temizler (kullanıcı örnekleri)", () => {
    expect(normalizeLocality("Afyonkarahisar", "Afyonkarahisar Merkez")).toEqual({
      province: "Afyonkarahisar",
      district: "Merkez",
    });
    expect(normalizeLocality("Ankara", "Ankara Çankaya")).toEqual({
      province: "Ankara",
      district: "Çankaya",
    });
    expect(normalizeLocality("İzmir", "İzmir Konak")).toEqual({
      province: "İzmir",
      district: "Konak",
    });
    expect(normalizeLocality("İstanbul", "İstanbul Kadıköy")).toEqual({
      province: "İstanbul",
      district: "Kadıköy",
    });
  });

  it("Türkçe karakter, büyük/küçük harf ve fazla boşluk farkları duyarsızdır", () => {
    expect(normalizeLocality("  AFYONKARAHİSAR ", "  MERKEZ  ")).toEqual({
      province: "Afyonkarahisar",
      district: "Merkez",
    });
    expect(normalizeLocality("istanbul", "istanbul  kadikoy")).toEqual({
      province: "İstanbul",
      district: "Kadıköy",
    });
    expect(normalizeLocality("izmir", "izmir   konak")).toEqual({
      province: "İzmir",
      district: "Konak",
    });
  });

  it("birebir eşleşen ilçeyi resmî adıyla döndürür", () => {
    expect(normalizeLocality("Afyonkarahisar", "Sandıklı")).toEqual({
      province: "Afyonkarahisar",
      district: "Sandıklı",
    });
    expect(normalizeLocality("Ankara", "Çankaya")).toEqual({
      province: "Ankara",
      district: "Çankaya",
    });
  });

  it("il öneki yalnız kalan ifade birebir ilçe ise silinir", () => {
    // Kalan ifade listede yoksa önek silinmez, ilçe boş döner (tahmin yok).
    expect(normalizeLocality("Ankara", "Ankara Yenişehir")).toEqual({
      province: "Ankara",
      district: "",
    });
    // İl adı ilçeye dönüşmez.
    expect(normalizeLocality("Afyonkarahisar", "Afyonkarahisar")).toEqual({
      province: "Afyonkarahisar",
      district: "",
    });
  });

  it("eşleşmeyen ilçeyi tahmin etmez; il biliniyorsa ilçe boş kalır", () => {
    expect(normalizeLocality("Afyonkarahisar", "Bilinmeyen İlçe")).toEqual({
      province: "Afyonkarahisar",
      district: "",
    });
  });

  it("resmî listede olmayan il için tahmin yapmaz; sokak adı il sanılmaz", () => {
    expect(normalizeLocality("Olmayan İl", "Merkez")).toEqual({ province: "", district: "" });
    expect(normalizeLocality("İstanbul Cd. No:5", "")).toEqual({ province: "", district: "" });
    expect(normalizeLocality("", "Merkez")).toEqual({ province: "", district: "" });
  });

  it("il + ilçe tek metinde geldiğinde ayırır (tek alanlı kaynaklar)", () => {
    expect(normalizeLocality("Afyonkarahisar Merkez", "")).toEqual({
      province: "Afyonkarahisar",
      district: "Merkez",
    });
    expect(normalizeLocality("Ankara Çankaya", "")).toEqual({
      province: "Ankara",
      district: "Çankaya",
    });
  });
});
