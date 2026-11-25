import type {
  Actor,
  Category,
  City,
  Commission,
  CommissionPayout,
  Company,
  DB,
  EngagementCounter,
  EngagementKind,
  EngagementNotification,
  Lead,
  LeadStatus,
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
import { seedDB } from "../data/seed";
import { normalizeSearch, slugify, uniqueSlug } from "./slug";
import { uid, nowISO, log } from "./engine";
import * as engine from "./engine";
import { isSupabaseConfigured, supabase } from "./supabase";
import { bindSyncBridge, emptyDB, flushNow, loadSnapshot, scheduleSync } from "./dataSource";
import { scheduleSeoRebuild, companySeoSnapshot, seoRelevantChange } from "./seoRebuild";
import { normalizeCoordinates } from "./coordinates";
import { isValidPackageAmount, packageAmount } from "./packages";
import { ENGAGEMENT_DEFAULTS, applyEngagementToDB } from "./engagement";

/**
 * VERİ KAYNAĞI KATMANI
 *
 * DEMO MOD (Supabase yapılandırılmamış): tüm veriler tarayıcının
 * localStorage'ında tutulur. Bu katman, Production'da Supabase deposuyla
 * değiştirilebilecek tutarlı bir fonksiyon arayüzü sunar.
 *
 * SUPABASE MOD (.env dolu): getDB() localStorage'a ASLA yazmaz ve tohum
 * VERİ ÜRETMEZ — App bootstrap dataSource.loadSnapshot() ile anlık görüntü
 * yükler; mutasyonlar bellekte uygulanır ve persist() fark-tabanlı
 * senkron yazımı (dataSource.syncSnapshot) sıraya alır. Denetim kayıtları
 * istemciden yazılmaz (0002: log_audit yalnız service_role).
 * BU DEMO MOD GERÇEK BIR VERITABANI DEĞILDIR; Roller arayüzde korunur,
 * sunucu taraflı koruma (RLS) Supabase migration'ında hazırdır.
 */

const STORAGE_KEY = "firma-rehberi.db.v2"; // v2: anlamsal kategori eşlemeli tohum veri

let cache: DB | null = null;
let storageAvailable = true;

/* Senkron köprüsü: persist()'ten gelen sinyali veri kaynağına iletir.
   Fark (diff) tabanı: sunucuda son bilinen durum; hydrate sonrasında
   setBaseline ile güncellenir (auth/App akışları dataSource.setSnapshotThrough). */
let lastSyncBaseline: DB | null = null;

bindSyncBridge({
  isConfigured: () => isSupabaseConfigured,
  getCurrent: () => cache,
  getBaseline: () => lastSyncBaseline,
  setBaseline: (db) => {
    lastSyncBaseline = db;
  },
});

export function getDB(): DB {
  if (cache) return cache;
  if (isSupabaseConfigured) {
    // Uretim: tohumlama/localStorage yok; bootstrap hydrate tasle anlık gorunumu doldurur.
    const empty = emptyDB();
    cache = empty;
    return empty;
  }
  if (storageAvailable && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        cache = JSON.parse(raw) as DB;
        // Eski demo kayıtları (0011 öncesi) ekip alanı içermez → yüklemede tamamla.
        if (!Array.isArray(cache.teams)) cache.teams = [];
        if (!(cache.settings?.teamCapacity >= 2))
          cache.settings = { ...cache.settings, teamCapacity: 15 } as DB["settings"];
        // 0018 öncesi demo kayıtları: yeni alanları varsayılanla tamamla.
        if (!Array.isArray(cache.engagementCounters)) cache.engagementCounters = [];
        if (!Array.isArray(cache.engagementNotifications)) cache.engagementNotifications = [];
        if (typeof cache.settings?.engagementEnabled !== "boolean")
          cache.settings = { ...cache.settings, ...ENGAGEMENT_DEFAULTS } as DB["settings"];
        return cache;
      }
    } catch {
      // Bozuk veri → yeniden tohumla
    }
  }
  const seeded = seedDB();
  cache = seeded;
  persist();
  return seeded;
}

export function persist(): void {
  repoVersion++;
  if (!cache) return;
  if (isSupabaseConfigured) {
    scheduleSync();
    return;
  }
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    storageAvailable = false; // iCloud/private mod vb. — bellek içi devam
  }
}

export function resetDB(): void {
  if (isSupabaseConfigured) {
    // Gerçek veritabanına karşı demo tohumu ASLA yazılırımaz; yalnız demo modda geçerli.
    console.warn("resetDB demo modda geçerlidir; Supabase modunda yok sayıldı.");
    return;
  }
  cache = seedDB();
  companyIndexCache = null;
  persist();
}

/** Testler için */
export function setDB(db: DB): void {
  cache = db;
  companyIndexCache = null;
}

/**
 * Supabase anlık görüntüsünü devreye alır (App/auth hydrate akışı kullanır):
 * cache'i değiştirir VE fark-senkronun taban (baseline) durumunu günceller —
 * aksi halde ilk flush tüm tabloları yeniden upsert etmeye kalkardı.
 */
export function applySnapshot(db: DB): void {
  cache = db;
  companyIndexCache = null;
  lastSyncBaseline = JSON.parse(JSON.stringify(db)) as DB;
  lastSyncBaseline.audit = [];
}

/* ============ YETKİ KONTROLLERİ ============ */

/**
 * İstemci tarafı rol kapısı. Canlı modda asıl sınır RLS'dir; bu kontrol demo
 * modda da aynı davranışı korur ve yanlışlıkla çağrılan yönetim işlemlerini
 * engeller. Sunucu anahtarı kullanılmaz.
 */
function requireAdmin(actor: Actor): void {
  if (actor.role !== "admin")
    throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
}

/* ============ FİRMALAR ============ */

/* --- O(1) id-arama indeksi (FirmCard O(n²) grid taraması kapatılır) ---
 * Salt-okunur ekleme; getCompanyById davranışı değişmez (canlı referans döner).
 * Geçerlilik: persist() her mutasyondan sonra çağırdığından sürüm sayacı
 * indeksi tazeler; setDB/resetDB de indeks bilinçli düşürür. */
let repoVersion = 0;
let companyIndexCache: { version: number; map: Map<string, Company> } | null = null;

export function companyIndex(): Map<string, Company> {
  const db = getDB();
  if (!companyIndexCache || companyIndexCache.version !== repoVersion) {
    const map = new Map<string, Company>();
    for (const c of db.companies) map.set(c.id, c);
    companyIndexCache = { version: repoVersion, map };
  }
  return companyIndexCache.map;
}

export interface CompanyFilter {
  q?: string;
  categoryId?: string;
  citySlug?: string;
  district?: string;
  featuredOnly?: boolean;
  includeUnpublished?: boolean;
}

