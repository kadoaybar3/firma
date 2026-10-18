import type {
  Actor,
  Category,
  City,
  Commission,
  Company,
  DB,
  Lead,
  LeadStatus,
  LeadVisit,
  Membership,
  Payment,
  Referral,
  Sale,
  SalesRep,
  Settings,
} from "./types";
import { seedDB } from "../data/seed";
import { normalizeSearch, slugify, uniqueSlug } from "./slug";
import { uid, nowISO, log } from "./engine";
import * as engine from "./engine";

/**
 * VERİ KAYNAĞI KATMANI
 *
 * Gerçek Supabase bilgileri henüz sağlanmadığından bu uygulama DEMO MODDA çalışır:
 * tüm veriler tarayıcının localStorage'ında tutulur. Bu katman, Production'da
 * Supabase deposuyla değiştirilebilecek tutarlı bir fonksiyon arayüzü sunar.
 *
 * BU DEMO MOD GERÇEK BIR VERITABANI DEĞILDIR; Roller arayüzde korunur,
 * sunucu taraflı koruma (RLS) Supabase migration'ında hazırdır.
 */

const STORAGE_KEY = "firma-rehberi.db.v2"; // v2: anlamsal kategori eşlemeli tohum veri

let cache: DB | null = null;
let storageAvailable = true;

export function getDB(): DB {
  if (cache) return cache;
  if (storageAvailable && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        cache = JSON.parse(raw) as DB;
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
  if (!cache) return;
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    storageAvailable = false; // iCloud/private mod vb. — bellek içi devam
  }
}

export function resetDB(): void {
  cache = seedDB();
  persist();
}

/** Testler için */
export function setDB(db: DB): void {
  cache = db;
}

/* ============ FİRMALAR ============ */

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
  images?: string[];
  featured?: boolean;
  published?: boolean;
  repId?: string | null;
}

