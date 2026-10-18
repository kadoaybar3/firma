import { describe, expect, it } from "vitest";
import { companyIndex, createCompany, deleteCompany, getCompanyById, getDB, resetDB, setDB } from "./repo";
import type { DB } from "./types";
import { seedDB } from "../data/seed";
import type { Actor } from "./types";

/**
 * Tur 3: O(1) firma indeksi invariantları.
 * İndeks getCompanyById ile birebir aynı sonucu/canlı referansı vermelidir;
 * mutasyon sonrası sürüm sayacıyla tazelenmelidir.
 */

const admin: Actor = { userId: "admin-1", role: "admin" };

describe("companyIndex", () => {
  it("tüm firmaları içerir ve getCompanyById ile AYNI canlı referansı döndürür", () => {
    resetDB();
    const index = companyIndex();
    for (const c of getCompanyByIdAll()) {
      const fromIndex = index.get(c.id);
      expect(fromIndex).toBe(c); // canlı referans — updateCompany mutasyonu indekste görünür
    }
    expect(index.size).toBe(seedDB().companies.length);
  });

  it("createCompany sonrası indeks yeni firmayı görür (sürüm tazelenmesi)", () => {
    resetDB();
    // İndeksi mutasyondan ÖNCE kur: tazelenme davranışını kanıtlar
    const warm = companyIndex();
    expect(warm.size).toBe(getDB().companies.length);
    const draft = {
      name: "İndekste Aday Test Firması",
      categoryId: "cat-1",
      cityId: "city-afyon",
      district: "Merkez",
      address: "Test",
      phone: "0555 999 88 77",
      description: "İndeks testi",
    };
    const company = createCompany(draft, admin);
    expect(companyIndex().get(company.id)).toBe(company);
    expect(companyIndex().get(company.id)).toBe(getCompanyById(company.id));
  });

  it("deleteCompany sonrası indeks eski firmayı döndürmez", () => {
    resetDB();
    const company = createCompany(
      {
        name: "Silinecek İndeks Test Firması",
        categoryId: "cat-1",
        cityId: "city-afyon",
        district: "Merkez",
        address: "Test",
        phone: "0555 888 77 66",
        description: "silme testi",
      },
      admin,
    );
    expect(companyIndex().has(company.id)).toBe(true);
    deleteCompany(company.id, admin);
    expect(companyIndex().has(company.id)).toBe(false);
    expect(getCompanyById(company.id)).toBeUndefined();
  });

  it("setDB ile indeks bilinçli düşürülür (test izolasyonu)", () => {
    resetDB();
    companyIndex(); // indeksi kur
    const cloned = structuredClone(seedDB()) as DB;
    cloned.companies = cloned.companies.filter((c) => c.id !== "co-1");
    setDB(cloned);
    expect(companyIndex().has("co-1")).toBe(false);
    expect(companyIndex().get("co-2")).toBe(getDB().companies.find((c) => c.id === "co-2"));
  });
});

/** seed içindeki tüm firmaların canlı referansları (getDB cache'i üzerinden kopya değil) */
function getCompanyByIdAll(): DB["companies"] {
  return getDB().companies;
}
