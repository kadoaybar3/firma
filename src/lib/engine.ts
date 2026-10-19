import type {
  Actor,
  AuditEntry,
  Commission,
  DB,
  Membership,
  Payment,
  Sale,
  Settings,
} from "./types";
import { isSupabaseConfigured } from "./supabase";

/**
 * Saf iş kuralları motoru. Veritabanına bağımlı DEĞİL; db nesnesi üzerinde çalışan
 * ve denetim kaydı üreten fonksiyonlardır. Test edilebilirlik için fiziksel
 * kaydetme (localStorage/Supabase) repo katmanına bırakılır.
 */

export const nowISO = (): string => new Date().toISOString();
export const uid = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function addOneYear(iso: string): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

export function log(
  db: DB,
  actor: Actor,
  action: string,
  summary: string,
  detail: unknown,
): void {
  // Supabase modunda denetim kaydı istemciden YAZILMAZ: 0002, log_audit
  // EXECUTE hakkını yalnızca service_role'a bıraktı ve audit_log tablosunda
  // istemciye INSERT izni vermez. Denetim kayıtları sunucu tarafındaki
  // SECURITY DEFINER işlem zincirinden doğar (confirm_sale vb.).
  if (isSupabaseConfigured) return;
  const entry: AuditEntry = {
    id: uid(),
    at: nowISO(),
    actorId: actor.userId,
    actorRole: actor.role,
    action,
    summary,
    detail: JSON.stringify(detail),
  };
  db.audit.unshift(entry);
  // Kayıt defteri sınırsız büyümesin
  if (db.audit.length > 500) db.audit.length = 500;
}

export class BizError extends Error {}

function requireAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new BizError("Bu işlem yalnızca yönetici tarafından yapılabilir.");
}

function assertSaleConfirmable(db: DB, sale: Sale, settings: Settings): void {
  if (sale.status === "iptal") throw new BizError("İptal edilmiş satış kesinleştirilemez.");
  if (sale.status === "odendi") throw new BizError("Bu satış zaten kesinleştirildi.");
  // KURAL: Gerçekleşmemiş/doğrulanmamış satış için komisyon üretilmez.
  const paid = db.payments.some((p) => p.saleId === sale.id && p.status === "onaylandi");
  if (!paid)
    throw new BizError(
      "Ödeme doğrulanmadan satış kesinleştirilemez. Önce ödeme kaydını doğrulamalısınız.",
    );
  void settings;
}

function hasCommissionForSale(db: DB, saleId: string): boolean {
  return db.commissions.some((c) => c.saleId === saleId);
}

/** Aynı satıştan birden fazla komisyon üretilmesini kesin olarak engeller. */
function assertNoCommission(db: DB, saleId: string): void {
  if (hasCommissionForSale(db, saleId))
    throw new BizError("Bu satış için komisyon zaten oluşturuldu (mükerrer engel).");
}

/**
 * Satışı kesinleştirir:
 *  - Ödeme doğrulaması zorunludur.
 *  - Aktif üyelik oluşturulur (1 yıl).
 *  - Kanala göre tek seferlik komisyon üretilir:
 *      · temsilci satışı → satis komisyonu
 *      · doğrudan satış + geçerli referans kodu → referans ödülü
 */
export function confirmSale(
  db: DB,
  saleId: string,
  actor: Actor,
): { membership: Membership } {
  requireAdmin(actor);

  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new BizError("Satış bulunamadı.");
  assertSaleConfirmable(db, sale, db.settings);
  assertNoCommission(db, sale.id);

  // Mükerrer aktif üyelik engeli
  if (db.memberships.some((m) => m.saleId === sale.id && m.status !== "iptal"))
    throw new BizError("Bu satış için üyelik zaten oluşturuldu.");

  const startsAt = nowISO();
  const membership: Membership = {
    id: uid(),
    companyId: sale.companyId,
    saleId: sale.id,
    startsAt,
    endsAt: addOneYear(startsAt),
    status: "aktif",
  };
  db.memberships.push(membership);

  sale.status = "odendi";
  sale.confirmedAt = startsAt;

  const s = db.settings;
  if (sale.channel === "temsilci" && sale.repId) {
    const rep = db.reps.find((r) => r.id === sale.repId);
    if (!rep) throw new BizError("Temsilci bulunamadı.");
    // Özel oran tanımlıysa yüzdesel hesap; aksi halde genel tutar
    const amount =
      rep.customCommissionRate != null
        ? Math.round((sale.amount * rep.customCommissionRate) / 100)
        : s.repCommission;
    const commission: Commission = {
      id: uid(),
      saleId: sale.id,
      repId: rep.id,
      type: "satis",
      amount,
      status: "beklemede",
      createdAt: startsAt,
    };
    db.commissions.push(commission);
    log(db, actor, "komisyon_uretildi", `${rep.name} için satış komisyonu üretildi`, {
      saleId: sale.id,
      repId: rep.id,
      amount,
    });
  } else if (sale.channel === "dogrudan" && sale.referralCode) {
    const referral = db.referrals.find(
      (r) => r.code === sale.referralCode && !r.usedAt,
    );
    if (referral) {
      referral.usedAt = startsAt;
      referral.saleId = sale.id;
      const commission: Commission = {
        id: uid(),
        saleId: sale.id,
        repId: referral.repId,
        type: "referans",
        amount: s.referralReward,
        status: "beklemede",
        createdAt: startsAt,
      };
      db.commissions.push(commission);
      log(db, actor, "komisyon_uretildi", `Referans ödülü üretildi (${referral.code})`, {
        saleId: sale.id,
        repId: referral.repId,
        amount: s.referralReward,
      });
    }
  }

  log(db, actor, "satis_kesinlesti", `Satış kesinleştirildi (üyelik başladı)`, {
    saleId: sale.id,
    membershipId: membership.id,
  });
  return { membership };
}

