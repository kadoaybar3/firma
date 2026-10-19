import type {
  Category,
  City,
  Commission,
  Company,
  DB,
  Lead,
  LeadVisit,
  Membership,
  Payment,
  Referral,
  Sale,
  SalesRep,
  Settings,
} from "./types";
import { supabase, isSupabaseConfigured } from "./supabase";
import { nowISO } from "./engine";

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
    leads: [],
    visits: [],
    sales: [],
    payments: [],
    memberships: [],
    commissions: [],
    referrals: [],
    settings: {
      membershipPrice: 0,
      repCommission: 0,
      referralReward: 0,
      renewalCommission: 0,
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
    images: c.images?.length ? c.images : ["🏢"],
    hours: c.hours ?? {},
    featured: Boolean(c.featured),
    published: Boolean(c.published),
    sales_rep_id: c.repId ?? null,
    created_at: c.createdAt ?? nowISO(),
    updated_at: c.updatedAt ?? nowISO(),
  };
}

export function companyFromRow(row: Record<string, unknown>): Company {
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
    images: (row["images"] as string[]) ?? ["🏢"],
    hours: (row["hours"] as Company["hours"]) ?? { weekday: "", saturday: "", sunday: "" },
    featured: Boolean(row["featured"]),
    published: Boolean(row["published"]),
    repId: sopt(row, "sales_rep_id"),
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
    created_at: r.createdAt ?? nowISO(),
  };
}

export function leadFromRow(row: Record<string, unknown>): Lead {
  return {
    id: sv(row, "id"),
    repId: sopt(row, "sales_rep_id"),
    companyName: sv(row, "company_name"),
    categoryId: sopt(row, "category_id"),
    cityId: sopt(row, "city_id"),
    district: sopt(row, "district"),
    phone: sopt(row, "phone"),
    note: sv(row, "note"),
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
    note: l.note ?? "",
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

export function settingsFromRow(row: Record<string, unknown> | null): Settings {
  if (!row)
    return {
      membershipPrice: 1000,
      repCommission: 600,
      referralReward: 100,
      renewalCommission: 600,
      updatedAt: nowISO(),
    };
  return {
    membershipPrice: num(row, "membership_price"),
    repCommission: num(row, "rep_commission"),
    referralReward: num(row, "referral_reward"),
    renewalCommission: num(row, "renewal_commission"),
    updatedAt: sv(row, "updated_at"),
  };
}

export function settingsToRow(s: Settings): Record<string, unknown> {
  return {
    id: 1,
    membership_price: s.membershipPrice,
    rep_commission: s.repCommission,
    referral_reward: s.referralReward,
    renewal_commission: s.renewalCommission,
    updated_at: s.updatedAt ?? nowISO(),
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

/** Oturumun RLS yetkisine göre görünen tüm tabloları okur. */
export async function loadSnapshot(): Promise<SnapshotResult> {
  if (!isSupabaseConfigured) throw new Error("Supabase yapılandırılmadı; hydrate yalnız üretim modunda çalışır.");

  const tables = [
    "categories",
    "cities",
    "city_districts",
    "sales_reps",
    "companies",
    "leads",
    "lead_visits",
    "sales",
    "payments",
    "memberships",
    "commissions",
    "referrals",
    "app_settings",
  ] as const;
  const outs = await Promise.all(tables.map((t) => selectAll(t)));
  const failure = outs.find((o) => o.error);
  if (failure) throw new Error(`Supabase verisi okunamadı → ${failure.error}`);

  const [cats, cityRows, districtRows, repRows, compRows, leadRows, visitRows, saleRows, payRows, memRows, comRows, refRows, settingsRows] =
    outs.map((o) => o.rows);

  const db: DB = {
    categories: cats.map(categoryFromRow),
    cities: citiesFromRows(cityRows, districtRows),
    companies: compRows.map(companyFromRow),
    reps: repRows.map(repFromRow),
    leads: leadRows.map(leadFromRow),
    visits: visitRows.map(visitFromRow),
    sales: saleRows.map(saleFromRow),
    payments: payRows.map(paymentFromRow),
    memberships: memRows.map(membershipFromRow),
    commissions: comRows.map(commissionFromRow),
    referrals: refRows.map(referralFromRow),
    settings: settingsFromRow(settingsRows[0] ?? null),
    audit: [],
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

async function writeChunk(table: string, op: "upsert" | "delete", payload: Record<string, unknown>[] | string[]): Promise<void> {
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  if (op === "upsert" && payload.length) {
    const { error } = await supabase.from(table).upsert(payload as never);
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }
  if (op === "delete" && (payload as string[]).length) {
    const { error } = await supabase.from(table).delete().in("id", payload as string[]);
    if (error) throw new Error(`${table} delete: ${error.message}`);
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

  /* ---- 1) BABA tablolar: kategori/şehir/temsilci ---- */
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

  // Temsilciler
  const repUp = diffFor(local.reps.map(repToRow), b.reps.map(repToRow));
  await writeChunk("sales_reps", "upsert", repUp.upserts);
  await writeChunk("sales_reps", "delete", repUp.deletes);

  /* ---- 2) Firmalar ---- */
  const compUp = diffFor(local.companies.map(companyToRow), b.companies.map(companyToRow));
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
    s.renewalCommission !== bs.renewalCommission;
  if (valuesDiffer) await writeChunk("app_settings", "upsert", [settingsToRow(s)]);

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

/* =========================================================
   SENKRON KUYRUĞU (repo.ts persist() çağrılarından beslenir)
   ========================================================= */

const SYNC_DEBOUNCE_MS = 500;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;
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

async function doFlush(): Promise<void> {
  if (!bridge || !bridge.isConfigured()) return;
  const current = bridge.getCurrent();
  if (!current) return;
  try {
    const nextBase = await syncSnapshot(current, bridge.getBaseline());
    bridge.setBaseline(nextBase);
    emitSync(null);
  } catch (err) {
    // Hata sessizce YUTULMAZ: base değişmedi; bir sonraki persist/flush aynı
    // farkı tekrar dener ve hata dinleyicilere/UI'e duyurulur.
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[sync] kayıt sunucuya yazılamadı:", message);
    emitSync(message);
  }
}

/** persist() çağrısından beslenen, debounce'lu yazım kuyruğu. */
export function scheduleSync(): void {
  if (!bridge || !bridge.isConfigured()) return;
  if (syncTimer) return;
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    if (flushInFlight) {
      // In-flight flush sırasında gelen yazılar bir sonraki tura düşer
      scheduleSync();
      return;
    }
    flushInFlight = true;
    await doFlush();
    flushInFlight = false;
  }, SYNC_DEBOUNCE_MS);
}

/** Bekleyen farkı hemen yazar (hydrate/login/logout öncesi çağrılır). */
export async function flushNow(): Promise<void> {
  if (!bridge || !bridge.isConfigured()) return;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!flushInFlight) {
    flushInFlight = true;
    await doFlush();
    flushInFlight = false;
  }
}