export function listCompanies(filter: CompanyFilter = {}): Company[] {
  const db = getDB();
  const cityId = filter.citySlug
    ? db.cities.find((c) => c.slug === filter.citySlug)?.id
    : undefined;
  const q = filter.q ? normalizeSearch(filter.q) : "";

  return db.companies
    .filter((co) => {
      if (!filter.includeUnpublished && !co.published) return false;
      if (filter.categoryId && co.categoryId !== filter.categoryId) return false;
      if (cityId && co.cityId !== cityId) return false;
      if (
        filter.district &&
        co.district.toLocaleLowerCase("tr") !== filter.district.toLocaleLowerCase("tr")
      )
        return false;
      if (filter.featuredOnly && !co.featured) return false;
      if (q) {
        const category = db.categories.find((c) => c.id === co.categoryId);
        const haystack = normalizeSearch(
          `${co.name} ${co.description} ${co.district} ${category?.name ?? ""}`,
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, "tr"));
}

export function getCompanyBySlug(slug: string): Company | undefined {
  const db = getDB();
  return db.companies.find((c) => c.slug === slug);
}

export function getCompanyById(id: string): Company | undefined {
  return getDB().companies.find((c) => c.id === id);
}

export interface CompanyDraft {
  name: string;
  categoryId: string;
  cityId: string;
  district: string;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  socials?: Company["socials"];
  description: string;
  hours?: Company["hours"];
  featured?: boolean;
  published?: boolean;
  repId?: string | null;
  /** Harita konumu; iki alan birlikte geçerli olmalıdır. */
  latitude?: number;
  longitude?: number;
}

/** Konum alanlarından en az biri doluysa ikisinin de geçerli olmasını şart koşar. */
function normalizedDraftCoordinates(draft: {
  latitude?: number;
  longitude?: number;
}): { latitude: number; longitude: number } | null {
  const hasAny = draft.latitude !== undefined || draft.longitude !== undefined;
  const coords = normalizeCoordinates(draft.latitude, draft.longitude);
  if (hasAny && !coords) throw new Error("Konum koordinatları geçersiz.");
  return coords;
}

/**
 * @param internalId Yalnızca başarısız bir lead dönüşümünün yeniden denenmesinde
 * kullanılır: aynı kimlikle upsert edilerek sunucuda yetim firma satırı oluşması
 * engellenir. Normal çağrılarda verilmez.
 */
export function createCompany(draft: CompanyDraft, actor: Actor, internalId?: string): Company {
  requireAdmin(actor);
  // Genel yol: işaret üretemez — marker saklanmaz, yayın yalnız ödeme ile.
  const { source: _drop, ...rest } = draft.socials ?? {};
  return buildCompany({ ...draft, socials: rest }, actor, internalId, false);
}

/**
 * Ödemesiz yayın istisnasının TEK kapısı: Google Scraper içe aktarma.
 * Admin yetkisi buradaki requireAdmin ile doğrulanır; işaret olmadan
 * draft.published yoksayılır. Normal personel/lead akışları bu fonksiyonu kullanmaz.
 */
export function createScraperCompany(draft: CompanyDraft, actor: Actor): Company {
  requireAdmin(actor);
  if (draft.socials?.source !== "google-maps-scraper") {
    throw new Error("Scraper içe aktarma işareti gerekli.");
  }
  const company = buildCompany(draft, actor, undefined, draft.published === true);
  // SEO tetikleme (4F): ilk kez yayında doğan firma yeni sitemap URL'i ekler.
  if (company.published) scheduleSeoRebuild();
  return company;
}

function buildCompany(draft: CompanyDraft, actor: Actor, internalId: string | undefined, published: boolean): Company {
  const db = getDB();
  if (!draft.name.trim()) throw new Error("Firma adı zorunludur.");
  if (!draft.phone.trim()) throw new Error("Telefon numarası zorunludur.");
  const coords = normalizedDraftCoordinates(draft);
  const company: Company = {
    id: internalId ?? uid(),
    name: draft.name.trim(),
    slug: uniqueSlug(
      draft.name,
      db.companies.map((c) => c.slug),
    ),
    categoryId: draft.categoryId,
    cityId: draft.cityId,
    district: draft.district,
    address: draft.address.trim(),
    phone: draft.phone.trim(),
    email: draft.email?.trim() || undefined,
    website: draft.website?.trim() || undefined,
    socials: draft.socials ?? {},
    description: draft.description.trim(),
    // Fotoğraf sistemi kaldırıldı; kolon geriye dönük uyumluluk için boş kalsın
    images: [],
    hours: draft.hours ?? { weekday: "09:00 - 18:00", saturday: "09:00 - 16:00", sunday: "Kapalı" },
    featured: draft.featured ?? false,
    // GÜVENLİK: genel yolda yeni firma ASLA yayında doğmaz (false).
    // Ödemesiz yayın yalnız createScraperCompany ile (admin + scraper işareti).
    published,
    repId: draft.repId ?? undefined,
    ...(coords ?? {}),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.companies.push(company);
  log(db, actor, "firma_eklendi", `Firma eklendi: ${company.name}`, { companyId: company.id });
  persist();
  return company;
}

/**
 * Firma için yönetici tarafından doğrulanmış bir ödeme var mı?
 * Personel kaynaklı (repId dolu) firmaların yayına alınması bu kontrole bağlıdır.
 */
export function companyHasConfirmedPayment(companyId: string): boolean {
  const db = getDB();
  const saleIds = new Set(
    db.sales.filter((s) => s.companyId === companyId).map((s) => s.id),
  );
  return db.payments.some((p) => saleIds.has(p.saleId) && p.status === "onaylandi");
}

export function updateCompany(id: string, patch: Partial<CompanyDraft>, actor: Actor): Company {
  requireAdmin(actor);
  const db = getDB();
  const company = db.companies.find((c) => c.id === id);
  if (!company) throw new Error("Firma bulunamadı.");
  // Canlı modda yayın durumu yalnız `setCompanyPublished` (0016 sunucu RPC'si)
  // ile değişir. Diğer alanların düzenlenmesi published'a dokunmaz; bu yüzden
  // yalnız gerçek bir geçiş isteği reddedilir (form aynı değeri geri gönderir).
  if (
    patch.published !== undefined &&
    patch.published !== company.published &&
    isSupabaseConfigured
  ) {
    throw new Error(
      "Yayın durumu yalnızca güvenli yayınlama işlemiyle değiştirilebilir.",
    );
  }
  // GÜVENLİK: yayına alma, firmanın satışı ve o satışa bağlı ONAYLI ödeme
  // kaydı olmadan yapılamaz. İSTİSNA (dar): zaten işaretli scraper firmalar
  // admin tarafından ödemesiz yayına alınabilir. İşaret burada yasaklanan
  // yamayla değil, yalnız createScraperCompany ile konabilir (genel yollar
  // işaret üretemez, düzenleme işareti değiştiremez) — istisna yamaya kapalı.
  if (
    patch.published === true &&
    !company.published &&
    company.socials?.source !== "google-maps-scraper" &&
    !companyHasConfirmedPayment(id)
  ) {
    throw new Error(
      "Firma, satış kaydı ve yönetici tarafından onaylanmış ödeme olmadan yayına alınamaz. Önce satış/ödeme kaydını doğrulayın.",
    );
  }
  const before = { featured: company.featured, published: company.published };
  // SEO tetikleme (4F): değişiklik öncesi/sonrası snapshot — yalnız SEO
  // çıktısını etkileyen alan farkında build tetiklenir.
  const seoBefore = companySeoSnapshot(company);
  const coords = normalizedDraftCoordinates(patch);
  // İşaret yamalaması engeli: genel düzenleme kaynağı değiştiremez.
  if (patch.socials?.source !== undefined) {
    const source = company.socials?.source;
    Object.assign(company, patch, coords ?? {}, { updatedAt: nowISO() });
    company.socials = { ...company.socials };
    if (source === undefined) delete company.socials.source; else company.socials.source = source;
  } else {
    Object.assign(company, patch, coords ?? {}, { updatedAt: nowISO() });
  }
  if (patch.name && patch.name.trim() && patch.name !== company.name) {
    // Ad değişse de slug korunur (bağlantı istikrarı); yalnızca ilk oluşturmada üretilir.
    company.name = patch.name.trim();
  }
  const seoAffects = seoRelevantChange(seoBefore, companySeoSnapshot(company));
  log(db, actor, "firma_guncellendi", `Firma güncellendi: ${company.name}`, {
    companyId: id,
    patch,
    before,
  });
  persist();
  // Yayın dışı firmada SEO alanı değişikliği sitemap'i değiştirmez (filter içinde).
  if (seoAffects) scheduleSeoRebuild();
  return company;
}

/* ============ FİRMA YAYINI (TEK GÜVENLİ YOL) ============ */

/**
 * Firma yayın durumunu değiştirir — yayınlama/geri alma için TEK yol.
 *
 * CANLI (Supabase): 0016 `set_company_published` SECURITY DEFINER RPC'si
 * çağrılır. RPC yalnız admin kapısı, satır kilidi ve idempotency uygular;
 * kesinleşmiş (`odendi`) satış + ona bağlı `onaylandi` ödeme şartını ve
 * `log_audit` kaydını sunucudaki `guard_company_publish` trigger'ı uygular.
 * İstemcideki ödeme kontrolü yalnız erken geri bildirimdir; asıl sınır
 * sunucudadır (doğrudan PostgREST UPDATE'i de aynı trigger'dan geçer).
 *
 * `note` yalnız DEMO audit'inde kullanılır; canlıda audit'i trigger yazdığı
 * için RPC'ye taşınmaz (0016 imzası: uuid, boolean).
 *
 * SCRAPER İSTİSNASI: `socials.source === "google-maps-scraper"` firmalar
 * ödemesiz yayınlanabilir. Sunucu bunu `firma_yayinlandi_scraper` eylemiyle
 * ayrı kaydeder; normal firmalarla karışmaz.
 *
 * DEMO: aynı karar yerelde uygulanır ve audit kaydı yazılır (Supabase modunda
 * audit istemciden yazılamaz; 0002).
 */
export async function setCompanyPublished(
  companyId: string,
  published: boolean,
  actor: Actor,
  note?: string,
  options: { refreshSnapshot?: boolean } = {},
): Promise<void> {
  requireAdmin(actor);
  const db = getDB();
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error("Firma bulunamadı.");
  // Idempotent: istenen durum zaten geçerliyse hiçbir şey yazılmaz.
  if (company.published === published) return;

  const scraper = company.socials?.source === "google-maps-scraper";
  if (published && !scraper && !companyHasConfirmedPayment(companyId)) {
    throw new Error(
      "Firma yayına alınamaz: kesinleşmiş satış ve onaylanmış ödeme kaydı bulunmuyor.",
    );
  }

  if (isSupabaseConfigured) {
    await flushPending("Firma yayın durumu değiştirilmeden");
    if (!supabase) throw new Error("Supabase istemcisi yok.");
    const { error } = await supabase.rpc("set_company_published", {
      p_company_id: companyId,
      p_published: published,
    });
    if (error) throw new Error(error.message || "Yayın durumu değiştirilemedi.");
    if (options.refreshSnapshot !== false) await refreshFromServer();
    // SEO: yayın durumu sitemap'i etkiler (updateCompany'daki davranış korunur).
    scheduleSeoRebuild();
    return;
  }

  company.published = published;
  company.updatedAt = nowISO();
  const cleanNote = note?.trim() || undefined;
  log(
    db,
    actor,
    published
      ? scraper
        ? "firma_yayinlandi_scraper"
        : "firma_yayinlandi"
      : "firma_yayindan_kaldirildi",
    published
      ? `${company.name} ${scraper ? "scraper kaynağından ödemesiz " : ""}yayına alındı`
      : `${company.name} yayından kaldırıldı`,
    { companyId, published, scraper, note: cleanNote },
  );
  persist();
  scheduleSeoRebuild();
}

/**
 * Toplu yayın/geri alma sonrası yerel görünümü sunucuyla TEK seferde hizalar.
 * `setCompanyPublished` her satır için RPC çağırır; snapshot yenilemesi
 * çağrı başına tekrarlanmasın diye döngüde kapatılır ve burada bir kez yapılır.
 */
export async function refreshPublishSnapshot(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await refreshFromServer();
}

export function deleteCompany(id: string, actor: Actor): void {
  requireAdmin(actor);
  const db = getDB();
  const company = db.companies.find((c) => c.id === id);
  if (!company) throw new Error("Firma bulunamadı.");
  // Üyeliği aktif firmayı silmeyi engelle
  const hasActive = db.memberships.some((m) => m.companyId === id && m.status === "aktif");
  if (hasActive)
    throw new Error("Bu firmanın aktif bir üyeliği var. Seçili firmayı yayından kaldırabilirsiniz.");
  // SEO tetikleme (4F): yayındaki firma silinirse sitemap'ten düşmeli.
  const wasPublished = company.published;
  db.companies = db.companies.filter((c) => c.id !== id);
  // Dönüşüm işaretçisi asılmaz (FK on delete set null ile aynı davranış):
  // firması silinen aday yeniden dönüştürülebilir hale gelir.
  for (const lead of db.leads) {
    if (lead.convertedToCompanyId === id) {
      lead.updatedAt = nowISO();
      delete lead.convertedToCompanyId;
    }
  }
  log(db, actor, "firma_silindi", `Firma silindi: ${company.name}`, { companyId: id });
  persist();
  if (wasPublished) scheduleSeoRebuild();
}

/* ============ KATEGORİLER ============ */

export function listCategories(): Category[] {
  return getDB().categories;
}

export function getCategoryById(id: string): Category | undefined {
  return getDB().categories.find((c) => c.id === id);
}

export function categoryCompanyCount(id: string): number {
  return getDB().companies.filter((c) => c.categoryId === id && c.published).length;
}

export function createCategory(name: string, icon: string, actor: Actor): Category {
  requireAdmin(actor);
  const db = getDB();
  const cat: Category = {
    id: uid(),
    name: name.trim(),
    slug: uniqueSlug(
      name,
      db.categories.map((c) => c.slug),
    ),
    icon: icon.trim() || "🏢",
  };
  db.categories.push(cat);
  log(db, actor, "kategori_eklendi", `Kategori eklendi: ${cat.name}`, { categoryId: cat.id });
  persist();
  // SEO tetikleme (4F): yeni kategori sayfası sitemap'e girer.
  scheduleSeoRebuild();
  return cat;
}

export function deleteCategory(id: string, actor: Actor): void {
  requireAdmin(actor);
  const db = getDB();
  const inUse = db.companies.some((c) => c.categoryId === id);
  if (inUse) throw new Error("Bu kategoride çalışan firmalar var; önce onları taşıyın.");
  const cat = db.categories.find((c) => c.id === id);
  db.categories = db.categories.filter((c) => c.id !== id);
  if (cat) log(db, actor, "kategori_silindi", `Kategori silindi: ${cat.name}`, { categoryId: id });
  persist();
  // SEO tetikleme (4F): kategori sayfası sitemap'ten düşer.
  scheduleSeoRebuild();
}

/* ============ ŞEHİR / İLÇE ============ */

export function listCities(): City[] {
  return getDB().cities;
}

export function getCityBySlug(slug: string): City | undefined {
  return getDB().cities.find((c) => c.slug === slug);
}

export function getCityById(id: string): City | undefined {
  return getDB().cities.find((c) => c.id === id);
}

export function districtCount(cityId: string, district: string): number {
  const db = getDB();
  const city = db.cities.find((c) => c.id === cityId);
  return city
    ? db.companies.filter((c) => c.cityId === cityId && c.district === district && c.published)
        .length
    : 0;
}

export const districtCompanyCount = districtCount;

/**
 * Tek geçişli ilçe sayacı — listeleme sayfalarının her render'ında ilçe başına
 * O(n) filtre koşmasını ve listCompanies'in sıralama maliyetini taşımasını önler.
 * Salt-okunur ekleme; mevcut fonksiyonların davranışı değişmez.
 * Anlambilim districtCompanyCount ile birebir aynıdır (published + exact-case).
 */
export function districtCountsByCity(cityId: string): Map<string, number> {
  const db = getDB();
  const counts = new Map<string, number>();
  for (const c of db.companies) {
    if (c.cityId === cityId && c.published) {
      counts.set(c.district, (counts.get(c.district) ?? 0) + 1);
    }
  }
  return counts;
}

export function addDistrict(cityId: string, name: string, actor: Actor): void {
  requireAdmin(actor);
  const db = getDB();
  const city = db.cities.find((c) => c.id === cityId);
  if (!city) throw new Error("Şehir bulunamadı.");
  const district = name.trim();
  if (!district) return;
  if (city.districts.includes(district)) throw new Error("Bu ilçe zaten kayıtlı.");
  city.districts.push(district);
  log(db, actor, "ilce_eklendi", `İlçe eklendi: ${city.name}/${district}`, { cityId, district });
  persist();
  // SEO tetikleme (4F): yeni ilçe sayfası sitemap'e girer.
  scheduleSeoRebuild();
}

export function removeDistrict(cityId: string, name: string, actor: Actor): void {
  const db = getDB();
  const city = db.cities.find((c) => c.id === cityId);
  if (!city) throw new Error("Şehir bulunamadı.");
  if (db.companies.some((c) => c.cityId === cityId && c.district === name))
    throw new Error("Bu ilçede kazanılan firmalar var; önce onları taşıyın.");
  if (name === "Merkez") throw new Error("Merkez ilçesi kaldırılamaz.");
  city.districts = city.districts.filter((d) => d !== name);
  log(db, actor, "ilce_kaldirildi", `İlçe kaldırıldı: ${city.name}/${name}`, { cityId, name });
  persist();
  // SEO tetikleme (4F): ilçe sayfası sitemap'ten düşer.
  scheduleSeoRebuild();
}

export function createCity(name: string, actor: Actor, districts: string[] = ["Merkez"]): City {
  const db = getDB();
  const cleanDistricts = [...new Set(districts.map((d) => d.trim()).filter(Boolean))];
  const city: City = {
    id: uid(),
    name: name.trim(),
    slug: uniqueSlug(
      name,
      db.cities.map((c) => c.slug),
    ),
    districts: cleanDistricts.length ? cleanDistricts : ["Merkez"],
  };
  db.cities.push(city);
  log(db, actor, "sehir_eklendi", `Şehir eklendi: ${city.name}`, { cityId: city.id });
  persist();
  // SEO tetikleme (4F): yeni şehir sayfası sitemap'e girer.
  scheduleSeoRebuild();
  return city;
}

/* ============ TEMSİLCİLER ============ */

export function listReps(actor?: Actor): SalesRep[] {
  const db = getDB();
  // Temsilci yalnızca kendi kaydını görür; admin hepsini görür.
  if (actor && actor.role === "temsilci" && actor.repId)
    return db.reps.filter((r) => r.id === actor.repId);
  return db.reps;
}

export function getRepById(id: string): SalesRep | undefined {
  return getDB().reps.find((r) => r.id === id);
}

export function createRep(name: string, phone: string, actor: Actor): SalesRep {
  const db = getDB();
  const rep: SalesRep = {
    id: uid(),
    name: name.trim(),
    phone: phone.trim(),
    code: uniqueRepCode(db),
    status: "aktif",
    createdAt: nowISO(),
  };
  db.reps.push(rep);
  log(db, actor, "temsilci_eklendi", `Temsilci eklendi: ${rep.name} (${rep.code})`, {
    repId: rep.id,
  });
  persist();
  return rep;
}

function uniqueRepCode(db: DB): string {
  let n = db.reps.length + 1;
  let code = `AF-${String(n).padStart(3, "0")}`;
  while (db.reps.some((r) => r.code === code)) {
    n++;
    code = `AF-${String(n).padStart(3, "0")}`;
  }
  return code;
}

export function updateRep(
  id: string,
  patch: Partial<Pick<SalesRep, "name" | "phone" | "status" | "customCommissionRate">>,
  actor: Actor,
): SalesRep {
  const db = getDB();
  const rep = db.reps.find((r) => r.id === id);
  if (!rep) throw new Error("Temsilci bulunamadı.");
  const before = { status: rep.status, customCommissionRate: rep.customCommissionRate };
  Object.assign(rep, patch);
  log(db, actor, "temsilci_guncellendi", `Temsilci güncellendi: ${rep.name}`, {
    repId: id,
    patch,
    before,
  });
  persist();
  return rep;
}

/* ============ ADAY & ZİYARET (Tekrar edildiği yaklaşık) ============ */

export function listLeads(actor: Actor): Lead[] {
  const db = getDB();
  if (actor.role === "temsilci") {
    // repId'siz temsilci hesabı hiçbir adayı GÖREMEZ (boş liste — havuza sızma olmasın)
    return db.leads
      .filter((l) => l.repId === actor.repId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return [...db.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listVisits(leadId: string): LeadVisit[] {
  return getDB()
    .visits.filter((v) => v.leadId === leadId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function createLead(
  data: Pick<
    Lead,
    "companyName" | "categoryId" | "cityId" | "district" | "phone" | "email" | "socials" | "note"
  > & { address?: string; latitude?: number; longitude?: number; hours?: Lead["hours"] },
  actor: Actor,
): Lead {
  if (actor.role !== "temsilci" || !actor.repId)
    throw new Error("Aday yalnızca satış temsilcisi tarafından eklenabilir.");
  const db = getDB();
  // Çalışma saatleri firma ile aynı üç alanlı biçimde taşınır; hiçbiri
  // girilmediyse alan hiç yazılmaz (firma varsayılanı korunur).
  const hours = data.hours
    ? {
        weekday: data.hours.weekday.trim(),
        saturday: data.hours.saturday.trim(),
        sunday: data.hours.sunday.trim(),
      }
    : undefined;
  const hasHours = Boolean(hours && (hours.weekday || hours.saturday || hours.sunday));
  const lead: Lead = {
    id: uid(),
    repId: actor.repId,
    source: "sahada",
    companyName: data.companyName.trim(),
    categoryId: data.categoryId || undefined,
    cityId: data.cityId || undefined,
    district: data.district?.trim() || undefined,
    phone: data.phone?.trim(),
    email: data.email?.trim() || undefined,
    socials: {
      whatsapp: data.socials?.whatsapp?.trim() || undefined,
      instagram: data.socials?.instagram?.trim() || undefined,
      facebook: data.socials?.facebook?.trim() || undefined,
    },
    address: data.address?.trim() || undefined,
    ...(normalizedDraftCoordinates(data) ?? {}),
    ...(hasHours && hours ? { hours } : {}),
    note: data.note.trim(),
    status: "yeni",
    visitCount: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  if (!lead.companyName) throw new Error("Firma adı zorunludur.");
  db.leads.push(lead);
  log(db, actor, "aday_eklendi", `Aday eklendi: ${lead.companyName}`, { leadId: lead.id });
  persist();
  return lead;
}

/**
 * Tur 6: Web kaynaklı aday — halka açık "Firmanızı ekletin" formundan gelir.
 * Rep atanmaz (admin ConvertLeadPanel'de atayabilir); 'web_basvuru' denetimi
 * yazılır. Spam karşı arayüz katmanında honeypot işler; repo yalnızca
 * doğrulama yapar.
 */
export function createPublicLead(
  data: {
    companyName: string;
    categoryId?: string;
    cityId?: string;
    district?: string;
    phone: string;
    note?: string;
  },
): Lead {
  const companyName = data.companyName.trim();
  const phone = data.phone.trim();
  if (!companyName) throw new Error("Firma adı zorunlu.");
  if (!phone) throw new Error("Telefon numarası zorunlu.");
  const db = getDB();
  const lead: Lead = {
    id: uid(),
    companyName,
    categoryId: data.categoryId || undefined,
    cityId: data.cityId || undefined,
    district: data.district?.trim() || undefined,
    phone,
    note: data.note?.trim() ?? "",
    status: "yeni",
    visitCount: 0,
    source: "web",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.leads.push(lead);
  log(db, { role: "sistem" }, "web_basvuru", `Web başvurusu: ${lead.companyName}`, {
    leadId: lead.id,
  });
  persist();
  return lead;
}

/**
 * Referans bağlantısıyla gelen personel başvurusu — DEMO mod (0012 aynası).
 * Referans kodu ve ekip burada da çözülür: istemciden yalnız açık kod
 * (AF-001) gelir; ekip, başvuruyu alan personelin o anki team_id'sidir.
 * Başvuru BEKLEMEDE kalır; hesap oluşturma YOK (onay yalnız yönetici).
 * Spam katmanı arayüzde (honeypot) ve canlıda RPC'de çalışır; bu katman
 * yalnızca doğrulama ve kayıt yapar.
 */
export function createPublicApplication(data: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  refCode: string;
}): RepApplication {
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const phone = data.phone.trim();
  const email = data.email.trim().toLowerCase();
  const refCode = data.refCode.trim().toUpperCase();
  if (firstName.length < 2 || firstName.length > 50) throw new Error("Ad 2-50 karakter olmalıdır.");
  if (lastName.length < 2 || lastName.length > 50)
    throw new Error("Soyad 2-50 karakter olmalıdır.");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15)
    throw new Error("Geçerli bir telefon numarası girin.");
  if (email.length < 5 || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Geçerli bir e-posta adresi girin.");

  const db = getDB();
  const rep = db.reps.find((r) => r.code.toUpperCase() === refCode && r.status === "aktif");
  if (!rep) throw new Error("Geçersiz referans bağlantısı.");

  const dup = db.repApplications.find(
    (a) =>
      a.status === "beklemede" &&
      (a.email.trim().toLowerCase() === email || a.phone.replace(/\D/g, "") === digits),
  );
  if (dup) throw new Error("Bu bilgilerle zaten bekleyen bir başvurunuz var.");

  const app: RepApplication = {
    id: uid(),
    firstName,
    lastName,
    phone,
    email,
    referralRepId: rep.id,
    teamId: rep.teamId, // başvuru anındaki ekip görüntüsü (sunucuda RPC aynı yapar)
    status: "beklemede",
    createdAt: nowISO(),
  };
  db.repApplications.push(app);
  log(db, { role: "sistem" }, "personel_basvurusu", `Personel başvurusu: ${firstName} ${lastName}`, {
    applicationId: app.id,
    referralRepId: rep.id,
  });
  persist();
  return app;
}

/* ============ BAŞVURU İNCELEME / ONAY / RED (0013) ============ */

/**
 * Başvuru listesi. Yalnız yönetici görür (canlıda 0013 RLS zaten
 * `admin read rep applications` ile kısıtlı; demo modda bu filtre korunur).
 */
export function listRepApplications(actor?: Actor): RepApplication[] {
  const db = getDB();
  if (actor && actor.role !== "admin") return [];
  return db.repApplications;
}

/**
 * Demo mod onay aynası (0013 approve_rep_application RPC'siyle aynı kurallar):
 * referans personeli + ekip yeniden doğrulanır, kapasite yeniden kontrol
 * edilir, yeni personel kaydı ve 'onaylandi' birlikte yazılır.
 * Canlıda hesap oluşturma Netlify Function + tek transaction RPC'dir.
 */
export async function approveRepApplication(
  applicationId: string,
  password: string,
  actor: Actor,
): Promise<void> {
  assertAdminActor(actor);

  if (!isSupabaseConfigured) {
    const db = getDB();
    const app = db.repApplications.find((a) => a.id === applicationId);
    if (!app) throw new Error("Başvuru bulunamadı.");
    if (app.status !== "beklemede")
      throw new Error(`Bu başvuru zaten sonuçlandırılmış (durum: ${app.status}).`);
    if (password.length < 6) throw new Error("Personel şifresi en az 6 karakter olmalıdır.");

    const ref = db.reps.find((r) => r.id === app.referralRepId && r.status === "aktif");
    if (!ref) throw new Error("Referans personeli doğrulanamadı (kayıt yok veya pasif).");
    if (app.teamId) {
      if (!db.teams.some((t) => t.id === app.teamId)) {
        throw new Error("Başvurunun bağlı olduğu ekip artık yok.");
      }
      if (ref.teamId !== app.teamId) {
        throw new Error("Referans personelin ekibi değişmiş; başvuru yeniden değerlendirilmelidir.");
      }
      const cap = db.settings.teamCapacity;
      const count = db.reps.filter((r) => r.teamId === app.teamId).length;
      if (count + 1 > cap)
        throw new Error(`Ekip kapasitesi dolu: kapasite ${cap} kişi (lider dahil). Onay yapılamaz.`);
    }

    const rep: SalesRep = {
      id: uid(),
      name: `${app.firstName} ${app.lastName}`.trim(),
      phone: app.phone,
      code: uniqueRepCode(db),
      status: "aktif",
      teamId: app.teamId,
      createdAt: nowISO(),
    };
    db.reps.push(rep);
    app.status = "onaylandi";
    log(
      db,
      actor,
      "personel_basvurusu_onaylandi",
      `Personel başvurusu onaylandı: ${rep.name} (${rep.code})`,
      { applicationId: app.id, repId: rep.id, referralRepId: app.referralRepId, teamId: app.teamId },
    );
    persist();
    return;
  }

  // Canlı: Auth hesabı + onay tek function'da (0013 ile hizalı temizlik).
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Oturum bulunamadı; yeniden giriş yapın.");
  const res = await fetch("/api/approve-rep-application", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ applicationId, password }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(body.message || "Başvuru onaylanamadı.");
  await refreshFromServer();
}

/** Red: yalnız yönetici; kayıt silinmez, 'reddedildi' olarak kalır. */
export async function rejectRepApplication(applicationId: string, actor: Actor): Promise<void> {
  assertAdminActor(actor);

  if (!isSupabaseConfigured) {
    const db = getDB();
    const app = db.repApplications.find((a) => a.id === applicationId);
    if (!app) throw new Error("Başvuru bulunamadı.");
    if (app.status !== "beklemede")
      throw new Error(`Bu başvuru zaten sonuçlandırılmış (durum: ${app.status}).`);
    app.status = "reddedildi";
    log(
      db,
      actor,
      "personel_basvurusu_reddedildi",
      `Personel başvurusu reddedildi: ${app.firstName} ${app.lastName}`,
      { applicationId: app.id, referralRepId: app.referralRepId },
    );
    persist();
    return;
  }

  if (!supabase) throw new Error("Supabase istemcisi yok.");
  const { error } = await supabase.rpc("reject_rep_application", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(error.message || "Başvuru reddedilemedi.");
  await refreshFromServer();
}

/** Temsilci yalnızca KENDİ adayının durumunu değiştirebilir. */
export function updateLeadStatus(leadId: string, status: LeadStatus, note?: string, actor?: Actor): Lead {
  const db = getDB();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Aday bulunamadı.");
  if (actor && actor.role === "temsilci" && actor.repId !== lead.repId)
    throw new Error("Bu aday size ait değil.");
  const before = lead.status;
  lead.status = status;
  if (note !== undefined) lead.note = note;
  lead.updatedAt = nowISO();
  log(db, actor ?? { role: "sistem" }, "aday_durum", `Aday durumu güncellendi: ${status}`, {
    leadId,
    before,
    after: status,
  });
  persist();
  return lead;
}

/** Temsilcinin düzenleyebildiği taslak alanları (şemada karşılığı olanlar). */
export interface LeadPatch {
  companyName?: string;
  categoryId?: string;
  cityId?: string;
  district?: string;
  phone?: string;
  email?: string;
  socials?: Lead["socials"];
  address?: string;
  latitude?: number;
  longitude?: number;
  packageKey?: "normal" | "featured";
  note?: string;
}

/**
 * Taslak (aday) düzenleme. Temsilci yalnızca KENDİ ve henüz firmaya
 * dönüşmemiş kaydını düzenleyebilir. Anlaşma bildirildikten sonra kayıt
 * kilitlenir (ödeme/onay sürecinde bilgi değişmez).
 */
export function updateLead(leadId: string, patch: LeadPatch, actor: Actor): Lead {
  const db = getDB();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Taslak bulunamadı.");
  if (lead.convertedToCompanyId)
    throw new Error("Firmaya dönüşmüş kayıt düzenlenemez; değişiklik için yöneticiye başvurun.");
  if (actor.role === "temsilci") {
    if (!actor.repId || lead.repId !== actor.repId) throw new Error("Bu taslak size ait değil.");
    if (lead.status === "anlaşma")
      throw new Error("Anlaşma bildirildikten sonra firma bilgileri kilitlenir.");
  }

  if (patch.companyName !== undefined) {
    const name = patch.companyName.trim();
    if (!name) throw new Error("Firma adı zorunludur.");
    lead.companyName = name;
  }
  if (patch.categoryId !== undefined) lead.categoryId = patch.categoryId || undefined;
  if (patch.cityId !== undefined) lead.cityId = patch.cityId || undefined;
  if (patch.district !== undefined) lead.district = patch.district.trim() || undefined;
  if (patch.phone !== undefined) lead.phone = patch.phone.trim();
  if (patch.email !== undefined) lead.email = patch.email.trim() || undefined;
  if (patch.socials !== undefined) {
    lead.socials = {
      whatsapp: patch.socials.whatsapp?.trim() || undefined,
      instagram: patch.socials.instagram?.trim() || undefined,
      facebook: patch.socials.facebook?.trim() || undefined,
    };
  }
  if (patch.address !== undefined) lead.address = patch.address.trim() || undefined;
  if (patch.packageKey !== undefined) {
    if (patch.packageKey !== "normal" && patch.packageKey !== "featured") throw new Error("Geçersiz paket seçimi.");
    lead.packageKey = patch.packageKey;
  }
  if ("latitude" in patch || "longitude" in patch) {
    const coords = normalizedDraftCoordinates(patch);
    lead.latitude = coords?.latitude;
    lead.longitude = coords?.longitude;
  }
  if (patch.note !== undefined) lead.note = patch.note.trim();
  lead.updatedAt = nowISO();

  log(db, actor, "aday_guncellendi", `Taslak güncellendi: ${lead.companyName}`, { leadId });
  persist();
  return lead;
}

export function deleteLead(leadId: string, actor: Actor): void {
  const db = getDB();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Aday bulunamadı.");
  if (lead.convertedToCompanyId)
    throw new Error("Firmaya dönüşmüş aday silinemez; dönüşüm geçmişini korumak için firma kaydıyla birlikte kapatın.");
  if (actor.role === "temsilci" && actor.repId !== lead.repId)
    throw new Error("Bu aday size ait değil.");
  db.leads = db.leads.filter((l) => l.id !== leadId);
  log(db, actor, "aday_silindi", `Aday silindi: ${lead.companyName}`, { leadId });
  persist();
}

/**
 * Başarısız dönüşüm denemelerinin kimlikleri. Sunucu yazımı tamamlanmadan
 * işlem geri alındığında, aynı satırların aynı kimliklerle yeniden denenmesini
 * sağlar; böylece kısmi yazım sonrası yetim firma/satış oluşmaz.
 */
const pendingConversions = new Map<string, { companyId: string; saleId?: string }>();

/**
 * Anlaşılan adayın firmaya dönüştürülmesi (ADMIN-only). Firma ve otomatik
 * potansiyel satış birlikte oluşturulur ve sunucuya YAZILANA KADAR beklenir.
 * Yazım başarısız olursa yerel değişiklikler geri alınır ve çağırana hata
 * fırlatılır — kullanıcıya sahte başarı gösterilmez.
 */
export async function convertLead(
  leadId: string,
  draft: CompanyDraft,
  actor: Actor,
): Promise<Company> {
  if (actor.role !== "admin")
    throw new Error("Firmaya dönüşüm yalnızca yönetici tarafından yapılır.");
  const db = getDB();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Aday bulunamadı.");
  if (lead.convertedToCompanyId) throw new Error("Bu aday zaten firmaya dönüşmüştür.");

  // Önceki başarısız denemeden kalan kimlikler varsa yeniden kullan.
  const stash = pendingConversions.get(leadId);
  const companyId = stash?.companyId ?? uid();
  const saleId = stash?.saleId ?? uid();
  const previousUpdatedAt = lead.updatedAt;

  // Aday sahibi varsayılan atamadır; admin formdaki seçimle geçersiz kılabilir.
  const company = createCompany(
    { ...draft, repId: draft.repId ?? lead.repId ?? null },
    actor,
    companyId,
  );
  // Firmaya bağlı potansiyel satış: yayın guard'ı (firma → satış → onaylı ödeme)
  // ancak satış varsa geçebilir. Aynı firmada satış zaten varsa mükerrer üretilmez.
  let createdSaleId: string | undefined;
  if (!db.sales.some((s) => s.companyId === company.id)) {
    const sale = createSale(
      {
        companyId: company.id,
        channel: "temsilci",
        repId: company.repId ?? null,
        // Paket seçimi satış tutarını belirler (temsilci fiyat giremez).
        ...(lead.packageKey ? { amount: packageAmount(db.settings, lead.packageKey) } : {}),
      },
      actor,
      saleId,
    );
    createdSaleId = sale.id;
  }
  lead.convertedToCompanyId = company.id;
  lead.updatedAt = nowISO();
  log(db, actor, "aday_donusum", `Firmaya dönüştürüldü: ${lead.companyName}`, {
    leadId,
    companyId: company.id,
  });
  persist();

  try {
    // R1: firma + satış birlikte kalıcı olmadan başarı dönmez.
    await flushNow();
    pendingConversions.delete(leadId);
  } catch (e) {
    // Sunucu yazımı tamamlanmadı (baseline değişmedi). Yerel görünümü geri al;
    // aynı kimlikleri sakla ki tekrar denemede yetim satır oluşmasın.
    const companyIndex = db.companies.findIndex((c) => c.id === company.id);
    if (companyIndex >= 0) db.companies.splice(companyIndex, 1);
    if (createdSaleId) db.sales = db.sales.filter((s) => s.id !== createdSaleId);
    delete lead.convertedToCompanyId;
    lead.updatedAt = previousUpdatedAt;
    pendingConversions.set(leadId, { companyId, saleId: createdSaleId ?? stash?.saleId });
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Firma dönüşümü sunucuya kaydedilemedi; işlem geri alındı. Lütfen tekrar deneyin. (${detail})`,
    );
  }

  return company;
}

/** Temsilci kendi adayına ziyaret/görüşme kaydı ekler. */
export function addVisit(
  leadId: string,
  data: Pick<LeadVisit, "date" | "note" | "outcome">,
  actor: Actor,
): LeadVisit {
  if (actor.role !== "temsilci" || !actor.repId)
    throw new Error("Ziyaret kaydı yalnızca satış temsilcisi tarafından eklenebilir.");
  const db = getDB();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Aday bulunamadı.");
  if (lead.repId !== actor.repId) throw new Error("Bu aday size ait değil.");
  const visit: LeadVisit = {
    id: uid(),
    leadId,
    repId: actor.repId,
    date: data.date || nowISO(),
    note: data.note.trim(),
    outcome: data.outcome.trim(),
  };
  db.visits.push(visit);
  lead.visitCount += 1;
  // Ziyaret eklenince aday en az "irtibat" aşamasına atar (iptal edilmişse korunur)
  if (lead.status === "yeni") lead.status = "irtibat";
  lead.updatedAt = nowISO();
  log(db, actor, "ziyaret_eklendi", `Ziyaret kaydedildi: ${lead.companyName}`, {
    leadId,
    visitId: visit.id,
  });
  persist();
  return visit;
}

/* ============ SATIŞ / ÖDEME / ÜYELİK / KOMİSYON ============ */

export function listSales(actor: Actor): Sale[] {
  const db = getDB();
  if (actor.role === "temsilci" && actor.repId)
    return db.sales
      .filter((s) => s.repId === actor.repId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...db.sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listPayments(actor: Actor, saleId?: string): Payment[] {
  const db = getDB();
  let payments = saleId ? db.payments.filter((p) => p.saleId === saleId) : [...db.payments];
  if (actor.role === "temsilci" && actor.repId) {
    const mySaleIds = new Set(db.sales.filter((s) => s.repId === actor.repId).map((s) => s.id));
    payments = payments.filter((p) => mySaleIds.has(p.saleId));
  }
  return payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Temsilci için ödeme "durumunu değiştiremez": yalnızca kendi satışlarını GÖRÜR. */
export function listMemberships(actor: Actor): Membership[] {
  const db = getDB();
  if (actor.role === "temsilci" && actor.repId) {
    const myCompanyIds = new Set(
      db.sales.filter((s) => s.repId === actor.repId).map((s) => s.companyId),
    );
    return db.memberships.filter((m) => myCompanyIds.has(m.companyId));
  }
  return [...db.memberships];
}

export interface CommissionPayoutSummary {
  rep: SalesRep;
  earned: number;
  paid: number;
  outstanding: number;
}

export function listCommissionPayoutSummary(actor: Actor): CommissionPayoutSummary[] {
  const db = getDB();
  const reps = actor.role === "temsilci"
    ? db.reps.filter((rep) => rep.id === actor.repId)
    : db.reps;
  const commissions = actor.role === "temsilci"
    ? db.commissions.filter((commission) => commission.repId === actor.repId)
    : db.commissions;
  const payouts = actor.role === "temsilci"
    ? (db.commissionPayouts ?? []).filter((payout) => payout.repId === actor.repId)
    : (db.commissionPayouts ?? []);

  return reps.map((rep) => {
    const earnedCents = commissions
      .filter((commission) => commission.repId === rep.id)
      .reduce((sum, commission) => sum + Math.round(commission.amount * 100), 0);
    const paidCents = payouts
      .filter((payout) => payout.repId === rep.id)
      .reduce((sum, payout) => sum + Math.round(payout.amount * 100), 0);
    return {
      rep,
      earned: earnedCents / 100,
      paid: paidCents / 100,
      outstanding: Math.max(0, earnedCents - paidCents) / 100,
    };
  });
}

export function listCommissionPayouts(actor: Actor): CommissionPayout[] {
  const db = getDB();
  if (actor.role === "temsilci" && !actor.repId) return [];
  return (db.commissionPayouts ?? [])
    .filter((payout) => actor.role !== "temsilci" || payout.repId === actor.repId)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export async function recordCommissionPayout(
  repId: string,
  amount: number,
  referenceNo: string,
  actor: Actor,
): Promise<void> {
  if (actor.role !== "admin") throw new Error("Yalnızca yönetici ödeme kaydedebilir.");
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.round((amount + Number.EPSILON) * 100) / 100 !== amount
  ) {
    throw new Error("Ödeme tutarı sıfırdan büyük ve en fazla iki ondalık basamaklı olmalıdır.");
  }
  const db = getDB();
  const summary = listCommissionPayoutSummary(actor).find((row) => row.rep.id === repId);
  if (!summary) throw new Error("Temsilci bulunamadı.");
  if (amount > summary.outstanding) throw new Error("Ödeme tutarı kalan alacaktan fazla olamaz.");
  const payoutId = uid();
  const normalizedReference = referenceNo.trim() || undefined;

  if (isSupabaseConfigured) {
    await flushPending("Temsilci ödemesi kaydedilmeden");
    if (!supabase) throw new Error("Supabase istemcisi yok.");
    const { error } = await supabase.rpc("record_commission_payout", {
      p_payout_id: payoutId,
      p_sales_rep_id: repId,
      p_amount: amount,
      p_reference_no: normalizedReference ?? null,
    });
    if (error) throw new Error(`Temsilci ödemesi kaydedilemedi: ${error.message}`);
    await refreshFromServer();
    return;
  }

  const payout: CommissionPayout = {
    id: payoutId,
    repId,
    amount,
    referenceNo: normalizedReference,
    paidAt: nowISO(),
    createdAt: nowISO(),
    createdBy: actor.userId,
  };
  db.commissionPayouts ??= [];
  db.commissionPayouts.push(payout);
  log(db, actor, "komisyon_odeme_kaydedildi", `${summary.rep.name} temsilcisine ödeme kaydedildi`, {
    payoutId,
    repId,
    amount,
    referenceNo: normalizedReference,
  });
  persist();
}

/* ============ EKİP LİDERLİĞİ KOMİSYONU (0014) ============ */

export interface TeamCommissionSummary {
  leader: SalesRep;
  earned: number;
  paid: number;
  outstanding: number;
}

/**
 * Ekip liderliği komisyonları — temsilci komisyonlarından AYRI defter.
 * Canlıda RLS zaten yalnız admin'in tümünü ve liderin kendi satırını
 * okumasına izin verir; bu filtre aynı sınırı demo modda korur.
 */
export function listTeamCommissions(actor: Actor): TeamCommission[] {
  const db = getDB();
  const rows = db.teamCommissions ?? [];
  const visible =
    actor.role === "temsilci" ? rows.filter((tc) => tc.leaderRepId === actor.repId) : rows;
  return [...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Ekip liderliği komisyonu ödemeleri (0008 deseni, ayrı defter). */
export function listTeamCommissionPayouts(actor: Actor): TeamCommissionPayout[] {
  const db = getDB();
  const rows = db.teamCommissionPayouts ?? [];
  const visible =
    actor.role === "temsilci" ? rows.filter((p) => p.leaderRepId === actor.repId) : rows;
  return [...visible].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

/** Lider bazında hakediş / ödenen / kalan bakiye. */
export function listTeamCommissionSummary(actor: Actor): TeamCommissionSummary[] {
  const db = getDB();
  const commissions = listTeamCommissions(actor);
  const payouts = listTeamCommissionPayouts(actor);
  const leaderIds = new Set([
    ...commissions.map((c) => c.leaderRepId),
    ...payouts.map((p) => p.leaderRepId),
  ]);
  return db.reps
    .filter((rep) => leaderIds.has(rep.id))
    .map((rep) => {
      const earnedCents = commissions
        .filter((c) => c.leaderRepId === rep.id)
        .reduce((sum, c) => sum + Math.round(c.amount * 100), 0);
      const paidCents = payouts
        .filter((p) => p.leaderRepId === rep.id)
        .reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
      return {
        leader: rep,
        earned: earnedCents / 100,
        paid: paidCents / 100,
        outstanding: Math.max(0, earnedCents - paidCents) / 100,
      };
    });
}

/**
 * Ekip liderliği komisyonu ödemesi (yalnız yönetici). Temsilci komisyon
 * bakiyesine DOKUNMAZ; canlıda 0014 `record_team_commission_payout` RPC'si
 * sunucuda bakiye sınırını uygular.
 */
export async function recordTeamCommissionPayout(
  leaderId: string,
  amount: number,
  referenceNo: string,
  actor: Actor,
): Promise<void> {
  if (actor.role !== "admin") throw new Error("Yalnızca yönetici ödeme kaydedebilir.");
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.round((amount + Number.EPSILON) * 100) / 100 !== amount
  ) {
    throw new Error("Ödeme tutarı sıfırdan büyük ve en fazla iki ondalık basamaklı olmalıdır.");
  }
  const db = getDB();
  const summary = listTeamCommissionSummary(actor).find((row) => row.leader.id === leaderId);
  if (!summary) throw new Error("Ekip lideri bulunamadı.");
  if (amount > summary.outstanding)
    throw new Error("Ödeme tutarı ekip liderinin kalan alacağından fazla olamaz.");
  const payoutId = uid();
  const normalizedReference = referenceNo.trim() || undefined;

  if (isSupabaseConfigured) {
    await flushPending("Ekip liderliği ödemesi kaydedilmeden");
    if (!supabase) throw new Error("Supabase istemcisi yok.");
    const { error } = await supabase.rpc("record_team_commission_payout", {
      p_payout_id: payoutId,
      p_team_leader_rep_id: leaderId,
      p_amount: amount,
      p_reference_no: normalizedReference ?? null,
    });
    if (error) throw new Error(`Ekip liderliği ödemesi kaydedilemedi: ${error.message}`);
    await refreshFromServer();
    return;
  }

  const payout: TeamCommissionPayout = {
    id: payoutId,
    leaderRepId: leaderId,
    amount,
    referenceNo: normalizedReference,
    paidAt: nowISO(),
    createdAt: nowISO(),
    createdBy: actor.userId,
  };
  db.teamCommissionPayouts ??= [];
  db.teamCommissionPayouts.push(payout);
  log(
    db,
    actor,
    "ekip_liderligi_odeme_kaydedildi",
    `${summary.leader.name} adına ekip liderliği ödemesi kaydedildi`,
    { payoutId, leaderId, amount, referenceNo: normalizedReference },
  );
  persist();
}

export function listCommissions(
  actor: Actor,
): { com: Commission; repName: string }[] {
  const db = getDB();
  let commissions = [...db.commissions];
  if (actor.role === "temsilci" && actor.repId)
    commissions = commissions.filter((c) => c.repId === actor.repId);
  return commissions
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((com) => ({
      com,
      repName: db.reps.find((r) => r.id === com.repId)?.name ?? "—",
    }));
}

export function createSale(
  data: {
    companyId: string;
    channel: Sale["channel"];
    repId?: string | null;
    referralCode?: string;
    amount?: number;
    renewalForMembershipId?: string;
  },
  actor: Actor,
  internalId?: string,
): Sale {
  const db = getDB();
  let repId = data.repId ?? null;

  // Temsilci kendi adına kayıt açar; başka temsilci seçemez.
  if (actor.role === "temsilci") {
    if (!actor.repId) throw new Error("Temsilci hesabınızın satış koduna ulaşılamadı.");
    repId = actor.repId;
  }
  const companyId = data.companyId;
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) throw new Error("Firma bulunamadı.");
  const alreadyMember = db.memberships.some(
    (m) => m.companyId === companyId && m.status === "aktif",
  );
  if (alreadyMember && !data.renewalForMembershipId)
    throw new Error("Bu firmanın zaten aktif bir üyeliği var.");

  // Paket dışı tutar temsilci tarafından giremez (yalnızca paket seçimi).
  if (data.amount !== undefined && !isValidPackageAmount(data.amount, db.settings)) {
    throw new Error("Satış tutarı paket seçeneklerinden biri olmalıdır.");
  }

  const sale: Sale = {
    id: internalId ?? uid(),
    repId,
    companyId,
    channel: data.channel,
    referralCode: data.referralCode?.trim() || undefined,
    amount: data.amount ?? db.settings.membershipPrice,
    status: "potansiyel",
    createdAt: nowISO(),
    renewalForMembershipId: data.renewalForMembershipId,
  };
  db.sales.push(sale);
  log(db, actor, "satis_acildi", `Satış kaydı açıldı: ${company.name}`, { saleId: sale.id, repId });
  persist();
  return sale;
}

function assertAdminActor(actor: Actor): void {
  if (actor.role !== "admin")
    throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
}

/**
 * Kritik işlemler (ödeme onayı, satış kesinleştirme, iptal) öncesi bekleyen
 * yerel farkı sunucuya yazar. Yazım başarısızsa işlem DEVAM ETMEZ; gerçek
 * Supabase hatası, "satış/ödeme bulunamadı" hatasından ayırt edilebilsin diye
 * bağlam bilgisiyle birlikte yukarı fırlatılır.
 */
async function flushPending(context: string): Promise<void> {
  try {
    await flushNow();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`${context} öncesi bekleyen kayıtlar sunucuya yazılamadı: ${detail}`);
  }
}

/** Sunucudaki gerçek durumu yeniden okur; yerel fark kuyruğunu sıfırlar. */
async function refreshFromServer(): Promise<void> {
  const { db } = await loadSnapshot();
  applySnapshot(db);
}

/**
 * `provider_ref` ve `idempotency_key` sunucuda ayrı ayrı UNIQUE'tir. Aynı
 * satışta reddedilmiş (hata) bir kayıt varken yeniden ödeme açmak, aynı
 * anahtarı tekrar üretirse duplicate-key hatası verir. Bu yardımcı, satışın
 * mevcut anahtarlarını okuyup çakışmayan ilk anahtarı döndürür.
 * Anahtar tam satış UUID'si içerdiğinden farklı satışlarla çakışmaz.
 */
async function uniquePaymentKeyForSale(saleId: string, base: string): Promise<string> {
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  let key = base;
  let i = 2;
  for (;;) {
    const { data, error } = await supabase
      .from("payments")
      .select("id")
      .eq("sale_id", saleId)
      .or(`provider_ref.eq.${key},idempotency_key.eq.${key}`)
      .limit(1);
    if (error) throw new Error(`Ödeme anahtarı denetlenemedi: ${error.message}`);
    if (!data || data.length === 0) return key;
    key = `${base}-${i++}`;
  }
}

/**
 * Satış için BEKLEMEDE ödeme kaydı açar (admin).
 *
 * Idempotent: aynı satışın bekleyen/onaylı ödemesi varsa yeni kayıt
 * ÜRETİLMEZ. Tüm referanslar tam satış UUID'sinden türetilir; böylece
 * `payments.provider_ref` unique kısıtı farklı satışlarla çakışmaz.
 * Supabase modunda işlem doğrudan sunucuya yazılır ve ardından anlık
 * görüntü tazelenir (fark-senkron kuyruğuna bağımlı değildir).
 */
export async function createPendingPayment(saleId: string, actor: Actor): Promise<Payment> {
  if (!isSupabaseConfigured) {
    const db = getDB();
    const payment = engine.openPendingPayment(db, saleId, actor);
    persist();
    return payment;
  }

  assertAdminActor(actor);
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  await flushPending("Bekleyen ödeme kaydı açılmadan");

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id,status,amount")
    .eq("id", saleId)
    .maybeSingle();
  if (saleError) throw new Error(`Satış okunamadı: ${saleError.message}`);
  if (!sale) throw new Error("Satış bulunamadı.");
  if (sale.status === "iptal") throw new Error("İptal edilmiş satışa ödeme kaydı açılamaz.");
  if (sale.status === "odendi") throw new Error("Satış zaten kesinleştirilmiş.");

  const { data: active } = await supabase
    .from("payments")
    .select("id")
    .eq("sale_id", saleId)
    .in("status", ["beklemede", "onaylandi"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!active) {
    const key = await uniquePaymentKeyForSale(saleId, `PENDING-${saleId}`);
    const { error } = await supabase.from("payments").insert({
      id: uid(),
      sale_id: saleId,
      amount: Number(sale.amount),
      provider: "hicbiri",
      provider_ref: key,
      status: "beklemede",
      idempotency_key: key,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    if (error) {
      // Eşzamanlı ikinci yönetici aynı kaydı açmış olabilir → mevcut kaydı kullan.
      const { data: raced } = await supabase
        .from("payments")
        .select("id")
        .eq("sale_id", saleId)
        .in("status", ["beklemede", "onaylandi"])
        .limit(1)
        .maybeSingle();
      if (!raced) throw new Error(`Ödeme kaydı açılamadı: ${error.message}`);
    }
  }

  await refreshFromServer();
  const payment = getDB().payments.find(
    (p) => p.saleId === saleId && (p.status === "beklemede" || p.status === "onaylandi"),
  );
  if (!payment) throw new Error("Ödeme kaydı okunamadı.");
  return payment;
}

/**
 * EFT tahsilatını onaylar ve satışı kesinleştirir (yalnızca admin).
 *
 * Supabase modunda kritik adımlar sunucudaki SECURITY DEFINER fonksiyonlar
 * (`verify_payment_manual`, `confirm_sale` / `confirm_renewal`) ile yürütülür.
 * Bu fonksiyonlar satır kilidi ve durum kontrolü yaptığından iki yöneticinin
 * aynı satışı aynı anda onaylaması mükerrer üyelik/komisyon üretmez.
 */
export async function approveEftPayment(saleId: string, actor: Actor): Promise<Payment> {
  if (!isSupabaseConfigured) {
    const db = getDB();
    const payment = engine.approveEftPayment(db, saleId, actor);
    persist();
    return payment;
  }

  assertAdminActor(actor);
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  await flushPending("Ödeme onaylanmadan");

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id,status,amount,renewal_for_membership_id")
    .eq("id", saleId)
    .maybeSingle();
  if (saleError) throw new Error(`Satış okunamadı: ${saleError.message}`);
  if (!sale) throw new Error("Satış bulunamadı.");
  if (sale.status === "iptal") throw new Error("İptal edilmiş satışın ödemesi onaylanamaz.");
  if (sale.status === "odendi") throw new Error("Bu satış zaten kesinleştirildi.");

  const { data: approved } = await supabase
    .from("payments")
    .select("id")
    .eq("sale_id", saleId)
    .eq("status", "onaylandi")
    .limit(1)
    .maybeSingle();

  if (!approved) {
    const { data: pending } = await supabase
      .from("payments")
      .select("id,provider")
      .eq("sale_id", saleId)
      .eq("status", "beklemede")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pending && pending.provider !== "hicbiri" && pending.provider !== "eft") {
      throw new Error(
        "Bu satışta kart ödeme kaydı bekliyor. Kart ödemesi sağlayıcı doğrulamasıyla tamamlanmalı; EFT onayı verilemez.",
      );
    }

    let paymentId: string | undefined = pending?.id;
    if (!paymentId) {
      const key = await uniquePaymentKeyForSale(saleId, `EFT-${saleId}`);
      const { data: inserted, error } = await supabase
        .from("payments")
        .insert({
          id: uid(),
          sale_id: saleId,
          amount: Number(sale.amount),
          provider: "eft",
          provider_ref: key,
          status: "beklemede",
          idempotency_key: key,
          created_at: nowISO(),
          updated_at: nowISO(),
        })
        .select("id")
        .single();
      if (error) {
        // Yarış: diğer yönetici aynı EFT kaydını açmış olabilir.
        const { data: raced } = await supabase
          .from("payments")
          .select("id")
          .eq("sale_id", saleId)
          .eq("status", "beklemede")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!raced) throw new Error(`EFT ödeme kaydı açılamadı: ${error.message}`);
        paymentId = raced.id;
      } else {
        paymentId = inserted.id;
      }
    }

    if (pending?.provider === "hicbiri" && paymentId === pending.id) {
      const { error } = await supabase
        .from("payments")
        .update({ provider: "eft", updated_at: nowISO() })
        .eq("id", paymentId)
        .eq("status", "beklemede");
      if (error) throw new Error(`Ödeme yöntemi güncellenemedi: ${error.message}`);
    }

    // Tutar çapraz doğrulaması ve durum kilidi sunucuda yapılır.
    const verified = await supabase.rpc("verify_payment_manual", { p_payment_id: paymentId });
    if (verified.error) {
      throw new Error(`Ödeme doğrulanamadı: ${verified.error.message}`);
    }
  }

  const confirmed = sale.renewal_for_membership_id
    ? await supabase.rpc("confirm_renewal", { p_sale_id: saleId })
    : await supabase.rpc("confirm_sale", { p_sale_id: saleId });
  if (confirmed.error) {
    throw new Error(`Satış kesinleştirilemedi: ${confirmed.error.message}`);
  }

  await refreshFromServer();
  const payment = getDB().payments.find((p) => p.saleId === saleId && p.status === "onaylandi");
  if (!payment) throw new Error("Onaylanan ödeme okunamadı.");
  return payment;
}

/**
 * Bekleyen ödemeyi reddeder (admin). Kayıt silinmez; "hata" işaretlenir ve
 * satış potansiyel kalır → doğru ödeme geldiğinde yeniden denenebilir.
 */
export async function rejectPendingPayment(saleId: string, actor: Actor): Promise<Payment[]> {
  if (!isSupabaseConfigured) {
    const db = getDB();
    const payments = engine.rejectPendingPayment(db, saleId, actor);
    persist();
    return payments;
  }

  assertAdminActor(actor);
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  await flushPending("Ödeme reddedilmeden");

  const { data: sale } = await supabase
    .from("sales")
    .select("id,status")
    .eq("id", saleId)
    .maybeSingle();
  if (!sale) throw new Error("Satış bulunamadı.");
  if (sale.status !== "potansiyel") throw new Error("Yalnızca bekleyen satışın ödemesi reddedilebilir.");

  const updated = await supabase
    .from("payments")
    .update({ status: "hata", updated_at: nowISO() })
    .eq("sale_id", saleId)
    .eq("status", "beklemede")
    .select("id");
  if (updated.error) throw new Error(`Ödeme reddedilemedi: ${updated.error.message}`);
  if (!updated.data || updated.data.length === 0)
    throw new Error("Reddedilecek bekleyen ödeme kaydı yok (durum değişmiş olabilir).");

  await refreshFromServer();
  return getDB().payments.filter((p) => p.saleId === saleId && p.status === "hata");
}

export async function cancelSale(saleId: string, actor: Actor): Promise<Sale> {
  if (isSupabaseConfigured) {
    assertAdminActor(actor);
    if (!supabase) throw new Error("Supabase istemcisi yok.");
    await flushPending("Satış iptal edilmeden");

    const { data: sale } = await supabase
      .from("sales")
      .select("id,status")
      .eq("id", saleId)
      .maybeSingle();
    if (!sale) throw new Error("Satış bulunamadı.");
    if (sale.status !== "potansiyel") throw new Error("Yalnızca bekleyen satış iptal edilebilir.");

    const { data: approved } = await supabase
      .from("payments")
      .select("id")
      .eq("sale_id", saleId)
      .eq("status", "onaylandi")
      .limit(1)
      .maybeSingle();
    if (approved)
      throw new Error("Ödemesi onaylanmış satış iptal edilemez; iade sürecini kullanın.");

    const rejected = await supabase
      .from("payments")
      .update({ status: "hata", updated_at: nowISO() })
      .eq("sale_id", saleId)
      .eq("status", "beklemede");
    if (rejected.error) throw new Error(`Bekleyen ödemeler kapatılamadı: ${rejected.error.message}`);

    const cancelled = await supabase
      .from("sales")
      .update({ status: "iptal" })
      .eq("id", saleId)
      .eq("status", "potansiyel")
      .select("id")
      .maybeSingle();
    if (cancelled.error) throw new Error(`Satış iptal edilemedi: ${cancelled.error.message}`);
    if (!cancelled.data) throw new Error("Satış iptal edilemedi (durum değişmiş olabilir).");

    await refreshFromServer();
    const result = getDB().sales.find((s) => s.id === saleId);
    if (!result) throw new Error("Satış okunamadı.");
    return result;
  }

  const db = getDB();
  assertAdminActor(actor);
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new Error("Satış bulunamadı.");
  if (sale.status !== "potansiyel") throw new Error("Yalnızca bekleyen satış iptal edilebilir.");
  sale.status = "iptal";
  for (const p of db.payments.filter((p) => p.saleId === saleId && p.status === "beklemede")) {
    p.status = "hata";
    p.updatedAt = nowISO();
  }
  log(db, actor, "satis_iptal", `Satış iptal edildi`, { saleId });
  persist();
  return sale;
}

/* engine sarmalayıcıları — değişikliği kalıcı yapar */

export async function confirmSale(saleId: string, actor: Actor): Promise<void> {
  if (isSupabaseConfigured) {
    assertAdminActor(actor);
    if (!supabase) throw new Error("Supabase istemcisi yok.");
    await flushPending("Satış kesinleştirilmeden");
    const { error } = await supabase.rpc("confirm_sale", { p_sale_id: saleId });
    if (error) throw new Error(error.message);
    await refreshFromServer();
    return;
  }
  const db = getDB();
  engine.confirmSale(db, saleId, actor);
  persist();
}

export async function confirmRenewal(saleId: string, actor: Actor): Promise<void> {
  if (isSupabaseConfigured) {
    assertAdminActor(actor);
    if (!supabase) throw new Error("Supabase istemcisi yok.");
    await flushPending("Yenileme kesinleştirilmeden");
    const { error } = await supabase.rpc("confirm_renewal", { p_sale_id: saleId });
    if (error) throw new Error(error.message);
    await refreshFromServer();
    return;
  }
  const db = getDB();
  engine.confirmRenewal(db, saleId, actor);
  persist();
}

export async function verifyPayment(paymentId: string, actor: Actor): Promise<void> {
  if (isSupabaseConfigured) {
    assertAdminActor(actor);
    if (!supabase) throw new Error("Supabase istemcisi yok.");
    await flushPending("Ödeme doğrulanmadan");
    const { data: payment, error: readError } = await supabase
      .from("payments")
      .select("id,provider,status")
      .eq("id", paymentId)
      .maybeSingle();
    if (readError) throw new Error(`Ödeme okunamadı: ${readError.message}`);
    if (!payment) throw new Error("Ödeme kaydı bulunamadı.");
    if (payment.status !== "beklemede")
      throw new Error("Yalnızca beklemedeki ödeme doğrulanabilir.");
    if (payment.provider !== "hicbiri" && payment.provider !== "eft")
      throw new Error(
        "Kart ödemesi yalnızca sağlayıcı doğrulamasıyla tamamlanabilir; manuel onay verilemez.",
      );
    // Sunucu tarafı: yalnızca beklemede + tutar eşleşmesi + admin.
    const { error } = await supabase.rpc("verify_payment_manual", { p_payment_id: paymentId });
    if (error) throw new Error(error.message);
    await refreshFromServer();
    return;
  }
  const db = getDB();
  engine.verifyPayment(db, paymentId, actor);
  persist();
}

export function createRenewalSale(membershipId: string, actor: Actor): Sale {
  const db = getDB();
  const sale = engine.createRenewalSale(db, membershipId, actor);
  persist();
  return sale;
}


/* ============ REFERANSLAR ============ */

export function listReferrals(actor: Actor): Referral[] {
  const db = getDB();
  if (actor.role === "temsilci" && actor.repId)
    return db.referrals.filter((r) => r.repId === actor.repId);
  return [...db.referrals];
}

export function createReferralCode(repId: string, actor: Actor): Referral {
  const db = getDB();
  if (actor.role !== "admin") throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
  const rep = db.reps.find((r) => r.id === repId);
  if (!rep) throw new Error("Temsilci bulunamadı.");
  const code = `${slugify(rep.name).toUpperCase().slice(0, 6)}-${String(
    db.referrals.length + 1,
  ).padStart(4, "0")}`;
  const referral: Referral = {
    id: uid(),
    code,
    repId,
    createdAt: nowISO(),
  };
  db.referrals.push(referral);
  log(db, actor, "referans_olusturuldu", `Referans kodu oluşturuldu: ${code}`, {
    referralId: referral.id,
    repId,
  });
  persist();
  return referral;
}

/* ============ EKİPLER (0011_teams.sql) ============ */

/**
 * Ekip listesi. Temsilci yalnız kendi ekibini görür (canlıda RLS zaten
 * daraltır; demo modda bu filtre korunur). Admin tümünü görür.
 */
export function listTeams(actor?: Actor): Team[] {
  const db = getDB();
  if (actor && actor.role === "temsilci" && actor.repId) {
    const me = db.reps.find((r) => r.id === actor.repId);
    return db.teams.filter((t) => t.id === me?.teamId);
  }
  return db.teams;
}

/** Oturum temsilcisinin ekibi ve doğrudan üyeleri (Dashboard "Ekibim"). */
export function getMyTeam(actor: Actor): { team: Team; members: SalesRep[] } | null {
  const db = getDB();
  if (!actor.repId) return null;
  const me = db.reps.find((r) => r.id === actor.repId);
  const team = me?.teamId ? db.teams.find((t) => t.id === me.teamId) : undefined;
  if (!team) return null;
  return { team, members: db.reps.filter((r) => r.teamId === team.id) };
}

function assertTeamName(name: string): string {
  const v = name.trim();
  if (v.length < 2 || v.length > 60) throw new Error("Ekip adı 2-60 karakter olmalıdır.");
  return v;
}

/** Kapasite kontrolü — SQL trigger'ının (enforce_team_capacity) aynası. */
function assertTeamCapacity(db: DB, teamId: string, excludeRepId: string): void {
  const cap = db.settings.teamCapacity;
  const count = db.reps.filter((r) => r.teamId === teamId && r.id !== excludeRepId).length;
  if (count + 1 > cap) throw new Error(`Ekip kapasitesi doldu: kapasite ${cap} kişi (lider dahil).`);
}

/**
 * Personel kendi ekibini kurar: lider olur ve eski ekip üyeliğinden ayrılır.
 * Canlıda 0011 `create_team` RPC'si — üyelik ataması sunucuda tetikleyicidir.
 */
export async function createTeam(name: string, actor: Actor): Promise<Team> {
  const trimmed = assertTeamName(name);
  if (actor.role !== "temsilci" || !actor.repId)
    throw new Error("Bu işlem yalnızca temsilci tarafından yapılabilir.");

  if (!isSupabaseConfigured) {
    const db = getDB();
    if (db.teams.some((t) => t.leaderRepId === actor.repId))
      throw new Error("Zaten bir ekibin liderisiniz.");
    const me = db.reps.find((r) => r.id === actor.repId);
    if (!me) throw new Error("Temsilci kaydı bulunamadı.");
    const team: Team = { id: uid(), name: trimmed, leaderRepId: actor.repId, createdAt: nowISO() };
    db.teams.push(team);
    me.teamId = team.id; // eski ekip üyeliği tek atamada düşer (tek ekip kuralı)
    log(db, actor, "ekip_kuruldu", `Ekip kuruldu: ${team.name}`, { teamId: team.id });
    persist();
    return team;
  }

  if (!supabase) throw new Error("Supabase istemcisi yok.");
  const { error } = await supabase.rpc("create_team", { p_name: trimmed });
  if (error) throw new Error(`Ekip kurulamadı: ${error.message}`);
  await refreshFromServer();
  const team = getDB().teams.find((t) => t.leaderRepId === actor.repId);
  if (!team) throw new Error("Ekip kaydı okunamadı.");
  return team;
}

/**
 * Personelin ekip bağlantısını yönetir / ekipler arası transfer (YALNIZ admin).
 * Canlıda doğrudan sunucuya yazar; kapasite aşımı ve liderlik kuralları
 * 0011 trigger'larından anında hata döner.
 */
export async function setRepTeam(repId: string, teamId: string | null, actor: Actor): Promise<void> {
  assertAdminActor(actor);

  if (!isSupabaseConfigured) {
    const db = getDB();
    const rep = db.reps.find((r) => r.id === repId);
    if (!rep) throw new Error("Temsilci bulunamadı.");
    if (teamId && !db.teams.some((t) => t.id === teamId)) throw new Error("Ekip bulunamadı.");
    const leads = db.teams.find((t) => t.leaderRepId === repId);
    if (leads && leads.id !== teamId)
      throw new Error("Ekip lideri kendi ekibinden ayrılamaz; önce ekip liderliğini değiştirin.");
    if (teamId && rep.teamId !== teamId) assertTeamCapacity(db, teamId, repId);
    rep.teamId = teamId ?? undefined;
    log(
      db,
      actor,
      "ekip_baglantisi",
      teamId ? `Personel ekebağlandı: ${rep.name}` : `Personel ekipten çıkarıldı: ${rep.name}`,
      { repId, teamId },
    );
    persist();
    return;
  }

  await flushPending("Ekip bağlantısı güncellenmeden");
  const { data, error } = await supabase!
    .from("sales_reps")
    .update({ team_id: teamId })
    .eq("id", repId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Ekip bağlantısı güncellenemedi: ${error.message}`);
  if (!data) throw new Error("Temsilci bulunamadı.");
  await refreshFromServer();
}

/**
 * Ekip liderliğini değiştirir (YALNIZ admin): yeni lider ekibe katılır,
 * eski lider üye olarak kalır. Liderlik aktarımı transferin ön koşuludur
 * (bir personel aynı anda yalnız bir ekibin lideri olabilir).
 */
export async function setTeamLeader(teamId: string, repId: string, actor: Actor): Promise<void> {
  assertAdminActor(actor);

  if (!isSupabaseConfigured) {
    const db = getDB();
    const team = db.teams.find((t) => t.id === teamId);
    if (!team) throw new Error("Ekip bulunamadı.");
    const rep = db.reps.find((r) => r.id === repId);
    if (!rep) throw new Error("Temsilci bulunamadı.");
    if (db.teams.some((t) => t.leaderRepId === repId && t.id !== teamId))
      throw new Error("Bu personel zaten başka bir ekibin lideri.");
    if (rep.teamId !== teamId) assertTeamCapacity(db, teamId, repId);
    team.leaderRepId = repId;
    rep.teamId = teamId; // SQL trigger aynası: lider her zaman kendi ekibinin üyesi
    log(db, actor, "ekip_lideri", `Ekip lideri değiştirildi: ${team.name} → ${rep.name}`, {
      teamId,
      repId,
    });
    persist();
    return;
  }

  await flushPending("Ekip lideri değiştirilmeden");
  const { data, error } = await supabase!
    .from("teams")
    .update({ leader_rep_id: repId })
    .eq("id", teamId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Ekip lideri değiştirilemedi: ${error.message}`);
  if (!data) throw new Error("Ekip bulunamadı.");
  await refreshFromServer();
}

/* ============ EKİP BULMA / KATILIM BAŞVURUSU (0015) ============ */

/**
 * Tüm ekiplerin özeti (lider adı, üye sayısı, kapasite) — ekipler herkes
 * tarafından görüntülenebilir. Canlıda 0015 `teams_overview` görünümünden
 * snapshot'a gelir (anon'a kapalı); demo modda aynı hesap yerelde yapılır.
 */
export function listTeamsOverview(): TeamOverview[] {
  const db = getDB();
  if (db.teamOverviews) return db.teamOverviews;
  const capacity = db.settings.teamCapacity;
  return db.teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    leaderRepId: team.leaderRepId,
    leaderName: db.reps.find((r) => r.id === team.leaderRepId)?.name ?? "—",
    memberCount: db.reps.filter((r) => r.teamId === team.id).length,
    capacity,
  }));
}

/**
 * Ekip katılım başvuruları — yönetici tümünü, personel yalnız KENDİ
 * başvurusunu görür (canlıda RLS zaten aynı sınırı uygular; demo aynası).
 */
export function listTeamJoinApplications(actor?: Actor): TeamJoinApplication[] {
  const db = getDB();
  const rows = db.teamJoinApplications ?? [];
  const visible =
    actor && actor.role === "admin"
      ? rows
      : actor && actor.repId
        ? rows.filter((a) => a.repId === actor.repId)
        : [];
  return [...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Ekibe katılım başvurusu (yalnız personel) — 0015
 * `submit_team_join_application` RPC'sinin demo aynası: tek ekip üyeliği,
 * tekrar (beklemede) başvuru ve kapasite burada da kontrol edilir.
 * Başvuru BEKLEMEDE kalır; üyelik/ekip bağlantısı YARATMAZ (onay ayrıdır).
 */
export async function submitTeamJoinApplication(teamId: string, actor: Actor): Promise<void> {
  if (actor.role !== "temsilci" || !actor.repId)
    throw new Error("Bu işlem yalnızca temsilci tarafından yapılabilir.");

  if (!isSupabaseConfigured) {
    const db = getDB();
    const me = db.reps.find((r) => r.id === actor.repId);
    if (!me) throw new Error("Temsilci kaydı bulunamadı.");
    if (me.teamId)
      throw new Error("Zaten bir ekipte olduğunuz için başka bir ekibe başvuru yapamazsınız.");
    if (!db.teams.some((t) => t.id === teamId)) throw new Error("Ekip bulunamadı.");
    if (db.teamJoinApplications?.some((a) => a.repId === me.id && a.status === "beklemede"))
      throw new Error("Zaten bekleyen bir ekip başvurunuz var.");
    const cap = db.settings.teamCapacity;
    const count = db.reps.filter((r) => r.teamId === teamId).length;
    if (count + 1 > cap)
      throw new Error(`Ekip kapasitesi dolu: kapasite ${cap} kişi (lider dahil). Başvuru yapılamaz.`);

    const app: TeamJoinApplication = {
      id: uid(),
      repId: me.id,
      teamId,
      status: "beklemede",
      createdAt: nowISO(),
    };
    db.teamJoinApplications ??= [];
    db.teamJoinApplications.push(app);
    log(db, actor, "ekip_katilim_basvurusu", `Ekip katılım başvurusu: ${teamNameOf(db, teamId)}`, {
      applicationId: app.id,
      teamId,
    });
    persist();
    return;
  }

  if (!supabase) throw new Error("Supabase istemcisi yok.");
  const { error } = await supabase.rpc("submit_team_join_application", {
    p_team_id: teamId,
  });
  if (error) throw new Error(error.message || "Ekip başvurusu gönderilemedi.");
  await refreshFromServer();
}

function teamNameOf(db: DB, teamId: string): string {
  return db.teams.find((t) => t.id === teamId)?.name ?? teamId;
}

/**
 * Başvuru onayı (YALNIZ yönetici) — 0015 `approve_team_join_application`
 * RPC'sinin demo aynası: beklemede kilidi, başka ekip bağlılık kontrolü ve
 * kapasite ONAY ANINDA yeniden kontrol edilir; üyelik ancak onayda kurulur.
 */
export async function approveTeamJoinApplication(applicationId: string, actor: Actor): Promise<void> {
  assertAdminActor(actor);

  if (!isSupabaseConfigured) {
    const db = getDB();
    const app = db.teamJoinApplications?.find((a) => a.id === applicationId);
    if (!app) throw new Error("Başvuru bulunamadı.");
    if (app.status !== "beklemede")
      throw new Error(`Bu başvuru zaten sonuçlandırılmış (durum: ${app.status}).`);
    const rep = db.reps.find((r) => r.id === app.repId);
    if (!rep) throw new Error("Personel kaydı bulunamadı.");
    if (rep.teamId)
      throw new Error("Personel zaten bir ekibe bağlı; başvuru onaylanamaz.");
    if (!db.teams.some((t) => t.id === app.teamId))
      throw new Error("Başvurunun ekibi artık yok.");
    const cap = db.settings.teamCapacity;
    const count = db.reps.filter((r) => r.teamId === app.teamId).length;
    if (count + 1 > cap)
      throw new Error(`Ekip kapasitesi dolu: kapasite ${cap} kişi (lider dahil). Onay yapılamaz.`);

    rep.teamId = app.teamId; // tek transaction'ın demo aynası: üyelik + durum birlikte
    app.status = "onaylandi";
    app.decidedAt = nowISO();
    app.decidedBy = actor.userId;
    log(db, actor, "ekip_katilim_onaylandi", `Ekip katılım başvurusu onaylandı: ${rep.name}`, {
      applicationId: app.id,
      repId: rep.id,
      teamId: app.teamId,
    });
    persist();
    return;
  }

  await flushPending("Ekip katılım onayından önce");
  if (!supabase) throw new Error("Supabase istemcisi yok.");
  const { error } = await supabase.rpc("approve_team_join_application", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(error.message || "Başvuru onaylanamadı.");
  await refreshFromServer();
}

/** Başvuru reddi (YALNIZ yönetici) — kayıt silinmez, 'reddedildi' kalır. */
export async function rejectTeamJoinApplication(applicationId: string, actor: Actor): Promise<void> {
  assertAdminActor(actor);

  if (!isSupabaseConfigured) {
    const db = getDB();
    const app = db.teamJoinApplications?.find((a) => a.id === applicationId);
    if (!app) throw new Error("Başvuru bulunamadı.");
    if (app.status !== "beklemede")
      throw new Error(`Bu başvuru zaten sonuçlandırılmış (durum: ${app.status}).`);
    app.status = "reddedildi";
    app.decidedAt = nowISO();
    app.decidedBy = actor.userId;
    log(db, actor, "ekip_katilim_reddedildi", "Ekip katılım başvurusu reddedildi", {
      applicationId: app.id,
      repId: app.repId,
      teamId: app.teamId,
    });
    persist();
    return;
  }

  if (!supabase) throw new Error("Supabase istemcisi yok.");
  const { error } = await supabase.rpc("reject_team_join_application", {
    p_application_id: applicationId,
  });
  if (error) throw new Error(error.message || "Başvuru reddedilemedi.");
  await refreshFromServer();
}

/* ============ AYARLAR ============ */

export function getSettings(): Settings {
  return getDB().settings;
}

/** Ayar anahtarına göre sayısal alt sınır (SQL check kısıtlarıyla aynı). */
const SETTINGS_MIN: Record<string, number> = {
  teamCapacity: 2,
  engagementTier1Interval: 1,
  engagementTier2Start: 1,
};

/** Komisyon/ödül kuralları ve etkileşim bildirim eşikleri yönetici tarafından değiştirilebilir. */
export function updateSettings(
  patch: Partial<
    Pick<
      Settings,
      | "membershipPrice"
      | "repCommission"
      | "referralReward"
      | "renewalCommission"
      | "teamCapacity"
      | "engagementEnabled"
      | "engagementTier1Enabled"
      | "engagementTier1Interval"
      | "engagementTier2Enabled"
      | "engagementTier2Start"
      | "engagementKindOverrides"
    >
  >,
  actor: Actor,
): Settings {
  if (actor.role !== "admin") throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
  const db = getDB();
  const before = { ...db.settings };
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "boolean" || (value !== null && typeof value === "object")) continue;
    const n = Number(value);
    const min = SETTINGS_MIN[key] ?? 0;
    if (!Number.isFinite(n) || n < min) throw new Error(`Geçersiz değer: ${key}`);
  }
  Object.assign(db.settings, patch, { updatedAt: nowISO() });
  log(db, actor, "ayar_guncelle", "Sistem ayarları güncellendi", {
    before,
    after: db.settings,
  });
  persist();
  return db.settings;
}

/* ============ ETKİLEŞİM SAYAÇLARI (0018) ============ */

/** Firma bazlı sayaçlar; companyId verilmezse tümü. */
export function listEngagementCounters(companyId?: string): EngagementCounter[] {
  const rows = getDB().engagementCounters ?? [];
  return companyId ? rows.filter((r) => r.companyId === companyId) : [...rows];
}

/** Eşik bildirimleri — en yeniden eskiye. */
export function listEngagementNotifications(limit = 20): EngagementNotification[] {
  const rows = [...(getDB().engagementNotifications ?? [])];
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/**
 * Gerçek bir etkileşimi sayar. Yayında olmayan/bulunmayan firmada hiçbir
 * şey yapmaz (sahte kayıt üretilmez).
 *
 * SUPABASE MODU: sayaç ve eşik kararı sunucuda, tek transaction içinde
 * (`track_company_engagement` RPC) verilir — eşzamanlı ziyaretlerde sayaç
 * kaybolmaz ve aynı sayım için ikinci bildirim yazılamaz.
 * DEMO MOD: aynı kural `applyEngagementToDB` ile yerel veri kümesinde uygulanır.
 */
export async function trackEngagement(
  companyId: string,
  kind: EngagementKind,
): Promise<EngagementNotification | null> {
  const db = getDB();
  const company = db.companies.find((c) => c.id === companyId);
  if (!company || !company.published) return null;

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.rpc("track_company_engagement", {
      p_company_id: companyId,
      p_kind: kind,
    });
    // Ziyaretçi akışını engellemeyiz; hata yalnız konsola düşer.
    if (error) console.warn(`track_company_engagement: ${error.message}`);
    return null;
  }

  const notification = applyEngagementToDB(db, companyId, kind);
  persist();
  return notification;
}

/* ============ DENETİM KAYDI ============ */

export function listAudit(limit = 100): ReturnType<typeof getDB>["audit"] {
  return getDB().audit.slice(0, limit);
}

/* ============ RAPORLAR ============ */