/** Bir üyeliğin ilk satışında kazanç elde eden temsilciyi bulur (yenileme yönlendirme için). */
export function originalRepOfMembership(db: DB, membershipId: string): string | null {
  const membership = db.memberships.find((m) => m.id === membershipId);
  if (!membership) return null;
  const originalSale = db.sales.find((s) => s.id === membership.saleId);
  if (originalSale?.repId) return originalSale.repId;
  const referralCommission = db.commissions.find(
    (c) => c.saleId === membership.saleId && (c.type === "referans" || c.type === "satis"),
  );
  return referralCommission?.repId ?? null;
}

/** Yenileme için potansiyel satış kaydı açar (ödeme sonrası kesinleşir). */
export function createRenewalSale(
  db: DB,
  membershipId: string,
  actor: Actor,
): Sale {
  requireAdmin(actor);
  const membership = db.memberships.find((m) => m.id === membershipId);
  if (!membership) throw new BizError("Üyelik bulunamadı.");
  if (db.sales.some((s) => s.renewalForMembershipId === membershipId && s.status !== "iptal"))
    throw new BizError("Bu üyelik için bekleyen yenileme satışı zaten var.");

  const renewalRep = originalRepOfMembership(db, membershipId);
  const sale: Sale = {
    id: uid(),
    repId: renewalRep,
    companyId: membership.companyId,
    channel: "temsilci",
    amount: db.settings.membershipPrice,
    status: "potansiyel",
    createdAt: nowISO(),
    renewalForMembershipId: membershipId,
  };
  db.sales.push(sale);
  log(db, actor, "yenileme_baslatti", `Üyelik yenileme süreci başlatıldı`, {
    membershipId,
    saleId: sale.id,
    temsilciyeBaglanacak: renewalRep,
  });
  return sale;
}

/**
 * Üyelik yenileme kesinleştirmesi:
 *  - Yenileme satışının ödemesi doğrulanmış olmalı.
 *  - KURAL: Yenileme komisyonu, üyeliği ilk kazandıran temsilciye otomatik bağlanır.
 *  - Kayıt benzersizdir (mükerrer engel).
 */
export function confirmRenewal(
  db: DB,
  saleId: string,
  actor: Actor,
): Membership | undefined {
  requireAdmin(actor);

  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new BizError("Satış bulunamadı.");
  if (!sale.renewalForMembershipId) throw new BizError("Bu satış bir yenileme satışı değil.");
  assertSaleConfirmable(db, sale, db.settings);
  assertNoCommission(db, sale.id);

  const membership = db.memberships.find((m) => m.id === sale.renewalForMembershipId);
  if (!membership) throw new BizError("Üyelik bulunamadı.");

  sale.status = "odendi";
  sale.confirmedAt = nowISO();
  membership.endsAt = addOneYear(membership.endsAt);
  membership.status = "aktif";

  const repId = sale.repId ?? originalRepOfMembership(db, membership.id);
  if (repId) {
    const commission: Commission = {
      id: uid(),
      saleId: sale.id,
      repId,
      type: "yenileme",
      amount: db.settings.renewalCommission,
      status: "beklemede",
      createdAt: membership.endsAt,
    };
    db.commissions.push(commission);
    log(db, actor, "komisyon_uretildi", `Yenileme komisyonu ilk satışı yapan temsilciye bağlandı`, {
      saleId: sale.id,
      repId,
      amount: db.settings.renewalCommission,
    });
  }

  log(db, actor, "uyelik_yenilendi", `Üyelik yenilendi`, {
    saleId: sale.id,
    membershipId: membership.id,
    yeniBitis: membership.endsAt,
  });
  return membership;
}

/**
 * Ödeme doğrulama (manuel — sağlayıcı entegrasyonu yokken). Yalnızca admin.
 * Gerçek entegrasyonda bu adım webhook ile sunucu tarafında otomatik yapılır.
 */
export function verifyPayment(
  db: DB,
  paymentId: string,
  actor: Actor,
): Payment {
  requireAdmin(actor);
  const payment = db.payments.find((p) => p.id === paymentId);
  if (!payment) throw new BizError("Ödeme kaydı bulunamadı.");
  if (payment.status === "onaylandi") throw new BizError("Ödeme zaten doğrulanmış.");
  payment.status = "onaylandi";
  payment.updatedAt = nowISO();
  log(db, actor, "odeme_dogrulandi", `Ödeme manuel doğrulandı (demo)`, {
    paymentId: payment.id,
    saleId: payment.saleId,
    not: "Sağlayıcı entegrasyonu yapılandırılmadı; doğrulama yönetici tarafından manuel yapıldı.",
  });
  return payment;
}

/**
 * Sağlayıcı webhook kaydını idempotent işler.
 * Aynı providerRef ile gelen tekrar bildirim ikinci bir kayıt üretmez.
 */
export function applyWebhookPayment(
  db: DB,
  saleId: string,
  amount: number,
  provider: string,
  providerRef: string,
  status: Payment["status"],
  idempotencyKey: string,
): { created: boolean; payment: Payment } {
  const existing = db.payments.find(
    (p) =>
      p.providerRef === providerRef ||
      (idempotencyKey && p.idempotencyKey === idempotencyKey),
  );
  if (existing) {
    // Mükerrer bildirim: sadece durumu ilerletebilir
    if (existing.status !== status) {
      existing.status = status;
      existing.updatedAt = nowISO();
    }
    return { created: false, payment: existing };
  }
  const payment: Payment = {
    id: uid(),
    saleId,
    amount,
    provider,
    providerRef,
    status,
    idempotencyKey,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.payments.push(payment);
  return { created: true, payment };
}
