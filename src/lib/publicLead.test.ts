import { describe, expect, it } from "vitest";
import { createPublicLead, createLead, getDB, listLeads, listAudit, resetDB } from "./repo";
import type { Actor } from "./types";
import { seedDB } from "../data/seed";

/**
 * Tur 6: halka açık başvuru formu kuralları.
 * Temsilci atanmadan 'web' kaynaklı aday oluşur; rep panosu görmez,
 * admin görür; denetim 'web_basvuru' kaydı tutulur.
 */

const admin: Actor = { userId: "admin-1", role: "admin" };
const rep: Actor = { userId: "rep-1", role: "temsilci", repId: "rep-1" };

describe("createPublicLead", () => {
  it("rep'siz 'web' kaynaklı aday oluşturur ve denetim kaydı tutar", () => {
    resetDB();
    const before = seedDB().leads.length;

    const lead = createPublicLead({
      companyName: "Web'den Gelen Kebap",
      categoryId: "cat-1",
      cityId: "city-afyon",
      district: "Merkez",
      phone: "0272 000 11 00",
      note: "Rehbere eklenmek istiyoruz.",
    });

    expect(lead.status).toBe("yeni");
    expect(lead.source).toBe("web");
    expect(lead.repId).toBeUndefined();
    expect(lead.companyName).toBe("Web'den Gelen Kebap");
    expect(getDB().leads.length).toBe(before + 1);

    const audit = listAudit(10);
    const entry = audit.find((a) => a.action === "web_basvuru");
    expect(entry?.summary).toContain("Web'den Gelen Kebap");
  });

  it("ad veya telefon zorunlu; bos girişlerde hata verir", () => {
    resetDB();
    expect(() =>
      createPublicLead({ companyName: "   ", phone: "0272 000 11 00" }),
    ).toThrow("Firma adı zorunlu.");
    expect(() => createPublicLead({ companyName: "Test", phone: "" })).toThrow(
      "Telefon numarası zorunlu.",
    );
  });

  it("temsilci panosu web başvurusunu GÖRMEZ; admin görür", () => {
    resetDB();
    createPublicLead({ companyName: "Görünmez Başvuru", phone: "0505 555 55 55" });

    const repLeads = listLeads(rep);
    expect(repLeads.some((l) => l.companyName === "Görünmez Başvuru")).toBe(false);

    const adminLeads = listLeads(admin);
    expect(adminLeads.some((l) => l.companyName === "Görünmez Başvuru")).toBe(true);
  });

  it("temsilci createLead 'sahada' kaynaklı yaz; repId'siz temsilci hiçbir adayı göremez", () => {
    resetDB();
    createLead(
      {
        companyName: "Sahada Aday",
        categoryId: undefined,
        cityId: undefined,
        district: " Merkez ",
        phone: "0505 444 33 22",
        note: "",
      },
      rep,
    );
    const stored = getDB().leads.find((l) => l.companyName === "Sahada Aday");
    expect(stored?.source).toBe("sahada");
    expect(stored?.repId).toBe("rep-1");
    expect(stored?.district).toBe("Merkez"); // trim tutarlılığı
    // repId'siz bozuk temsilci hesabı havuza katılamaz
    expect(listLeads({ userId: "rep-x", role: "temsilci" }).length).toBe(0);
  });
});
