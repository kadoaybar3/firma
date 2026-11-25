import type {
  AuditEntry,
  Category,
  City,
  Commission,
  CommissionPayout,
  Company,
  DB,
  EngagementCounter,
  EngagementNotification,
  EngagementRule,
  Lead,
  LeadVisit,
  Membership,
  Payment,
  Referral,
  RepApplication,
  Sale,
  SalesRep,
  Settings,
  Team,
  TeamCommission,
  TeamCommissionPayout,
  TeamJoinApplication,
  TeamOverview,
} from "./types";
import { supabase, isSupabaseConfigured } from "./supabase";
import { nowISO } from "./engine";
import { normalizeCoordinates, toFiniteNumber } from "./coordinates";
import { encodeLeadNote, parseLeadNote } from "./leadLocation";
import { ENGAGEMENT_DEFAULTS, isEngagementKind } from "./engagement";

/**
 * SUPABASE VERİ KAYNAĞI KATMANI (P-1 bağlantı turu)
 *
 * Mimari karar — "yerelde-hızda + Elasticsearch benzeri fark yazımı":
 *  1. `loadSnapshot()`: oturumun RLS yetkisiyle görülen TABLO BÜTÜNÜ okunur ve
 *     tip-uyumlu DB nesnesine dönüştürülür (anon → yalnız published firmalar;
 *     admin/temsilci → RLS'in izin verdiği satırlar). Sunucudan gelen veri
 *     localStorage'a YAZILMAZ.
 *  2. `syncSnapshot(local, base)`: repo katmanı mutasyonları kendi bellek
 *     DB'sinde anında uygular (senkron API korunur); ardından bu fonksiyon
 *     local ↔ base farkını FK sırasına uygun upsert/delete ile sunucuya yazar.
 *     base = sunucuda bilinen son durum; başarısızlıkta base değişmez,
 *     bir sonraki flush aynı farkı yeniden dener (eventual consistency).
 *
 * Tasarım kısıtları:
 *  - `audit_log` İSTEMCİDEN SENKRON EDİLMEZ (0002, log_audit execute haklarını
 *     yalnızca service_role'a bıraktı). Denetim kayıtları sunucu tarafındaki
 *     SECURITY DEFINER işlem zincirinden doğar (confirm_sale vb.).
 *  - Demo tohum verisi (seedDB) Supabase modunda hiçbir yere yazılmaz.
 *  - service_role anahtarı asla istemcide bulunmaz; tüm erişim RLS içindir.
 */

export type SnapshotResult = { db: DB };

/** Hydration öncesi üretimde kullanılan boş DB (asla tohumlanmaz). */
export function emptyDB(): DB {
  return {
    categories: [],
    cities: [],
    companies: [],
    reps: [],
    teams: [],
    leads: [],
    visits: [],
    sales: [],
    payments: [],
    memberships: [],
    commissions: [],
    commissionPayouts: [],
    referrals: [],
    repApplications: [],
    engagementCounters: [],
    engagementNotifications: [],
    settings: {
      membershipPrice: 0,
      repCommission: 0,
      referralReward: 0,
      renewalCommission: 0,
      teamCapacity: 15,
      ...ENGAGEMENT_DEFAULTS,
      updatedAt: nowISO(),
    },
    audit: [],
  };
}

/* =========================================================
   SATIR AL-VER TİP DÖNÜŞÜMLERİ (pure — test edilebilir)
   Kolonlar: 0001_init.sql + 0003/0004 additive kolonları.
   ========================================================= */

function sv(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function sopt(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

export function categoryFromRow(row: Record<string, unknown>): Category {
  return { id: sv(row, "id"), name: sv(row, "name"), slug: sv(row, "slug"), icon: sv(row, "icon") || "🏢" };
}

export function categoryToRow(c: Category): Record<string, unknown> {
  return { id: c.id, name: c.name, slug: c.slug, icon: c.icon };
}

/** cities + city_districts satırlarını (ayrı tablolar) City[] yapısına muhafaza eder. */
export function citiesFromRows(
  cityRows: Record<string, unknown>[],
  districtRows: Record<string, unknown>[],
): City[] {
  const byCity = new Map<string, string[]>();
  for (const d of districtRows) {
    const cityId = sv(d, "city_id");
    if (!cityId) continue;
    const list = byCity.get(cityId) ?? [];
    list.push(sv(d, "district"));
    byCity.set(cityId, list);
  }
  return cityRows.map((r) => ({
    id: sv(r, "id"),
    name: sv(r, "name"),
    slug: sv(r, "slug"),
    districts: byCity.get(sv(r, "id")) ?? [],
  }));
}

export function companyToRow(c: Company): Record<string, unknown> {
  /**
   * Koordinatlar yalnız İKİSİ de geçerliyse satıra girer. Kolonlar 0007
   * migration'ı ile eklenir; öncesinde koordinat dolu bir firma yazılırsa
   * PostgREST "column does not exist" hatası verir — bu, migration'ın
   * uygulanmadığını görünür kılar (sessiz veri kaybı yok).
   */
  const coords = normalizeCoordinates(c.latitude, c.longitude);
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    category_id: c.categoryId,
    city_id: c.cityId,
    district: c.district ?? "",
    address: c.address ?? "",
    phone: c.phone ?? "",
    email: c.email ?? null,
    website: c.website ?? null,
    socials: c.socials ?? {},
    description: c.description ?? "",
    images: c.images?.length ? c.images : [],
    hours: c.hours ?? {},
    featured: Boolean(c.featured),
    published: Boolean(c.published),
    sales_rep_id: c.repId ?? null,
    ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
    created_at: c.createdAt ?? nowISO(),
    updated_at: c.updatedAt ?? nowISO(),
  };
}

export function companyFromRow(row: Record<string, unknown>): Company {
  // Koordinatlar yalnız kolonlar mevcutsa ve iki değer de geçerliyse dolu gelir.
  const coords = normalizeCoordinates(
    toFiniteNumber(row["latitude"]),
    toFiniteNumber(row["longitude"]),
  );
  return {
    id: sv(row, "id"),
    name: sv(row, "name"),
    slug: sv(row, "slug"),
    categoryId: sv(row, "category_id"),
    cityId: sv(row, "city_id"),
    district: sv(row, "district"),
    address: sv(row, "address"),
    phone: sv(row, "phone"),
    email: sopt(row, "email"),
    website: sopt(row, "website"),
    socials: (row["socials"] as Company["socials"]) ?? {},
    description: sv(row, "description"),
    images: (row["images"] as string[]) ?? [],
    hours: (row["hours"] as Company["hours"]) ?? { weekday: "", saturday: "", sunday: "" },
    featured: Boolean(row["featured"]),
    published: Boolean(row["published"]),
    repId: sopt(row, "sales_rep_id"),
    ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
    createdAt: sv(row, "created_at"),
    updatedAt: sv(row, "updated_at"),
  };
}

export function repFromRow(row: Record<string, unknown>): SalesRep {
  return {
    id: sv(row, "id"),
    name: sv(row, "name"),
    phone: sv(row, "phone"),
    code: sv(row, "code"),
    status: sv(row, "status") === "pasif" ? "pasif" : "aktif",
    customCommissionRate: row["custom_commission_rate"] == null ? undefined : num(row, "custom_commission_rate"),
    teamId: sopt(row, "team_id"),
    createdAt: sv(row, "created_at"),
  };
}

export function repToRow(r: SalesRep): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    code: r.code,
    status: r.status,
    custom_commission_rate: r.customCommissionRate ?? null,
    team_id: r.teamId ?? null,
    created_at: r.createdAt ?? nowISO(),
  };
}

