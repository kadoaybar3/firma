import { describe, expect, it } from "vitest";
import type { Actor } from "../lib/types";
import { checkDuplicate } from "./duplicate";

/**
 * Mükerrer kontrol yalnız bilgilendirme amaçlıdır: eşleşme ad/lar döner,
 * kontrol hatası asla throw etmez ve sonuç kayıt akışını engellemez.
 * Test ortamı demo moddadır (isSupabaseConfigured = false).
 */
const rep: Actor = { userId: "user-1", role: "temsilci", repId: "rep-1" };

describe("checkDuplicate (demo mod)", () => {
  it("büyük/küçük harf ve Türkçe karakter farkıyla eşleşir", async () => {
    const result = await checkDuplicate("ÇAY PAZAR ECZANESİ", rep);
    expect(result.status).toBe("exists");
    expect(result.matches.some((m) => m.kind === "firma" && m.name === "Çay Pazar Eczanesi")).toBe(
      true,
    );
  });

  it("noktalama ve büyük harf kombinasyonuyla eşleşir", async () => {
    // "Şuhut..." → normalize "suhut..."; ham yazım "suhut" i ile sorgulanır.
    const result = await checkDuplicate("suhut kiraz pazarlama kooperatifi!", rep);
    expect(result.status).toBe("exists");
    expect(result.matches[0]?.name).toBe("Şuhut Kiraz Pazarlama Kooperatifi");
  });

  it("isim benzerliğinde (içerir) eşleşir", async () => {
    const result = await checkDuplicate("Çay Pazar Eczanesi Afyon Şubesi", rep);
    expect(result.status).toBe("exists");
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("farklı bir isimde eşleşme bulamaz", async () => {
    const result = await checkDuplicate("Tamamen Farklı Bir İşletme Adı", rep);
    expect(result.status).toBe("none");
    expect(result.matches).toEqual([]);
  });

  it("aday (lead) kaydını da kontrol eder", async () => {
    const result = await checkDuplicate("Esentepe Pastanesi", rep);
    expect(result.status).toBe("exists");
    expect(result.matches.some((m) => m.kind === "aday")).toBe(true);
  });

  it("çok kısa isimde sorgulamaz", async () => {
    const result = await checkDuplicate("A", rep);
    expect(result.status).toBe("none");
  });

  it("asla throw etmez (kontrol hatası akışı kilitlemez)", async () => {
    await expect(checkDuplicate("X".repeat(500), rep)).resolves.toHaveProperty("status");
  });
});
