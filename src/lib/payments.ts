/**
 * Ödeme sağlayıcı soyutlaması.
 *
 * ÖNEMLİ: Gerçek ödeme entegrasyonu henüz YOK. Bu dosya yalnızca mimariyi
 * hazırlar; sahte "ödeme başarılı" akışı üretilmez.
 *
 * Tasarım ilkeleri:
 * - Kart bilgileri hiçbir koşulda kendi veritabanımızda saklanmaz.
 *   Müşteri, sağlayıcının barındırdığı ödeme sayfasına (3D Secure) yönlendirilir.
 * - Satış/ödeme durumu YALNIZCA sağlayıcının webhook bildirimiyle (sunucu
 *   tarafında imza doğrulanarak) güncellenir. İstemci bildirimlerine güvenilmez.
 * - Webhook'lar idempotent işlenir: aynı providerRef ile gelen tekrarlı
 *   bildirimler ikinci bir ödeme kaydı/commission üretmez.
 * - Sağlayıcı hesap/API anahtarı yoksa entegrasyon "yapılandırılmadı" durumundadır
 *   ve ödeme kayıtları yalnızca yönetim panelinde manuel doğrulanabilir (denetim kaydıyla).
 */

export interface PaymentCheckoutRequest {
  /** Sağlayıcının sipariş/başvuru id'si — idempotency için benzersiz */
  idempotencyKey: string;
  amount: number;
  /** Denetim amaçlı açıklayıcı metin */
  description: string;
  /** Ödeme sonrası dönülecek URL'ler */
  callbackUrl: string;
}

export interface PaymentCheckoutResult {
  /** Kullanıcının yönlendirileceği barındırılmış ödeme sayfası */
  redirectUrl: string;
}

export interface WebhookPayload {
  providerRef: string;
  status: "basarili" | "hata" | "iade";
  amount: number;
  /** Sağlayıcının imzası — sunucu tarafında doğrulanır */
  raw?: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  /** Sağlayıcı hazır değilse false döner ve arayüz entegrasyonun eksik olduğunu gösterir */
  isConfigured(): boolean;
  createCheckout(req: PaymentCheckoutRequest): Promise<PaymentCheckoutResult>;
}

/** Henüz gerçek sağlayıcı yapılandırılmadı. */
class NotConfiguredProvider implements PaymentProvider {
  readonly name = "hicbiri";

  isConfigured(): boolean {
    return false;
  }

  async createCheckout(): Promise<PaymentCheckoutResult> {
    throw new Error(
      "Ödeme sağlayıcısı yapılandırılmadı. Gerçek ödeme alımının tek yolu sağlayıcı entegrasyonudur; sahte ödeme akışı üretilmez.",
    );
  }
}

export const paymentProvider: PaymentProvider = new NotConfiguredProvider();

export const isPaymentProviderConfigured = paymentProvider.isConfigured();