/** Ekip satırı dönüşümü (0011_teams.sql). */
export function teamFromRow(row: Record<string, unknown>): Team {
  return {
    id: sv(row, "id"),
    name: sv(row, "name"),
    leaderRepId: sv(row, "leader_rep_id"),
    createdAt: sv(row, "created_at"),
  };
}

export function teamToRow(t: Team): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    leader_rep_id: t.leaderRepId,
    created_at: t.createdAt ?? nowISO(),
    // created_by yalnızca create_team RPC'sinde yazılır; diff-sync taşımaz.
  };
}

export function leadFromRow(row: Record<string, unknown>): Lead {
  const parsed = parseLeadNote(sv(row, "note"));
  return {
    id: sv(row, "id"),
    repId: sopt(row, "sales_rep_id"),
    companyName: sv(row, "company_name"),
    categoryId: sopt(row, "category_id"),
    cityId: sopt(row, "city_id"),
    district: sopt(row, "district"),
    phone: sopt(row, "phone"),
    email: sopt(row, "email"),
    socials: (row["socials"] as Company["socials"] | null) ?? {},
    address: parsed.address,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    packageKey: parsed.packageKey,
    hours: parsed.hours,
    note: parsed.note,
    status:
      sv(row, "status") === "yeni" ||
      sv(row, "status") === "irtibat" ||
      sv(row, "status") === "görüşme" ||
      sv(row, "status") === "anlaşma" ||
      sv(row, "status") === "iptal"
        ? (sv(row, "status") as Lead["status"])
        : "yeni",
    visitCount: num(row, "visit_count"),
    createdAt: sv(row, "created_at"),
    updatedAt: sv(row, "updated_at"),
    source: sv(row, "source") === "web" ? "web" : "sahada",
    convertedToCompanyId: sopt(row, "converted_to_company_id"),
  };
}

export function leadToRow(l: Lead): Record<string, unknown> {
  return {
    id: l.id,
    sales_rep_id: l.repId ?? null,
    company_name: l.companyName ?? "",
    category_id: l.categoryId ?? null,
    city_id: l.cityId ?? null,
    district: l.district ?? null,
    phone: l.phone ?? null,
    email: l.email ?? null,
    socials: l.socials ?? {},
    note: encodeLeadNote(l.note ?? "", {
      address: l.address,
      latitude: l.latitude,
      longitude: l.longitude,
      packageKey: l.packageKey,
      hours: l.hours,
    }),
    status: l.status,
    visit_count: l.visitCount ?? 0,
    created_at: l.createdAt ?? nowISO(),
    updated_at: l.updatedAt ?? nowISO(),
    source: l.source ?? "sahada",
    converted_to_company_id: l.convertedToCompanyId ?? null,
  };
}

export function visitFromRow(row: Record<string, unknown>): LeadVisit {
  return {
    id: sv(row, "id"),
    leadId: sv(row, "lead_id"),
    repId: sv(row, "sales_rep_id"),
    date: sv(row, "visit_date"),
    note: sv(row, "note"),
    outcome: sv(row, "outcome"),
  };
}

export function visitToRow(v: LeadVisit): Record<string, unknown> {
  return {
    id: v.id,
    lead_id: v.leadId,
    sales_rep_id: v.repId,
    visit_date: v.date ?? nowISO(),
    note: v.note ?? "",
    outcome: v.outcome ?? "",
  };
}

export function saleFromRow(row: Record<string, unknown>): Sale {
  return {
    id: sv(row, "id"),
    repId: row["sales_rep_id"] == null ? (null as unknown as string) : sv(row, "sales_rep_id"),
    companyId: sv(row, "company_id"),
    channel: sv(row, "channel") === "dogrudan" ? "dogrudan" : "temsilci",
    referralCode: sopt(row, "referral_code"),
    amount: num(row, "amount"),
    status: (["potansiyel", "odendi", "iptal"].includes(sv(row, "status"))
      ? sv(row, "status")
      : "potansiyel") as Sale["status"],
    createdAt: sv(row, "created_at"),
    confirmedAt: sopt(row, "confirmed_at"),
    renewalForMembershipId: sopt(row, "renewal_for_membership_id"),
  };
}

export function saleToRow(s: Sale): Record<string, unknown> {
  return {
    id: s.id,
    sales_rep_id: s.repId ?? null,
    company_id: s.companyId,
    channel: s.channel,
    referral_code: s.referralCode ?? null,
    amount: s.amount,
    status: s.status,
    created_at: s.createdAt ?? nowISO(),
    confirmed_at: s.confirmedAt ?? null,
    renewal_for_membership_id: s.renewalForMembershipId ?? null,
  };
}

