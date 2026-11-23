import type { Payment, Sale } from "./types";

/*
 * TEK SINIFLANDIRMA KAYNAĞI
 *
 * Satış aşaması, ödeme yöntemi ve ödeme durumu etiketleri yalnız burada
 * tanımlanır; Dashboard (İşlem Merkezi), Sales ve Payments aynı fonksiyonları
 * kullanır. Böylece aynı kayıt farklı sayfalarda farklı durum gösteremez.
 *
 * İş kuralı DEĞİL, sınıflandırma: para/komisyon/kesinleştirme/yayın kararları
 * repo + engine içinde kalır.
 */

export type SaleStage =
  | "settled"
  | "cancelled"
  | "confirm"
  | "eft"
  | "card"
  | "none";

export type BadgeTone = "green" | "orange" | "red" | "gray";

/** Satışlara bağlı ödemeleri tek geçişte indeksler. */
export function groupPaymentsBySale(payments: Payment[]): Map<string, Payment[]> {
  const map = new Map<string, Payment[]>();
  for (const payment of payments) {
    const rows = map.get(payment.saleId);
    if (rows) rows.push(payment);
    else map.set(payment.saleId, [payment]);
  }
  return map;
}

/** Öncelikli ödeme: onaylanmış varsa o, yoksa en yeni beklemede olan. */
export function primaryPaymentForSale(rows: Payment[]): Payment | undefined {
  return (
    rows.find((payment) => payment.status === "onaylandi") ??
    rows
      .filter((payment) => payment.status === "beklemede")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  );
}

/** Kart ödemesi: sağlayıcı doğrulaması gerekir, yönetici onayı veremez. */
export function isCardPayment(payment: Payment): boolean {
  return payment.provider !== "eft" && payment.provider !== "hicbiri";
}

/** EFT veya manuel kayıt: yönetici onayı bu iki yöntemde mümkündür. */
export function isAdminApprovablePayment(payment: Payment): boolean {
  return payment.status === "beklemede" && !isCardPayment(payment);
}

export function paymentMethodLabel(payment?: Payment): string {
  if (!payment) return "Kayıt yok";
  if (payment.provider === "eft") return "EFT";
  if (payment.provider === "hicbiri") return "Manuel";
  return "Kart";
}

export function paymentStatusBadge(status: Payment["status"]): {
  tone: BadgeTone;
  label: string;
} {
  if (status === "onaylandi") return { tone: "green", label: "Onaylandı" };
  if (status === "beklemede") return { tone: "orange", label: "Bekliyor" };
  if (status === "hata") return { tone: "red", label: "Reddedildi" };
  return { tone: "gray", label: "İade" };
}

/** Yöntem + durum tek satırda (liste hücreleri için). */
export function paymentSummary(payment?: Payment): string {
  if (!payment) return "Kayıt yok";
  return `${paymentMethodLabel(payment)} · ${paymentStatusBadge(payment.status).label.toLocaleLowerCase("tr")}`;
}

/**
 * Satış aşaması — SIRA ÖNEMLİ, ilk eşleşen kazanır:
 * kesinleşti → iptal → kesinleştirme yarım → bekleyen ödeme (EFT/manuel vs kart)
 * → ödeme kaydı yok. Böylece bir satış tek kuyruk satırı üretir.
 */
export function saleStage(sale: Sale, rows: Payment[]): SaleStage {
  if (sale.status === "odendi") return "settled";
  if (sale.status === "iptal") return "cancelled";
  if (rows.some((payment) => payment.status === "onaylandi")) return "confirm";
  const pending = rows.find((payment) => payment.status === "beklemede");
  if (pending) return isCardPayment(pending) ? "card" : "eft";
  return "none";
}

/** Satışın kuyruktaki aşaması — ödemeleri kendisi indeksler. */
export function saleStageFor(sale: Sale, payments: Payment[]): SaleStage {
  return saleStage(
    sale,
    payments.filter((payment) => payment.saleId === sale.id),
  );
}
