import { beforeEach, describe, expect, it } from "vitest";
import { confirmSale as engineConfirmSale } from "./engine";
import {
  approveEftPayment,
  createCompany,
  createRenewalSale,
  createSale,
  createTeam,
  getDB,
  listCategories,
  listCities,
  listCommissionPayoutSummary,
  listCommissions,
  listTeamCommissions,
  listTeamCommissionPayouts,
  listTeamCommissionSummary,
  recordTeamCommissionPayout,
  resetDB,
  setRepTeam,
} from "./repo";
import type { Actor, Sale } from "./types";

/**
 * Ekip liderliği komisyonu — demo motor JS aynası (0014_team_commissions.sql).
 * SQL tarafının statik invariantları migration-security.test.ts'te; bu dosya
 * iş modelini doğrular: matrah = satış − paylar, %20, liderin kendi satışı
 * hariç, yenileme hariç, tek satır, ayrı ödeme defteri ve görünürlük.
 */
const admin: Actor = { userId: "u-admin", role: "admin" };
const leader: Actor = { userId: "u-1", role: "temsilci", repId: "rep-1" };
const member: Actor = { userId: "u-2", role: "temsilci", repId: "rep-2" };

beforeEach(() => resetDB());

let seq = 0;
function companyFor(prefix: string) {
  seq += 1;
  const category = listCategories()[0];
  const city = listCities()[0];
  return createCompany(
    {
      name: `${prefix} ${seq}`,
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

/** rep-1 liderliğinde bir ekip kurar, rep-2'yi üye yapar. */
async function leaderTeam(): Promise<void> {
  const team = await createTeam("Test Ekibi", leader);
  await setRepTeam("rep-2", team.id, admin);
}

async function sellByMember(amount: number, repId = "rep-2"): Promise<Sale> {
  const company = companyFor("Ekip Satışı");
  return createSale({ companyId: company.id, channel: "temsilci", repId, amount }, admin);
}

function teamComsFor(saleId: string) {
  return listTeamCommissions(admin).filter((tc) => tc.saleId === saleId);
}

function repComsFor(saleId: string) {
  return listCommissions(admin).filter(({ com }) => com.saleId === saleId);
}

describe("ekip liderliği komisyonu — hesaplama", () => {
  it("örnek hesap: 1.000 TL satış → temsilci 500, kalan 500, lidere %20 = 100", async () => {
    await leaderTeam();
    const sale = await sellByMember(1000);
    await approveEftPayment(sale.id, admin);

    const repComs = repComsFor(sale.id);
    expect(repComs).toHaveLength(1);
    expect(repComs[0].com.amount).toBe(500); // mevcut temsilci komisyonu DEĞİŞMEDİ

    const rows = teamComsFor(sale.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].leaderRepId).toBe("rep-1");
    expect(rows[0].repId).toBe("rep-2");
    expect(rows[0].baseAmount).toBe(500); // brüt 1.000 değil, paylar sonrası kalan
    expect(rows[0].rate).toBe(20);
    expect(rows[0].amount).toBe(100);
    // Firma Rehberi'nde kalan: 1.000 − 500 − 100 = 400
    expect(sale.amount - repComs[0].com.amount - rows[0].amount).toBe(400);
  });

  it("matrah brüt tutar değil, temsilci komisyonu düşülmüş kalandır", async () => {
    await leaderTeam();
    const seller = getDB().reps.find((r) => r.id === "rep-2");
    if (seller) seller.customCommissionRate = 25; // 2.000 × %25 = 500
    const sale = await sellByMember(2000);
    await approveEftPayment(sale.id, admin);

    expect(repComsFor(sale.id)[0].com.amount).toBe(500);
    const rows = teamComsFor(sale.id);
    expect(rows[0].baseAmount).toBe(1500); // 2.000 − 500
    expect(rows[0].amount).toBe(300); // %20
  });

  it("her yeni satışta tekrar hesaplanır (ikinci satış ikinci satır)", async () => {
    await leaderTeam();
    const first = await sellByMember(1000);
    const second = await sellByMember(2000);
    await approveEftPayment(first.id, admin);
    await approveEftPayment(second.id, admin);

    expect(teamComsFor(first.id)[0].amount).toBe(100);
    expect(teamComsFor(second.id)[0].amount).toBe(200); // (2.000 − 1.000) × %20
    expect(listTeamCommissions(admin)).toHaveLength(2);
  });

  it("ekip liderinin kendi satışı ekip liderliği komisyonu üretmez", async () => {
    await leaderTeam();
    const sale = await sellByMember(1000, "rep-1");
    await approveEftPayment(sale.id, admin);

    expect(repComsFor(sale.id)).toHaveLength(1); // temsilci komisyonu normal
    expect(teamComsFor(sale.id)).toHaveLength(0);
  });

  it("ekibe bağlı olmayan personelin satışı ekip liderliği komisyonu üretmez", async () => {
    const sale = await sellByMember(1000); // ekip kurulmadı
    await approveEftPayment(sale.id, admin);

    expect(repComsFor(sale.id)).toHaveLength(1);
    expect(listTeamCommissions(admin)).toHaveLength(0);
  });

  it("yenileme satışı ekip liderliği komisyonu üretmez", async () => {
    await leaderTeam();
    const sale = await sellByMember(1000);
    await approveEftPayment(sale.id, admin);
    const membership = getDB().memberships.find((m) => m.saleId === sale.id);
    expect(membership).toBeTruthy();

    const renewal = createRenewalSale(membership!.id, admin);
    await approveEftPayment(renewal.id, admin);

    expect(repComsFor(renewal.id)[0].com.type).toBe("yenileme");
    expect(teamComsFor(renewal.id)).toHaveLength(0);
    expect(listTeamCommissions(admin)).toHaveLength(1); // yalnız ilk satış
  });

  it("satış onayı başarısızsa ekip liderliği komisyonu da oluşmaz", async () => {
    await leaderTeam();
    const sale = await sellByMember(1000);
    // ödeme doğrulanmadan kesinleştirme → hata, hiçbir satır yazılmaz
    expect(() => engineConfirmSale(getDB(), sale.id, admin)).toThrow();
    expect(repComsFor(sale.id)).toHaveLength(0);
    expect(teamComsFor(sale.id)).toHaveLength(0);
  });

  it("aynı satış ikinci kez onaylanmaz; ikinci ekip komisyonu satırı oluşmaz", async () => {
    await leaderTeam();
    const sale = await sellByMember(1000);
    await approveEftPayment(sale.id, admin);
    await expect(approveEftPayment(sale.id, admin)).rejects.toThrow();

    expect(repComsFor(sale.id)).toHaveLength(1);
    expect(teamComsFor(sale.id)).toHaveLength(1);
  });
});

describe("ekip liderliği komisyonu — görünürlük", () => {
  it("yalnız lider kendi satırını görür; üye ve diğer liderler göremez", async () => {
    await leaderTeam();
    const sale = await sellByMember(1000);
    await approveEftPayment(sale.id, admin);

    expect(listTeamCommissions(admin)).toHaveLength(1);
    expect(listTeamCommissions(leader)).toHaveLength(1); // satırın sahibi lider
    expect(listTeamCommissions(member)).toHaveLength(0); // satıcı ama lider değil
    expect(listTeamCommissionSummary(member)).toHaveLength(0);
  });
});

describe("ekip liderliği komisyonu — ödeme defteri", () => {
  async function withEarning() {
    await leaderTeam();
    const sale = await sellByMember(1000); // hakediş 100
    await approveEftPayment(sale.id, admin);
  }

  it("ödeme yalnız yönetici; bakiye aşılamaz", async () => {
    await withEarning();
    await expect(
      recordTeamCommissionPayout("rep-1", 50, "", leader),
    ).rejects.toThrow(/Yalnızca yönetici/);
    await expect(
      recordTeamCommissionPayout("rep-1", 150, "", admin),
    ).rejects.toThrow(/kalan alacağından fazla/);
    expect(listTeamCommissionPayouts(admin)).toHaveLength(0);
  });

  it("hakediş / ödenen / kalan bakiye doğru hesaplanır", async () => {
    await withEarning();
    await recordTeamCommissionPayout("rep-1", 60, "TR1", admin);

    const summary = listTeamCommissionSummary(admin).find((row) => row.leader.id === "rep-1");
    expect(summary).toMatchObject({ earned: 100, paid: 60, outstanding: 40 });

    const payout = listTeamCommissionPayouts(admin)[0];
    expect(payout.leaderRepId).toBe("rep-1");
    expect(payout.amount).toBe(60);
    expect(payout.referenceNo).toBe("TR1");
  });

  it("ekip liderliği ödemesi temsilci komisyon defterine karışmaz", async () => {
    await withEarning();
    // Ödeme ÖNCESİ temsilci bakiyesi (seed verisi dahil) anlık görüntüsü
    const repBefore = listCommissionPayoutSummary(admin).find(
      (row) => row.rep.id === "rep-1",
    );
    await recordTeamCommissionPayout("rep-1", 100, "", admin);

    // rep-1'in KENDİ temsilci bakiyesi hiç değişmedi (ödeme oraya yazılmadı)
    const repAfter = listCommissionPayoutSummary(admin).find((row) => row.rep.id === "rep-1");
    expect(repAfter).toEqual(repBefore);
    // ekip liderliği bakiyesi tamamen kapandı
    const teamSummary = listTeamCommissionSummary(admin).find((row) => row.leader.id === "rep-1");
    expect(teamSummary).toMatchObject({ earned: 100, paid: 100, outstanding: 0 });
  });
});
