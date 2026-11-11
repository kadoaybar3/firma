import { describe, expect, it } from "vitest";
import {
  approveEftPayment,
  convertLead,
  createCompany,
  createLead,
  createPendingPayment,
  createSale,
  districtCompanyCount,
  districtCountsByCity,
  listCategories,
  listCities,
  listCommissions,
  listLeads,
  listReps,
  listSales,
  resetDB,
  updateCompany,
  updateLead,
  updateLeadStatus,
  verifyPayment,
} from "./repo";
import type { Actor } from "./types";

/**
 * districtCountsByCity ile referans districtCompanyCount arasındaki invariant
 * eşdeğerlik — tek-geçiş uygulaması mantık farkı taşımamalı
 * (published filtresi, exact-case ilçe eşleşmesi, şehir kısıtı).
 */
describe("districtCountsByCity", () => {
  it("her ilçe için districtCompanyCount ile birebir aynı sayıyı üretir", () => {
    resetDB();
    for (const city of listCities()) {
      const map = districtCountsByCity(city.id);
      for (const d of city.districts) {
        expect(map.get(d) ?? 0).toBe(districtCompanyCount(city.id, d));
      }
    }
  });

  it("bilinmeyen şehir kimliği için boş Map döner", () => {
    resetDB();
    expect(districtCountsByCity("yok-boyle-sehir").size).toBe(0);
  });
});

describe("firma koordinatları", () => {
  const admin: Actor = { role: "admin" };

  function draft() {
    const category = listCategories()[0];
    const city = listCities()[0];
    return {
      name: "Koordinat Test Firma",
      categoryId: category.id,
      cityId: city.id,
      district: city.districts[0] ?? "Merkez",
      address: "Marulcu Mah., No:45",
      phone: "0555 000 00 00",
      description: "",
      published: false,
    };
  }

  it("createCompany koordinatları kaydeder", () => {
    resetDB();
    const company = createCompany(
      { ...draft(), latitude: 38.754321, longitude: 30.52 },
      admin,
    );
    expect(company.latitude).toBe(38.754321);
    expect(company.longitude).toBe(30.52);
  });

  it("updateCompany koordinatları günceller ve temizleyebilir", () => {
    resetDB();
    const company = createCompany(draft(), admin);
    expect(company.latitude).toBeUndefined();

    const withCoords = updateCompany(
      company.id,
      { latitude: 38.1, longitude: 30.2 },
      admin,
    );
    expect(withCoords.latitude).toBe(38.1);
    expect(withCoords.longitude).toBe(30.2);

    const cleared = updateCompany(
      company.id,
      { latitude: undefined, longitude: undefined },
      admin,
    );
    expect(cleared.latitude).toBeUndefined();
    expect(cleared.longitude).toBeUndefined();
  });

  it("geçersiz/yetersiz koordinatı reddeder", () => {
    resetDB();
    expect(() =>
      createCompany({ ...draft(), latitude: 91, longitude: 30 }, admin),
    ).toThrow(/koordinat/i);
    expect(() =>
      createCompany({ ...draft(), latitude: 38.1 }, admin),
    ).toThrow(/koordinat/i);
  });
});

