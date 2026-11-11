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
    // Komisyon = gerçek satış tutarı × oran (%). Özel oran varsa o, yoksa genel oran.
    const rate = rep.customCommissionRate ?? s.repCommission;
    const amount = Math.round((sale.amount * rate) / 100);
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
 *
 * Güvenlik kuralları:
 *  - Yalnızca "beklemede" durumundaki kayıt doğrulanabilir. Başarısız (hata)
 *    veya iade edilmiş bir kayıt sonradan "tahsil edildi" yapılamaz.
 *  - İptal edilmiş satışın ödemesi doğrulanamaz.
 *  - Aynı ödeme ikinci kez doğrulanamaz (mükerrer engel).
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
  if (payment.status !== "beklemede")
    throw new BizError("Yalnızca beklemedeki ödeme doğrulanabilir; yeni bir ödeme kaydı açın.");
  if (payment.provider !== "hicbiri" && payment.provider !== "eft")
    throw new BizError(
      "Kart ödemesi yalnızca sağlayıcı doğrulamasıyla tamamlanabilir; manuel onay verilemez.",
    );

  const sale = db.sales.find((s) => s.id === payment.saleId);
  if (sale?.status === "iptal") throw new BizError("İptal edilmiş satışın ödemesi doğrulanamaz.");
  if (sale?.status === "odendi") throw new BizError("Satış zaten kesinleştirilmiş.");

  payment.status = "onaylandi";
  payment.updatedAt = nowISO();
  log(db, actor, "odeme_dogrulandi", `Ödeme manuel doğrulandı (demo)`, {
    paymentId: payment.id,
    saleId: payment.saleId,
    not: "Sağlayıcı entegrasyonu yapılandırılmadı; doğrulama yönetici tarafından manuel yapıldı.",
  });
  return payment;
}

/* ---------------------------------------------------------
   ÖDEME KAYDI AÇMA / EFT ONAYI (idempotent)
   --------------------------------------------------------- */

/** Bir satış için hâlâ geçerli (bekleyen veya onaylı) ödeme kaydı. */
function activePaymentForSale(db: DB, saleId: string): Payment | undefined {
  return db.payments.find(
    (p) => p.saleId === saleId && (p.status === "beklemede" || p.status === "onaylandi"),
  );
}

/**
 * provider_ref ve idempotency_key SUNUCUDA UNIQUE'tir. Aynı anahtarın ikinci
 * kez üretilmesi "duplicate key" hatasının kaynağıdır; bu yardımcı, çakışma
 * varsa sonuna sıra numarası ekleyerek her denemeyi ayrıştırır.
 */
function uniquePaymentKey(db: DB, base: string): string {
  let key = base;
  let i = 2;
  while (db.payments.some((p) => p.providerRef === key || p.idempotencyKey === key)) {
    key = `${base}-${i++}`;
  }
  return key;
}

/**
 * Satış için BEKLEMEDE ödeme kaydı açar (admin).
 *
 * Idempotent: satışın zaten bekleyen/onaylı bir ödemesi varsa YENİ kayıt
 * üretilmez, mevcut kayıt döner. Böylece çift tıklama veya sayfa yenileme
 * mükerrer `provider_ref` üretmez. Yalnızca reddedilmiş/başarısız (hata) ya
 * da iade edilmiş ödemelerden sonra yeni bir deneme kaydı açılır.
 */
