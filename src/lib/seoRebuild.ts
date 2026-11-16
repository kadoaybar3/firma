/*
 * SEO yeniden build tetikleyicisi (Faz 4F)
 *
 * Yayınlama/veri değişikliği sonrası Netlify Build Hook'u çağırır; hook
 * çağrısı sunucuda (`netlify/functions/seo-rebuild.mts`) yapılır — hook
 * URL'i istemciye ASLA girmez.
 *
 * Kurallar:
 *  - Tetikleme debounce'ludur (45 sn): art arda gelen toplu yayınlamalar
 *    tek build'de birleşir.
 *  - Build isteği, Supabase yazımı (flushNow) tamamlanmadan GÖNDERİLMEZ;
 *    aksi halde build eski veriyi çeker.
 *  - Hatalar yutulur: build tetikleme hatası firma kayıt/yayınlama
 *    akışına yansıtılmaz (syncError banner'ına bile düşmez).
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { flushNow } from "./dataSource";
import type { Company } from "./types";

/** Art arda tetiklemeler bu pencerede tek build'de birleşir (30–60 sn). */
const SEO_REBUILD_DEBOUNCE_MS = 45_000;

/**
 * SEO çıktısını (sitemap + prerender + JSON-LD) etkileyen firma alanları.
 * `buildFirmDetailSeo` / `buildLocalBusinessJsonLd` bu alanları kullanır.
 * `featured` bilinçli olarak YOK: yalnız listelerde sıralamayı etkiler,
 * sayfa metnini değiştirmez.
 */
export type CompanySeoSnapshot = {
  slug: string;
  published: boolean;
  name: string;
  phone: string;
  district: string;
  address: string;
  description: string;
  hours: Company["hours"];
  categoryId: string;
  cityId: string;
  latitude?: number;
  longitude?: number;
  email?: string;
  website?: string;
  socials: Company["socials"];
};

export function companySeoSnapshot(c: Company): CompanySeoSnapshot {
  return {
    slug: c.slug,
    published: c.published,
    name: c.name,
    phone: c.phone,
    district: c.district,
    address: c.address,
    description: c.description,
    hours: c.hours,
    categoryId: c.categoryId,
    cityId: c.cityId,
    latitude: c.latitude,
    longitude: c.longitude,
    email: c.email,
    website: c.website,
    socials: c.socials,
  };
}

/**
 * İki snapshot arasında SEO çıktısını değiştiren fark var mı?
 * Her iki durum da yayın dışıysa sitemap/prerender değişmez → false.
 */
export function seoRelevantChange(
  before: CompanySeoSnapshot,
  after: CompanySeoSnapshot,
): boolean {
  if (!before.published && !after.published) return false;
  // snapshot alan sırası sabit (companySeoSnapshot) → deterministik karşılaştırma
  return JSON.stringify(before) !== JSON.stringify(after);
}

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounce'lu tetikleme: aynı pencere içindeki tüm çağrılar tek build'e iner. */
export function scheduleSeoRebuild(): void {
  if (rebuildTimer) return;
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    void triggerSeoRebuild();
  }, SEO_REBUILD_DEBOUNCE_MS);
}

/**
 * Build hook çağrısı: önce Supabase yazımını bitirir, sonra yetkili
 * istemci fonksiyonuna POST atar. Her adımın hatası yutulur.
 */
export async function triggerSeoRebuild(): Promise<void> {
  try {
    if (!isSupabaseConfigured || !supabase) return;
    // Kritik: build Supabase'den okur; yazım bitmeden tetiklenirse eski veri çeker.
    await flushNow();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/seo-rebuild", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Build tetikleme hatası yayınlama akışına yansımaz (bilinçli yutma).
  }
}
