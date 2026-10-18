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
  };
  description: string;
  /** Görsel yoksa kullanılan emoji rozetleri (demo görsel politikası) */
  images: string[];
  hours: CompanyHours;
  featured: boolean;
  /** Halka açık sitede görünürlük */
  published: boolean;
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
  repId: string;
  companyName: string;
  categoryId?: string;
  cityId?: string;
  district?: string;
  phone?: string;
  note: string;
  status: LeadStatus;
  visitCount: number;
  createdAt: string;
  updatedAt: string;
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
