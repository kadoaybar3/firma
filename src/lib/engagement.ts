import type {
  DB,
  EngagementKind,
  EngagementNotification,
  EngagementRule,
  EngagementSettings,
  Settings,
} from "./types";

/**
 * FİRMA ETKİLEŞİM SAYAÇLARI VE İKİ KADEMELİ BİLDİRİM
 *
 * Kurallar:
 *  - Her firmanın ve her türün sayacı bağımsızdır.
 *  - 1. kademe (sabit aralık): her N etkileşimde bir (100, 200, 300…).
 *  - 2. kademe (katlanan): başlangıç eşiğinin 2'nin kuvveti katlarında
 *    (500, 1.000, 2.000, 4.000…); her bildirimden sonra eşik iki katına çıkar.
 *  - İki kademe aynı sayımda tetiklenirse TEK bildirim üretilir (tier = 2,
 *    `tier1Also` = true) — çakışan iki bildirim oluşmaz.
 *  - (firma, tür, sayaç değeri) tekil olduğundan aynı etkileşim için mükerrer
 *    bildirim yazılamaz; eşik mantığı yalnız tam eşikte tetiklenir.
 *
 * Bu dosya saf mantıktır: Supabase'de aynı kural `track_company_engagement`
 * RPC'sinde (atomik sayaç artışı + eşik değerlendirmesi) uygulanır.
 */

export const ENGAGEMENT_KINDS: EngagementKind[] = [
  "profil",
  "telefon",
  "whatsapp",
  "yol",
  "instagram",
  "web",
];

export const ENGAGEMENT_LABELS: Record<EngagementKind, string> = {
  profil: "Profil görüntülenmesi",
  telefon: "Telefon tıklaması",
  whatsapp: "WhatsApp tıklaması",
  yol: "Yol tarifi tıklaması",
  instagram: "Instagram tıklaması",
  web: "Web sitesi tıklaması",
};

/** Panelden değiştirilebilen varsayılanlar (yeni kurulum / migration varsayılanı). */
export const ENGAGEMENT_DEFAULTS: EngagementSettings = {
  engagementEnabled: true,
  engagementTier1Enabled: true,
  engagementTier1Interval: 100,
  engagementTier2Enabled: true,
  engagementTier2Start: 500,
};

export function isEngagementKind(value: unknown): value is EngagementKind {
  return typeof value === "string" && (ENGAGEMENT_KINDS as string[]).includes(value);
}