export function openPendingPayment(db: DB, saleId: string, actor: Actor): Payment {
  requireAdmin(actor);
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new BizError("Satış bulunamadı.");
  if (sale.status === "iptal") throw new BizError("İptal edilmiş satışa ödeme kaydı açılamaz.");
  if (sale.status === "odendi") throw new BizError("Satış zaten kesinleştirilmiş.");

  const existing = activePaymentForSale(db, saleId);
  if (existing) return existing;

  const key = uniquePaymentKey(db, `PENDING-${sale.id}`);
  const payment: Payment = {
    id: uid(),
    saleId,
    amount: sale.amount,
    provider: "hicbiri",
    providerRef: key,
    status: "beklemede",
    idempotencyKey: key,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.payments.push(payment);
  log(db, actor, "odeme_kaydi_acildi", `Beklemede ödeme kaydı açıldı`, {
    saleId,
    paymentId: payment.id,
    providerRef: payment.providerRef,
  });
  return payment;
}

/**
 * EFT tahsilatını onaylar ve satışı tek adımda kesinleştirir (admin).
 *
 * Akış:
 *  1. Satış "potansiyel" olmalı; onaylanmış ödeme varsa yalnızca eksik
 *     kesinleştirme tamamlanır (kendi kendini onaran idempotent davranış).
 *  2. Bekleyen EFT/manuel ödeme varsa yeniden kullanılır; yoksa yeni EFT
 *     kaydı üretilir (referans `EFT-<satış-id>`).
 *  3. Ödeme "onaylandi" işaretlenir, ardından satış kesinleştirilir
 *     (üyelik + komisyon). Hata olursa bellek durumu geri alınır.
 *
 * Aynı satışın ikinci kez onaylanması komisyon/üyelik mükerrerliği
 * üretmez; `confirmSale`/`confirmRenewal` motoru bunu engeller.
 */
export function approveEftPayment(db: DB, saleId: string, actor: Actor): Payment {
  requireAdmin(actor);
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new BizError("Satış bulunamadı.");
  if (sale.status === "iptal") throw new BizError("İptal edilmiş satışın ödemesi onaylanamaz.");
  if (sale.status === "odendi") throw new BizError("Bu satış zaten kesinleştirildi.");

  const approved = db.payments.find((p) => p.saleId === saleId && p.status === "onaylandi");
  if (approved) {
    // Ödeme daha önce doğrulanmış ama kesinleştirme yarıda kalmış olabilir.
    try {
      if (sale.renewalForMembershipId) confirmRenewal(db, saleId, actor);
      else confirmSale(db, saleId, actor);
    } catch (err) {
      throw new BizError(err instanceof Error ? err.message : "Satış kesinleştirilemedi.");
    }
    return approved;
  }

  const pending = db.payments.find((p) => p.saleId === saleId && p.status === "beklemede");
  if (pending && pending.provider !== "hicbiri" && pending.provider !== "eft")
    throw new BizError(
      "Bu satışta kart ödeme kaydı bekliyor. Kart ödemesi sağlayıcı doğrulamasıyla tamamlanmalı; EFT onayı verilemez.",
    );

  // İşlem yarıda kalırsa bellekteki durumu geri alabilmek için anlık görüntü.
  const before = JSON.parse(
    JSON.stringify({
      sales: db.sales,
      payments: db.payments,
      memberships: db.memberships,
      commissions: db.commissions,
      referrals: db.referrals,
    }),
  ) as Pick<DB, "sales" | "payments" | "memberships" | "commissions" | "referrals">;

  let payment = pending;
  if (!payment) {
    const key = uniquePaymentKey(db, `EFT-${sale.id}`);
    payment = {
      id: uid(),
      saleId,
      amount: sale.amount,
      provider: "eft",
      providerRef: key,
      status: "beklemede",
      idempotencyKey: key,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.payments.push(payment);
  }

  payment.provider = "eft";
  payment.status = "onaylandi";
  payment.updatedAt = nowISO();

  try {
    if (sale.renewalForMembershipId) confirmRenewal(db, saleId, actor);
    else confirmSale(db, saleId, actor);
  } catch (err) {
    db.sales = before.sales;
    db.payments = before.payments;
    db.memberships = before.memberships;
    db.commissions = before.commissions;
    db.referrals = before.referrals;
    throw new BizError(err instanceof Error ? err.message : "EFT onayı tamamlanamadı.");
  }

  log(db, actor, "eft_onaylandi", `EFT ödemesi onaylandı ve satış kesinleşti`, {
    saleId,
    paymentId: payment.id,
    providerRef: payment.providerRef,
  });
  return payment;
}

/**
 * Bekleyen ödemeyi reddeder (admin). Ödeme kaydı SİLİNMEZ; "hata" olarak
 * işaretlenir ve satış potansiyel kalır, böylece doğru ödeme geldiğinde
 * yeniden denenebilir. Tahsil edilmiş gibi işaretlenemez.
 */
export function rejectPendingPayment(db: DB, saleId: string, actor: Actor): Payment[] {
  requireAdmin(actor);
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new BizError("Satış bulunamadı.");
  if (sale.status === "iptal") throw new BizError("Satış zaten iptal edilmiş.");
  if (sale.status === "odendi") throw new BizError("Kesinleşmiş satışın ödemesi reddedilemez.");

  const pending = db.payments.filter((p) => p.saleId === saleId && p.status === "beklemede");
  if (pending.length === 0) throw new BizError("Reddedilecek bekleyen ödeme kaydı yok.");

  for (const p of pending) {
    p.status = "hata";
    p.updatedAt = nowISO();
  }
  log(db, actor, "odeme_reddedildi", `Bekleyen ödeme reddedildi`, {
    saleId,
    paymentIds: pending.map((p) => p.id),
  });
  return pending;
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
