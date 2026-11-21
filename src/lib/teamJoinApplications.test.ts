import { beforeEach, describe, expect, it } from "vitest";
import {
  approveTeamJoinApplication,
  createTeam,
  getDB,
  listTeamJoinApplications,
  listTeamsOverview,
  rejectTeamJoinApplication,
  resetDB,
  setRepTeam,
  submitTeamJoinApplication,
} from "./repo";
import type { Actor, SalesRep, Team } from "./types";

/**
 * Ekip bulma ve ekibe katılma başvurusu (0015_team_join_applications.sql).
 * SQL tarafının statik invariantları migration-security.test.ts'te; bu dosya
 * iş modelini doğrular: beklemede başvuru üyelik YARATMAZ, tekrar başvuru ve
 * dolu ekip engellenir, onayda kapasite + başka ekip kontrolü yeniden koşar,
 * üyelik ancak yönetici onayıyla kurulur, yetki ve görünürlük sınırları.
 */
const admin: Actor = { userId: "u-admin", role: "admin" };
const leader: Actor = { userId: "u-1", role: "temsilci", repId: "rep-1" };
const applicant: Actor = { userId: "u-2", role: "temsilci", repId: "rep-2" };

beforeEach(() => resetDB());

let seq = 0;
/** Kapasite doldurmak için doğrudan üye ekler (arayüz yolu değil). */
function fillTeam(teamId: string, count: number): void {
  const db = getDB();
  for (let i = 0; i < count; i++) {
    seq += 1;
    const rep: SalesRep = {
      id: `filler-${seq}`,
      name: `Dolu Kişi ${seq}`,
      phone: `0555 999 ${String(seq).padStart(4, "0")}`,
      code: `AF-9${String(seq).padStart(4, "0")}`,
      status: "aktif",
      teamId,
      createdAt: new Date().toISOString(),
    };
    db.reps.push(rep);
  }
}

/** Yeni bir personel ekler ve onunla ekip kurdurur (ikinci ekip için). */
async function secondTeam(name: string): Promise<{ team: Team; actor: Actor }> {
  seq += 1;
  const id = `rep-x${seq}`;
  getDB().reps.push({
    id,
    name: `Ek Kurucu ${seq}`,
    phone: `0555 888 ${String(seq).padStart(4, "0")}`,
    code: `AF-8${String(seq).padStart(4, "0")}`,
    status: "aktif",
    createdAt: new Date().toISOString(),
  });
  const actor: Actor = { userId: `u-x${seq}`, role: "temsilci", repId: id };
  const team = await createTeam(name, actor);
  return { team, actor };
}

function pendingApp() {
  const app = listTeamJoinApplications(admin).find((a) => a.status === "beklemede");
  if (!app) throw new Error("bekleyen başvuru yok");
  return app;
}

function rep2() {
  return getDB().reps.find((r) => r.id === "rep-2");
}

describe("ekibe katılma başvurusu — gönderme", () => {
  it("başvuru beklemede kaydedilir ve üyelik YARATMAZ", async () => {
    const team = await createTeam("Kuzey Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant);

    const apps = listTeamJoinApplications(admin);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      repId: "rep-2",
      teamId: team.id,
      status: "beklemede",
    });
    expect(apps[0].decidedAt).toBeFalsy(); // henüz karar yok
    // Onaysız başvuru: ekip bağlantısı kurulmaz
    expect(rep2()?.teamId).toBeUndefined();
  });

  it("tekrar başvuru engellenir — aynı ve farklı ekip, beklemede tek satır", async () => {
    const team1 = await createTeam("A Ekibi", leader);
    const { team: team2 } = await secondTeam("B Ekibi");

    await submitTeamJoinApplication(team1.id, applicant);
    await expect(submitTeamJoinApplication(team1.id, applicant)).rejects.toThrow(/bekleyen/);
    await expect(submitTeamJoinApplication(team2.id, applicant)).rejects.toThrow(/bekleyen/);
    expect(listTeamJoinApplications(admin)).toHaveLength(1);
  });

  it("kapasite dolu ekip başvuru kabul etmez", async () => {
    const team = await createTeam("Dolu Ekip", leader); // 1 (lider)
    fillTeam(team.id, 14); // 15/15 → dolu (kapasite lider dahil)

    await expect(submitTeamJoinApplication(team.id, applicant)).rejects.toThrow(
      /kapasitesi dolu/,
    );
    expect(listTeamJoinApplications(admin)).toHaveLength(0);
    expect(rep2()?.teamId).toBeUndefined();
  });

  it("olmayan ekibe başvuru yapılamaz", async () => {
    await expect(submitTeamJoinApplication("yok-ekip", applicant)).rejects.toThrow(/bulunamadı/);
  });

  it("yetki: yalnız temsilci başvuru yapabilir", async () => {
    const team = await createTeam("A Ekibi", leader);
    await expect(submitTeamJoinApplication(team.id, admin)).rejects.toThrow(/yalnızca temsilci/);
  });
});