export function paymentFromRow(row: Record<string, unknown>): Payment {
  return {
    id: sv(row, "id"),
    saleId: sv(row, "sale_id"),
    amount: num(row, "amount"),
    provider: sv(row, "provider") || "hicbiri",
    providerRef: sv(row, "provider_ref"),
    status: (["beklemede", "onaylandi", "hata", "iade"].includes(sv(row, "status"))
      ? sv(row, "status")
      : "beklemede") as Payment["status"],
    idempotencyKey: sv(row, "idempotency_key"),
    createdAt: sv(row, "created_at"),
    updatedAt: sv(row, "updated_at"),
  };
}

export function paymentToRow(p: Payment): Record<string, unknown> {
  return {
    id: p.id,
    sale_id: p.saleId,
    amount: p.amount,
    provider: p.provider ?? "hicbiri",
    provider_ref: p.providerRef,
    status: p.status,
    idempotency_key: p.idempotencyKey,
    created_at: p.createdAt ?? nowISO(),
    updated_at: p.updatedAt ?? nowISO(),
  };
}

export function membershipFromRow(row: Record<string, unknown>): Membership {
  return {
    id: sv(row, "id"),
    companyId: sv(row, "company_id"),
    saleId: sv(row, "sale_id"),
    startsAt: sv(row, "starts_at"),
    endsAt: sv(row, "ends_at"),
    status: (["aktif", "suresi_bitti", "iptal"].includes(sv(row, "status"))
      ? sv(row, "status")
      : "aktif") as Membership["status"],
  };
}

export function membershipToRow(m: Membership): Record<string, unknown> {
  return {
    id: m.id,
    company_id: m.companyId,
    sale_id: m.saleId,
    starts_at: m.startsAt ?? nowISO(),
    ends_at: m.endsAt ?? nowISO(),
    status: m.status,
  };
}

export function commissionFromRow(row: Record<string, unknown>): Commission {
  return {
    id: sv(row, "id"),
    saleId: sv(row, "sale_id"),
    repId: sv(row, "sales_rep_id"),
    type: (["satis", "yenileme", "referans"].includes(sv(row, "type"))
      ? sv(row, "type")
      : "satis") as Commission["type"],
    amount: num(row, "amount"),
    status: (["beklemede", "onaylandi", "odendi"].includes(sv(row, "status"))
      ? sv(row, "status")
      : "beklemede") as Commission["status"],
    createdAt: sv(row, "created_at"),
    paidAt: sopt(row, "paid_at"),
  };
}

export function commissionToRow(c: Commission): Record<string, unknown> {
  return {
    id: c.id,
    sale_id: c.saleId,
    sales_rep_id: c.repId,
    type: c.type,
    amount: c.amount,
    status: c.status,
    created_at: c.createdAt ?? nowISO(),
    paid_at: c.paidAt ?? null,
  };
}

export function commissionPayoutFromRow(row: Record<string, unknown>): CommissionPayout {
  return {
    id: sv(row, "id"),
    repId: sv(row, "sales_rep_id"),
    amount: num(row, "amount"),
    referenceNo: sopt(row, "reference_no"),
    paidAt: sv(row, "paid_at"),
    createdAt: sv(row, "created_at"),
    createdBy: sopt(row, "created_by"),
  };
}


/**
 * Denetim kaydı satırı — YALNIZ OKUMA (yazım yalnız SECURITY DEFINER
 * zincirinden; 0002 log_audit EXECUTE'unu service_role'a bıraktı).
 */
export function auditFromRow(row: Record<string, unknown>): AuditEntry {
  return {
    id: sv(row, "id"),
    at: sv(row, "at"),
    actorId: sopt(row, "actor_id"),
    actorRole: auditRole(sv(row, "actor_role")),
    action: sv(row, "action"),
    summary: sv(row, "summary"),
    detail: auditDetail(row["detail"]),
  };
}

/** audit_log.actor_role serbest metindir; AuditEntry yalnız bilinen rolleri kabul eder. */
function auditRole(value: string): AuditEntry["actorRole"] {
  return value === "admin" || value === "temsilci" ? value : "sistem";
}

