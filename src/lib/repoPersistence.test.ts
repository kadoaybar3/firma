import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, DB, Lead } from "./types";
import type { CompanyDraft } from "./repo";
import { seedDB } from "../data/seed";

/**
 * Gerçek Supabase modu (isSupabaseConfigured = true) simülasyonu.
 * Amaç: yazım hatalarının sessizce yutulmadığını ve kritik işlemlerin
 * yazım tamamlanmadan "başarılı" dönmediğini kanıtlamak. Gerçek veritabanına
 * hiçbir istek gitmez; Supabase istemcisi ve senkron köprüsü taklit edilir.
 */
const h = vi.hoisted(() => ({
  flushNow: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("./dataSource", () => ({
  bindSyncBridge: vi.fn(),
  emptyDB: (): DB => ({
    categories: [],
    cities: [],
    companies: [],
    reps: [],
    leads: [],
    visits: [],
    sales: [],
    payments: [],
    memberships: [],
    commissions: [],
    referrals: [],
    settings: {
      membershipPrice: 1000,
      repCommission: 50,
      referralReward: 100,
      renewalCommission: 600,
      updatedAt: "",
    },
    audit: [],
  }),
  flushNow: h.flushNow,
  loadSnapshot: vi.fn(),
  scheduleSync: vi.fn(),
}));

vi.mock("./supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { from: h.from, rpc: h.rpc },
}));

import { approveEftPayment, convertLead, getDB, setDB, verifyPayment } from "./repo";

const admin: Actor = { userId: "admin-1", role: "admin" };

function freshDB(leadId: string): DB {
  const db = seedDB();
  const lead: Lead = {
    id: leadId,
    repId: "rep-1",
    companyName: "Persist Test Firma",
    district: "Merkez",
    phone: "0555 000 00 00",
    note: "",
    status: "yeni",
    visitCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: "sahada",
  };
  db.companies = [];
  db.sales = [];
  db.payments = [];
  db.memberships = [];
  db.leads = [lead];
  db.audit = [];
  return db;
}

const draft: CompanyDraft = {
  name: "Persist Test Firma",
  categoryId: "",
  cityId: "",
  district: "Merkez",
  address: "Test Mah., No: 9",
  phone: "0555 000 00 00",
  description: "",
};

beforeEach(() => {
  h.flushNow.mockReset();
  h.from.mockReset();
  h.rpc.mockReset();
});

describe("R1 — lead dönüşümü kalıcılığı", () => {
  it("sunucu yazımı başarısızsa sahte başarı yok: firma/satış/aday işareti geri alınır", async () => {
    setDB(freshDB("lead-fail"));
    h.flushNow.mockRejectedValue(new Error("ağ hatası"));

    await expect(convertLead("lead-fail", draft, admin)).rejects.toThrow(
      /kaydedilemedi.*ağ hatası/s,
    );

    const db = getDB();
    expect(db.companies).toHaveLength(0);
    expect(db.sales).toHaveLength(0);
    expect(db.leads[0]?.convertedToCompanyId).toBeUndefined();
  });

  it("yazım başarılıysa firma ve satış birlikte kalıcı olur", async () => {
    setDB(freshDB("lead-ok"));
    h.flushNow.mockResolvedValue(undefined);

    const company = await convertLead("lead-ok", draft, admin);

    const db = getDB();
    expect(db.companies.some((c) => c.id === company.id)).toBe(true);
    const sale = db.sales.find((s) => s.companyId === company.id);
    expect(sale).toBeDefined();
    expect(sale?.status).toBe("potansiyel");
    expect(db.leads[0]?.convertedToCompanyId).toBe(company.id);
    // Kritik işlem yazımı beklemiş olmalı (arka plan debounce'una bırakılmaz).
    expect(h.flushNow).toHaveBeenCalledTimes(1);
  });
});

describe("R2 — ödeme onayı öncesi zorunlu yazım", () => {
  it("flushNow hata verirse ödeme onayı durur; Supabase'e yazma/RPC gitmez", async () => {
    setDB(freshDB("lead-pay"));
    h.flushNow.mockRejectedValue(new Error("bağlantı koptu"));

    await expect(approveEftPayment("sale-1", admin)).rejects.toThrow(
      "Ödeme onaylanmadan öncesi bekleyen kayıtlar sunucuya yazılamadı: bağlantı koptu",
    );

    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(getDB().payments).toHaveLength(0);
  });

  it("flushNow hata verirse ödeme doğrulama da durur; RPC çağrılmaz", async () => {
    setDB(freshDB("lead-verify"));
    h.flushNow.mockRejectedValue(new Error("zaman aşımı"));

    await expect(verifyPayment("payment-1", admin)).rejects.toThrow(
      /Ödeme doğrulanmadan öncesi bekleyen kayıtlar sunucuya yazılamadı/,
    );

    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(getDB().payments).toHaveLength(0);
  });
});
