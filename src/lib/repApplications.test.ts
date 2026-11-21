import { beforeEach, describe, expect, it } from "vitest";
import {
  approveRepApplication,
  createPublicApplication,
  createTeam,
  getDB,
  listRepApplications,
  rejectRepApplication,
  resetDB,
  setRepTeam,
  setTeamLeader,
  updateSettings,
} from "./repo";
import type { Actor } from "./types";

/**
 * Referans bağlantısıyla personel başvurusu — demo mod JS aynası
 * (0012_rep_applications.sql). Honeypot canlıda RPC'de, arayüzde çalışır;
 * bu dosya repo katmanının doğrulama/tekrar-başvuru/ekip-görüntüsü
 * ve onay/red (0013) kurallarını doğrular.
 */
const admin: Actor = { userId: "user-admin", role: "admin" };
const rep1: Actor = { userId: "user-1", role: "temsilci", repId: "rep-1" };

beforeEach(() => resetDB());

function validInput(overrides: Partial<Parameters<typeof createPublicApplication>[0]> = {}) {
  return {
    firstName: "Ayşe",
    lastName: "Yılmaz",
    phone: "0555 111 22 33",
    email: "ayse@ornek.com",
    refCode: "AF-001",
    ...overrides,
  };
}

describe("demo personel başvurusu", () => {
  it("geçerli referansla beklemede başvuru kaydeder", () => {
    const app = createPublicApplication(validInput());
    expect(app.status).toBe("beklemede");
    expect(app.referralRepId).toBe("rep-1");
    expect(app.firstName).toBe("Ayşe");
    expect(getDB().repApplications).toHaveLength(1);
  });

  it("ekip, başvuru anında referans personelin team_id'sinden alınır", async () => {
    const team = await createTeam("Ekibim", { userId: "u1", role: "temsilci", repId: "rep-1" });
    const app = createPublicApplication(validInput());
    expect(app.teamId).toBe(team.id);
  });

  it("ekipsiz personelin başvurusu teamId olmadan kaydedilir", () => {
    const app = createPublicApplication(validInput({ refCode: "AF-002" }));
    expect(app.referralRepId).toBe("rep-2");
    expect(app.teamId).toBeUndefined();
  });

  it("geçersiz referans kodu reddedilir", () => {
    expect(() => createPublicApplication(validInput({ refCode: "XX-999" }))).toThrow(
      /Geçersiz referans/,
    );
    expect(getDB().repApplications).toHaveLength(0);
  });

  it("pasif personelin referans kodu çalışmaz", () => {
    getDB().reps[1].status = "pasif";
    expect(() => createPublicApplication(validInput({ refCode: "AF-002" }))).toThrow(
      /Geçersiz referans/,
    );
  });

  it("bekleyen aynı telefon veya e-posta ile ikinci başvuru reddedilir", () => {
    createPublicApplication(validInput());
    // telefon aynı, e-posta farklı → yine tekrar
    expect(() => createPublicApplication(validInput({ email: "farkli@ornek.com" }))).toThrow(
      /bekleyen bir başvurunuz/,
    );
    // e-posta aynı, telefon farklı → yine tekrar
    expect(() => createPublicApplication(validInput({ phone: "0555 999 88 77" }))).toThrow(
      /bekleyen bir başvurunuz/,
    );
    expect(getDB().repApplications).toHaveLength(1);
  });

  it("geçersiz ad/soyad/telefon/e-posta reddedilir", () => {
    expect(() => createPublicApplication(validInput({ firstName: "A" }))).toThrow(/Ad 2-50/);
    expect(() => createPublicApplication(validInput({ lastName: "" }))).toThrow(/Soyad 2-50/);
    expect(() => createPublicApplication(validInput({ phone: "12" }))).toThrow(/telefon/);
    expect(() => createPublicApplication(validInput({ email: "gecersiz" }))).toThrow(/e-posta/);
    expect(getDB().repApplications).toHaveLength(0);
  });
});