describe("ekibe katılma başvurusu — yönetici onayı", () => {
  it("onayda ekip üyeliği güvenli şekilde kurulur ve durum onaylanır", async () => {
    const team = await createTeam("A Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant);
    const app = pendingApp();

    await approveTeamJoinApplication(app.id, admin);

    expect(rep2()?.teamId).toBe(team.id); // tek üyelik: ekip bağlantısı kuruldu
    expect(listTeamJoinApplications(admin)[0]).toMatchObject({
      status: "onaylandi",
      decidedBy: "u-admin",
    });
    expect(listTeamJoinApplications(admin)[0].decidedAt).toBeTruthy();
  });

  it("onay sırasında kapasite yeniden kontrol edilir (başvuru sonrası dolarsa)", async () => {
    const team = await createTeam("A Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant); // kapasite müsaitken
    const app = pendingApp();
    fillTeam(team.id, 14); // başvuru sonrası ekip 15/15 doldu

    await expect(approveTeamJoinApplication(app.id, admin)).rejects.toThrow(/kapasitesi dolu/);
    expect(rep2()?.teamId).toBeUndefined(); // üyelik kurulmadı
    expect(listTeamJoinApplications(admin)[0].status).toBe("beklemede"); // karar geri alındı
  });

  it("onay sırasında başka ekip bağlılık kontrolü yeniden yapılır", async () => {
    const team1 = await createTeam("A Ekibi", leader);
    const { team: team2 } = await secondTeam("B Ekibi");
    await submitTeamJoinApplication(team1.id, applicant);
    const app = pendingApp();
    await setRepTeam("rep-2", team2.id, admin); // bu sırada başka ekibe transfer edildi

    await expect(approveTeamJoinApplication(app.id, admin)).rejects.toThrow(
      /zaten bir ekibe bağlı/,
    );
    expect(rep2()?.teamId).toBe(team2.id); // mevcut bağlantısı değişmedi
  });

  it("sonuçlandırılmış başvuruya tekrar onay/red verilemez", async () => {
    const team = await createTeam("A Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant);
    const app = pendingApp();

    await approveTeamJoinApplication(app.id, admin);
    await expect(approveTeamJoinApplication(app.id, admin)).rejects.toThrow(
      /zaten sonuçlandırılmış/,
    );
    await expect(rejectTeamJoinApplication(app.id, admin)).rejects.toThrow(
      /zaten sonuçlandırılmış/,
    );
    expect(rep2()?.teamId).toBe(team.id); // ikinci işlem üyeliği bozmadı
  });

  it("reddedilen başvuru üyelik yaratmaz; yeniden başvurulabilir", async () => {
    const team = await createTeam("A Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant);
    const app = pendingApp();

    await rejectTeamJoinApplication(app.id, admin);
    expect(rep2()?.teamId).toBeUndefined();
    expect(listTeamJoinApplications(admin)[0].status).toBe("reddedildi");

    // Reddedilen satır silinmedi; beklemede slotu serbest → yeniden başvuru
    await submitTeamJoinApplication(team.id, applicant);
    const rows = listTeamJoinApplications(admin);
    expect(rows).toHaveLength(2);
    expect(rows.filter((a) => a.status === "beklemede")).toHaveLength(1);
  });

  it("yetki: temsilci onaylayamaz veya reddedemez", async () => {
    const team = await createTeam("A Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant);
    const app = pendingApp();

    await expect(approveTeamJoinApplication(app.id, applicant)).rejects.toThrow(
      /yalnızca yönetici/,
    );
    await expect(rejectTeamJoinApplication(app.id, leader)).rejects.toThrow(/yalnızca yönetici/);
    expect(rep2()?.teamId).toBeUndefined();
    expect(listTeamJoinApplications(admin)[0].status).toBe("beklemede");
  });
});

describe("başvuru görünürlüğü ve ekip özeti", () => {
  it("personel yalnız kendi başvurusunu görür; yönetici tümünü görür", async () => {
    const team = await createTeam("A Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant);

    expect(listTeamJoinApplications(admin)).toHaveLength(1);
    expect(listTeamJoinApplications(applicant)).toHaveLength(1);
    expect(listTeamJoinApplications(leader)).toHaveLength(0); // başka personelin başvurusu
  });

  it("ekip özeti: lider adı, üye sayısı ve kapasite görünür", async () => {
    const team = await createTeam("A Ekibi", leader);
    await submitTeamJoinApplication(team.id, applicant);
    await approveTeamJoinApplication(pendingApp().id, admin);

    const overview = listTeamsOverview();
    expect(overview).toHaveLength(1);
    expect(overview[0]).toMatchObject({
      teamId: team.id,
      teamName: "A Ekibi",
      leaderRepId: "rep-1",
      leaderName: "Ayşe Yılmaz",
      memberCount: 2,
      capacity: 15,
    });
  });
});