describe("aday adres/koordinat taşıma", () => {
  it("createLead adres ve koordinatı saklar; not güncellemesi onları korur", () => {
    resetDB();
    const rep = listReps()[0];
    const actor: Actor = { role: "temsilci", repId: rep.id };
    const category = listCategories()[0];
    const city = listCities()[0];

    const lead = createLead(
      {
        companyName: "Aday Konum",
        categoryId: category.id,
        cityId: city.id,
        district: city.districts[0] ?? "Merkez",
        phone: "0555",
        address: "Marulcu Mah., No:45, Merkez, Afyonkarahisar",
        latitude: 38.754321,
        longitude: 30.52,
        note: "Yetkili: Ayşe",
      },
      actor,
    );

    expect(lead.address).toBe("Marulcu Mah., No:45, Merkez, Afyonkarahisar");
    expect(lead.latitude).toBe(38.754321);
    expect(lead.longitude).toBe(30.52);

    const statusUpdated = updateLeadStatus(lead.id, "irtibat", "Yeni not", actor);
    expect(statusUpdated.note).toBe("Yeni not");
    expect(statusUpdated.address).toBe("Marulcu Mah., No:45, Merkez, Afyonkarahisar");
    expect(statusUpdated.latitude).toBe(38.754321);
    expect(statusUpdated.longitude).toBe(30.52);
  });

  it("updateLead konumu temizleyebilir", () => {
    resetDB();
    const rep = listReps()[0];
    const actor: Actor = { role: "temsilci", repId: rep.id };
    const lead = createLead(
      {
        companyName: "Aday Konum 2",
        phone: "",
        note: "",
        address: "Adres",
        latitude: 38.1,
        longitude: 30.2,
      },
      actor,
    );

    updateLead(lead.id, { latitude: undefined, longitude: undefined }, actor);
    const stored = listLeads(actor).find((item) => item.id === lead.id);
    expect(stored?.latitude).toBeUndefined();
    expect(stored?.longitude).toBeUndefined();
    expect(stored?.address).toBe("Adres");
  });
});

describe("firma yayınlama güvenliği", () => {
  const admin: Actor = { role: "admin" };

  function companyDraft() {
    const category = listCategories()[0];
    const city = listCities()[0];
    return {
      name: "Yayın Guard Test Firma",
      categoryId: category.id,
      cityId: city.id,
      district: city.districts[0] ?? "Merkez",
      address: "Test Mah., No:2",
      phone: "0555 222 33 44",
      description: "",
    };
  }

  it("createCompany published:true istese bile firmayı yayın dışı oluşturur", () => {
    resetDB();
    const company = createCompany({ ...companyDraft(), published: true }, admin);
    expect(company.published).toBe(false);
  });

  it("satışı ve ödemesi olmayan firma yayına alınamaz", () => {
    resetDB();
    const company = createCompany(companyDraft(), admin);
    expect(() => updateCompany(company.id, { published: true }, admin)).toThrow(
      /satış kaydı ve yönetici tarafından onaylanmış ödeme/i,
    );
    expect(company.published).toBe(false);
  });

  it("satışı olan ama onaylı ödemesi olmayan firma yayına alınamaz", () => {
    resetDB();
    const company = createCompany(companyDraft(), admin);
    createSale({ companyId: company.id, channel: "temsilci" }, admin);
    expect(() => updateCompany(company.id, { published: true }, admin)).toThrow(
      /satış kaydı ve yönetici tarafından onaylanmış ödeme/i,
    );
    expect(company.published).toBe(false);
  });

  it("onaylı ödemesi olan firma yayına alınabilir", async () => {
    resetDB();
    const company = createCompany(companyDraft(), admin);
    const sale = createSale({ companyId: company.id, channel: "temsilci" }, admin);
    const payment = await createPendingPayment(sale.id, admin);
    await verifyPayment(payment.id, admin);

    const published = updateCompany(company.id, { published: true }, admin);
    expect(published.published).toBe(true);
  });

  it("temsilcisi olmayan (repId yok) firma da yayın guard'ına tabidir", () => {
    resetDB();
    const company = createCompany(companyDraft(), admin);
    expect(company.repId).toBeUndefined();
    expect(() => updateCompany(company.id, { published: true }, admin)).toThrow();
  });
});