/** `detail` kolonu JSONB'dir; AuditEntry.detail JSON METNİ bekler (engine.log deseni). */
function auditDetail(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Ekip liderliği komisyonu satırı (0014) — yalnız okuma.
 * Yazım istemciden YOKTUR: satırları confirm_sale (sunucu) üretir;
 * ToRow/sync eklenmez (rep_applications ile aynı desen).
 */
export function teamCommissionFromRow(row: Record<string, unknown>): TeamCommission {
  return {
    id: sv(row, "id"),
    saleId: sv(row, "sale_id"),
    repId: sv(row, "sales_rep_id"),
    leaderRepId: sv(row, "team_leader_rep_id"),
    baseAmount: num(row, "base_amount"),
    rate: num(row, "rate"),
    amount: num(row, "amount"),
    createdAt: sv(row, "created_at"),
  };
}

/** Ekip liderliği komisyonu ödemesi (0014) — yalnız okuma; yazım RPC'dir. */
export function teamCommissionPayoutFromRow(row: Record<string, unknown>): TeamCommissionPayout {
  return {
    id: sv(row, "id"),
    leaderRepId: sv(row, "team_leader_rep_id"),
    amount: num(row, "amount"),
    referenceNo: sopt(row, "reference_no"),
    paidAt: sv(row, "paid_at"),
    createdAt: sv(row, "created_at"),
    createdBy: sopt(row, "created_by"),
  };
}

/** Ekip katılım başvurusu satırı (0015) — yalnız okuma; yazım RPC'dir. */
export function teamJoinApplicationFromRow(row: Record<string, unknown>): TeamJoinApplication {
  const status = sv(row, "status");
  return {
    id: sv(row, "id"),
    repId: sv(row, "rep_id"),
    teamId: sv(row, "team_id"),
    status: status === "onaylandi" ? "onaylandi" : status === "reddedildi" ? "reddedildi" : "beklemede",
    createdAt: sv(row, "created_at"),
    decidedAt: sopt(row, "decided_at"),
    decidedBy: sopt(row, "decided_by"),
  };
}

/** Ekip özeti görünümü satırı (0015 `teams_overview`) — yalnız okuma. */
export function teamOverviewFromRow(row: Record<string, unknown>): TeamOverview {
  return {
    teamId: sv(row, "team_id"),
    teamName: sv(row, "team_name"),
    leaderRepId: sv(row, "leader_rep_id"),
    leaderName: sv(row, "leader_name"),
    memberCount: num(row, "member_count"),
    capacity: num(row, "capacity"),
  };
}

export function referralFromRow(row: Record<string, unknown>): Referral {
  return {
    id: sv(row, "id"),
    code: sv(row, "code"),
    repId: sv(row, "sales_rep_id"),
    usedAt: sopt(row, "used_at"),
    saleId: sopt(row, "sale_id"),
    createdAt: sv(row, "created_at"),
  };
}

export function referralToRow(r: Referral): Record<string, unknown> {
  return {
    id: r.id,
    code: r.code,
    sales_rep_id: r.repId,
    used_at: r.usedAt ?? null,
    sale_id: r.saleId ?? null,
    created_at: r.createdAt ?? nowISO(),
  };
}

/** Başvuru satırı dönüşümü (0012_rep_applications.sql) — yalnız okuma. */
export function repApplicationFromRow(row: Record<string, unknown>): RepApplication {
  const status = sv(row, "status");
  return {
    id: sv(row, "id"),
    firstName: sv(row, "first_name"),
    lastName: sv(row, "last_name"),
    phone: sv(row, "phone"),
    email: sv(row, "email"),
    referralRepId: sv(row, "referral_rep_id"),
    teamId: sopt(row, "team_id"),
    status: status === "onaylandi" ? "onaylandi" : status === "reddedildi" ? "reddedildi" : "beklemede",
    createdAt: sv(row, "created_at"),
  };
}

export function settingsFromRow(row: Record<string, unknown> | null): Settings {
  if (!row)
    return {
      membershipPrice: 1000,
      repCommission: 50,
      referralReward: 100,
      renewalCommission: 600,
      teamCapacity: 15,
      ...ENGAGEMENT_DEFAULTS,
      updatedAt: nowISO(),
    };
  const repCommission = num(row, "rep_commission");
  // 0011 uygulanmamışsa kolon yoktur → varsayılan 15 (okuma geriye dönük uyumlu).
  const teamCapacity = num(row, "team_capacity");
  return {
    membershipPrice: num(row, "membership_price"),
    // rep_commission artık YÜZDE. Eski satırlar hâlâ TL (ör. 600) taşıyor olabilir;
    // >100 değerler yüzde olarak yorumlanamaz, genel oran %50 sayılır. Admin ayarı
    // yüzde olarak kaydettiğinde (≤100) bu yedek devre dışı kalır.
    repCommission: repCommission > 100 ? 50 : repCommission,
    referralReward: num(row, "referral_reward"),
    renewalCommission: num(row, "renewal_commission"),
    teamCapacity: teamCapacity >= 2 ? teamCapacity : 15,
    ...engagementSettingsFromRow(row),
    updatedAt: sv(row, "updated_at"),
  };
}

/**
 * 0018 kolonları uygulanmamış eski bir satırda da okuma çalışsın diye
 * varsayılanlar kullanılır (feed geriye dönük uyumlu).
 */
function engagementSettingsFromRow(row: Record<string, unknown>) {
  const override = row["engagement_kind_overrides"];
  const overrides: Settings["engagementKindOverrides"] = {};
  if (override && typeof override === "object" && !Array.isArray(override)) {
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      if (!isEngagementKind(key) || !value || typeof value !== "object") continue;
      const raw = value as Record<string, unknown>;
      const part: Partial<EngagementRule> = {};
      if (typeof raw["enabled"] === "boolean") part.enabled = raw["enabled"];
      if (typeof raw["tier1Enabled"] === "boolean") part.tier1Enabled = raw["tier1Enabled"];
      if (Number.isFinite(Number(raw["tier1Interval"])))
        part.tier1Interval = Math.floor(Number(raw["tier1Interval"]));
      if (typeof raw["tier2Enabled"] === "boolean") part.tier2Enabled = raw["tier2Enabled"];
      if (Number.isFinite(Number(raw["tier2Start"])))
        part.tier2Start = Math.floor(Number(raw["tier2Start"]));
      overrides[key] = part;
    }
  }
  return {
    engagementEnabled:
      typeof row["engagement_enabled"] === "boolean"
        ? (row["engagement_enabled"] as boolean)
        : ENGAGEMENT_DEFAULTS.engagementEnabled,
    engagementTier1Enabled:
      typeof row["engagement_tier1_enabled"] === "boolean"
        ? (row["engagement_tier1_enabled"] as boolean)
        : ENGAGEMENT_DEFAULTS.engagementTier1Enabled,
    engagementTier1Interval:
      num(row, "engagement_tier1_interval") >= 1
        ? Math.floor(num(row, "engagement_tier1_interval"))
        : ENGAGEMENT_DEFAULTS.engagementTier1Interval,
    engagementTier2Enabled:
      typeof row["engagement_tier2_enabled"] === "boolean"
        ? (row["engagement_tier2_enabled"] as boolean)
        : ENGAGEMENT_DEFAULTS.engagementTier2Enabled,
    engagementTier2Start:
      num(row, "engagement_tier2_start") >= 1
        ? Math.floor(num(row, "engagement_tier2_start"))
        : ENGAGEMENT_DEFAULTS.engagementTier2Start,
    engagementKindOverrides: overrides,
  };
}

export function settingsToRow(s: Settings): Record<string, unknown> {
  return {
    id: 1,
    membership_price: s.membershipPrice,
    rep_commission: s.repCommission,
    referral_reward: s.referralReward,
    renewal_commission: s.renewalCommission,
    team_capacity: s.teamCapacity,
    engagement_enabled: s.engagementEnabled !== false,
    engagement_tier1_enabled: s.engagementTier1Enabled !== false,
    engagement_tier1_interval: Math.max(1, Math.floor(s.engagementTier1Interval || 1)),
    engagement_tier2_enabled: s.engagementTier2Enabled !== false,
    engagement_tier2_start: Math.max(1, Math.floor(s.engagementTier2Start || 1)),
    engagement_kind_overrides: s.engagementKindOverrides ?? {},
    updated_at: s.updatedAt ?? nowISO(),
  };
}

/* ---------- 0018: etkileşim sayaçları / bildirimleri (yalnız OKUMA) ---------- */