export function createCompany(draft: CompanyDraft, actor: Actor): Company {
  const db = getDB();
  if (!draft.name.trim()) throw new Error("Firma adı zorunludur.");
  if (!draft.phone.trim()) throw new Error("Telefon numarası zorunludur.");
  const company: Company = {
    id: uid(),
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
    images: draft.images?.length ? draft.images : ["🏢"],
    hours: draft.hours ?? { weekday: "09:00 - 18:00", saturday: "09:00 - 16:00", sunday: "Kapalı" },
    featured: draft.featured ?? false,
    published: draft.published ?? false,
    repId: draft.repId ?? undefined,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.companies.push(company);
  log(db, actor, "firma_eklendi", `Firma eklendi: ${company.name}`, { companyId: company.id });
  persist();
  return company;
}

export function updateCompany(id: string, patch: Partial<CompanyDraft>, actor: Actor): Company {
  const db = getDB();
  const company = db.companies.find((c) => c.id === id);
  if (!company) throw new Error("Firma bulunamadı.");
  const before = { featured: company.featured, published: company.published };
  Object.assign(company, patch, { updatedAt: nowISO() });
  if (patch.name && patch.name.trim() && patch.name !== company.name) {
    // Ad değişse de slug korunur (bağlantı istikrarı); yalnızca ilk oluşturmada üretilir.
    company.name = patch.name.trim();
  }
  log(db, actor, "firma_guncellendi", `Firma güncellendi: ${company.name}`, {
    companyId: id,
    patch,
    before,
  });
  persist();
  return company;
}

export function deleteCompany(id: string, actor: Actor): void {
  const db = getDB();
  const company = db.companies.find((c) => c.id === id);
  if (!company) throw new Error("Firma bulunamadı.");
  // Üyeliği aktif firmayı silmeyi engelle
  const hasActive = db.memberships.some((m) => m.companyId === id && m.status === "aktif");
  if (hasActive)
    throw new Error("Bu firmanın aktif bir üyeliği var. Seçili firmayı yayından kaldırabilirsiniz.");
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
  return cat;
}

export function deleteCategory(id: string, actor: Actor): void {
  const db = getDB();
  const inUse = db.companies.some((c) => c.categoryId === id);
  if (inUse) throw new Error("Bu kategoride çalışan firmalar var; önce onları taşıyın.");
  const cat = db.categories.find((c) => c.id === id);
  db.categories = db.categories.filter((c) => c.id !== id);
  if (cat) log(db, actor, "kategori_silindi", `Kategori silindi: ${cat.name}`, { categoryId: id });
  persist();
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
  const db = getDB();
  const city = db.cities.find((c) => c.id === cityId);
  if (!city) throw new Error("Şehir bulunamadı.");
  const district = name.trim();
  if (!district) return;
  if (city.districts.includes(district)) throw new Error("Bu ilçe zaten kayıtlı.");
  city.districts.push(district);
  log(db, actor, "ilce_eklendi", `İlçe eklendi: ${city.name}/${district}`, { cityId, district });
  persist();
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
}

export function createCity(name: string, actor: Actor): City {
  const db = getDB();
  const city: City = {
    id: uid(),
    name: name.trim(),
    slug: uniqueSlug(
      name,
      db.cities.map((c) => c.slug),
    ),
    districts: ["Merkez"],
  };
  db.cities.push(city);
  log(db, actor, "sehir_eklendi", `Şehir eklendi: ${city.name}`, { cityId: city.id });
  persist();
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
  if (actor.role === "temsilci" && actor.repId)
    return db.leads
      .filter((l) => l.repId === actor.repId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...db.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listVisits(leadId: string): LeadVisit[] {
  return getDB()
    .visits.filter((v) => v.leadId === leadId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function createLead(
  data: Pick<Lead, "companyName" | "categoryId" | "cityId" | "district" | "phone" | "note">,
  actor: Actor,
): Lead {
  if (actor.role !== "temsilci" || !actor.repId)
    throw new Error("Aday yalnızca satış temsilcisi tarafından eklenabilir.");
  const db = getDB();
  const lead: Lead = {
    id: uid(),
    repId: actor.repId,
    companyName: data.companyName.trim(),
    categoryId: data.categoryId || undefined,
    cityId: data.cityId || undefined,
    district: data.district,
    phone: data.phone?.trim(),
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
 * Anlaşılan adayın firmaya dönüştürülmesi (ADMIN-only).
 * Firma, aday verisiyle önceden doldurulmuş taslak üzerinden createCompany
 * kurallarıyla oluşturulur; adayın sahibi temsilci firma rep eşlemesine
 * varsayılan olur. Aday durumu DEĞİŞMEZ (rep panosu "anlaşma" sayımını bozmamak
 * için); dönüşüm yalnızca convertedToCompanyId işaretçisiyle kayıt altına alınır.
 */
export function convertLead(leadId: string, draft: CompanyDraft, actor: Actor): Company {
  if (actor.role !== "admin")
    throw new Error("Firmaya dönüşüm yalnızca yönetici tarafından yapılır.");
  const db = getDB();
  const lead = db.leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Aday bulunamadı.");
  if (lead.convertedToCompanyId) throw new Error("Bu aday zaten firmaya dönüşmüştür.");
  // Adayın sahibi varsayılan rep; admin taslakta geçersiz kılabilir.
  // Aday sahibi varsayılan atamadır; admin formdaki seçimle geçersiz kılabilir.
  const company = createCompany({ ...draft, repId: draft.repId ?? lead.repId ?? null }, actor);
  lead.convertedToCompanyId = company.id;
  lead.updatedAt = nowISO();
  log(db, actor, "aday_donusum", `Firmaya dönüştürüldü: ${lead.companyName}`, {
    leadId,
    companyId: company.id,
  });
  persist();
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

  const sale: Sale = {
    id: uid(),
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

/** Sağlayıcı entegrasyonu olmadan satış için BEKLEMEDE ödeme kaydı açma (yetkisi admin). */
export function createPendingPayment(saleId: string, actor: Actor): Payment {
  const db = getDB();
  if (actor.role !== "admin") throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new Error("Satış bulunamadı.");
  const payment: Payment = {
    id: uid(),
    saleId,
    amount: sale.amount,
    provider: "hicbiri",
    providerRef: `PENDING-${sale.id.slice(0, 8)}`,
    status: "beklemede",
    idempotencyKey: uid(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.payments.push(payment);
  log(db, actor, "odeme_kaydi_acildi", `Beklemede ödeme kaydı açıldı`, { saleId, paymentId: payment.id });
  persist();
  return payment;
}

export function cancelSale(saleId: string, actor: Actor): Sale {
  const db = getDB();
  if (actor.role !== "admin") throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
  const sale = db.sales.find((s) => s.id === saleId);
  if (!sale) throw new Error("Satış bulunamadı.");
  if (sale.status !== "potansiyel") throw new Error("Yalnızca bekleyen satış iptal edilebilir.");
  sale.status = "iptal";
  log(db, actor, "satis_iptal", `Satış iptal edildi`, { saleId });
  persist();
  return sale;
}

/* engine sarmalayıcıları — değişikliği kalıcı yapar */
export function confirmSale(saleId: string, actor: Actor): void {
  const db = getDB();
  engine.confirmSale(db, saleId, actor);
  persist();
}

export function confirmRenewal(saleId: string, actor: Actor): void {
  const db = getDB();
  engine.confirmRenewal(db, saleId, actor);
  persist();
}

export function verifyPayment(paymentId: string, actor: Actor): void {
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

export function markCommissionPaid(commissionId: string, actor: Actor): void {
  const db = getDB();
  if (actor.role !== "admin") throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
  const commission = db.commissions.find((c) => c.id === commissionId);
  if (!commission) throw new Error("Komisyon bulunamadı.");
  if (commission.status === "odendi") throw new Error("Komisyon zaten ödendi.");
  commission.status = "odendi";
  commission.paidAt = nowISO();
  log(db, actor, "komisyon_odendi", `Komisyon ödendi`, { commissionId });
  persist();
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

/* ============ AYARLAR ============ */

export function getSettings(): Settings {
  return getDB().settings;
}

/** Komisyon/ödül kuralları yönetici tarafından değiştirilebilir; her değişiklik denetim kaydına işlenir. */
export function updateSettings(
  patch: Partial<Pick<Settings, "membershipPrice" | "repCommission" | "referralReward" | "renewalCommission">>,
  actor: Actor,
): Settings {
  if (actor.role !== "admin") throw new Error("Bu işlem yalnızca yönetici tarafından yapılabilir.");
  const db = getDB();
  const before = { ...db.settings };
  for (const [key, value] of Object.entries(patch)) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0)
      throw new Error(`Geçersiz değer: ${key}`);
  }
  Object.assign(db.settings, patch, { updatedAt: nowISO() });
  log(db, actor, "ayar_guncelle", "Fiyat ve komisyon ayarları güncellendi", {
    before,
    after: db.settings,
  });
  persist();
  return db.settings;
}

/* ============ DENETİM KAYDI ============ */

export function listAudit(limit = 100): ReturnType<typeof getDB>["audit"] {
  return getDB().audit.slice(0, limit);
}

/* ============ RAPORLAR ============ */

export interface MonthlyReport {
  month: string; // 2026-10
  saleCount: number;
  totalAmount: number;
  commissionTotal: number;
}

export function monthlyReport(months = 6): MonthlyReport[] {
  const db = getDB();
  const out: MonthlyReport[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const sales = db.sales.filter(
      (s) => s.status === "odendi" && s.confirmedAt?.startsWith(key),
    );
    out.push({
      month: key,
      saleCount: sales.length,
      totalAmount: sales.reduce((sum, s) => sum + s.amount, 0),
      commissionTotal: db.commissions
        .filter((c) => sales.some((s) => s.id === c.saleId))
        .reduce((sum, c) => sum + c.amount, 0),
    });
  }
  return out;
}
