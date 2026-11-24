import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { listCompanies, listLeads } from "../lib/repo";
import type { Actor } from "../lib/types";

/** Eşleşen mevcut kayıt — yalnız bilgilendirme amaçlı gösterilir. */
export interface DuplicateMatch {
  kind: "firma" | "aday";
  name: string;
  district?: string;
  city?: string;
}

export interface DuplicateResult {
  status: "none" | "exists" | "unavailable";
  matches: DuplicateMatch[];
}

const NONE: DuplicateResult = { status: "none", matches: [] };
const UNAVAILABLE: DuplicateResult = { status: "unavailable", matches: [] };

/** Türkçe karakterleri sadeleştirip karşılaştırma anahtarı üretir. */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[ch] ?? ch)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Birebir veya birbirini içerir benzerliği; kısa isimlerde yanlış pozitif olmasın. */
function similar(target: string, other: string): boolean {
  if (!target || !other) return false;
  if (target === other) return true;
  if (target.length < 5 || other.length < 5) return false;
  return other.includes(target) || target.includes(other);
}

function isMatchRecord(value: unknown): value is DuplicateMatch {
  return Boolean(value) && typeof value === "object" && typeof (value as DuplicateMatch).name === "string";
}

/**
 * Mükerrer firma kontrolü — YALNIZ BİLGİLENDİRME.
 *
 * Bu sonuç ASLA kayıt oluşturmayı engellemez; karar her zaman temsilcidedir.
 * API/ağ/veritabanı hatasında `unavailable` döner ve akış sürer — kontrol
 * hiçbir koşulda zorunlu doğrulama değildir.
 *
 * Canlı modda sunucu ucu noktası hem mevcut firmaları hem aday kayıtlarını
 * normalize ederek karşılaştırır ve eşleşen kayıtların adını döner. Demo
 * modda aynı karşılaştırma tarayıcı hafızasındaki veri üzerinde yapılır.
 */
export async function checkDuplicate(name: string, actor?: Actor): Promise<DuplicateResult> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return NONE;

  try {
    if (!isSupabaseConfigured) {
      const target = normalize(trimmed);
      const matches: DuplicateMatch[] = [];
      for (const c of listCompanies({ includeUnpublished: true })) {
        if (similar(target, normalize(c.name))) {
          matches.push({ kind: "firma", name: c.name, district: c.district || undefined });
        }
      }
      if (actor) {
        for (const l of listLeads(actor)) {
          if (similar(target, normalize(l.companyName))) {
            matches.push({ kind: "aday", name: l.companyName, district: l.district });
          }
        }
      }
      return { status: matches.length ? "exists" : "none", matches: matches.slice(0, 5) };
    }

    if (!supabase) return UNAVAILABLE;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return UNAVAILABLE;

    const res = await fetch("/api/check-company-duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) return UNAVAILABLE;
    const body = (await res.json()) as { matches?: unknown };
    const matches = (Array.isArray(body.matches) ? body.matches : [])
      .filter(isMatchRecord)
      .slice(0, 5);
    return { status: matches.length ? "exists" : "none", matches };
  } catch {
    return UNAVAILABLE;
  }
}