/** Eşik/adım değeri: pozitif tam sayı; geçersizse varsayılana döner. */
function step(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Genel ayarları tür bazlı geçersiz kılmalarla birleştirir. Şimdilik tüm
 * türler genel kuralı kullanır; `engagementKindOverrides` ileride tür bazlı
 * ayar için hazırdır (UI eklemek yeterli, mantık değişmez).
 */
export function resolveEngagementRule(settings: Settings, kind: EngagementKind): EngagementRule {
  const base: EngagementRule = {
    enabled: flag(settings.engagementEnabled, ENGAGEMENT_DEFAULTS.engagementEnabled),
    tier1Enabled: flag(settings.engagementTier1Enabled, ENGAGEMENT_DEFAULTS.engagementTier1Enabled),
    tier1Interval: step(settings.engagementTier1Interval, ENGAGEMENT_DEFAULTS.engagementTier1Interval),
    tier2Enabled: flag(settings.engagementTier2Enabled, ENGAGEMENT_DEFAULTS.engagementTier2Enabled),
    tier2Start: step(settings.engagementTier2Start, ENGAGEMENT_DEFAULTS.engagementTier2Start),
  };
  const override = settings.engagementKindOverrides?.[kind];
  if (!override) return base;
  return {
    enabled: flag(override.enabled, base.enabled),
    tier1Enabled: flag(override.tier1Enabled, base.tier1Enabled),
    tier1Interval: step(override.tier1Interval, base.tier1Interval),
    tier2Enabled: flag(override.tier2Enabled, base.tier2Enabled),
    tier2Start: step(override.tier2Start, base.tier2Start),
  };
}

/** sayım / başlangıç oranı 2'nin tam kuvveti mi? (500 → 1, 2, 4, 8…) */
export function isDoublingStep(count: number, start: number): boolean {
  if (!Number.isFinite(count) || !Number.isFinite(start)) return false;
  if (start < 1 || count < start || count % start !== 0) return false;
  const ratio = count / start;
  if (ratio < 1) return false;
  if (ratio <= Number.MAX_SAFE_INTEGER) {
    const exponent = Math.round(Math.log2(ratio));
    return 2 ** exponent === ratio;
  }
  return false;
}

export interface ThresholdHit {
  tier: 1 | 2;
  /** Bildirimin bağlı olduğu eşik (= o anki sayaç değeri) */
  threshold: number;
  /** Aynı sayımda 1. kademe de tetiklendi (tek bildirimde birleştirilir) */
  tier1Also: boolean;
}

/**
 * Bu sayaç değeri bir eşik aşımı üretiyor mu? Üretmiyorsa null.
 * Yalnız TAM eşikte tetiklenir: aynı etkileşim iki kez bildirim üretemez.
 */
export function crossedThreshold(count: number, rule: EngagementRule): ThresholdHit | null {
  if (!rule.enabled || !Number.isFinite(count) || count < 1) return null;

  const tier1 =
    rule.tier1Enabled && rule.tier1Interval >= 1 && count % rule.tier1Interval === 0;
  const tier2 = rule.tier2Enabled && isDoublingStep(count, rule.tier2Start);

  if (!tier1 && !tier2) return null;
  return { tier: tier2 ? 2 : 1, threshold: count, tier1Also: tier1 && tier2 };
}

/** (firma, tür, sayaç) — tekil bildirim anahtarı (demo modda id, sunucuda unique kısıt). */
export function engagementNotificationKey(
  companyId: string,
  kind: EngagementKind,
  count: number,
): string {
  return `${companyId}|${kind}|${count}`;
}

/**
 * Sayaç artışını yerel DB'ye uygular ve gerekiyorsa TEK bildirim üretir.
 * Demo modda (ve testlerde) kullanılır; Supabase modunda aynı işi RPC yapar.
 */
export function applyEngagementToDB(
  db: DB,
  companyId: string,
  kind: EngagementKind,
  now: string = new Date().toISOString(),
): EngagementNotification | null {
  const counters = (db.engagementCounters ??= []);
  let counter = counters.find((c) => c.companyId === companyId && c.kind === kind);
  if (!counter) {
    counter = { companyId, kind, count: 0, updatedAt: now };
    counters.push(counter);
  }
  counter.count += 1;
  counter.updatedAt = now;

  const hit = crossedThreshold(counter.count, resolveEngagementRule(db.settings, kind));
  if (!hit) return null;

  const notifications = (db.engagementNotifications ??= []);
  if (
    notifications.some(
      (n) => n.companyId === companyId && n.kind === kind && n.count === counter.count,
    )
  ) {
    return null;
  }

  const notification: EngagementNotification = {
    id: engagementNotificationKey(companyId, kind, counter.count),
    companyId,
    kind,
    count: counter.count,
    tier: hit.tier,
    threshold: hit.threshold,
    tier1Also: hit.tier1Also,
    createdAt: now,
  };
  notifications.unshift(notification);
  return notification;
}

/** Bir firmanın tür bazlı sayaçları (yoksa 0). */
export function engagementCountsFor(db: DB, companyId: string): Record<EngagementKind, number> {
  const out = {} as Record<EngagementKind, number>;
  for (const kind of ENGAGEMENT_KINDS) out[kind] = 0;
  for (const counter of db.engagementCounters ?? []) {
    if (counter.companyId === companyId) out[counter.kind] = counter.count;
  }
  return out;
}

export function engagementNotificationText(
  notification: EngagementNotification,
  companyName: string,
): string {
  const label = ENGAGEMENT_LABELS[notification.kind] ?? notification.kind;
  const tierNote =
    notification.tier === 2
      ? notification.tier1Also
        ? "katlanan eşik (sabit aralıkla aynı anda)"
        : "katlanan eşik"
      : "sabit aralık";
  return `${companyName} — ${label} ${notification.count.toLocaleString("tr-TR")} oldu (${tierNote}).`;
}
