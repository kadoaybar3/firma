import { describe, expect, it } from "vitest";
import { mapLink } from "./hours";

describe("mapLink — yol tarifi hedefi", () => {
  it("koordinat varsa doğrudan koordinatı kullanır", () => {
    expect(
      mapLink({
        name: "Firma",
        address: "Yanlış adres",
        district: "Merkez",
        province: "Afyonkarahisar",
        latitude: 38.754321,
        longitude: 30.52,
      }),
    ).toBe("https://www.google.com/maps/dir/?api=1&destination=38.754321,30.52");
  });

  it("koordinat yoksa adresi kullanır", () => {
    const link = mapLink({ name: "Firma", address: "Marulcu Mah., No:45" });
    expect(link).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Marulcu%20Mah.%2C%20No%3A45",
    );
  });

  it("adreste eksik ilçe/ili tamamlar", () => {
    const link = mapLink({
      name: "Firma",
      address: "Marulcu Mah., No:45",
      district: "Merkez",
      province: "Afyonkarahisar",
    });
    expect(link).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Marulcu%20Mah.%2C%20No%3A45%2C%20Merkez%2C%20Afyonkarahisar",
    );
  });

  it("adres yoksa ad + ilçe + il aramasına düşer", () => {
    const link = mapLink({
      name: "Firma",
      district: "Merkez",
      province: "Afyonkarahisar",
    });
    expect(link).toBe(
      "https://www.google.com/maps/search/?api=1&query=Firma%2C%20Merkez%2C%20Afyonkarahisar",
    );
  });

  it("adres ve konum yoksa bağlantı üretmez", () => {
    expect(mapLink({ name: "Firma" })).toBeNull();
  });

  it("geçersiz koordinatı yok sayıp adrese döner", () => {
    expect(
      mapLink({ name: "Firma", address: "Adres", latitude: 999, longitude: 30 }),
    ).toBe("https://www.google.com/maps/dir/?api=1&destination=Adres");
  });
});