describe("başvuru onayı (0013 demo aynası)", () => {
  it("onay: yeni personel AF kodu ve ekip bağlantısıyla oluşur, başvuru onaylanır", async () => {
    const team = await createTeam("Ekibim", rep1);
    const app = createPublicApplication(validInput());
    await approveRepApplication(app.id, "sifre123", admin);

    const db = getDB();
    expect(app.status).toBe("onaylandi");
    const created = db.reps[db.reps.length - 1];
    expect(created.name).toBe("Ayşe Yılmaz");
    expect(created.code).toBe("AF-003");
    expect(created.teamId).toBe(team.id);
    expect(created.status).toBe("aktif");
    // başvuru kaydı denetim için listede kalır
    expect(listRepApplications(admin)).toHaveLength(1);
    expect(db.audit.some((e) => e.action === "personel_basvurusu_onaylandi")).toBe(true);
  });

  it("onay ve red yalnız yönetici", async () => {
    const app = createPublicApplication(validInput());
    await expect(approveRepApplication(app.id, "sifre123", rep1)).rejects.toThrow(/yalnızca yönetici/);
    await expect(rejectRepApplication(app.id, rep1)).rejects.toThrow(/yalnızca yönetici/);
    expect(app.status).toBe("beklemede");
  });

  it("sonuçlanmış başvuruya tekrar onay veya red verilemez", async () => {
    const app = createPublicApplication(validInput());
    await approveRepApplication(app.id, "sifre123", admin);
    await expect(approveRepApplication(app.id, "sifre123", admin)).rejects.toThrow(
      /zaten sonuçlandırılmış/,
    );
    await expect(rejectRepApplication(app.id, admin)).rejects.toThrow(/zaten sonuçlandırılmış/);
  });

  it("personel şifresi en az 6 karakter (hesap bütünlüğü)", async () => {
    const app = createPublicApplication(validInput());
    await expect(approveRepApplication(app.id, "abc", admin)).rejects.toThrow(/en az 6 karakter/);
    expect(app.status).toBe("beklemede");
    expect(getDB().reps).toHaveLength(2);
  });

  it("kapasite doluysa onay yapılamaz", async () => {
    const team = await createTeam("Ekibim", rep1);
    updateSettings({ teamCapacity: 2 }, admin);
    await setRepTeam("rep-2", team.id, admin); // 2/2 (lider dahil)
    const app = createPublicApplication(validInput());
    await expect(approveRepApplication(app.id, "sifre123", admin)).rejects.toThrow(
      /kapasitesi dolu/,
    );
    expect(app.status).toBe("beklemede");
    expect(getDB().reps).toHaveLength(2);
  });

  it("referans personeli pasifleştirilmişse onay yapılamaz", async () => {
    await createTeam("Ekibim", rep1);
    const app = createPublicApplication(validInput());
    getDB().reps[0].status = "pasif";
    await expect(approveRepApplication(app.id, "sifre123", admin)).rejects.toThrow(
      /Referans personeli doğrulanamadı/,
    );
    expect(app.status).toBe("beklemede");
  });

  it("referans personelinin ekibi değişmişse onay yapılamaz", async () => {
    const a = await createTeam("A Ekibi", rep1);
    const app = createPublicApplication(validInput());
    // rep-1 liderliğinden ayrılıp başka ekibe geçer (başvuru anındaki ekip A)
    await setRepTeam("rep-2", a.id, admin);
    await setTeamLeader(a.id, "rep-2", admin);
    await createTeam("B Ekibi", rep1);
    await expect(approveRepApplication(app.id, "sifre123", admin)).rejects.toThrow(
      /ekibi değişmiş/,
    );
    expect(app.status).toBe("beklemede");
  });
});

describe("başvuru reddi (0013)", () => {
  it("red kaydı silmez, reddedildi olarak tutar ve denetim bırakır", async () => {
    const app = createPublicApplication(validInput());
    await rejectRepApplication(app.id, admin);
    expect(app.status).toBe("reddedildi");
    expect(getDB().repApplications).toHaveLength(1);
    expect(getDB().reps).toHaveLength(2); // yeni personel oluşmaz
    expect(getDB().audit.some((e) => e.action === "personel_basvurusu_reddedildi")).toBe(true);
  });

  it("reddedilen başvuruya tekrar onay veya red verilemez", async () => {
    const app = createPublicApplication(validInput());
    await rejectRepApplication(app.id, admin);
    await expect(rejectRepApplication(app.id, admin)).rejects.toThrow(/zaten sonuçlandırılmış/);
    await expect(approveRepApplication(app.id, "sifre123", admin)).rejects.toThrow(
      /zaten sonuçlandırılmış/,
    );
    expect(getDB().reps).toHaveLength(2);
  });

  it("başvuru listesi yalnız yöneticiye görünür", async () => {
    createPublicApplication(validInput());
    expect(listRepApplications(admin)).toHaveLength(1);
    expect(listRepApplications(rep1)).toEqual([]);
    expect(listRepApplications()).toHaveLength(1); // actor'suz çağrı (admin oturumu)
  });
});