describe("convertLead → potansiyel satış", () => {
  const admin: Actor = { role: "admin" };
  function leadDraft() {
    const category = listCategories()[0];
    const city = listCities()[0];
    return {
      companyName: "Dönüşüm Test Firma",
      categoryId: category.id,
      cityId: city.id,
      district: city.districts[0] ?? "Merkez",
      phone: "0555 111 22 33",
      note: "",
    };
  }

  function companyDraft() {
    const category = listCategories()[0];
    const city = listCities()[0];
    return {
      name: "Dönüşüm Test Firma",
      categoryId: category.id,
      cityId: city.id,
      district: city.districts[0] ?? "Merkez",
      address: "Test Mah., No:1",
      phone: "0555 111 22 33",
      description: "",
      published: false,
    };
  }

  it("firmaya bağlı, potansiyel durumda ve temsilci kanallı satış oluşturur", async () => {
    resetDB();
    const rep = listReps()[0];
    const repActor: Actor = { role: "temsilci", repId: rep.id };
    const lead = createLead(leadDraft(), repActor);

    const company = await convertLead(lead.id, companyDraft(), admin);
    const sales = listSales(admin).filter((s) => s.companyId === company.id);

    expect(sales).toHaveLength(1);
    expect(sales[0].status).toBe("potansiyel");
    expect(sales[0].channel).toBe("temsilci");
    expect(sales[0].repId).toBe(rep.id);
    expect(sales[0].amount).toBeGreaterThan(0);
  });

  it("aynı aday ikinci kez dönüştürülürse mükerrer satış oluşmaz", async () => {
    resetDB();
    const rep = listReps()[0];
    const repActor: Actor = { role: "temsilci", repId: rep.id };
    const lead = createLead(leadDraft(), repActor);

    const company = await convertLead(lead.id, companyDraft(), admin);
    await expect(convertLead(lead.id, companyDraft(), admin)).rejects.toThrow();
    expect(listSales(admin).filter((s) => s.companyId === company.id)).toHaveLength(1);
  });
});

describe("paket tutarı → satış → ödeme → komisyon", () => {
  const admin: Actor = { role: "admin" };

  function companyFor(name: string) {
    const category = listCategories()[0];
    const city = listCities()[0];
    return createCompany(
      {
        name,
        categoryId: category.id,
        cityId: city.id,
        district: city.districts[0] ?? "Merkez",
        address: "Test Mah., No:1",
        phone: "0555 111 22 33",
        description: "",
        published: false,
      },
      admin,
    );
  }

  function salesCommissions(saleId: string) {
    return listCommissions(admin).filter(({ com }) => com.saleId === saleId);
  }

  it("normal paket (1.000) → komisyon %50 = 500", async () => {
    resetDB();
    const rep = listReps()[0];
    const company = companyFor("Komisyon Normal");
    const sale = createSale(
      { companyId: company.id, channel: "temsilci", repId: rep.id, amount: 1000 },
      admin,
    );
    const payment = await approveEftPayment(sale.id, admin);

    expect(sale.amount).toBe(1000);
    expect(payment.amount).toBe(sale.amount);
    const coms = salesCommissions(sale.id);
    expect(coms).toHaveLength(1);
    expect(coms[0].com.amount).toBe(500);
    expect(coms[0].com.amount / sale.amount).toBe(0.5);
  });

  it("öne çıkan paket (2.000) → komisyon %50 = 1.000, ödeme tutarı satışla eşit", async () => {
    resetDB();
    const rep = listReps()[0];
    const company = companyFor("Komisyon Öne Çıkan");
    const sale = createSale(
      { companyId: company.id, channel: "temsilci", repId: rep.id, amount: 2000 },
      admin,
    );
    const payment = await approveEftPayment(sale.id, admin);

    expect(payment.amount).toBe(2000);
    expect(payment.amount).toBe(sale.amount);
    const coms = salesCommissions(sale.id);
    expect(coms).toHaveLength(1);
    expect(coms[0].com.amount).toBe(1000);
    expect(coms[0].com.amount / sale.amount).toBe(0.5);
  });

  it("paket dışı tutar satışa yazılamaz", () => {
    resetDB();
    const rep = listReps()[0];
    const company = companyFor("Yanlış Tutar");
    expect(() =>
      createSale({ companyId: company.id, channel: "temsilci", repId: rep.id, amount: 999 }, admin),
    ).toThrow(/paket/i);
  });

  it("aynı satış için ikinci komisyon üretilmez", async () => {
    resetDB();
    const rep = listReps()[0];
    const company = companyFor("Mükerrer Komisyon");
    const sale = createSale(
      { companyId: company.id, channel: "temsilci", repId: rep.id, amount: 2000 },
      admin,
    );
    await approveEftPayment(sale.id, admin);
    await expect(approveEftPayment(sale.id, admin)).rejects.toThrow();
    expect(salesCommissions(sale.id)).toHaveLength(1);
  });
});
