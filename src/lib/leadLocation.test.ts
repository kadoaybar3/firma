import { describe, expect, it } from "vitest";
import { encodeLeadNote, parseLeadNote } from "./leadLocation";

describe("leadLocation not işareti", () => {
  it("adres + koordinatı nota yazar ve geri okur", () => {
    const encoded = encodeLeadNote("Yetkili: Ayşe", {
      address: "Marulcu Mah., Kurtuluş Cd., No:45, Merkez, Afyonkarahisar",
      latitude: 38.754321,
      longitude: 30.52,
    });
    expect(encoded).toContain("[FR-KONUM v1]");
    expect(encoded.startsWith("Yetkili: Ayşe")).toBe(true);

    const parsed = parseLeadNote(encoded);
    expect(parsed.note).toBe("Yetkili: Ayşe");
    expect(parsed.address).toBe("Marulcu Mah., Kurtuluş Cd., No:45, Merkez, Afyonkarahisar");
    expect(parsed.latitude).toBe(38.754321);
    expect(parsed.longitude).toBe(30.52);
  });

  it("işaretsiz notu olduğu gibi döndürür", () => {
    expect(parseLeadNote("Sadece not")).toEqual({ note: "Sadece not" });
  });

  it("eski işareti yenisiyle değiştirir (mükerrer satır oluşmaz)", () => {
    const first = encodeLeadNote("Not", { address: "Eski adres", latitude: 38.1, longitude: 30.2 });
    const second = encodeLeadNote(first, { address: "Yeni adres", latitude: 39.1, longitude: 31.2 });
    expect(second.split("[FR-KONUM v1]")).toHaveLength(2);
    expect(parseLeadNote(second).address).toBe("Yeni adres");
    expect(parseLeadNote(second).latitude).toBe(39.1);
  });

  it("aralık dışı koordinatı yok sayar", () => {
    const encoded = encodeLeadNote("", { address: "Adres", latitude: 120, longitude: 30 });
    const parsed = parseLeadNote(encoded);
    expect(parsed.address).toBe("Adres");
    expect(parsed.latitude).toBeUndefined();
    expect(parsed.longitude).toBeUndefined();
  });

  it("adres ve koordinat yoksa notu değiştirmez", () => {
    expect(encodeLeadNote("  Not  ", {})).toBe("Not");
  });

  it("bozuk JSON işaretini yok sayar", () => {
    const parsed = parseLeadNote('Not\n\n[FR-KONUM v1] {bozuk}');
    expect(parsed.note).toContain("Not");
  });
});
