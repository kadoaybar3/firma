import { describe, expect, it } from "vitest";
import {
  ENGAGEMENT_DEFAULTS,
  applyEngagementToDB,
  crossedThreshold,
  engagementCountsFor,
  isDoublingStep,
  resolveEngagementRule,
} from "./engagement";
import type { DB, EngagementRule, Settings } from "./types";

/**
 * İki kademeli eşik mantığı — saf fonksiyon testleri.
 * Sunucudaki 0018 RPC'si aynı kuralları uygular (tam eşikte tek bildirim).
 */

const rule = (patch: Partial<EngagementRule> = {}): EngagementRule => ({
  enabled: true,
  tier1Enabled: true,
  tier1Interval: 100,
  tier2Enabled: true,
  tier2Start: 500,
  ...patch,
});

const settings = (patch: Partial<Settings> = {}): Settings => ({
  membershipPrice: 1000,
  repCommission: 50,
  referralReward: 100,
  renewalCommission: 600,
  teamCapacity: 15,
  ...ENGAGEMENT_DEFAULTS,
  ...patch,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const emptyDB = (): DB => ({
  categories: [],
  cities: [],
  companies: [],
  reps: [],
  teams: [],
  leads: [],
  visits: [],
  sales: [],
  payments: [],
  memberships: [],
  commissions: [],
  referrals: [],
  repApplications: [],
  engagementCounters: [],
  engagementNotifications: [],
  settings: settings(),
  audit: [],
});

describe("sabit aralıklı kademe", () => {
  it("yalnız aralığın tam katlarında tetikler", () => {
    expect(crossedThreshold(99, rule())).toBeNull();
    expect(crossedThreshold(100, rule())).toEqual({ tier: 1, threshold: 100, tier1Also: false });
    expect(crossedThreshold(200, rule())).toEqual({ tier: 1, threshold: 200, tier1Also: false });
    expect(crossedThreshold(250, rule())).toBeNull();
  });

  it("kapalıyken hiç tetiklemez", () => {
    expect(crossedThreshold(100, rule({ tier1Enabled: false }))).toBeNull();
  });

  it("genel anahtar kapalıyken iki kademe de susar", () => {
    expect(crossedThreshold(500, rule({ enabled: false }))).toBeNull();
  });
});

describe("katlanan kademe", () => {
  it("başlangıç eşiğinin 2'nin kuvveti katlarında tetikler", () => {
    expect(isDoublingStep(500, 500)).toBe(true); // 2^0
    expect(isDoublingStep(1000, 500)).toBe(true); // 2^1
    expect(isDoublingStep(2000, 500)).toBe(true); // 2^2
    expect(isDoublingStep(16000, 500)).toBe(true); // 2^5
    expect(isDoublingStep(1500, 500)).toBe(false); // 2'nin kuvveti değil
    expect(isDoublingStep(499, 500)).toBe(false);
  });

  it("500 → 1.000 → 2.000 → 4.000 dizisini üretir", () => {
    expect(crossedThreshold(500, rule({ tier1Enabled: false }))).toEqual({
      tier: 2,
      threshold: 500,
      tier1Also: false,
    });
    expect(crossedThreshold(1000, rule({ tier1Enabled: false }))?.tier).toBe(2);
    expect(crossedThreshold(4000, rule({ tier1Enabled: false }))?.tier).toBe(2);
    expect(crossedThreshold(6000, rule({ tier1Enabled: false }))).toBeNull();
  });
});

describe("iki kademe aynı anda", () => {
  it("tek bildirim üretir ve birleşmeyi işaretler", () => {
    const both = rule({ tier1Interval: 500 });
    expect(crossedThreshold(500, both)).toEqual({ tier: 2, threshold: 500, tier1Also: true });
  });

  it("yalnız 1. kademe uyuyorsa tier 1 döner", () => {
    expect(crossedThreshold(100, rule({ tier1Interval: 100 }))?.tier).toBe(1);
  });
});

describe("tür bazlı kural çözümü", () => {
  it("tür geçersiz kılması genel kuralı ezer", () => {
    const s = settings({
      engagementKindOverrides: { web: { tier1Interval: 25, tier2Enabled: false } },
    });
    const web = resolveEngagementRule(s, "web");
    expect(web.tier1Interval).toBe(25);
    expect(web.tier2Enabled).toBe(false);
    // Diğer türler genel kuralı kullanır
    expect(resolveEngagementRule(s, "telefon").tier1Interval).toBe(100);
  });
});

describe("sayaç uygulaması", () => {
  it("firma ve tür bazında bağımsız artar, eşikte tek bildirim üretir", () => {
    const db = emptyDB();
    db.settings = settings({ engagementTier1Interval: 2, engagementTier2Start: 4 });

    expect(applyEngagementToDB(db, "c1", "profil")?.count).toBeUndefined();
    expect(applyEngagementToDB(db, "c1", "profil")).toMatchObject({ count: 2, tier: 1 });
    expect(applyEngagementToDB(db, "c1", "profil")).toBeNull(); // 3 — eşik değil
    expect(applyEngagementToDB(db, "c1", "profil")).toMatchObject({ count: 4, tier: 2, tier1Also: true });

    // Farklı tür ve farklı firma ayrı sayılır
    expect(applyEngagementToDB(db, "c1", "telefon")).toBeNull();
    expect(applyEngagementToDB(db, "c2", "profil")).toBeNull();
    expect(engagementCountsFor(db, "c1").profil).toBe(4);
    expect(engagementCountsFor(db, "c1").telefon).toBe(1);
    expect(engagementCountsFor(db, "c2").profil).toBe(1);

    // Aynı sayaç değeri için ikinci bildirim yok
    expect(db.engagementNotifications).toHaveLength(2);
    expect(new Set(db.engagementNotifications?.map((n) => n.id)).size).toBe(2);
  });

  it("sistem kapalıyken sayaç artar ama bildirim oluşmaz", () => {
    const db = emptyDB();
    db.settings = settings({ engagementEnabled: false, engagementTier1Interval: 1 });
    expect(applyEngagementToDB(db, "c1", "yol")).toBeNull();
    expect(engagementCountsFor(db, "c1").yol).toBe(1);
    expect(db.engagementNotifications).toHaveLength(0);
  });
});
