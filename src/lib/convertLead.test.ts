import { describe, expect, it } from "vitest";
import {
  convertLead,
  deleteCompany,
  deleteLead,
  getDB,
  listAudit,
  resetDB,
} from "./repo";
import type { CompanyDraft } from "./repo";
import type { Actor, Lead } from "./types";
import { seedDB } from "../data/seed";

/**
 * Tur 2 köprüsü: aday→firma dönüştürme kuralları.
 * Testler demo repo üzerinde (resetDB + bellek içi cache) izole çalışır;
 * localStorage yoksa persist sessizce pas geçer (mevcut davranış).
 */

const admin: Actor = { userId: "admin-1", role: "admin" };
const rep: Actor = { userId: "rep-1", role: "temsilci", repId: "rep-1" };

function seedLead(): Lead {
  const lead = seedDB().leads.find((l) => l.id === "lead-1");
  if (!lead) throw new Error("seed lead-1 bulunamadı");
  return lead;
}

/** Aday verisinden tipik dönüşüm taslağı (UI'nin CompanyForm initial eşlemesiyle aynı) */
function draftFrom(lead: Lead, seed: ReturnType<typeof seedDB>): CompanyDraft {
  return {
    name: lead.companyName,
    categoryId: lead.categoryId ?? seed.categories[0].id,
    cityId: lead.cityId ?? seed.cities[0].id,
    district: lead.district ?? "Merkez",
    address: "",
    phone: lead.phone ?? "",
    email: "",
    website: "",
    socials: {},
    description: lead.note,
    featured: false,
    published: false,
    repId: lead.repId ?? null,
  };
}

function freshLead(leadId: string): Lead {
  const found = getDB().leads.find((l) => l.id === leadId);
  if (!found) throw new Error(`lead ${leadId} bulunamadı`);
  return found;
}

describe("convertLead", () => {
  it("firmayı lead verisiyle oluşturur (rep eşlemeli, slug üretimli, yayın dışı) ve adayı işaretler", () => {
    resetDB();
    const seed = seedDB();
    const lead = seedLead();

    const company = convertLead(lead.id, draftFrom(lead, seed), admin);

    // Firma oluşturuldu ve lead'in sahibi temsilciye eşlendi
    expect(company.name).toBe(lead.companyName);
    expect(company.slug.length).toBeGreaterThan(0);
    expect(company.published).toBe(false);
    expect(company.repId).toBe(lead.repId);
    expect(getDB().companies.some((c) => c.id === company.id)).toBe(true);

    // Aday dönüşüm işaretçisini aldı; durumu korunur (rep panosu "anlaşma" sayımı bozulmaz)
    const after = freshLead(lead.id);
    expect(after.convertedToCompanyId).toBe(company.id);
    expect(after.status).toBe(lead.status);
  });

  it("aynı adayda ikinci dönüşüm denemesi HATA verir", () => {
    resetDB();
    const seed = seedDB();
    const lead = seedLead();
    convertLead(lead.id, draftFrom(lead, seed), admin);
    expect(() => convertLead(lead.id, draftFrom(lead, seed), admin)).toThrow(
      "Bu aday zaten firmaya dönüşmüştür.",
    );
  });

  it("temsilci rolünde HATA verir (dönüşüm yalnızca admin)", () => {
    resetDB();
    const seed = seedDB();
    const lead = seedLead();
    expect(() => convertLead(lead.id, draftFrom(lead, seed), rep)).toThrow(
      "Firmaya dönüşüm yalnızca yönetici tarafından yapılır.",
    );
  });

  it("dönüşümden sonra deleteLead HATA verir; denetim kaydı aday_donusum tutulur", () => {
    resetDB();
    const seed = seedDB();
    const lead = seedLead();
    const company = convertLead(lead.id, draftFrom(lead, seed), admin);

    expect(() => deleteLead(lead.id, admin)).toThrow(
      "Firmaya dönüşmüş aday silinemez; dönüşüm geçmişini korumak için firma kaydıyla birlikte kapatın.",
    );

    // Denetim: dönüşüm kaydı lead+company meta ile tutulmalı (log unshift ile en üste ekler)
    const audit = listAudit(10);
    const entry = audit.find((a) => a.action === "aday_donusum");
    expect(entry).toBeDefined();
    expect(entry?.summary).toContain(lead.companyName);
    const detail = JSON.parse(entry?.detail ?? "{}") as {
      leadId?: string;
      companyId?: string;
    };
    expect(detail.leadId).toBe(lead.id);
    expect(detail.companyId).toBe(company.id);
  });

  it("formdaki temsilci seçimi kazanır: admin farklı rep seçerse firma ona atanır (B1 notu)", () => {
    resetDB();
    const seed = seedDB();
    const lead = seedLead();
    // lead-1'in sahibi rep-1; admin bilinçli olarak rep-2'ye atıyor
    const draft = { ...draftFrom(lead, seed), repId: "rep-2" };

    const company = convertLead(lead.id, draft, admin);

    expect(company.repId).toBe("rep-2");
  });

  it("dönüşüm kaynaklı firma silinirse aday işaretçisi temizlenir (zombi aday yok)", () => {
    resetDB();
    const seed = seedDB();
    const lead = seedLead();
    const company = convertLead(lead.id, draftFrom(lead, seed), admin);

    deleteCompany(company.id, admin);

    // İşaretçi asılmadı: aday yeniden dönüştürülebilir (FK on delete set null eşdeğeri)
    const after = freshLead(lead.id);
    expect(after.convertedToCompanyId).toBeUndefined();
    expect(() => deleteLead(lead.id, admin)).not.toThrow();
  });
});
