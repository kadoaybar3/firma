/**
 * Merkezi veri modelleri. Tüm alan adları ingilizce (standart uygulama),
 * içerik dili kullanıcıya gösterilen Türkçe metinlerde.
 */

export type Role = "admin" | "temsilci";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Rol "temsilci" ise, kullanıcının bağlı olduğu satış temsilcisi kaydının id'si */
  repId?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

export interface City {
  id: string;
  name: string;
  slug: string;
  districts: string[];
}

export interface CompanyHours {
  weekday: string;
  saturday: string;
  sunday: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  cityId: string;
  district: string;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  socials: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    /** Google Place ID (scraper ile aktarılan firmalarda; JSONB, kolon yok). */
    placeId?: string;
    /** İçe aktarma kaynağı (yalnız "google-maps-scraper" yayın ödeme istisnası doğurur). */
    source?: string;
  };
  description: string;
  /** Görsel yoksa kullanılan emoji rozetleri (demo görsel politikası) */
  images: string[];
  hours: CompanyHours;
  featured: boolean;
  /** Halka açık sitede görünürlük */
  published: boolean;
  /**
   * Harita konumu (WGS84). Kolonlar 0007 migration'ı ile eklendi; mevcut
   * kayıtlarda NULL olabilir. İki alan birlikte anlamlıdır.
   */
  latitude?: number;
  longitude?: number;
  /** Satışı gerçekleştiren temsilci (bilgi amaçlı) */
  repId?: string;
  createdAt: string;
  updatedAt: string;
}

export type RepStatus = "aktif" | "pasif";

export interface SalesRep {
  id: string;
  name: string;
  phone: string;
  /** İnsan-okur satış kodu, ör. AF-001 */
  code: string;
  status: RepStatus;
  /** Bu temsilci için özel komisyon oranı (%) — boşsa genel ayarlardan hesaplanır */
  customCommissionRate?: number;
  createdAt: string;
}

/** Satış temsilcisinin sahadan topladığı firma adayı */
export type LeadStatus = "yeni" | "irtibat" | "görüşme" | "anlaşma" | "iptal";

export interface Lead {
  id: string;
  /** Sahada kaydeden temsilci; web başvurularında dönüştürme sonrası atanır (optional) */
  repId?: string;
  companyName: string;
  categoryId?: string;
  cityId?: string;
  district?: string;
  phone?: string;
  email?: string;
  /** İletişim ve sosyal hesaplar; firma dönüşümünde aynen aktarılır. */
  socials?: Company["socials"];
  /**
   * Açık adres. `leads` tablosunda adres kolonu olmadığından `note` içindeki
   * makine-okunur işaretle taşınır (bkz. lib/leadLocation.ts); UI'da normal
   * alan gibi davranır.
   */
  address?: string;
  /** Aday aşamasında seçilen konum (aynı işaret içinde taşınır). */
  latitude?: number;
  longitude?: number;
  /** Seçilen üyelik paketi (note işareti içinde taşınır; şema değişmez). */
  packageKey?: "normal" | "featured";
  note: string;
  status: LeadStatus;
  visitCount: number;
  createdAt: string;
  updatedAt: string;
  /** Kaynağı işaretler: temsilci sahadan ('sahada') veya web formundan ('web') */
  source?: "sahada" | "web";
  /** Firmaya dönüştürülmüşse hedef firma id (genel boru hattından ayrıştırma işareti) */
  convertedToCompanyId?: string;
}

export interface LeadVisit {
  id: string;
  leadId: string;
  repId: string;
  /** ISO tarih-saat */
  date: string;
  note: string;
  /** Görüşme sonucu özeti */
  outcome: string;
}

/** Üyelik satışı */
export type SaleChannel = "temsilci" | "dogrudan";
export type SaleStatus = "potansiyel" | "odendi" | "iptal";

export interface Sale {
  id: string;
  /** Kanal "dogrudan" ise null olabilir */
  repId?: string | null;
  companyId: string;
  channel: SaleChannel;
  /** Doğrudan satışsa, işletmenin kullandığı temsilci referans kodu */
  referralCode?: string;
  amount: number;
  status: SaleStatus;
  createdAt: string;
  confirmedAt?: string;
  /** Üyelik yenilemesinden doğan satışsa, yenilenen üyeliğin id'si */
  renewalForMembershipId?: string;
}

/**
 * Ödeme kayıtları. GERÇEK KART BİLGİLERİ HİÇBİR ALANDA TUTULMAZ;
 * yalnızca sağlayıcı referansı ve durum saklanır.
 */
export type PaymentStatus = "beklemede" | "onaylandi" | "hata" | "iade";

export interface Payment {
  id: string;
  saleId: string;
  amount: number;
  /** Ödeme sağlayıcısı: "ackl hiçbiri" durumunda "hicbiri" */
  provider: string;
  /** Ödeme sağlayıcısının döndürdüğü işlem referansı (webhook idempotency için) */
  providerRef: string;
  status: PaymentStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export type MembershipStatus = "aktif" | "suresi_bitti" | "iptal";

export interface Membership {
  id: string;
  companyId: string;
  saleId: string;
  startsAt: string;
  endsAt: string;
  status: MembershipStatus;
}

/** Komisyon ve ödül kayıtları */
export type CommissionType = "satis" | "yenileme" | "referans";
export type CommissionStatus = "beklemede" | "onaylandi" | "odendi";

export interface Commission {
  id: string;
  saleId: string;
  repId: string;
  type: CommissionType;
  amount: number;
  status: CommissionStatus;
  createdAt: string;
  paidAt?: string;
}

/** Yönetici tarafından temsilciye yapılan gerçek para transferi. */
export interface CommissionPayout {
  id: string;
  repId: string;
  amount: number;
  referenceNo?: string;
  paidAt: string;
  createdAt: string;
  createdBy?: string;
}

/** Temsilciye verilen doğrudan referans kodu */
export interface Referral {
  id: string;
  code: string;
  repId: string;
  usedAt?: string;
  saleId?: string;
  createdAt: string;
}

/** Yönetim tarafından değiştirilebilir iş kuralları — kaynak koda SABLLENMEZ */
export interface Settings {
  membershipPrice: number;
  /** Temsilci komisyon oranı (%). Satış tutarıyla çarpılarak hesaplanır. */
  repCommission: number;
  referralReward: number;
  renewalCommission: number;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId?: string;
  actorRole: Role | "sistem";
  action: string;
  summary: string;
  /** Yapılan değişikliğin makine-okur özeti (JSON) */
  detail: string;
}

export interface DB {
  categories: Category[];
  cities: City[];
  companies: Company[];
  reps: SalesRep[];
  leads: Lead[];
  visits: LeadVisit[];
  sales: Sale[];
  payments: Payment[];
  memberships: Membership[];
  commissions: Commission[];
  commissionPayouts?: CommissionPayout[];
  referrals: Referral[];
  settings: Settings;
  audit: AuditEntry[];
}

/** Oturumda aktör bilgisi (yetki + denetim kaydı için) */
export interface Actor {
  userId?: string;
  role: Role | "sistem";
  repId?: string;
}
