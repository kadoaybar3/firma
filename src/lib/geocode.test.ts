import { describe, expect, it } from "vitest";
import {
  buildGeocodeQueries,
  buildGeocodeQuery,
  isGeocodeReady,
  normalizeGeocodeQuery,
} from "./geocode";

describe("geocode sorgu kurulumu", () => {
  it("adres zaten ilçe/ili içeriyorsa tekrar eklemez", () => {
    expect(
      buildGeocodeQuery({
        address: "Marulcu Mah., Kurtuluş Cd., No:45, Merkez, Afyonkarahisar",
        district: "Merkez",
        province: "Afyonkarahisar",
      }),
    ).toBe("Marulcu, Kurtuluş Caddesi, No:45, Merkez, Afyonkarahisar");
  });

  it("eksik ilçe/ili adrese ekler", () => {
    expect(
      buildGeocodeQuery({
        address: "Veysel Karani Mah., 1139. Sk., No:57/A",
        district: "Merkez",
        province: "Afyonkarahisar",
      }),
    ).toBe("Veysel Karani, 1139. Sokak, No:57/A, Merkez, Afyonkarahisar");
  });

  it("Nominatim'in çözmediği kısaltmaları açar", () => {
    expect(
      buildGeocodeQuery({
        address: "Atatürk Bul., Merkez, Afyonkarahisar",
        district: "Merkez",
        province: "Afyonkarahisar",
      }),
    ).toBe("Atatürk Bulvarı, Merkez, Afyonkarahisar");
  });

  it("tam adres bulunamazsa cadde ve mahalle yedeklerini üretir", () => {
    expect(
      buildGeocodeQueries({
        address: "Marulcu Mah., Kurtuluş Cd., No:45, Merkez, Afyonkarahisar",
        district: "Merkez",
        province: "Afyonkarahisar",
      }),
    ).toEqual([
      "Marulcu, Kurtuluş Caddesi, No:45, Merkez, Afyonkarahisar",
      "Kurtuluş Caddesi, Merkez, Afyonkarahisar",
      "Marulcu, Merkez, Afyonkarahisar",
    ]);
  });

  it("Türkçe karakterlerde anahtar sadeleştirir", () => {
    expect(normalizeGeocodeQuery("  İSTANBUL  Kadıköy ")).toBe("istanbul kadikoy");
  });
});

describe("isGeocodeReady", () => {
  it("yalnız ilçe + il varsa otomatik arama yapmaz", () => {
    expect(isGeocodeReady({ address: "Merkez, Afyonkarahisar", district: "Merkez", province: "Afyonkarahisar" })).toBe(false);
  });

  it("mahalle/cadde düzeyinde adres varsa hazırdır", () => {
    expect(
      isGeocodeReady({
        address: "Marulcu Mah., Kurtuluş Cd., No:45, Merkez, Afyonkarahisar",
        district: "Merkez",
        province: "Afyonkarahisar",
      }),
    ).toBe(true);
  });

  it("il yoksa hazır değildir", () => {
    expect(isGeocodeReady({ address: "Marulcu Mah. Kurtuluş Cd. No:45" })).toBe(false);
  });

  it("çok kısa adres hazır değildir", () => {
    expect(isGeocodeReady({ address: "Sk 5", province: "Afyonkarahisar" })).toBe(false);
  });
});
