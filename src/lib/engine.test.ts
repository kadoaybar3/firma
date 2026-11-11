import { describe, expect, it } from "vitest";
import {
  BizError,
  approveEftPayment,
  confirmSale,
  createRenewalSale,
  confirmRenewal,
  applyWebhookPayment,
  openPendingPayment,
  rejectPendingPayment,
  verifyPayment,
} from "./engine";
import type { Actor, DB, Settings } from "./types";

const admin: Actor = { userId: "u1", role: "admin" };
const repActor: Actor = { userId: "u9", role: "temsilci", repId: "rep-1" };

const settings: Settings = {
  membershipPrice: 1000,
  repCommission: 50,
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

  it("ödeme doğrulanmış satış için komisyon üretir (%50 = 500)", () => {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 1000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 1000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    const { membership } = confirmSale(db, "s1", admin);
    expect(membership.companyId).toBe("co-1");
    expect(membership.status).toBe("aktif");
    expect(db.commissions).toHaveLength(1);
    expect(db.commissions[0].amount).toBe(500);
    expect(db.commissions[0].type).toBe("satis");
  });

  it("öne çıkan paket (2.000) komisyonu %50 = 1.000", () => {
    const db = freshDB();
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 2000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 2000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    confirmSale(db, "s1", admin);
    expect(db.commissions).toHaveLength(1);
    expect(db.commissions[0].amount).toBe(1000);
    // Oran her iki pakette de %50
    expect(db.commissions[0].amount / db.sales[0].amount).toBe(0.5);
  });

  it("temsilciye özel oran, genel oranı geçersiz kılar", () => {
    const db = freshDB();
    db.reps[0].customCommissionRate = 25;
    db.sales.push({ id: "s1", repId: "rep-1", companyId: "co-1", channel: "temsilci", amount: 2000, status: "potansiyel", createdAt: "" });
    db.payments.push({ id: "p1", saleId: "s1", amount: 2000, provider: "iyzico", providerRef: "r1", status: "onaylandi", idempotencyKey: "k1", createdAt: "", updatedAt: "" });
    confirmSale(db, "s1", admin);
    expect(db.commissions[0].amount).toBe(500);
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

describe("EFT / manuel ödeme akışı", () => {
  function baseWithSale() {
    const db = freshDB();
    db.sales.push({
      id: "s1",
      repId: "rep-1",
      companyId: "co-1",
      channel: "temsilci",
      amount: 1000,
      status: "potansiyel",
      createdAt: "",
    });
    return db;
  }

  it("aynı satış için ikinci kez ödeme kaydı açmaz (idempotent)", () => {
    const db = baseWithSale();
    const first = openPendingPayment(db, "s1", admin);
    const second = openPendingPayment(db, "s1", admin);
    expect(second.id).toBe(first.id);
    expect(db.payments).toHaveLength(1);
    // Referans tam satış kimliğinden türetilir; kısaltılmış önek çakışması yok.
    expect(first.providerRef).toBe("PENDING-s1");
    expect(first.idempotencyKey).toBe(first.providerRef);
  });

  it("EFT onayı ödemeyi, satışı, üyeliği ve tek komisyonu birlikte oluşturur", () => {
    const db = baseWithSale();
    openPendingPayment(db, "s1", admin);
    const payment = approveEftPayment(db, "s1", admin);
    expect(payment.status).toBe("onaylandi");
    expect(payment.provider).toBe("eft");
    expect(db.sales[0].status).toBe("odendi");
    expect(db.memberships).toHaveLength(1);
    expect(db.commissions).toHaveLength(1);
    expect(db.commissions[0].amount).toBe(500);
  });

  it("aynı ödeme ikinci kez onaylanamaz; komisyon/üyelik artmaz", () => {
    const db = baseWithSale();
    openPendingPayment(db, "s1", admin);
    approveEftPayment(db, "s1", admin);
    expect(() => approveEftPayment(db, "s1", admin)).toThrow(BizError);
    expect(db.payments.filter((p) => p.status === "onaylandi")).toHaveLength(1);
    expect(db.memberships).toHaveLength(1);
    expect(db.commissions).toHaveLength(1);
  });

  it("reddedilen ödeme tahsil edilmiş sayılmaz; satış potansiyel kalır", () => {
    const db = baseWithSale();
    const pending = openPendingPayment(db, "s1", admin);
    const rejected = rejectPendingPayment(db, "s1", admin);
    expect(rejected).toHaveLength(1);
    expect(pending.status).toBe("hata");
    expect(db.sales[0].status).toBe("potansiyel");
    expect(db.memberships).toHaveLength(0);
    expect(db.commissions).toHaveLength(0);
  });

  it("reddedilen ödemeden sonra yeni kayıt açılabilir ve onaylanabilir", () => {
    const db = baseWithSale();
    const first = openPendingPayment(db, "s1", admin);
    rejectPendingPayment(db, "s1", admin);
    const second = openPendingPayment(db, "s1", admin);
    expect(second.id).not.toBe(first.id);
    // UNIQUE provider_ref çakışmasını önlemek için sonek üretilir.
    expect(second.providerRef).not.toBe(first.providerRef);
    expect(db.payments).toHaveLength(2);
    approveEftPayment(db, "s1", admin);
    expect(db.sales[0].status).toBe("odendi");
    expect(db.commissions).toHaveLength(1);
  });

  it("temsilci ödeme kaydı açamaz ve EFT onayı veremez", () => {
    const db = baseWithSale();
    expect(() => openPendingPayment(db, "s1", repActor)).toThrow(BizError);
    const pending = openPendingPayment(db, "s1", admin);
    expect(() => approveEftPayment(db, "s1", repActor)).toThrow(BizError);
    expect(pending.status).toBe("beklemede");
    expect(db.sales[0].status).toBe("potansiyel");
  });

  it("kart ödemesi bekleyen satışa EFT onayı verilemez", () => {
    const db = baseWithSale();
    db.payments.push({
      id: "p-card",
      saleId: "s1",
      amount: 1000,
      provider: "iyzico",
      providerRef: "CHIP-1",
      status: "beklemede",
      idempotencyKey: "CHIP-1",
      createdAt: "",
      updatedAt: "",
    });
    expect(() => approveEftPayment(db, "s1", admin)).toThrow(BizError);
    expect(db.payments[0].status).toBe("beklemede");
    expect(db.commissions).toHaveLength(0);
  });

  it("kart ödemesi manuel doğrulanamaz; sağlayıcı doğrulaması gerekir", () => {
    const db = baseWithSale();
    db.payments.push({
      id: "p-card",
      saleId: "s1",
      amount: 1000,
      provider: "iyzico",
      providerRef: "CHIP-1",
      status: "beklemede",
      idempotencyKey: "CHIP-1",
      createdAt: "",
      updatedAt: "",
    });
    expect(() => verifyPayment(db, "p-card", admin)).toThrow(BizError);
    expect(db.payments[0].status).toBe("beklemede");
  });

  it("iptal edilmiş satışın ödemesi onaylanamaz", () => {
    const db = baseWithSale();
    db.sales[0].status = "iptal";
    expect(() => approveEftPayment(db, "s1", admin)).toThrow(BizError);
    expect(db.commissions).toHaveLength(0);
  });
});
