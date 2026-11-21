import { beforeEach, describe, expect, it } from "vitest";
import {
  createRep,
  createTeam,
  getMyTeam,
  listTeams,
  resetDB,
  setRepTeam,
  setTeamLeader,
  updateSettings,
} from "./repo";
import type { Actor } from "./types";

/**
 * Ekip altyapısı (0011_teams.sql) — demo mod JS aynası.
 * SQL trigger'ları (kapasite/liderlik) migration-security.test.ts'de statik,
 * bu dosya ise repo.ts iş mantığını doğrular.
 */
const admin: Actor = { userId: "user-admin", role: "admin" };
const rep1: Actor = { userId: "user-1", role: "temsilci", repId: "rep-1" };
const rep2: Actor = { userId: "user-2", role: "temsilci", repId: "rep-2" };

beforeEach(() => resetDB());

describe("ekip kurma (personel)", () => {
  it("personel kendi ekibini kurar: lider olur ve ekibe bağlanır", async () => {
    const team = await createTeam("Afyon Ekibi", rep1);
    expect(team.name).toBe("Afyon Ekibi");
    expect(team.leaderRepId).toBe("rep-1");
    const mine = getMyTeam(rep1);
    expect(mine?.team.id).toBe(team.id);
    expect(mine?.members.map((m) => m.id)).toContain("rep-1");
  });

  it("aynı personel ikinci kez ekip kuramaz (tek liderlik)", async () => {
    await createTeam("A Ekibi", rep1);
    await expect(createTeam("B Ekibi", rep1)).rejects.toThrow(/liderisiniz/);
  });

  it("ekipteki personel yeni ekip kurunca eski ekibinden ayrılır", async () => {
    const a = await createTeam("A Ekibi", rep1);
    await setRepTeam("rep-2", a.id, admin);
    expect(getMyTeam(rep1)?.members.map((m) => m.id)).toContain("rep-2");

    const b = await createTeam("B Ekibi", rep2);
    expect(getMyTeam(rep2)?.team.id).toBe(b.id);
    expect(getMyTeam(rep1)?.members.map((m) => m.id)).not.toContain("rep-2");
  });

  it("geçersiz ekip adı reddedilir", async () => {
    await expect(createTeam(" x ", rep1)).rejects.toThrow(/2-60/);
  });

  it("yönetici ekip kuramaz (yalnız temsilci)", async () => {
    await expect(createTeam("Yönetici Ekibi", admin)).rejects.toThrow(/yalnızca temsilci/);
  });
});

describe("ekip kapasitesi", () => {
  it("kapasite dolunca yeni üye eklenemez", async () => {
    const a = await createTeam("A Ekibi", rep1);
    updateSettings({ teamCapacity: 2 }, admin);
    await setRepTeam("rep-2", a.id, admin); // 2/2 (lider dahil)
    const rep3 = createRep("Üçüncü Personel", "0555 000 00 03", admin);
    await expect(setRepTeam(rep3.id, a.id, admin)).rejects.toThrow(/kapasitesi doldu/);
  });

  it("kapasitesi 2'nin altına indirilemez", () => {
    expect(() => updateSettings({ teamCapacity: 1 }, admin)).toThrow(/Geçersiz değer/);
  });
});

describe("transfer ve liderlik (yalnız yönetici)", () => {
  it("temsilci ekip bağlantısı veya liderlik değiştiremez", async () => {
    const a = await createTeam("A Ekibi", rep1);
    await expect(setRepTeam("rep-2", a.id, rep2)).rejects.toThrow(/yalnızca yönetici/);
    await expect(setTeamLeader(a.id, "rep-2", rep2)).rejects.toThrow(/yalnızca yönetici/);
  });

  it("ekip lideri başka ekibe aktarılamaz (önce liderlik devredilir)", async () => {
    const a = await createTeam("A Ekibi", rep1);
    const b = await createTeam("B Ekibi", rep2);
    await expect(setRepTeam("rep-1", b.id, admin)).rejects.toThrow(/önce ekip liderliğini/);
    await expect(setRepTeam("rep-1", null, admin)).rejects.toThrow(/önce ekip liderliğini/);
    // liderlik devri (sıradan üyeden) sonrası transfer serbest
    const rep3 = createRep("Üçüncü", "0555", admin);
    await setRepTeam(rep3.id, a.id, admin);
    await setTeamLeader(a.id, rep3.id, admin);
    await expect(setRepTeam("rep-1", b.id, admin)).resolves.toBeUndefined();
  });

  it("liderlik değişince yeni lider ekibe katılır, eski lider üye kalır", async () => {
    const a = await createTeam("A Ekibi", rep1);
    await setRepTeam("rep-2", a.id, admin);
    await setTeamLeader(a.id, "rep-2", admin);

    expect(getMyTeam(rep2)?.team.id).toBe(a.id);
    expect(getMyTeam(rep1)?.team.id).toBe(a.id); // üye olarak kalır
    const members = getMyTeam(rep1)?.members.map((m) => m.id) ?? [];
    expect(members).toEqual(expect.arrayContaining(["rep-1", "rep-2"]));
    expect(getMyTeam(rep2)?.team.leaderRepId).toBe("rep-2");
  });

  it("başka ekibin lideri lider yapılamaz", async () => {
    const a = await createTeam("A Ekibi", rep1);
    await createTeam("B Ekibi", rep2);
    await expect(setTeamLeader(a.id, "rep-2", admin)).rejects.toThrow(/zaten başka bir ekibin/);
  });
});

describe("ekip görünürlüğü", () => {
  it("temsilci yalnız kendi ekibini listeler; admin tümünü görür", async () => {
    const a = await createTeam("A Ekibi", rep1);
    await setRepTeam("rep-2", a.id, admin);
    const rep3 = createRep("Üçüncü", "0555", admin);
    await createTeam("B Ekibi", { role: "temsilci", repId: rep3.id });

    expect(listTeams(rep1).map((t) => t.id)).toEqual([a.id]);
    expect(listTeams(rep2).map((t) => t.id)).toEqual([a.id]);
    expect(listTeams(admin).length).toBe(2);
  });

  it("ekipsiz personel ekip görmez", () => {
    expect(listTeams(rep2)).toEqual([]);
    expect(getMyTeam(rep2)).toBeNull();
  });
});