export function engagementCounterFromRow(row: Record<string, unknown>): EngagementCounter | null {
  const kind = row["kind"];
  const companyId = sv(row, "company_id");
  if (!isEngagementKind(kind) || !companyId) return null;
  return {
    companyId,
    kind,
    count: Math.max(0, Math.floor(num(row, "count"))),
    updatedAt: sv(row, "updated_at"),
  };
}

export function engagementNotificationFromRow(
  row: Record<string, unknown>,
): EngagementNotification | null {
  const kind = row["kind"];
  const companyId = sv(row, "company_id");
  const id = sv(row, "id");
  if (!isEngagementKind(kind) || !companyId || !id) return null;
  return {
    id,
    companyId,
    kind,
    count: Math.max(0, Math.floor(num(row, "count"))),
    tier: num(row, "tier") === 2 ? 2 : 1,
    threshold: Math.max(0, Math.floor(num(row, "threshold"))),
    tier1Also: row["tier1_also"] === true ? true : undefined,
    createdAt: sv(row, "created_at"),
  };
}

/* =========================================================
   ANLIK GÖRÜNTÜ (HYDRATION)
   ========================================================= */

interface QueryOut {
  rows: Record<string, unknown>[];
  error: string | null;
  table: string;
}

async function selectAll(table: string): Promise<QueryOut> {
  if (!supabase) return { rows: [], error: "Supabase istemcisi yapılandırılmadı.", table };
  const { data, error } = await supabase.from(table).select("*");
  if (error) return { rows: [], error: `${table}: ${error.message}`, table };
  return { rows: (data ?? []) as Record<string, unknown>[], error: null, table };
}

/** Bellekte tutulan azami denetim kaydı — sınırsız büyümeyi önler. */
export const AUDIT_READ_LIMIT = 500;

/**
 * Denetim kayıtları — sunucu tarafında `at DESC` + limitli okuma.
 * Sıralama sunucuda yapılır: selectAll order'sız olduğu için aynı yaklaşım
 * "son işlemler" dilimini yanlış satırlardan seçebilirdi. RLS, temsilciye
 * 0 satır döndürür (hata değil).
 */
