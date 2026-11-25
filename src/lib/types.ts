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
  /** Üyeliği olduğu ekip (tek ekip kuralı — null/undefined = ekipte değil) */
  teamId?: string;
  createdAt: string;
}

/**
 * Bağımsız ekip — ana sisteme doğrudan bağlıdır; üst/alt ekip kolonu YOKTUR
 * (hiyerarşi imkânsız). Lider de ekibin üyesidir (sales_reps.team_id).
 */
export interface Team {
  id: string;
  name: string;
  /** Ekibin tek lideri (UNIQUE — bir personel aynı anda tek ekibin lideri) */
  leaderRepId: string;
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
  /**
   * İşletmenin çalışma saatleri. `leads` tablosunda kolon olmadığından
   * `note` işaretiyle taşınır (bkz. lib/leadLocation.ts); firma dönüşümünde
   * `companies.hours` alanına aynen aktarılır.
   */
  hours?: CompanyHours;
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

/**
 * Ekip katılım başvurusu (0015_team_join_applications) — yazım yalnız
 * sunucu RPC'lerindedir (onay/reddeden bağımsız olarak istemcinin bu
 * tabloya yazma yetkisi yoktur); okuma RLS ile personel yalnız kendi
 * başvurusunu, yönetici tümünü görür.
 */
export interface TeamJoinApplication {
  id: string;
  /** Başvuru sahibi personel */
  repId: string;
  /** Katılınmak istenen ekip */
  teamId: string;
  status: "beklemede" | "onaylandi" | "reddedildi";
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

/**
 * Ekip özeti görünümü (0015 `teams_overview`) — lider adı, üye sayısı ve
 * kapasite tek yerden okunur; personelin diğer ekiplerin üye satırlarını
 * (telefon vb.) görmesi gerekmez.
 */
export interface TeamOverview {
  teamId: string;
  teamName: string;
  leaderRepId: string;
  leaderName: string;
  memberCount: number;
  capacity: number;
}

/**
 * Ekip liderliği komisyonu (0014_team_commissions) — `commissions`
 * tablosundan AYRIDIR (aynı satışa ikinci komisyon satırı eklenmez).
 * Matrah, satış sonrası Firma Rehberi'ne kalan tutardır; lider ve tutar
 * satış anında sunucuda hesaplanıp anlık görüntü olarak saklanır.
 */
export interface TeamCommission {
  id: string;
  saleId: string;
  /** Satışı yapan doğrudan ekip üyesi */
  repId: string;
  /** Satış anındaki ekip lideri (sonradan değişmez) */
  leaderRepId: string;
  /** Paylar sonrası Firma Rehberi'ne kalan matrah */
  baseAmount: number;
  /** Oran (%) — kesin iş modeli: 20 */
  rate: number;
  amount: number;
  createdAt: string;
}

/** Ekip liderliği komisyonu için yönetici ödeme kaydı (0008 deseni). */
export interface TeamCommissionPayout {
  id: string;
  leaderRepId: string;
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

export type RepApplicationStatus = "beklemede" | "onaylandi" | "reddedildi";

/**
 * Referans bağlantısıyla gelen personel başvurusu (0012_rep_applications).
 * Yalnız yönetici görür; onay ve personel hesabı oluşturma SONRAKİ aşamada.
 */
export interface RepApplication {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** Referans veren personel — sunucuda ref kodundan çözülür (istemciden UUID gelmez) */
  referralRepId: string;
  /** Başvuru anındaki ekip (rep.teamId anlık görüntüsü — sunucuda belirlenir) */
  teamId?: string;
  status: RepApplicationStatus;
  createdAt: string;
}

/**
 * Firma etkileşim türleri — her tür için sayaç AYRIDIR ve bildirim eşikleri
 * türden bağımsız değerlendirilir.
 */
export type EngagementKind = "profil" | "telefon" | "whatsapp" | "yol" | "instagram" | "web";

/** Firma + tür başına birikimli sayaç (0018 `company_engagement_counters`). */
export interface EngagementCounter {
  companyId: string;
  kind: EngagementKind;
  count: number;
  updatedAt: string;
}

/**
 * Eşik aşımı bildirimi (0018 `company_engagement_notifications`).
 * (firma, tür, sayaç değeri) tekildir: aynı etkileşim için ikinci bildirim
 * üretilemez. İki kademe aynı anda tetiklenirse TEK kayıt yazılır ve
 * `tier1Also` ikinci kademenin yanında birinci kademenin de tetiklendiğini söyler.
 */
export interface EngagementNotification {
  id: string;
  companyId: string;
  kind: EngagementKind;
  count: number;
  /** 1 = sabit aralık, 2 = katlanarak artan eşik */
  tier: 1 | 2;
  threshold: number;
  tier1Also?: boolean;
  createdAt: string;
}

/** Bir etkileşim türü için çözümlenmiş (genel + tür bazlı) bildirim kuralı. */
export interface EngagementRule {
  enabled: boolean;
  tier1Enabled: boolean;
  tier1Interval: number;
  tier2Enabled: boolean;
  tier2Start: number;
}

/** Bildirim sistemi ayarları — panelden yönetilir, koda sabitlenmez. */
export interface EngagementSettings {
  /** Sistem genel anahtarı: kapalıyken hiçbir kademe bildirim üretmez. */
  engagementEnabled: boolean;
  engagementTier1Enabled: boolean;
  /** Sabit aralık: her N etkileşimde bir bildirim (100, 200, 300…). */
  engagementTier1Interval: number;
  engagementTier2Enabled: boolean;
  /** Katlanan eşik başlangıcı: 500 → 1.000 → 2.000 → 4.000… */
  engagementTier2Start: number;
  /** İleride tür bazlı ayar: tür → kısmi kural (boş = genel kural geçerli). */
  engagementKindOverrides?: Partial<Record<EngagementKind, Partial<EngagementRule>>>;
}

/** Yönetim tarafından değiştirilebilir iş kuralları — kaynak koda SABLLENMEZ */
export interface Settings extends EngagementSettings {
  membershipPrice: number;
  /** Temsilci komisyon oranı (%). Satış tutarıyla çarpılarak hesaplanır. */
  repCommission: number;
  referralReward: number;
  renewalCommission: number;
  /** Genel ekip kapasitesi (KİŞİ — lider dahil; varsayılan 15) */
  teamCapacity: number;
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
  teams: Team[];
  leads: Lead[];
  visits: LeadVisit[];
  sales: Sale[];
  payments: Payment[];
  memberships: Membership[];
  commissions: Commission[];
  commissionPayouts?: CommissionPayout[];
  /** 0014: ekip liderliği komisyonları — yalnız sunucu (confirm_sale) yazar */
  teamCommissions?: TeamCommission[];
  /** 0014: ekip liderliği komisyonu ödemeleri — yalnız RPC yazar */
  teamCommissionPayouts?: TeamCommissionPayout[];
  /** 0015: ekip katılım başvuruları — yazım yalnız RPC */
  teamJoinApplications?: TeamJoinApplication[];
  /** 0015: ekip özeti görünümü (snapshot okuma; demo modda hesaplanır) */
  teamOverviews?: TeamOverview[];
  referrals: Referral[];
  repApplications: RepApplication[];
  /** 0018: firma etkileşim sayaçları — yazım yalnız track_company_engagement RPC'si */
  engagementCounters?: EngagementCounter[];
  /** 0018: eşik bildirimleri — yazım yalnız RPC; (firma, tür, sayaç) tekil */
  engagementNotifications?: EngagementNotification[];
  settings: Settings;
  audit: AuditEntry[];
}

/** Oturumda aktör bilgisi (yetki + denetim kaydı için) */
export interface Actor {
  userId?: string;
  role: Role | "sistem";
  repId?: string;
}
