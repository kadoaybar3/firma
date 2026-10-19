import { describe, expect, it } from "vitest";
import {
  categoryFromRow,
  categoryToRow,
  citiesFromRows,
  companyFromRow,
  companyToRow,
  emptyDB,
  leadFromRow,
  leadToRow,
  paymentFromRow,
  repFromRow,
  repToRow,
  saleFromRow,
  saleToRow,
  settingsFromRow,
  syncSnapshot,
} from "./dataSource";
import type { Company, DB, Sale } from "./types";

/**
 * Supabase veri kaynağı dönüşümleri — SAF birim testler (ağ yok).
 * Kolon eşleşmeleri 0001_init.sql + 0003/0004 additive kolonlarına karşı doğrulanır.
 */

describe("dataSource satır dönüşümleri", () => {
  it("company roundtrip: camelCase ↔ snake_case", () => {
    const c: Company = {
      id: "c1",
      name: "Test Firma",
      slug: "test-firma",
      categoryId: "cat1",
      cityId: "city1",
      district: "Merkez",
      address: "Adres",
      phone: "0555",
      email: "a@b.c",
      website: "https://x.y",
      socials: { instagram: "ig" },
      description: "açıklama",
      images: ["🏠"],
      hours: { weekday: "09-18", saturday: "", sunday: "" },
      featured: true,
      published: false,
      repId: "rep1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const row = companyToRow(c);
    expect(row).toMatchObject({
      category_id: "cat1",
      city_id: "city1",
      sales_rep_id: "rep1",
      featured: true,
      published: false,
    });
    const back = companyFromRow(row as Record<string, unknown>);
    expect(back).toEqual(c);
  });

  it("company null alanları → string fallback", () => {
    const back = companyFromRow({
      id: "c2",
      name: "X",
      slug: "x",
      category_id: "k",
      city_id: "sehir",
      district: null,
      address: null,
      phone: null,
      email: null,
      website: null,
      socials: null,
      description: null,
      images: null,
      hours: null,
      created_at: null,
      updated_at: null,
    });
    expect(back.district).toBe("");
    expect(back.email).toBeUndefined();
    expect(back.images).toEqual(["🏢"]);
    expect(back.hours).toEqual({ weekday: "", saturday: "", sunday: "" });
  });

  it("lead status/source güvenli parçalama", () => {
    const l = leadFromRow({
      id: "l1",
      sales_rep_id: null,
      company_name: "Aday A",
      status: "geçersiz-değer",
      source: "web",
      visit_count: 3,
    });
    expect(l.status).toBe("yeni");
    expect(l.source).toBe("web");
    expect(l.visitCount).toBe(3);
  });

  it("lead roundtrip", () => {
    const l = leadToRow({
      id: "l2",
      repId: "rep9",
      companyName: "A",
      categoryId: undefined,
      cityId: undefined,
      district: undefined,
      phone: undefined,
      note: "",
      status: "irtibat",
      visitCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      source: "sahada",
    });
    expect(l.sales_rep_id).toBe("rep9");
    expect(l.category_id).toBeNull();
    expect(leadFromRow(l as Record<string, unknown>).categoryId).toBeUndefined();
  });

  it("cities + city_districts → City[] birleştirme", () => {
    const cities = citiesFromRows(
      [
        { id: "c1", name: "Afyonkarahisar", slug: "afyonkarahisar" },
        { id: "c2", name: "İstanbul", slug: "istanbul" },
      ],
      [
        { city_id: "c1", district: "Merkez" },
        { city_id: "c1", district: "Sandıklı" },
      ],
    );
    expect(cities[0].districts).toEqual(["Merkez", "Sandıklı"]);
    expect(cities[1].districts).toEqual([]);
  });

  it("rep roundtrip + unknown status", () => {
    const row = repToRow({
      id: "r1",
      name: "Ayşe",
      phone: "1",
      code: "AF-001",
      status: "aktif",
      customCommissionRate: 12.5,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row.custom_commission_rate).toBe(12.5);
    const back = repFromRow({ ...row, status: "bilinmeyen" });
    expect(back.status).toBe("aktif"); // güvenli varsayılan
  });

  it("sale status/channel güvenli parçalama", () => {
    const s = saleFromRow({
      id: "s1",
      sales_rep_id: null,
      company_id: "co1",
      channel: "yanlış",
      amount: "1000", // PostgREST numeric string dönebilir
      status: "odendi",
    });
    expect(s.channel).toBe("temsilci");
    expect(s.status).toBe("odendi");
    expect(s.amount).toBe(1000);
  });

  it("sale roundtrip", () => {
    const sale: Sale = {
      id: "s2",
      repId: null,
      companyId: "co1",
      channel: "dogrudan",
      amount: 500,
      status: "potansiyel",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const row = saleToRow(sale);
    expect(row.sales_rep_id).toBeNull();
    expect(row.referral_code).toBeNull();
    expect(saleFromRow(row as Record<string, unknown>)).toEqual(sale);
  });

  it("payment status güvenli parçalama", () => {
    const p = paymentFromRow({
      id: "p1",
      sale_id: "s1",
      amount: 100,
      provider: "stripe",
      provider_ref: "ref1",
      status: "geçersiz",
      idempotency_key: "k1",
    });
    expect(p.status).toBe("beklemede");
  });

  it("category fallback ikon", () => {
    expect(categoryFromRow({ id: "k", name: "N", slug: "n", icon: null }).icon).toBe("🏢");
  });

  it("settings: boş satır → migration varsayılanları (0001 seed değerleri)", () => {
    const s = settingsFromRow(null);
    expect(s).toMatchObject({ membershipPrice: 1000, repCommission: 600, referralReward: 100, renewalCommission: 600 });
  });
});

describe("emptyDB guard'ı", () => {
  it("tohumsuz boş DB üretir ve settings sıfırldır", () => {
    const db = emptyDB();
    expect(db.companies).toEqual([]);
    expect(db.leads).toEqual([]);
    expect(db.settings.membershipPrice).toBe(0);
    expect(db.audit).toEqual([]);
  });
});

describe("syncSnapshot ayar-değişim kuralı", () => {
  it("değerler aynıysa live'a bağlantı kurmadan çalışırlabilir (client olmadan hızlı çıkış)", async () => {
    // Supabase istemcisi olmayan ortamda syncSnapshot direkt hata fırlatır;
    // bu davranış "yanlışlıkla demo yazımı"nı bloklamanın son savunmasıdır.
    const db: DB = emptyDB();
    await expect(syncSnapshot(db, db)).rejects.toThrow(/Supabase/i);
  });
});

describe("categoryToRow", () => {
  it("roundtrip", () => {
    const cat = { id: "k1", name: "KAFE", slug: "kafe", icon: "☕" };
    expect(categoryFromRow(categoryToRow(cat) as Record<string, unknown>)).toEqual(cat);
  });
});