async function selectAudit(limit = AUDIT_READ_LIMIT): Promise<Record<string, unknown>[]> {
  if (!supabase) throw new Error("Supabase istemcisi yapılandırılmadı.");
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`audit_log: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * 0018 sayaç tabloları. `0018_company_engagement.sql` bu iki tabloya yalnız
 * `authenticated` rolüne SELECT verir, anon/public için hiçbir yetki bırakmaz.
 * Bu yüzden ANON görüntüsünde bu tablolar HİÇ sorgulanmamalıdır: aksi halde
 * PostgREST `42501 permission denied for table company_engagement_counters`
 * döner ve `loadSnapshot` tek hatada TÜM görüntüyü düşürür (kamu sitesi ve
 * giriş ekranı açılamaz).
 */
export const ENGAGEMENT_TABLES = [
  "company_engagement_counters",
  "company_engagement_notifications",
] as const;

export type SnapshotOptions = {
  /**
   * 0018 sayaç/bildirim tabloları da okunsun mu? Varsayılan `true`.
   * Yönetici olmayan (anon) görüntüde `false` verilir — bkz. ENGAGEMENT_TABLES.
   */
  includeEngagement?: boolean;
};

/** Okunacak tablo listesi — sayaç tabloları yalnız yönetici görüntüsünde eklenir. */
export function snapshotTables(includeEngagement: boolean): string[] {
  const tables: string[] = [
    "categories",
    "cities",
    "city_districts",
    "teams",
    "sales_reps",
    "companies",
    "leads",
    "lead_visits",
    "sales",
    "payments",
    "memberships",
    "commissions",
    "commission_payouts",
    "referrals",
    "app_settings",
    "rep_applications",
    // 0014: ekip liderliği komisyonları — RLS ile okunur; YAZIM istemciden
    // yok (confirm_sale / record_team_commission_payout RPC'leri) → sync'e
    // eklenmez (rep_applications ile aynı desen).
    "team_commissions",
    "team_commission_payouts",
    // 0015: ekip katılım başvuruları + ekip özeti görünümü — yazım yalnız
    // RPC (submit/approve/reject); bu iki kaynak da sync write listesinde
    // DEĞİLDİR (okuma only, rep_applications deseni).
    "team_join_applications",
    "teams_overview",
  ];
  // 0018: etkileşim sayaçları + eşik bildirimleri — YAZIM yalnız
  // track_company_engagement RPC'sinde; bu iki kaynak da sync write
  // listesinde DEĞİLDİR (okuma only, rep_applications deseni).
  return includeEngagement ? [...tables, ...ENGAGEMENT_TABLES] : tables;
}

/** Oturumun RLS yetkisine göre görünen tüm tabloları okur. */
export async function loadSnapshot(options: SnapshotOptions = {}): Promise<SnapshotResult> {
  if (!isSupabaseConfigured) throw new Error("Supabase yapılandırılmadı; hydrate yalnız üretim modunda çalışır.");

  const tables = snapshotTables(options.includeEngagement !== false);
  /**
   * Denetim okuması kritik `Promise.all` zincirinin DIŞINDA ve kendi
   * catch'iyle: tablo/RLS/ağ hatası yönetim panelinin açılmasını engellemez,
   * boş audit ile devam edilir. Sorgu yine tablolarla PARALEL başlar.
   */
  const auditPromise = selectAudit()
    .then((rows) => rows.map(auditFromRow).slice(0, AUDIT_READ_LIMIT))
    .catch(() => [] as DB["audit"]);
  const outs = await Promise.all(tables.map((t) => selectAll(t)));
  const failure = outs.find((o) => o.error);
  if (failure) throw new Error(`Supabase verisi okunamadı → ${failure.error}`);
  const audit = await auditPromise;

  // Tablo adına göre eşleme: sayaç tabloları anon görüntüsünde hiç
  // sorgulanmadığı için sıralı destructuring yerine adla okunur.
  const rowsByTable = new Map(outs.map((o) => [o.table, o.rows]));
  const rows = (table: string): Record<string, unknown>[] => rowsByTable.get(table) ?? [];

  const db: DB = {
    categories: rows("categories").map(categoryFromRow),
    cities: citiesFromRows(rows("cities"), rows("city_districts")),
    companies: rows("companies").map(companyFromRow),
    reps: rows("sales_reps").map(repFromRow),
    teams: rows("teams").map(teamFromRow),
    leads: rows("leads").map(leadFromRow),
    visits: rows("lead_visits").map(visitFromRow),
    sales: rows("sales").map(saleFromRow),
    payments: rows("payments").map(paymentFromRow),
    memberships: rows("memberships").map(membershipFromRow),
    commissions: rows("commissions").map(commissionFromRow),
    commissionPayouts: rows("commission_payouts").map(commissionPayoutFromRow),
    referrals: rows("referrals").map(referralFromRow),
    // Başvurular yalnız yöneticiye görünür (0013: admin SELECT policy);
    // anon listeleme/değiştirme yapamaz (RLS default-deny).
    repApplications: rows("rep_applications").map(repApplicationFromRow),
    // 0014: lider yalnız kendi satırını görür; anon satır göremez (RLS).
    teamCommissions: rows("team_commissions").map(teamCommissionFromRow),
    teamCommissionPayouts: rows("team_commission_payouts").map(teamCommissionPayoutFromRow),
    // 0015: personel yalnız kendi başvurusunu görür (RLS); görünüm anon'a
    // kapalı, yalnız authenticated okur.
    teamJoinApplications: rows("team_join_applications").map(teamJoinApplicationFromRow),
    teamOverviews: rows("teams_overview").map(teamOverviewFromRow),
    // 0018: sayaçlar ve bildirimler yalnız okunur (yazım RPC'de). Anon
    // görüntüsünde bu tablolar hiç sorgulanmaz → boş dizi.
    engagementCounters: rows("company_engagement_counters")
      .map(engagementCounterFromRow)
      .filter((c): c is EngagementCounter => c !== null),
    engagementNotifications: rows("company_engagement_notifications")
      .map(engagementNotificationFromRow)
      .filter((n): n is EngagementNotification => n !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    settings: settingsFromRow(rows("app_settings")[0] ?? null),
    // Denetim kayıtları yalnız OKUNUR; syncSnapshot yazım listesinde değildir.
    audit,
  };
  return { db };
}

/* =========================================================
   FARK TANABANLI SENKRON YAZIMI (write-through)
   ========================================================= */

function cloneDB(db: DB): DB {
  return JSON.parse(JSON.stringify(db)) as DB;
}

function diffFor(
  localRows: Record<string, unknown>[],
  baseRows: Record<string, unknown>[], // null tablo demek: tümü upsert
): { upserts: Record<string, unknown>[]; deletes: string[] } {
  const localMap = new Map(localRows.map((r) => [String(r["id"]), r]));
  const baseMap = new Map(baseRows.map((r) => [String(r["id"]), r]));
  const upserts: Record<string, unknown>[] = [];
  for (const [id, row] of localMap) {
    const prev = baseMap.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(row)) upserts.push(row);
  }
  const deletes: string[] = [];
  for (const id of baseMap.keys()) if (!localMap.has(id)) deletes.push(id);
  return { upserts, deletes };
}

async function updateSettingsRow(settings: Settings): Promise<void> {
  if (!supabase) throw new Error("Supabase istemcisi yok.");

  const payload = settingsToRow(settings);
  const values = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "id"));
  const { data, error } = await supabase
    .from("app_settings")
    .update(values as never)
    .eq("id", 1)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`app_settings update: ${error.message}`);
  if (!data) {
    throw new Error(
      "app_settings: id=1 ayar satırı bulunamadı veya yönetici UPDATE RLS politikası etkin değil.",
    );
  }
}

async function writeChunk(table: string, op: "upsert" | "delete", payload: Record<string, unknown>[] | string[]): Promise<void> {
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  /**
   * Toplu içe aktarma, tek persist'te yüzlerce satır üretebilir; PostgREST istek
   * boyutu/TLS yüklemesi bu yüzden dilimlenir (100 satır/cağrı) — parçalar
   * sıralı yazılır, hata tek parçada fark edilebilir.
   */
  const SLICE = 100;
  if (op === "upsert") {
    for (let i = 0; i < payload.length; i += SLICE) {
      const slice = payload.slice(i, i + SLICE);
      if (!slice.length) continue;
      const { error } = await supabase.from(table).upsert(slice as never);
      if (error) throw new Error(`${table} upsert: ${error.message}`);
    }
  }
  if (op === "delete") {
    const ids = payload as string[];
    for (let i = 0; i < ids.length; i += SLICE) {
      const slice = ids.slice(i, i + SLICE);
      if (!slice.length) continue;
      const { error } = await supabase.from(table).delete().in("id", slice);
      if (error) throw new Error(`${table} delete: ${error.message}`);
    }
  }
}

/**
 * local ↔ base farkını sunucuya yazar; başarısızlıkta exception atar
 * (base değişmez; repo bir sonraki flush'ta aynı farkı yeniden dener).
 * Bağlantı sırası FK kısıtlarına uygundur.
 */
export async function syncSnapshot(local: DB, base: DB | null): Promise<DB> {
  if (!isSupabaseConfigured) throw new Error("Supabase yapılandırılmadı.");

  const b = base ?? emptyDB();

  /**
   * YAYIN GÜVENLİĞİ (son savunma hattı): `published` false→true geçişi yalnız
   * firmanın satışı ve o satışa bağlı ONAYLI ödeme varsa sunucuya yazılır.
   * İSTİSNA: scraper işaretli firmalar — yetki repo.createScraperCompany
   * (requireAdmin) içinde doğrulandı; sync aktörü doğrulayamaz, bu kararı
   * miras alır. Genel create/update yolları işaret üretemez (yayın kilidi aynen).
   */
  const basePublished = new Map(b.companies.map((c) => [c.id, c.published === true]));
  for (const c of local.companies) {
    if (c.published !== true || basePublished.get(c.id) === true) continue;
    if (c.socials?.source === "google-maps-scraper") continue;
    const saleIds = new Set(local.sales.filter((s) => s.companyId === c.id).map((s) => s.id));
    const hasConfirmedPayment = local.payments.some(
      (p) => saleIds.has(p.saleId) && p.status === "onaylandi",
    );
    if (!hasConfirmedPayment)
      throw new Error(`"${c.name}" yayına alınamaz: satış ve onaylı ödeme kaydı bulunmuyor.`);
  }

  /* ---- 1) BABA tablolar: kategori/şehir/ekip/temsilci ---- */
  // Kategoriler
  const catUp = diffFor(local.categories.map(categoryToRow), b.categories.map(categoryToRow));
  await writeChunk("categories", "upsert", catUp.upserts);
  await writeChunk("categories", "delete", catUp.deletes);

  // Şehirler + ilçeler
  const cityUp = diffFor(local.cities.map(({ districts: _d, ...rest }) => rest), b.cities.map(({ districts: _d, ...rest }) => rest));
  await writeChunk("cities", "upsert", cityUp.upserts);
  await writeChunk("cities", "delete", cityUp.deletes);

  // İlçe satırları (ayrık tablo; PK: city_id+district)
  const localPairs = local.cities.flatMap((c) => c.districts.map((d) => ({ city_id: c.id, district: d })));
  const basePairs = b.cities.flatMap((c) => c.districts.map((d) => ({ city_id: c.id, district: d })));
  const localPairSet = new Set(localPairs.map((p) => `${p.city_id}|${p.district}`));
  const basePairSet = new Set(basePairs.map((p) => `${p.city_id}|${p.district}`));
  const pairUps = localPairs.filter((p) => !basePairSet.has(`${p.city_id}|${p.district}`));
  const pairDels = basePairs.filter((p) => !localPairSet.has(`${p.city_id}|${p.district}`));
  if (pairUps.length) {
    const { error } = await supabase!.from("city_districts").upsert(pairUps as never);
    if (error) throw new Error(`city_districts upsert: ${error.message}`);
  }
  for (const p of pairDels) {
    const { error } = await supabase!.from("city_districts").delete().match(p as never);
    if (error) throw new Error(`city_districts delete: ${error.message}`);
  }

  // Ekipler (sales_reps.team_id FK'sı TERS yöndedir: ekipler ÖNCE yazılır;
  // leader_rep_id'nin sales_reps FK'sı bilinçli yoktur — bkz. 0011 notları)
  const teamUp = diffFor(local.teams.map(teamToRow), b.teams.map(teamToRow));
  await writeChunk("teams", "upsert", teamUp.upserts);
  await writeChunk("teams", "delete", teamUp.deletes);

  // Temsilciler
  const repUp = diffFor(local.reps.map(repToRow), b.reps.map(repToRow));
  await writeChunk("sales_reps", "upsert", repUp.upserts);
  await writeChunk("sales_reps", "delete", repUp.deletes);

  /* ---- 2) Firmalar ----
   * YAYIN DURUMU bu fark yazımıyla TAŞINMAZ: mevcut bir satırda `published`
   * her zaman sunucudaki bilinen değere sabitlenir. Yayın/geri alma yalnız
   * 0016 `set_company_published` RPC'siyle (sunucu doğrulaması + audit) olur;
   * aksi halde bayat/oynanmış yerel bir değer sunucudaki gerçeği ezebilirdi.
   * Yeni satırlar taslak doğar; scraper istisnası INSERT trigger'ında denetlenir.
   */
  const baseCompanyRows = new Map(b.companies.map((c) => [c.id, companyToRow(c)]));
  const localCompanyRows = local.companies.map((c) => {
    const row = companyToRow(c);
    const baseRow = baseCompanyRows.get(c.id);
    if (baseRow) row.published = baseRow.published;
    return row;
  });
  const compUp = diffFor(localCompanyRows, b.companies.map(companyToRow));
  await writeChunk("companies", "upsert", compUp.upserts);
  await writeChunk("companies", "delete", compUp.deletes);

  /* ---- 3) Adaylar ve ziyaretler ---- */
  const leadUp = diffFor(local.leads.map(leadToRow), b.leads.map(leadToRow));
  await writeChunk("leads", "upsert", leadUp.upserts);
  await writeChunk("leads", "delete", leadUp.deletes);

  const visitUp = diffFor(local.visits.map(visitToRow), b.visits.map(visitToRow));
  await writeChunk("lead_visits", "upsert", visitUp.upserts);
  await writeChunk("lead_visits", "delete", visitUp.deletes);

  /* ---- 4) Satış / ödeme / üyelik / komisyon / referans ---- */
  const saleUp = diffFor(local.sales.map(saleToRow), b.sales.map(saleToRow));
  await writeChunk("sales", "upsert", saleUp.upserts);
  await writeChunk("sales", "delete", saleUp.deletes);

  const payUp = diffFor(local.payments.map(paymentToRow), b.payments.map(paymentToRow));
  await writeChunk("payments", "upsert", payUp.upserts);
  await writeChunk("payments", "delete", payUp.deletes);

  const memUp = diffFor(local.memberships.map(membershipToRow), b.memberships.map(membershipToRow));
  await writeChunk("memberships", "upsert", memUp.upserts);
  await writeChunk("memberships", "delete", memUp.deletes);

  const comUp = diffFor(local.commissions.map(commissionToRow), b.commissions.map(commissionToRow));
  await writeChunk("commissions", "upsert", comUp.upserts);
  await writeChunk("commissions", "delete", comUp.deletes);

  const refUp = diffFor(local.referrals.map(referralToRow), b.referrals.map(referralToRow));
  await writeChunk("referrals", "upsert", refUp.upserts);
  await writeChunk("referrals", "delete", refUp.deletes);

  /* ---- 5) Ayarlar (tek satır; yalnız değer alanları değişmişse yaz —
       boot emptyDB zaman damgası racedeyip gerçek ayarların üzerine
       yazmaması için updatedAt karşılaştırmaya katılmaz) ---- */
  const s = local.settings;
  const bs = b.settings;
  const valuesDiffer =
    s.membershipPrice !== bs.membershipPrice ||
    s.repCommission !== bs.repCommission ||
    s.referralReward !== bs.referralReward ||
    s.renewalCommission !== bs.renewalCommission ||
    s.teamCapacity !== bs.teamCapacity ||
    (s.engagementEnabled !== false) !== (bs.engagementEnabled !== false) ||
    (s.engagementTier1Enabled !== false) !== (bs.engagementTier1Enabled !== false) ||
    s.engagementTier1Interval !== bs.engagementTier1Interval ||
    (s.engagementTier2Enabled !== false) !== (bs.engagementTier2Enabled !== false) ||
    s.engagementTier2Start !== bs.engagementTier2Start ||
    JSON.stringify(s.engagementKindOverrides ?? {}) !==
      JSON.stringify(bs.engagementKindOverrides ?? {});
  if (valuesDiffer) await updateSettingsRow(s);

  // Sunucuda artık bilinen durum, local'in SENKRON EDİLEbilir parçalarıdır
  // (audit_log bilinçli dışarıda kalır).
  const nextBase = cloneDB(local);
  nextBase.audit = [];
  return nextBase;
}

/* =========================================================
   WEB BAŞVURU RPC (0006 submit_web_lead)
   ========================================================= */

/** PostgREST/model seviyesindeki hatayı kullanıcıya anlaşılır Türkçe'ye çevirir. */
function friendlyRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("çok fazla deneme")) return "Çok fazla deneme yaptınız; lütfen bir süre bekleyin.";
  if (m.includes("firma adı")) return "Firma adı zorunludur.";
  if (m.includes("telefon")) return "Telefon numarası zorunludur.";
  if (m.includes("kategori bulunamadı")) return "Seçilen kategori bulunamadı.";
  if (m.includes("şehir bulunamadı")) return "Seçilen şehir bulunamadı.";
  if (m.includes("geçersiz referans")) return "Geçersiz referans bağlantısı.";
  if (m.includes("zaten bekleyen")) return "Bu bilgilerle zaten bekleyen bir başvurunuz var.";
  if (m.includes("network") || m.includes("fetch")) return "Ağ hatası; bağlantınızı kontrol edin.";
  return message;
}

/**
 * Halka açık "Firmanızı ekletin" formu — canlı modda 0006 RPC'si üzerinden.
 * Doğrudan leads INSERT YAPMAZ (2001 anonim INSERT politikası yok; bilinçli
 * tasarım). Honeypot doluysa sunucu null döner; istemci başarı gibi davranır.
 * Dönüş: oluşan kaydın id'si (honeypot yutulduysa null).
 */
export async function submitWebLead(input: {
  companyName: string;
  phone: string;
  categoryId?: string;
  cityId?: string;
  district?: string;
  note?: string;
  honeypot?: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase yapılandırılmadı; web başvurusu gönderilemedi.");
  }
  const { data, error } = await supabase.rpc("submit_web_lead", {
    p_company_name: input.companyName,
    p_phone: input.phone,
    p_category_id: input.categoryId ?? null,
    p_city_id: input.cityId ?? null,
    p_district: input.district ?? null,
    p_note: input.note ?? null,
    p_honeypot: input.honeypot ?? "",
  });
  if (error) throw new Error(friendlyRpcError(error.message));
  return typeof data === "string" ? data : null;
}

/**
 * Halka açık personel başvuru formu — canlı modda 0012 RPC'si üzerinden.
 * Doğrudan rep_applications INSERT YOK (anon politikası yok; bilinçli
 * tasarım). Referans kodu ve ekip SUNUCUDA çözülür; istemciden yalnız
 * açık kod (AF-001) gider. Honeypot doluysa sunucu null döner.
 * Dönüş: oluşan başvurunun id'si (honeypot yutulduysa null).
 */
export async function submitRepApplication(input: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  refCode: string;
  honeypot?: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase yapılandırılmadı; başvuru gönderilemedi.");
  }
  const { data, error } = await supabase.rpc("submit_rep_application", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email,
    p_ref_code: input.refCode,
    p_honeypot: input.honeypot ?? "",
  });
  if (error) throw new Error(friendlyRpcError(error.message));
  return typeof data === "string" ? data : null;
}

/* =========================================================
   SENKRON KUYRUĞU (repo.ts persist() çağrılarından beslenir)
   ========================================================= */

const SYNC_DEBOUNCE_MS = 500;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;
const syncListeners = new Set<(error: string | null) => void>();

export function onSyncStateChange(fn: (error: string | null) => void): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

function emitSync(error: string | null): void {
  for (const fn of syncListeners) fn(error);
}

/** repo.ts'in senkron ağına kendi durumu sağladığı köprü. */
interface SyncBridge {
  isConfigured(): boolean;
  getCurrent(): DB | null;
  getBaseline(): DB | null;
  setBaseline(db: DB): void;
}

let bridge: SyncBridge | null = null;

export function bindSyncBridge(b: SyncBridge): void {
  bridge = b;
}

/**
 * Bekleyen farkı yazar. Hata durumunda:
 *  - baseline DEĞİŞMEZ (bir sonraki deneme aynı farkı tekrar gönderir),
 *  - hata dinleyicilere (UI banner) duyurulur,
 *  - hata ÇAĞIRANA fırlatılır — böylece kritik işlemler (ödeme onayı, firma
 *    dönüşümü) yazım başarısızken "başarılı" görünmez.
 */
async function doFlush(): Promise<void> {
  if (!bridge || !bridge.isConfigured()) return;
  const current = bridge.getCurrent();
  if (!current) return;
  try {
    const nextBase = await syncSnapshot(current, bridge.getBaseline());
    bridge.setBaseline(nextBase);
    emitSync(null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[sync] kayıt sunucuya yazılamadı:", message);
    emitSync(message);
    throw new Error(message);
  }
}

/** Tek uçuş (single-flight) flush: aynı anda iki yazım başlatılmaz. */
function startFlush(): Promise<void> {
  if (!flushPromise) {
    flushPromise = doFlush().finally(() => {
      flushPromise = null;
    });
  }
  return flushPromise;
}

/** persist() çağrısından beslenen, debounce'lu yazım kuyruğu. */
export function scheduleSync(): void {
  if (!bridge || !bridge.isConfigured()) return;
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (flushPromise) {
      // In-flight flush sırasında gelen yazılar bir sonraki tura düşer
      scheduleSync();
      return;
    }
    // Arka plan kuyruğu: hata banner'a düşer, burada yutulur (unhandled rejection yok).
    void startFlush().catch(() => undefined);
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Bekleyen farkı hemen yazar (hydrate/login/logout ve kritik işlemler öncesi).
 * Yazım başarısız olursa hata çağırana fırlatılır.
 */
export async function flushNow(): Promise<void> {
  if (!bridge || !bridge.isConfigured()) return;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  await startFlush();
}
