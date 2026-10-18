import { describe, expect, it } from "vitest";
import { BizError, confirmSale, createRenewalSale, confirmRenewal, applyWebhookPayment } from "./engine";
import type { Actor, DB, Settings } from "./types";

const admin: Actor = { userId: "u1", role: "admin" };
const repActor: Actor = { userId: "u9", role: "temsilci", repId: "rep-1" };

const settings: Settings = {
  membershipPrice: 1000,
  repCommission: 600,
  referralReward: 100,
  renewalCommission: 600,
  updatedAt: new Date().toISOString(),
};

function freshDB(): DB {
  return {
    categories: [],
    cities: [],
    companies: [{ id: "co-1", name: "Test", slug: "test", categoryId: "", cityId: "", district: "", address: "", phone: "", socials: {}, description: "", images: [], hours: { weekday: "", saturday: "", sunday: "" }, featured: false, published: true, createdAt: "", updatedAt: "" }] as DB["companies"],
    reps: [{ id: "rep-1", name: "Rep", phone: "", code: "AF-001", status: "aktif", createdAt: "" }],
    leads: [],
    visits: [],
    sales: [],
    payments: [],
    memberships: [],
    commissions: [],
    referrals: [{ id: "ref-1", code: "AF-1001", repId: "rep-1", createdAt: "" }],
    settings: { ...settings },
    audit: [],
  };
}

describe("Satış kesinleştirme", () => {
  it("ödeme doğrulanmamış satışı kesinleştirMEZ", () => {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 1000, status: "potansiyel", createdAt: "" });
    expect(() => confirmSale(db, "s1", admin)).toThrow(BizError);
    expect(db.commissions).toHaveLength(0);
  });

  it("ödeme doğrulanmış satış için komisyon üretir (600)", () => {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 1000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 1000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    const { membership } = confirmSale(db, "s1", admin);
    expect(membership.companyId).toBe("co-1");
    expect(membership.status).toBe("aktif");
    expect(db.commissions).toHaveLength(1);
    expect(db.commissions[0].amount).toBe(600);
    expect(db.commissions[0].type).toBe("satis");
  });

  it("aynı satıştan ikinci kez komisyon üretMEZ (idempotent)", () => {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 1000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 1000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    confirmSale(db, "s1", admin);
    expect(() => confirmSale(db, "s1", admin)).toThrow(BizError);
    expect(db.commissions).toHaveLength(1);
    expect(db.memberships).toHaveLength(1);
  });

  it("temsilci kesinleştirme yetkisine sahip DEĞİL", () => {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 1000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 1000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    expect(() => confirmSale(db, "s1", repActor)).toThrow(BizError);
  });

  it("doğrudan satışta geçerli referans kodu → 100 TL referans ödülü", () => {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: null, companyId: "co-1", channel: "dogrudan", referralCode: "AF-1001", amount: 1000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 1000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    confirmSale(db, "s1", admin);
    expect(db.commissions).toHaveLength(1);
    expect(db.commissions[0].type).toBe("referans");
    expect(db.commissions[0].amount).toBe(100);
    expect(db.commissions[0].repId).toBe("rep-1");
    // referans kodu işaretlendi
    expect(db.referrals[0].usedAt).toBeTruthy();
  });
});

describe("Üyelik yenileme", () => {
  function baseWithMembership() {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 1000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 1000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    const { membership } = confirmSale(db, "s1", admin);
    return { db, membership };
  }

  it("yenileme satışı ödemesiz kesinleşmez", () => {
    const { db, membership } = baseWithMembership();
    const renewalSale = createRenewalSale(db, membership.id, admin);
    expect(() => confirmRenewal(db, renewalSale.id, admin)).toThrow(BizError);
    expect(db.commissions).toHaveLength(1); // yalnızca ilk satışın komisyonu
  });

  it("yenileme ücreti doğrulanınca komisyon İLK temsilciye bağlanır", () => {
    const { db, membership } = baseWithMembership();
    const renewalSale = createRenewalSale(db, membership.id, admin);
    expect(renewalSale.repId).toBe("rep-1");
    db.payments.push({ id: "p2", saleId: renewalSale.id, amount: 1000, provider: "iyzico", providerRef: "r2", status: "onaylandi", idempotencyKey: "k2", createdAt: "", updatedAt: "" });
    confirmRenewal(db, renewalSale.id, admin);
    const renewalCommission = db.commissions.find((c) => c.saleId === renewalSale.id);
    expect(renewalCommission).toBeTruthy();
    expect(renewalCommission?.type).toBe("yenileme");
    expect(renewalCommission?.repId).toBe("rep-1");
    expect(renewalCommission?.amount).toBe(600);
  });

  it("aynı yenileme tekrar kesinleştirilemez", () => {
    const { db, membership } = baseWithMembership();
    const renewalSale = createRenewalSale(db, membership.id, admin);
    db.payments.push({ id: "p2", saleId: renewalSale.id, amount: 1000, provider: "iyzico", providerRef: "r2", status: "onaylandi", idempotencyKey: "k2", createdAt: "", updatedAt: "" });
    confirmRenewal(db, renewalSale.id, admin);
    expect(() => confirmRenewal(db, renewalSale.id, admin)).toThrow(BizError);
    expect(db.commissions.filter((c) => c.type === "yenileme")).toHaveLength(1);
  });
});

describe("Webhook idempotency", () => {
  it("aynı providerRef ile tekrar bildirim ikinci kayıt OLUŞTURMAZ", () => {
    const db = freshDB();
    const first = applyWebhookPayment(db, "s1", 1000, "iyzico", "CHIP-1", "onaylandi", "k-1");
    const second = applyWebhookPayment(db, "s1", 1000, "iyzico", "CHIP-1", "onaylandi", "k-1");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(db.payments).toHaveLength(1);
  });
});
